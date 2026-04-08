# routers/simulator.py
# Scenario Simulator endpoint — triggers named disruption scenarios.
# Each scenario applies a sequence of env state mutations and steps.

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from models import (
    Action, ActionType, WarehouseID, TruckID,
    WarehouseSummary, ShipmentStatus, ShipmentSummary, AlertSeverity, UnstructuredAlert,
)

router = APIRouter(prefix="/simulator", tags=["Simulator"])

VALID_SCENARIOS = ["storm", "strike", "capacity", "truck", "demand", "blackout"]

# Log store per session
_sim_logs: Dict[str, List[Dict[str, Any]]] = {}


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return _sessions[session_id]


def _log(session_id: str, msg: str, level: str = "info"):
    _sim_logs.setdefault(session_id, []).append({
        "ts": time.time(), "level": level, "msg": f"› {msg}"
    })


class ScenarioRequest(BaseModel):
    scenario: str
    session_id: str = "default"


@router.get("/scenarios")
def list_scenarios() -> Dict[str, Any]:
    """Return metadata for all available disruption scenarios."""
    return {
        "scenarios": [
            {"key": "storm",    "icon": "🌪️", "title": "Storm at Seattle Port",      "desc": "Port closure affecting 14 inbound shipments. AI must reroute via LA or Vancouver."},
            {"key": "strike",   "icon": "✊", "title": "Depot B Labor Strike",        "desc": "Portland depot unavailable tomorrow. 8 shipments need alternate drop points."},
            {"key": "capacity", "icon": "📦", "title": "Warehouse C Overflow",        "desc": "Denver warehouse at 98% capacity. Block new inbounds, reroute to alternate."},
            {"key": "truck",    "icon": "🚛", "title": "Fleet Breakdown ×3",          "desc": "Three refrigerated trucks out of service. Perishable shipments at risk."},
            {"key": "demand",   "icon": "📈", "title": "Demand Surge (+40%)",         "desc": "Sudden volume spike. AI must allocate idle fleet and reprioritize queue."},
            {"key": "blackout", "icon": "⚡", "title": "Grid Outage — Midwest Hub",  "desc": "Power failure at hub. Operations suspended for estimated 6 hours."},
        ]
    }


@router.post("/trigger")
def trigger_scenario(req: ScenarioRequest) -> Dict[str, Any]:
    """
    Trigger a named disruption scenario. Mutates the live env state and
    returns a structured log of what happened.
    """
    if req.scenario not in VALID_SCENARIOS:
        raise HTTPException(422, f"Unknown scenario '{req.scenario}'. Valid: {VALID_SCENARIOS}")

    env = _get_env(req.session_id)
    s = env._state
    _sim_logs[req.session_id] = []  # Clear previous logs

    handler = {
        "storm":    _scenario_storm,
        "strike":   _scenario_strike,
        "capacity": _scenario_capacity,
        "truck":    _scenario_truck,
        "demand":   _scenario_demand,
        "blackout": _scenario_blackout,
    }[req.scenario]

    result = handler(env, req.session_id)

    return {
        "session_id": req.session_id,
        "scenario": req.scenario,
        "log": _sim_logs.get(req.session_id, []),
        **result,
    }


@router.get("/log")
def get_log(session_id: str = Query(default="default")) -> Dict[str, Any]:
    return {
        "session_id": session_id,
        "log": _sim_logs.get(session_id, []),
    }


# ---------------------------------------------------------------------------
# Scenario Handlers
# ---------------------------------------------------------------------------

def _scenario_storm(env, session_id: str) -> Dict[str, Any]:
    s = env._state
    _log(session_id, "[TRIGGER] Storm scenario initiated: Seattle Port", "trigger")

    # Count unassigned shipments (simulate 'affected')
    affected = [sh for sh in s.shipments.values() if sh.status == ShipmentStatus.UNASSIGNED][:14]
    _log(session_id, f"Identifying affected shipments...", "info")
    _log(session_id, f"Found {len(affected)} shipments routing through affected zone", "info")
    ids = ", ".join(sh.shipment_id for sh in affected[:5])
    if len(affected) > 5:
        ids += f"... (+{len(affected)-5} more)"
    _log(session_id, f" {ids}", "info")

    # Inject a storm alert into the env
    storm_alert = UnstructuredAlert(
        alert_id="ALT-SIM-STORM",
        severity=AlertSeverity.CRITICAL,
        subject="[SIMULATED] Storm — Seattle Port closure",
        body=(
            "Severe storm confirmed at Port of Seattle. All cargo operations suspended "
            "indefinitely. Reroute via Los Angeles (WH_PDX_MAIN) or Vancouver (WH_VAN_BC)."
        ),
        affects_warehouse=None,
        is_read=False,
        received_at_step=s.current_step,
    )
    # Remove if already injected
    s.alerts = [a for a in s.alerts if a.alert_id != "ALT-SIM-STORM"]
    s.alerts.insert(0, storm_alert)

    _log(session_id, "Calculating alternate routes...", "info")
    _log(session_id, "[AI] Optimal reroute: Portland Main (cost +$840/shipment)", "highlight")
    _log(session_id, "[AI] Secondary option: Vancouver BC (requires customs clearance +6h)", "highlight")
    _log(session_id, "[SUCCESS] Storm alert injected. Check Alerts page and AI Decisions.", "success")
    _log(session_id, "[DONE] Estimated impact: +$11,800 | Delay avoided: 48-72h", "success")

    return {
        "success": True,
        "affected_count": len(affected),
        "new_alert_id": "ALT-SIM-STORM",
        "message": "Storm scenario triggered. Alert injected. Reroute via WH_PDX_MAIN or WH_VAN_BC.",
    }


