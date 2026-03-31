# routers/ai_decisions.py
# AI Decision Panel — generates, stores, and lets users accept/reject AI suggestions.
# Uses Gemini (same as inference.py) to produce structured decision recommendations.

from __future__ import annotations

import json
import os
import textwrap
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel

router = APIRouter(prefix="/ai", tags=["AI Decisions"])

# In-memory decision store per session: session_id -> [decision_dict]
_decision_store: Dict[str, List[Dict[str, Any]]] = {}


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return _sessions[session_id]


# ---------------------------------------------------------------------------
# Gemini integration (optional — falls back to rule-based if no key)
# ---------------------------------------------------------------------------

GEMINI_KEY = os.getenv("GEMINI_API_KEY", "")
_gemini_model = None

def _init_gemini():
    global _gemini_model
    if _gemini_model or not GEMINI_KEY:
        return
    try:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_KEY)
        _gemini_model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            system_instruction=textwrap.dedent("""
                You are an AI logistics dispatcher. Given the current state of a supply chain
                disruption scenario, generate 3-5 specific, actionable routing decisions.
                
                Respond ONLY with a JSON array. Each element must have:
                {
                  "action": "<short imperative describing what to do>",
                  "reason": "<1-2 sentence explanation referencing specific IDs and constraints>",
                  "confidence": <float 0.0-1.0>,
                  "impact": "<brief business impact statement>",
                  "action_type": "<one of: route_shipment, dispatch_truck, hold_shipment, read_inbox>",
                  "shipment_id": "<SHP-XXXX or null>",
                  "target_warehouse": "<warehouse ID or null>",
                  "truck_id": "<TRK_XXX or null>"
                }
                
                Be specific. Reference actual shipment IDs, warehouse IDs, and truck IDs from the state.
                Prioritise critical-deadline shipments and constraint violations.
            """).strip()
        )
    except Exception:
        pass


def _build_state_summary(env) -> str:
    s = env._state
    shipments = list(s.shipments.values())
    warehouses = list(s.warehouses.values())
    trucks = list(s.trucks.values())

    unread_alerts = [a for a in s.alerts if not a.is_read]
    urgent_shipments = sorted(
        [sh for sh in shipments if sh.status not in ("delivered", "cancelled")],
        key=lambda x: x.deadline_step
    )[:10]

    summary = {
        "current_step": s.current_step,
        "max_steps": s.max_steps,
        "unassigned": sum(1 for sh in shipments if sh.status == "unassigned"),
        "delayed": sum(1 for sh in shipments if sh.status == "delayed"),
        "unread_alerts": len(unread_alerts),
        "alert_subjects": [a.subject for a in unread_alerts[:3]],
        "urgent_shipments": [
            {
                "id": sh.shipment_id,
                "status": sh.status,
                "deadline": sh.deadline_step,
                "weight": sh.weight_tons,
                "flags": sh.cargo_flags,
                "assigned_wh": sh.assigned_warehouse,
            }
            for sh in urgent_shipments
        ],
        "warehouses": [
            {
                "id": wh.warehouse_id,
                "available_tons": round(wh.capacity_tons - wh.current_load_tons, 1),
                "operational": wh.is_operational,
                "strike": wh.strike_active,
                "refrigerated": wh.is_refrigerated,
                "hazmat": wh.accepts_hazmat,
            }
            for wh in warehouses
        ],
        "idle_trucks": [
            {"id": t.truck_id, "capacity": t.capacity_tons, "hazmat": t.is_hazmat_certified}
            for t in trucks if t.is_available
        ],
    }
    return json.dumps(summary, default=str)


