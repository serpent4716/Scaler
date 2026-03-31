# routers/alerts.py
# Alerts endpoints — powers the Alerts / Email Feed page.

from __future__ import annotations
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query
from models import Action, ActionType

router = APIRouter(prefix="/alerts", tags=["Alerts"])


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return _sessions[session_id]


def _serialize_alert(alert) -> Dict[str, Any]:
    return {
        "alert_id": alert.alert_id,
        "severity": alert.severity,
        "subject": alert.subject,
        "body": alert.body,
        "affects_warehouse": alert.affects_warehouse,
        "affects_truck": alert.affects_truck,
        "is_read": alert.is_read,
        "received_at_step": alert.received_at_step,
        # Derive a clean AI interpretation tag for the UI
        "type": (
            "critical" if alert.severity in ("critical", "high")
            else "warning" if alert.severity == "medium"
            else "info"
        ),
    }


@router.get("")
def list_alerts(
    session_id: str = Query(default="default"),
    unread_only: bool = Query(default=False),
) -> Dict[str, Any]:
    """List all alerts (inbox). Optionally filter to unread only."""
    env = _get_env(session_id)
    s = env._state
    alerts = s.alerts if not unread_only else [a for a in s.alerts if not a.is_read]
    return {
        "session_id": session_id,
        "total": len(alerts),
        "unread_count": sum(1 for a in s.alerts if not a.is_read),
        "alerts": [_serialize_alert(a) for a in alerts],
    }


@router.post("/{alert_id}/read")
def read_alert(alert_id: str, session_id: str = Query(default="default")) -> Dict[str, Any]:
    """
    Mark an alert as read by stepping the env with READ_INBOX.
    Finds the alert's position in the unread list and fires READ_INBOX.
    """
    env = _get_env(session_id)
    s = env._state

    unread = [a for a in s.alerts if not a.is_read]
    index = next((i for i, a in enumerate(unread) if a.alert_id == alert_id), None)

    if index is None:
        # Already read — return current state
        alert = next((a for a in s.alerts if a.alert_id == alert_id), None)
        if not alert:
            raise HTTPException(404, f"Alert '{alert_id}' not found.")
        return {
            "success": True,
            "already_read": True,
            "alert": _serialize_alert(alert),
            "message": "Alert was already read.",
        }

    action = Action(
        action_type=ActionType.READ_INBOX,
        inbox_index=index,
        rationale=f"Reading alert {alert_id} via dashboard to extract disruption information.",
    )
    obs, reward, done, info = env.step(action)

    return {
        "success": obs.last_action_success,
        "already_read": False,
        "alert": _serialize_alert(obs.recently_read_alert) if obs.recently_read_alert else None,
        "message": obs.last_action_message,
        "reward": reward,
        "ai_interpretation": _generate_ai_interpretation(obs.recently_read_alert),
    }


def _generate_ai_interpretation(alert) -> Optional[str]:
    """
    Generates a structured AI interpretation from unstructured alert text.
    In prod this would call Gemini; here we use keyword-based heuristics.
    """
    if alert is None:
        return None

    body = alert.body.lower()
    subject = alert.subject.lower()

    impacts = []
    actions = []

    if "strike" in body or "walk out" in body or "picket" in body:
        wh = alert.affects_warehouse or "affected warehouse"
        impacts.append(f"Labor action at {wh} — warehouse operationally unavailable.")
        actions.append(f"Do NOT route shipments to {wh}. Redirect to Portland or Spokane.")

    if "storm" in body or "closed" in body or "suspended" in body:
        impacts.append("Port closure confirmed — all inbound/outbound suspended.")
        actions.append("Reroute all Seattle-bound shipments immediately via LA or Vancouver.")

    if "refrigerat" in body or "cold chain" in body or "cold storage" in body:
        impacts.append("Cold-chain integrity risk for refrigerated shipments.")
        actions.append("Ensure all REFRIGERATED cargo routes to WH_PDX_COLD only.")

    if "capacity" in body or "backlog" in body or "maxed" in body:
        impacts.append("Warehouse approaching capacity limit — risk of overflow.")
        actions.append("Spread inbound shipments across alternate depots.")

    if not impacts:
        impacts.append("Advisory alert received — monitor situation.")
        actions.append("No immediate rerouting required. Continue normal operations.")

    return (
        " ".join(impacts) + " Recommended actions: " + " ".join(actions)
    )