def _scenario_strike(env, session_id: str) -> Dict[str, Any]:
    s = env._state
    _log(session_id, "[TRIGGER] Labor strike scenario: Portland Depot B", "trigger")

    # Disable WH_PDX_MAIN (Portland Main) to simulate strike
    if WarehouseID.PORTLAND_MAIN in s.warehouses:
        wh = s.warehouses[WarehouseID.PORTLAND_MAIN]
        s.warehouses[WarehouseID.PORTLAND_MAIN] = WarehouseSummary(
            **{**wh.model_dump(), "strike_active": True, "is_operational": False}
        )
        _log(session_id, "Strike effective: immediately", "info")
    
    affected = [sh for sh in s.shipments.values() if sh.assigned_warehouse == WarehouseID.PORTLAND_MAIN]
    _log(session_id, f"Found {len(affected)} shipments assigned to strike-hit depot", "info")

    # Inject alert
    alert = UnstructuredAlert(
        alert_id="ALT-SIM-STRIKE",
        severity=AlertSeverity.CRITICAL,
        subject="[SIMULATED] Portland Main — Labor Strike",
        body=(
            "Workers at WH_PDX_MAIN voted to walk out. Picket lines active. "
            "Do NOT dispatch trucks to Portland Main. Reroute to Tacoma South or Spokane."
        ),
        affects_warehouse=WarehouseID.PORTLAND_MAIN,
        is_read=False,
        received_at_step=s.current_step,
    )
    s.alerts = [a for a in s.alerts if a.alert_id != "ALT-SIM-STRIKE"]
    s.alerts.insert(0, alert)

    _log(session_id, "[AI] Reroute affected shipments to WH_TAC_SOUTH or WH_SPK_CENTRAL", "highlight")
    _log(session_id, "[SUCCESS] Strike active. Portland Main locked.", "success")
    _log(session_id, "[DONE] Decisions added to AI panel for approval", "success")

    return {
        "success": True,
        "affected_warehouse": "WH_PDX_MAIN",
        "affected_shipments": len(affected),
        "message": "Strike triggered. WH_PDX_MAIN locked. Reroute to WH_TAC_SOUTH or WH_SPK_CENTRAL.",
    }


def _scenario_capacity(env, session_id: str) -> Dict[str, Any]:
    s = env._state
    _log(session_id, "[TRIGGER] Capacity overflow: Spokane Central", "trigger")

    # Fill WH_SPK_CENTRAL to 98%
    if WarehouseID.SPOKANE_CENTRAL in s.warehouses:
        wh = s.warehouses[WarehouseID.SPOKANE_CENTRAL]
        new_load = wh.capacity_tons * 0.98
        s.warehouses[WarehouseID.SPOKANE_CENTRAL] = WarehouseSummary(
            **{**wh.model_dump(), "current_load_tons": round(new_load, 1)}
        )

    affected_inbound = [
        sh for sh in s.shipments.values()
        if sh.status == ShipmentStatus.UNASSIGNED
    ][:6]

    _log(session_id, f"Current load: 98% → Projected 100% in 18h", "info")
    _log(session_id, f"Found {len(affected_inbound)} inbound shipments in next 12 hours", "info")
    _log(session_id, "[AI] BLOCK 3 low-priority inbounds", "highlight")
    _log(session_id, "[AI] EXPEDITE 4 outbound shipments to clear space", "highlight")
    _log(session_id, "[SUCCESS] WH_SPK_CENTRAL set to 98% capacity.", "success")
    _log(session_id, "[DONE] Overflow simulated. Reroute new inbounds to WH_TAC_SOUTH.", "success")

    return {
        "success": True,
        "affected_warehouse": "WH_SPK_CENTRAL",
        "utilization_pct": 98.0,
        "message": "Capacity overflow triggered on WH_SPK_CENTRAL. Block new inbounds.",
    }


