# inference.py
# Baseline inference script — required by OpenEnv spec.
# Runs a model against all 3 difficulty tiers and prints reproducible scores.
# Uses the OpenAI client pointed at the local server (or HF Spaces URL).

from __future__ import annotations

from http import client
import json
import os
import sys
import textwrap
import time
from typing import Any, Dict, Optional

import requests
import google.generativeai as genai

# ---------------------------------------------------------------------------
# Config — reads from environment variables
# ---------------------------------------------------------------------------

BASE_URL   = os.getenv("ENV_BASE_URL", "http://localhost:7860")
GEMINI_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyDGKz5C34DGh2K0loILgNkW7cDvS-OBlHI")
MODEL      = os.getenv("BASELINE_MODEL", "gemini-2.5-flash")
MAX_STEPS  = int(os.getenv("BASELINE_MAX_STEPS", "999"))  # env enforces its own limit




# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def _post(endpoint: str, payload: Dict) -> Dict:
    resp = requests.post(f"{BASE_URL}{endpoint}", json=payload, timeout=30)
    resp.raise_for_status()
    return resp.json()


def _get(endpoint: str, params: Dict = {}) -> Dict:
    resp = requests.get(f"{BASE_URL}{endpoint}", params=params, timeout=30)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Agent prompt builder
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = textwrap.dedent("""
    You are an expert logistics dispatcher AI.
    The Port of Seattle has closed. You must reroute shipments to alternative
    warehouses while respecting capacity limits, refrigeration requirements,
    hazmat rules, and avoiding warehouses on strike.

    You will receive a JSON observation at each step. You must respond with a
    single valid JSON action object — nothing else, no markdown, no explanation
    outside the JSON.

    Action schema:
    {
        "action_type": <one of: read_inbox, check_warehouse, check_shipment,
                        route_shipment, prioritize_shipment, hold_shipment,
                        cancel_route, query_fleet, dispatch_truck, no_op>,
        "shipment_id":      <"SHP-XXXX" or null>,
        "target_warehouse": <warehouse enum value or null>,
        "truck_id":         <truck enum value or null>,
        "inbox_index":      <integer or null>,
        "rationale":        <string, min 10 chars, explain your reasoning>
    }

    Warehouse IDs: WH_PDX_MAIN, WH_PDX_COLD, WH_TAC_NORTH, WH_TAC_SOUTH,
                   WH_SPK_CENTRAL, WH_VAN_BC, WH_BOI_LOGISTICS
    Truck IDs:     TRK_001 through TRK_008

    Key rules you MUST follow:
    - REFRIGERATED cargo → only WH_PDX_COLD
    - HAZMAT cargo → only warehouses where accepts_hazmat=true, truck must be hazmat certified
    - OVERSIZED cargo → counts as double weight for capacity
    - Always READ_INBOX before routing — alerts contain critical constraint information
    - Never route to a warehouse with strike_active=true or is_operational=false
    - You must ROUTE_SHIPMENT before DISPATCH_TRUCK
    - Step 1 should almost always be: read_inbox with inbox_index=0
""").strip()

genai.configure(api_key=GEMINI_KEY)
gemini_model = genai.GenerativeModel(
    model_name=MODEL,
    system_instruction=SYSTEM_PROMPT,
)

def _build_user_message(obs: Dict, step_num: int) -> str:
    return (
        f"Step {step_num}. Current observation:\n"
        + json.dumps(obs, indent=2, default=str)
    )


# ---------------------------------------------------------------------------
# Parse LLM output → action dict
# ---------------------------------------------------------------------------