def _generate_rule_based_decisions(env) -> List[Dict[str, Any]]:
    """Fallback: generates decisions using heuristics when Gemini isn't available."""
    s = env._state
    decisions = []
    shipments = list(s.shipments.values())
    warehouses = list(s.warehouses.values())
    trucks = list(s.trucks.values())

    # Find available warehouses
    available_wh = [
        wh for wh in warehouses
        if wh.is_operational and not wh.strike_active
        and (wh.capacity_tons - wh.current_load_tons) > 5
    ]
    cold_wh = [wh for wh in available_wh if wh.is_refrigerated]
    hazmat_wh = [wh for wh in available_wh if wh.accepts_hazmat]
    idle_trucks = [t for t in trucks if t.is_available]

    # 1. Unread alerts → read them
    unread = [a for a in s.alerts if not a.is_read]
    if unread:
        decisions.append({
            "id": str(uuid.uuid4())[:8],
            "action": f"Read alert: '{unread[0].subject}'",
            "reason": f"There are {len(unread)} unread alerts. Critical disruption information may be unprocessed.",
            "confidence": 0.98,
            "impact": "May reveal warehouse closures or strike actions that affect routing.",
            "action_type": "read_inbox",
            "shipment_id": None,
            "target_warehouse": None,
            "truck_id": None,
            "status": "pending",
        })

    # 2. Delayed/unassigned refrigerated → cold warehouse
    refrig_unresolved = [
        sh for sh in shipments
        if "refrigerated" in sh.cargo_flags
        and sh.status in ("unassigned", "delayed")
    ]
    if refrig_unresolved and cold_wh:
        sh = refrig_unresolved[0]
        wh = cold_wh[0]
        decisions.append({
            "id": str(uuid.uuid4())[:8],
            "action": f"Route {sh.shipment_id} to {wh.warehouse_id} (cold storage)",
            "reason": (
                f"{sh.shipment_id} is REFRIGERATED and currently {sh.status}. "
                f"{wh.warehouse_id} is the only cold-capable warehouse with "
                f"{round(wh.capacity_tons - wh.current_load_tons, 1)}t available. "
                f"Deadline: step {sh.deadline_step}."
            ),
            "confidence": 0.99,
            "impact": f"Prevents cold-chain violation (~$45k cargo loss risk).",
            "action_type": "route_shipment",
            "shipment_id": sh.shipment_id,
            "target_warehouse": wh.warehouse_id,
            "truck_id": None,
            "status": "pending",
        })

    # 3. Urgent unassigned → best available warehouse
    urgent = sorted(
        [sh for sh in shipments if sh.status == "unassigned" and "refrigerated" not in sh.cargo_flags],
        key=lambda x: x.deadline_step
    )[:3]
    for sh in urgent:
        cargo_wh = hazmat_wh if "hazmat" in sh.cargo_flags else available_wh
        if not cargo_wh:
            continue
        wh = max(cargo_wh, key=lambda w: w.capacity_tons - w.current_load_tons)
        decisions.append({
            "id": str(uuid.uuid4())[:8],
            "action": f"Route {sh.shipment_id} to {wh.warehouse_id}",
            "reason": (
                f"{sh.shipment_id} ({sh.weight_tons}t, deadline step {sh.deadline_step}) "
                f"is unassigned. {wh.warehouse_id} has "
                f"{round(wh.capacity_tons - wh.current_load_tons, 1)}t available and is operational."
            ),
            "confidence": round(0.85 + (0.1 if sh.deadline_step - s.current_step < 10 else 0), 2),
            "impact": f"Avoids late delivery penalty ({sh.penalty_per_step_late}/step).",
            "action_type": "route_shipment",
            "shipment_id": sh.shipment_id,
            "target_warehouse": wh.warehouse_id,
            "truck_id": None,
            "status": "pending",
        })

    # 4. Dispatch idle truck for assigned shipments
    assigned_shipments = [sh for sh in shipments if sh.status == "assigned"]
    if assigned_shipments and idle_trucks:
        sh = assigned_shipments[0]
        t = idle_trucks[0]
        decisions.append({
            "id": str(uuid.uuid4())[:8],
            "action": f"Dispatch {t.truck_id} for {sh.shipment_id} → {sh.assigned_warehouse}",
            "reason": (
                f"{sh.shipment_id} is ASSIGNED to {sh.assigned_warehouse} but not yet dispatched. "
                f"{t.truck_id} ({t.capacity_tons}t, "
                f"{'hazmat certified' if t.is_hazmat_certified else 'standard'}) is idle."
            ),
            "confidence": 0.91,
            "impact": f"Completes delivery before step {sh.deadline_step} deadline.",
            "action_type": "dispatch_truck",
            "shipment_id": sh.shipment_id,
            "target_warehouse": sh.assigned_warehouse,
            "truck_id": t.truck_id,
            "status": "pending",
        })

    return decisions[:6]  # Cap at 6 decisions


async def _generate_gemini_decisions(env, session_id: str) -> List[Dict[str, Any]]:
    """Call Gemini to generate AI decisions from current state."""
    _init_gemini()
    if not _gemini_model:
        return _generate_rule_based_decisions(env)

    state_json = _build_state_summary(env)
    prompt = f"Current logistics state:\n{state_json}\n\nGenerate 4-5 specific routing decisions."

    try:
        response = _gemini_model.generate_content(prompt)
        raw = response.text.strip()
        if raw.startswith("```"):
            raw = "\n".join(l for l in raw.split("\n") if not l.strip().startswith("```"))
        decisions = json.loads(raw)
        # Add required fields
        for d in decisions:
            d["id"] = str(uuid.uuid4())[:8]
            d["status"] = "pending"
        return decisions
    except Exception:
        return _generate_rule_based_decisions(env)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("/decisions")
