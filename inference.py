"""
inference.py — Supply Chain Disruption Dispatcher
==================================================
Run this LOCALLY, pointing at your live HF Space.

Required environment variables (set before running):
    HF_TOKEN        Your HuggingFace token — https://huggingface.co/settings/tokens
    API_BASE_URL    HF inference router  (default: https://router.huggingface.co/v1)
    MODEL_NAME      HF-hosted model      (default: Qwen/Qwen2.5-72B-Instruct)

Optional:
    LOCAL_IMAGE_NAME  Only needed if you run the env in Docker locally (leave blank)
    ENV_BASE_URL      URL of the running environment server
                      (default: https://Jeet3317-Scaler.hf.space)
    DISPATCH_TASK     Task label for logs   (default: supply-chain-dispatcher)
    DISPATCH_BENCHMARK  Benchmark label     (default: dispatch)

Quick start:
    export HF_TOKEN=hf_xxxxxxxxxxxx
    python inference.py
"""

from __future__ import annotations

import json
import os
import textwrap
import time
from typing import Any, Dict, List, Optional

import requests
from openai import OpenAI          # ALL LLM calls use the OpenAI client

# ---------------------------------------------------------------------------
# Config — env vars only. Defaults ONLY for non-secret values.
# ---------------------------------------------------------------------------

API_BASE_URL     = os.getenv("API_BASE_URL",     "https://router.huggingface.co/v1")
MODEL_NAME       = os.getenv("MODEL_NAME",       "Qwen/Qwen2.5-72B-Instruct")
API_KEY          = os.getenv("HF_TOKEN") or os.getenv("API_KEY")   # NO hard-coded default
LOCAL_IMAGE_NAME = os.getenv("LOCAL_IMAGE_NAME")                    # optional / leave blank

# Points at your live HF Space — change if you run the server locally
ENV_BASE_URL = os.getenv("ENV_BASE_URL", "https://Jeet3317-Scaler.hf.space")

TASK_NAME  = os.getenv("DISPATCH_TASK",      "supply-chain-dispatcher")
BENCHMARK  = os.getenv("DISPATCH_BENCHMARK", "dispatch")
MAX_STEPS  = int(os.getenv("DISPATCH_MAX_STEPS", "999"))   # env enforces its own hard cap

# ---------------------------------------------------------------------------
# Structured stdout  [START] / [STEP] / [END]
# ---------------------------------------------------------------------------

def log_start(task: str, env: str, model: str) -> None:
    print(f"[START] task={task} env={env} model={model}", flush=True)


def log_step(step: int, action: str, reward: float, done: bool, error: Optional[str]) -> None:
    error_val = error if error else "null"
    done_val  = str(done).lower()
    action_line = action.replace("\n", " ").replace("\r", "")
    print(
        f"[STEP] step={step} action={action_line} "
        f"reward={reward:.2f} done={done_val} error={error_val}",
        flush=True,
    )


def log_end(success: bool, steps: int, score: float, rewards: List[float]) -> None:
    rewards_str = ",".join(f"{r:.2f}" for r in rewards)
    print(
        f"[END] success={str(success).lower()} steps={steps} "
        f"score={score:.3f} rewards={rewards_str}",
        flush=True,
    )

# ---------------------------------------------------------------------------
# HTTP helpers — talk to the FastAPI environment server
# ---------------------------------------------------------------------------

def _post(endpoint: str, payload: Dict) -> Dict:
    resp = requests.post(f"{ENV_BASE_URL}{endpoint}", json=payload, timeout=60)
    resp.raise_for_status()
    return resp.json()

# ---------------------------------------------------------------------------
# System prompt
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
    - REFRIGERATED cargo -> only WH_PDX_COLD
    - HAZMAT cargo -> only warehouses where accepts_hazmat=true, truck must be hazmat certified
    - OVERSIZED cargo -> counts as double weight for capacity
    - Always READ_INBOX before routing — alerts contain critical constraint information
    - Never route to a warehouse with strike_active=true or is_operational=false
    - You must ROUTE_SHIPMENT before DISPATCH_TRUCK
    - Step 1 should almost always be: read_inbox with inbox_index=0
