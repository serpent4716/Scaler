# routers/fleet.py
# Fleet endpoints — powers the Fleet Management page.

from __future__ import annotations
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from models import TruckID, WarehouseID, Action, ActionType

router = APIRouter(prefix="/fleet", tags=["Fleet"])


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return _sessions[session_id]


def _serialize_truck(truck) -> Dict[str, Any]:
    return {
        "truck_id": truck.truck_id,
        "is_available": truck.is_available,
        "status": "idle" if truck.is_available else "in_transit",
        "current_location": truck.current_location,
        "capacity_tons": truck.capacity_tons,
        "current_load_tons": truck.current_load_tons,
        "available_load_tons": round(truck.capacity_tons - truck.current_load_tons, 2),
        "is_hazmat_certified": truck.is_hazmat_certified,
        "type": (
            "Refrigerated ❄️" if truck.is_hazmat_certified and truck.capacity_tons <= 15
            else "Hazmat Certified" if truck.is_hazmat_certified
            else "Heavy" if truck.capacity_tons >= 28
            else "Standard"
        ),
    }


@router.get("")
def list_fleet(session_id: str = Query(default="default")) -> Dict[str, Any]:
    """Return full fleet status snapshot."""
    env = _get_env(session_id)

    # Step the env with QUERY_FLEET to get live fleet data
    action = Action(
        action_type=ActionType.QUERY_FLEET,
        rationale="Dashboard fleet status query — listing all trucks for dispatcher view.",
    )
    obs, reward, done, info = env.step(action)
    s = env._state

    trucks = [_serialize_truck(t) for t in s.trucks.values()]
    return {
        "session_id": session_id,
        "current_step": s.current_step,
        "total": len(trucks),
        "idle": sum(1 for t in trucks if t["is_available"]),
        "in_transit": sum(1 for t in trucks if not t["is_available"]),
        "trucks": trucks,
    }


@router.get("/{truck_id}")
def get_truck(truck_id: str, session_id: str = Query(default="default")) -> Dict[str, Any]:
    env = _get_env(session_id)
    s = env._state
    try:
        tid = TruckID(truck_id)
    except ValueError:
        raise HTTPException(422, f"Invalid truck_id '{truck_id}'.")
    truck = s.trucks.get(tid)
    if not truck:
        raise HTTPException(404, f"Truck '{truck_id}' not found.")

    # Find shipment this truck is carrying (if in transit)
    carrying = [
        sh.shipment_id for sh in s.shipments.values()
        if sh.assigned_truck == tid
    ]
    result = _serialize_truck(truck)
    result["carrying_shipments"] = carrying
    return {"session_id": session_id, "truck": result}


class DispatchRequest(BaseModel):
    shipment_id: str
    target_warehouse: WarehouseID
    rationale: str = "Manual truck dispatch via fleet management UI."


@router.post("/{truck_id}/dispatch")
def dispatch_truck(
    truck_id: str,
    req: DispatchRequest,
    session_id: str = Query(default="default"),
) -> Dict[str, Any]:
    """
    Dispatch a specific truck to deliver a shipment.
    The shipment must already be ASSIGNED (via /shipments/{id}/reroute first).
    """
    env = _get_env(session_id)
    try:
        tid = TruckID(truck_id)
    except ValueError:
        raise HTTPException(422, f"Invalid truck_id '{truck_id}'.")

    action = Action(
        action_type=ActionType.DISPATCH_TRUCK,
        truck_id=tid,
        shipment_id=req.shipment_id,
        target_warehouse=req.target_warehouse,
        rationale=req.rationale,
    )
    obs, reward, done, info = env.step(action)
    return {
        "success": obs.last_action_success,
        "message": obs.last_action_message,
        "reward": reward,
        "done": done,
        "reward_info": info.get("reward_info"),
    }