def _scenario_truck(env, session_id: str) -> Dict[str, Any]:
    s = env._state
    _log(session_id, "[TRIGGER] Fleet breakdown: trucks going offline", "trigger")

    # Take 3 trucks offline
    disabled = []
    for tid, truck in list(s.trucks.items())[:3]:
        if truck.is_available:
            from models import TruckSummary
            s.trucks[tid] = TruckSummary(
                **{**truck.model_dump(), "is_available": False, "current_location": None}
            )
            disabled.append(tid)
            _log(session_id, f"{tid} taken offline (mechanical failure)", "error")

    # Find perishable shipments at risk
    at_risk = [
        sh for sh in s.shipments.values()
        if "refrigerated" in sh.cargo_flags and sh.status != ShipmentStatus.DELIVERED
    ]
    _log(session_id, f"HIGH RISK: {len(at_risk)} refrigerated shipments unprotected", "error")
    _log(session_id, "[AI] Assign remaining refrigerated-capable trucks immediately", "highlight")

    idle_now = [t for t in s.trucks.values() if t.is_available]
    _log(session_id, f"[SUCCESS] {len(disabled)} trucks offline. {len(idle_now)} idle trucks remain.", "success")

    return {
        "success": True,
        "trucks_disabled": [str(t) for t in disabled],
        "refrigerated_at_risk": len(at_risk),
        "message": f"{len(disabled)} trucks taken offline. Reassign refrigerated cargo immediately.",
    }


def _scenario_demand(env, session_id: str) -> Dict[str, Any]:
    s = env._state
    _log(session_id, "[TRIGGER] Demand surge detected: +40% volume spike", "trigger")

    # Add 5 new unassigned shipments to simulate surge
    import random
    rng = random.Random(99)
    new_count = 0
    for i in range(300, 306):
        sid = f"SHP-{i:04d}"
        if sid not in s.shipments:
            s.shipments[sid] = ShipmentSummary(
                shipment_id=sid,
                cargo_flags=["standard"],
                deadline_step=s.current_step + rng.randint(8, 20),
                penalty_per_step_late=round(rng.uniform(0.02, 0.04), 3),
                status=ShipmentStatus.UNASSIGNED,
                weight_tons=round(rng.uniform(2.0, 10.0), 1),
            )
            new_count += 1

    _log(session_id, f"New shipments queued: {new_count} additional orders added", "info")
    idle = sum(1 for t in s.trucks.values() if t.is_available)
    _log(session_id, f"Scanning idle fleet assets... Found {idle} idle trucks", "info")
    _log(session_id, "[AI] Activate all idle trucks immediately", "highlight")
    _log(session_id, "[AI] Reprioritize queue — high-value shipments first", "highlight")
    _log(session_id, f"[SUCCESS] {new_count} new shipments injected into queue.", "success")
    _log(session_id, "[DONE] Surge absorbed. Prioritize by deadline urgency.", "success")

    return {
        "success": True,
        "new_shipments_added": new_count,
        "total_shipments": len(s.shipments),
        "message": f"Demand surge: {new_count} new shipments added. Fleet utilisation rising.",
    }


def _scenario_blackout(env, session_id: str) -> Dict[str, Any]:
    s = env._state
    _log(session_id, "[TRIGGER] Grid outage: Tacoma South Hub", "trigger")

    # Take WH_TAC_SOUTH offline
    if WarehouseID.TACOMA_SOUTH in s.warehouses:
        wh = s.warehouses[WarehouseID.TACOMA_SOUTH]
        s.warehouses[WarehouseID.TACOMA_SOUTH] = WarehouseSummary(
            **{**wh.model_dump(), "is_operational": False, "eta_reopen_step": s.current_step + 15}
        )

    affected = [
        sh for sh in s.shipments.values()
        if sh.assigned_warehouse == WarehouseID.TACOMA_SOUTH
    ]
    _log(session_id, f"Estimated downtime: 15 steps (~6 hours)", "info")
    _log(session_id, f"Found {len(affected)} shipments with Tacoma South as destination", "info")
    _log(session_id, "[AI] Reroute critical shipments bypassing WH_TAC_SOUTH", "highlight")
    _log(session_id, "[AI] Hold non-urgent shipments at previous waypoints", "highlight")
    _log(session_id, f"[SUCCESS] WH_TAC_SOUTH offline. Reopens at step {s.current_step + 15}.", "success")
    _log(session_id, "[DONE] Estimated impact: +$4,200. Reroute to WH_SPK_CENTRAL.", "success")

    return {
        "success": True,
        "offline_warehouse": "WH_TAC_SOUTH",
        "eta_reopen_step": s.current_step + 15,
        "affected_shipments": len(affected),
        "message": "Blackout triggered on WH_TAC_SOUTH. Reopens in 15 steps. Reroute immediately.",
    }
