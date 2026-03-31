# routers/warehouses.py
# Warehouse endpoints — powers the Warehouses page and Map overlay.

from __future__ import annotations
from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Query
from models import WarehouseID

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return _sessions[session_id]


def _serialize_warehouse(wh) -> Dict[str, Any]:
    return {
        "warehouse_id": wh.warehouse_id,
        "current_load_tons": wh.current_load_tons,
        "capacity_tons": wh.capacity_tons,
        "available_tons": round(max(0.0, wh.capacity_tons - wh.current_load_tons), 2),
        "utilization_pct": round(wh.current_load_tons / wh.capacity_tons * 100, 1),
        "is_refrigerated": wh.is_refrigerated,
        "is_operational": wh.is_operational,
        "accepts_hazmat": wh.accepts_hazmat,
        "strike_active": wh.strike_active,
        "eta_reopen_step": wh.eta_reopen_step,
        # Derived status label for UI
        "status": (
            "closed" if not wh.is_operational
            else "strike" if wh.strike_active
            else "near-full" if (wh.current_load_tons / wh.capacity_tons) >= 0.85
            else "open"
        ),
    }


@router.get("")
def list_warehouses(session_id: str = Query(default="default")) -> Dict[str, Any]:
    """Return all warehouses with capacity, operational status and constraints."""
    env = _get_env(session_id)
    s = env._state
    warehouses = [_serialize_warehouse(wh) for wh in s.warehouses.values()]
    return {
        "session_id": session_id,
        "current_step": s.current_step,
        "total": len(warehouses),
        "warehouses": warehouses,
    }


@router.get("/{warehouse_id}")
def get_warehouse(warehouse_id: str, session_id: str = Query(default="default")) -> Dict[str, Any]:
    """Get a single warehouse by ID."""
    env = _get_env(session_id)
    s = env._state
    try:
        wh_enum = WarehouseID(warehouse_id)
    except ValueError:
        raise HTTPException(422, f"Invalid warehouse_id '{warehouse_id}'.")
    wh = s.warehouses.get(wh_enum)
    if not wh:
        raise HTTPException(404, f"Warehouse '{warehouse_id}' not found in session.")

    # Also return which shipments are assigned here
    assigned_shipments = [
        sh.shipment_id for sh in s.shipments.values()
        if sh.assigned_warehouse == wh_enum
    ]
    result = _serialize_warehouse(wh)
    result["assigned_shipments"] = assigned_shipments
    result["assigned_shipment_count"] = len(assigned_shipments)
    return {"session_id": session_id, "warehouse": result}