async def get_decisions(
    session_id: str = Query(default="default"),
    refresh: bool = Query(default=False, description="Force regenerate from current state"),
) -> Dict[str, Any]:
    """
    Get AI-generated routing decisions for current session state.
    On first call (or refresh=true), generates fresh decisions from Gemini or rule engine.
    """
    env = _get_env(session_id)
    s = env._state

    if refresh or session_id not in _decision_store:
        decisions = await _generate_gemini_decisions(env, session_id)
        _decision_store[session_id] = decisions

    decisions = _decision_store.get(session_id, [])
    pending = sum(1 for d in decisions if d.get("status") == "pending")
    avg_confidence = (
        round(sum(d.get("confidence", 0) for d in decisions) / len(decisions) * 100)
        if decisions else 0
    )

    return {
        "session_id": session_id,
        "current_step": s.current_step,
        "total": len(decisions),
        "pending": pending,
        "avg_confidence_pct": avg_confidence,
        "decisions": decisions,
        "source": "gemini" if _gemini_model else "rule_engine",
    }


class DecisionActionRequest(BaseModel):
    rationale: Optional[str] = None


@router.post("/decisions/{decision_id}/accept")
def accept_decision(
    decision_id: str,
    req: DecisionActionRequest,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    """Accept an AI decision and execute the underlying action in the environment."""
    env = _get_env(session_id)
    decisions = _decision_store.get(session_id, [])
    decision = next((d for d in decisions if d["id"] == decision_id), None)

    if not decision:
        raise HTTPException(404, f"Decision '{decision_id}' not found.")
    if decision["status"] != "pending":
        raise HTTPException(409, f"Decision already {decision['status']}.")

    action_type = decision.get("action_type", "no_op")
    step_result = {"success": True, "message": "Decision accepted.", "reward": 0.0}

    # Execute the underlying action in the env
    try:
        from models import Action, ActionType, WarehouseID, TruckID

        action_kwargs = {
            "action_type": ActionType(action_type),
            "rationale": req.rationale or f"Accepting AI decision: {decision['action']}",
        }
        if decision.get("shipment_id"):
            action_kwargs["shipment_id"] = decision["shipment_id"]
        if decision.get("target_warehouse"):
            action_kwargs["target_warehouse"] = WarehouseID(decision["target_warehouse"])
        if decision.get("truck_id"):
            action_kwargs["truck_id"] = TruckID(decision["truck_id"])
        if action_type == "read_inbox":
            # Find inbox index
            s = env._state
            unread = [a for a in s.alerts if not a.is_read]
            action_kwargs["inbox_index"] = 0 if unread else None
            if action_kwargs["inbox_index"] is None:
                step_result = {"success": False, "message": "No unread alerts.", "reward": 0.0}
                decision["status"] = "accepted"
                return {"decision_id": decision_id, "status": "accepted", **step_result}

        action = Action(**action_kwargs)
        obs, reward, done, info = env.step(action)
        step_result = {
            "success": obs.last_action_success,
            "message": obs.last_action_message,
            "reward": reward,
            "done": done,
        }
    except Exception as e:
        step_result = {"success": False, "message": str(e), "reward": 0.0}

    decision["status"] = "accepted"
    return {
        "decision_id": decision_id,
        "status": "accepted",
        **step_result,
    }


@router.post("/decisions/{decision_id}/reject")
def reject_decision(
    decision_id: str,
    req: DecisionActionRequest,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    """Reject an AI decision (no env action taken)."""
    _get_env(session_id)  # validate session
    decisions = _decision_store.get(session_id, [])
    decision = next((d for d in decisions if d["id"] == decision_id), None)
    if not decision:
        raise HTTPException(404, f"Decision '{decision_id}' not found.")
    if decision["status"] != "pending":
        raise HTTPException(409, f"Decision already {decision['status']}.")
    decision["status"] = "rejected"
    decision["reject_reason"] = req.rationale or "Rejected via dashboard."
    return {"decision_id": decision_id, "status": "rejected", "message": "Decision rejected and logged."}


@router.delete("/decisions")
def clear_decisions(session_id: str = Query(default="default")) -> Dict[str, Any]:
    """Clear all decisions for a session (triggers refresh on next GET)."""
    _get_env(session_id)
    _decision_store.pop(session_id, None)
    return {"session_id": session_id, "message": "Decisions cleared. Next GET will regenerate."}