""").strip()

# ---------------------------------------------------------------------------
# LLM helpers — OpenAI client pointed at HuggingFace router
# ---------------------------------------------------------------------------

def _build_user_message(obs: Dict, step_num: int) -> str:
    return (
        f"Step {step_num}. Current observation:\n"
        + json.dumps(obs, indent=2, default=str)
    )


def _parse_action(raw: str) -> Optional[Dict]:
    """Strip markdown fences if present and parse JSON."""
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        cleaned = "\n".join(l for l in lines if not l.strip().startswith("```"))
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        return None


def get_model_action(
    client: OpenAI,
    conversation_history: List[Dict],
    obs: Dict,
    step_num: int,
) -> str:
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    messages += conversation_history[-12:]           # keep last 12 turns for context
    messages.append({"role": "user", "content": _build_user_message(obs, step_num)})

    try:
        completion = client.chat.completions.create(
            model=MODEL_NAME,
            messages=messages,
            temperature=0.2,
            max_tokens=512,
            stream=False,
        )
        return (completion.choices[0].message.content or "").strip()
    except Exception as exc:
        print(f"[DEBUG] LLM call failed at step {step_num}: {exc}", flush=True)
        return json.dumps({
            "action_type": "no_op",
            "rationale": "LLM call failed — falling back to no_op.",
        })

# ---------------------------------------------------------------------------
# Single episode runner
# ---------------------------------------------------------------------------

def run_episode(client: OpenAI, difficulty: str) -> Dict[str, Any]:
    """Run one full episode and return result dict with score in [0, 1]."""

    session_id = f"run_{difficulty}"

    reset_resp = _post("/reset", {
        "session_id": session_id,
        "difficulty": difficulty,
        "seed": 42,
    })
    obs = reset_resp["observation"]

    conversation_history: List[Dict] = []
    step_rewards: List[float] = []
    steps_taken = 0
    episode_score: Optional[float] = None

    log_start(task=f"{TASK_NAME}-{difficulty}", env=BENCHMARK, model=MODEL_NAME)

    try:
        step_num = 0
        done = False

        while not done and step_num < MAX_STEPS:
            step_num += 1

            raw_action = get_model_action(client, conversation_history, obs, step_num)
            action_dict = _parse_action(raw_action)

            if action_dict is None:
                print(f"[DEBUG] Parse error at step {step_num}: {raw_action[:120]}", flush=True)
                action_dict = {
                    "action_type": "no_op",
                    "rationale": "Parse error — could not decode LLM output.",
                }
                raw_action = json.dumps(action_dict)

            error_msg: Optional[str] = None
            try:
                step_resp = _post("/step", {
                    "session_id": session_id,
                    "action": action_dict,
                })
            except requests.HTTPError as e:
                error_msg = e.response.text[:200]
                print(f"[DEBUG] Server error at step {step_num}: {error_msg}", flush=True)
                log_step(step=step_num, action=action_dict.get("action_type", "unknown"),
                         reward=0.0, done=True, error=error_msg)
                step_rewards.append(0.0)
                steps_taken = step_num
                break

            obs    = step_resp["observation"]
            reward = float(step_resp.get("reward", 0.0))
            done   = bool(step_resp.get("done", False))
            info   = step_resp.get("info", {})

            if not obs.get("last_action_success", True):
                error_msg = obs.get("last_action_message")

            step_rewards.append(reward)
            steps_taken = step_num

            # [STEP] log — uses action_type as the action label (single line)
            log_step(
                step=step_num,
                action=action_dict.get("action_type", "unknown"),
                reward=reward,
                done=done,
                error=error_msg,
            )

            # Append to conversation history for multi-turn context
            conversation_history.append({"role": "user",      "content": _build_user_message(obs, step_num)})
            conversation_history.append({"role": "assistant", "content": raw_action})

            if done:
                episode_score = info.get("reward_info", {}).get("episode_score")

            time.sleep(0.1)   # light rate-limit courtesy

    finally:
        # Clamp score to [0, 1] as required by spec
        final_score = float(episode_score) if episode_score is not None else 0.0
        final_score = min(max(final_score, 0.0), 1.0)
        success = final_score > 0.0

        log_end(success=success, steps=steps_taken, score=final_score, rewards=step_rewards)

    return {
        "difficulty":    difficulty,
        "steps_taken":   steps_taken,
        "episode_score": final_score,
        "rewards":       step_rewards,
    }

# ---------------------------------------------------------------------------
# Main — runs all 3 difficulty tiers
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not API_KEY:
        print(
            "[ERROR] HF_TOKEN is not set.\n"
            "  Get your token from https://huggingface.co/settings/tokens\n"
            "  Then run:  export HF_TOKEN=hf_xxxxxxxxxxxx",
            flush=True,
        )
        raise SystemExit(1)

    client = OpenAI(base_url=API_BASE_URL, api_key=API_KEY)

    print(f"Supply Chain Dispatcher — Inference", flush=True)
    print(f"Model  : {MODEL_NAME}",  flush=True)
    print(f"Server : {ENV_BASE_URL}", flush=True)
    print(f"{'='*60}", flush=True)

    results = []
    for difficulty in ("easy", "medium", "hard"):
        result = run_episode(client, difficulty)
        results.append(result)

    print(f"\n{'='*60}", flush=True)
    print("  RESULTS SUMMARY", flush=True)
    print(f"{'='*60}", flush=True)
    print(f"  {'Difficulty':<12} {'Steps':>6} {'Episode Score':>14}", flush=True)
    print(f"  {'-'*34}", flush=True)
    for r in results:
        print(
            f"  {r['difficulty']:<12} "
            f"{r['steps_taken']:>6} "
            f"{r['episode_score']:>14.4f}",
            flush=True,
        )
