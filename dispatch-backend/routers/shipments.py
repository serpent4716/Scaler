# routers/shipments.py
# Shipment CRUD endpoints — powers the Shipments page table + reroute action.

from __future__ import annotations
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from models import ShipmentStatus, WarehouseID, TruckID, Action, ActionType

router = APIRouter(prefix="/shipments", tags=["Shipments"])


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found. Call /reset first.")
    return _sessions[session_id]


def _serialize_shipment(sh) -> Dict[str, Any]:
    delivery_step = getattr(sh, "_delivery_step", None)
    return {
        "shipment_id": sh.shipment_id,
        "cargo_flags": sh.cargo_flags,
        "deadline_step": sh.deadline_step,
        "penalty_per_step_late": sh.penalty_per_step_late,
        "status": sh.status,
        "assigned_warehouse": sh.assigned_warehouse,
        "assigned_truck": sh.assigned_truck,
        "weight_tons": sh.weight_tons,
        "delivery_step": delivery_step,
        "is_late": (
            delivery_step is not None and delivery_step > sh.deadline_step
        ) if delivery_step else None,
    }


@router.get("")
def list_shipments(
    session_id: str = Query(default="default"),
    status: Optional[str] = Query(default=None, description="Filter by status"),
    priority: Optional[str] = Query(default=None, description="Filter by priority: high|med|low based on deadline"),
) -> Dict[str, Any]:
    """List all shipments with optional status filter."""
    env = _get_env(session_id)
    s = env._state
    shipments = list(s.shipments.values())

    if status:
        try:
            status_enum = ShipmentStatus(status)
            shipments = [sh for sh in shipments if sh.status == status_enum]
        except ValueError:
            raise HTTPException(422, f"Invalid status '{status}'. Valid: {[e.value for e in ShipmentStatus]}")

    # Priority: based on deadline urgency relative to current step
    if priority:
        current = s.current_step
        def get_priority(sh):
            steps_left = sh.deadline_step - current
            if steps_left <= 5: return "high"
            if steps_left <= 15: return "med"
            return "low"
        shipments = [sh for sh in shipments if get_priority(sh) == priority]

    return {
        "session_id": session_id,
        "current_step": s.current_step,
        "total": len(shipments),
        "shipments": [_serialize_shipment(sh) for sh in shipments],
    }


@router.get("/{shipment_id}")
def get_shipment(shipment_id: str, session_id: str = Query(default="default")) -> Dict[str, Any]:
    """Get full details of a single shipment."""
    env = _get_env(session_id)
    s = env._state
    sh = s.shipments.get(shipment_id)
    if not sh:
        raise HTTPException(404, f"Shipment '{shipment_id}' not found.")
    return {"session_id": session_id, "shipment": _serialize_shipment(sh)}


class RerouteRequest(BaseModel):
    target_warehouse: WarehouseID
    truck_id: Optional[TruckID] = None
    rationale: str = "Manual reroute via dashboard UI."


@router.post("/{shipment_id}/reroute")
def reroute_shipment(
    shipment_id: str,
    req: RerouteRequest,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    """
    Convenience endpoint: ROUTE_SHIPMENT action wrapped for the UI.
    Automatically steps the env with a ROUTE_SHIPMENT action.
    """
    env = _get_env(session_id)

    action = Action(
        action_type=ActionType.ROUTE_SHIPMENT,
        shipment_id=shipment_id,
        target_warehouse=req.target_warehouse,
        truck_id=req.truck_id,
        rationale=req.rationale,
    )
    obs, reward, done, info = env.step(action)

    return {
        "session_id": session_id,
        "action": "route_shipment",
        "shipment_id": shipment_id,
        "target_warehouse": req.target_warehouse,
        "success": obs.last_action_success,
        "message": obs.last_action_message,
        "reward": reward,
        "done": done,
        "reward_info": info.get("reward_info"),
    }


class HoldRequest(BaseModel):
    rationale: str = "Holding shipment via dashboard."


@router.post("/{shipment_id}/hold")
def hold_shipment(
    shipment_id: str,
    req: HoldRequest,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    env = _get_env(session_id)
    action = Action(
        action_type=ActionType.HOLD_SHIPMENT,
        shipment_id=shipment_id,
        rationale=req.rationale,
    )
    obs, reward, done, info = env.step(action)
    return {
        "success": obs.last_action_success,
        "message": obs.last_action_message,
        "reward": reward,
    }


@router.post("/{shipment_id}/cancel-route")
def cancel_route(
    shipment_id: str,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    env = _get_env(session_id)
    action = Action(
        action_type=ActionType.CANCEL_ROUTE,
        shipment_id=shipment_id,
        rationale=f"Route cancelled for {shipment_id} via dashboard UI.",
    )
    obs, reward, done, info = env.step(action)
    return {
        "success": obs.last_action_success,
        "message": obs.last_action_message,
        "reward": reward,
    }


@router.post("/{shipment_id}/prioritize")
def prioritize_shipment(
    shipment_id: str,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    env = _get_env(session_id)
    action = Action(
        action_type=ActionType.PRIORITIZE_SHIPMENT,
        shipment_id=shipment_id,
        rationale=f"Manually prioritizing {shipment_id} via dashboard — deadline is urgent.",
    )
    obs, reward, done, info = env.step(action)
    return {
        "success": obs.last_action_success,
        "message": obs.last_action_message,
        "reward": reward,
    }
