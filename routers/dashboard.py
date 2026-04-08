# routers/dashboard.py
# Dashboard summary endpoint — powers the KPI cards, activity feed, and mini-map.

from __future__ import annotations
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, Query
from models import ShipmentStatus, AlertSeverity

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _get_env(sessions, session_id):
    if session_id not in sessions:
        raise HTTPException(404, f"Session '{session_id}' not found. Call /reset first.")
    return sessions[session_id]


@router.get("/summary")
def dashboard_summary(
    session_id: str = Query(default="default"),
    sessions: dict = None,   # injected via dependency in server.py
) -> Dict[str, Any]:
    """
    Returns all KPI data needed by the Dashboard page in one call:
    - shipment counts (total, delayed, on-time, rerouted, at-risk)
    - alert counts by severity
    - warehouse utilisation snapshot
    - fleet availability snapshot
    - recent activity log (last 10 actions from env)
    - on-time rate %
    """
    from server import _sessions   # late import to avoid circular
    env = _get_env(_sessions, session_id)
    s = env._state

    all_shipments = list(s.shipments.values())
    all_warehouses = list(s.warehouses.values())
    all_trucks = list(s.trucks.values())

    total = len(all_shipments)
    delivered = sum(1 for sh in all_shipments if sh.status == ShipmentStatus.DELIVERED)
    delayed = sum(1 for sh in all_shipments if sh.status == ShipmentStatus.DELAYED)
    unassigned = sum(1 for sh in all_shipments if sh.status == ShipmentStatus.UNASSIGNED)
    in_transit = sum(1 for sh in all_shipments if sh.status == ShipmentStatus.IN_TRANSIT)
    assigned = sum(1 for sh in all_shipments if sh.status == ShipmentStatus.ASSIGNED)

    on_time_deliveries = sum(
        1 for sh in all_shipments
        if sh.status == ShipmentStatus.DELIVERED
        and getattr(sh, "_delivery_step", sh.deadline_step + 1) <= sh.deadline_step
    )
    on_time_rate = round((on_time_deliveries / delivered * 100) if delivered > 0 else 100.0, 1)

    unread_alerts = [a for a in s.alerts if not a.is_read]
    alert_counts = {}
    for a in unread_alerts:
        alert_counts[a.severity] = alert_counts.get(a.severity, 0) + 1

    critical_count = alert_counts.get("critical", 0) + alert_counts.get("high", 0)

    wh_summary = [
        {
            "warehouse_id": wh.warehouse_id,
            "capacity_pct": round(wh.current_load_tons / wh.capacity_tons * 100, 1),
            "is_operational": wh.is_operational,
            "strike_active": wh.strike_active,
            "is_refrigerated": wh.is_refrigerated,
            "accepts_hazmat": wh.accepts_hazmat,
            "available_tons": round(wh.capacity_tons - wh.current_load_tons, 1),
        }
        for wh in all_warehouses
    ]

    fleet_summary = {
        "idle": sum(1 for t in all_trucks if t.is_available),
        "in_transit": sum(1 for t in all_trucks if not t.is_available),
        "total": len(all_trucks),
    }

    return {
        "session_id": session_id,
        "current_step": s.current_step,
        "max_steps": s.max_steps,
        "steps_remaining": s.max_steps - s.current_step,
        "kpis": {
            "total_shipments": total,
            "delayed_shipments": delayed,
            "active_alerts": critical_count,
            "on_time_rate_pct": on_time_rate,
            "delivered": delivered,
            "unassigned": unassigned,
            "in_transit": in_transit,
            "assigned": assigned,
            "penalty_accrued": round(s.penalty_accrued, 4),
            "reward_earned": round(s.reward_earned, 4),
        },
        "alert_summary": alert_counts,
        "warehouse_snapshot": wh_summary,
        "fleet_snapshot": fleet_summary,
        "violations": {
            "capacity": s.capacity_violations,
            "strike": s.strike_violations,
            "refrigeration": s.refrigeration_violations,
            "hazmat": s.hazmat_violations,
        },
    }