def _parse_action(raw: str) -> Optional[Dict]:
    """Strip markdown fences if present and parse JSON."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(
            l for l in lines
            if not l.strip().startswith("```")
        )
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


# ---------------------------------------------------------------------------
# Single episode runner
# ---------------------------------------------------------------------------


def run_episode(difficulty: str, session_id: str) -> Dict[str, Any]:
    print(f"\n{'='*60}")
    print(f"  DIFFICULTY: {difficulty.upper()}  |  SESSION: {session_id}")
    print(f"{'='*60}")

    # Reset
    reset_resp = _post("/reset", {
        "session_id": session_id,
        "difficulty": difficulty,
        "seed": 42,
    })
    obs = reset_resp["observation"]

    conversation_history = []
    total_reward = 0.0
    episode_score = None
    step_num = 0

    while True:
        step_num += 1
        user_msg = _build_user_message(obs, step_num)
        conversation_history.append({"role": "user", "content": user_msg})

        # Call LLM
        try:
            history_for_gemini = [
                {"role": "user" if m["role"] == "user" else "model", "parts": [m["content"]]}
                for m in conversation_history[-12:]
                ]
            chat = gemini_model.start_chat(history=history_for_gemini[:-1])
            response = chat.send_message(history_for_gemini[-1]["parts"][0])
            raw_action = response.text
        except Exception as e:
            print(f"  [LLM ERROR] {e}")
            break

        action_dict = _parse_action(raw_action)
        if action_dict is None:
            print(f"  [PARSE ERROR] Could not parse: {raw_action[:120]}")
            # Fall back to no_op
            action_dict = {
                "action_type": "no_op",
                "rationale": "Parse error fallback — could not decode LLM output.",
            }

        print(
            f"  Step {step_num:>3} | "
            f"{action_dict.get('action_type', '?'):20s} | "
            f"{str(action_dict.get('shipment_id') or action_dict.get('target_warehouse') or ''):15s} | "
            f"rationale: {str(action_dict.get('rationale', ''))[:50]}"
        )

        # Step environment
        try:
            step_resp = _post("/step", {
                "session_id": session_id,
                "action": action_dict,
            })
        except requests.HTTPError as e:
            print(f"  [SERVER ERROR] {e.response.text[:200]}")
            break

        obs          = step_resp["observation"]
        reward       = step_resp["reward"]
        done         = step_resp["done"]
        info         = step_resp["info"]
        total_reward += reward

        conversation_history.append({
            "role": "assistant",
            "content": raw_action,
        })

        if done:
            episode_score = (
                info.get("reward_info", {}).get("episode_score")
            )
            terminal = info.get("reward_info", {}).get("terminal_reason", "unknown")
            print(f"\n  DONE — reason: {terminal}")
            print(f"  Cumulative step reward : {total_reward:.4f}")
            print(f"  Episode score (0-1)    : {episode_score:.4f}")
            break

        if step_num >= MAX_STEPS:
            print("  Reached MAX_STEPS safety limit.")
            break

        time.sleep(0.1)   # Rate-limit courtesy

    return {
        "difficulty": difficulty,
        "steps_taken": step_num,
        "total_step_reward": round(total_reward, 4),
        "episode_score": episode_score,
    }


# ---------------------------------------------------------------------------
# Main — runs all 3 difficulty tiers
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("Supply Chain Dispatcher — Baseline Inference")
    print(f"Model  : {MODEL}")
    print(f"Server : {BASE_URL}")

    if not OPENAI_KEY:
        print("\n[WARNING] OPENAI_API_KEY not set. Set it before running.\n")

    results = []
    for difficulty in ("easy", "medium", "hard"):
        session_id = f"baseline_{difficulty}"
        result = run_episode(difficulty, session_id)
        results.append(result)

    print(f"\n{'='*60}")
    print("  BASELINE RESULTS SUMMARY")
    print(f"{'='*60}")
    print(f"  {'Difficulty':<12} {'Steps':>6} {'Step Reward':>12} {'Episode Score':>14}")
    print(f"  {'-'*46}")
    for r in results:
        print(
            f"  {r['difficulty']:<12} "
            f"{r['steps_taken']:>6} "
            f"{r['total_step_reward']:>12.4f} "
            f"{str(r['episode_score']):>14}"
        )
    print(f"\n  Scores above are your reproducible baseline. "
          f"Paste these into README.md.")