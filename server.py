# server.py
# FastAPI HTTP wrapper — exposes the OpenEnv step()/reset()/state() API
# PLUS all the DISPATCH dashboard endpoints (shipments, fleet, warehouses,
# alerts, AI decisions, simulator, analytics, map).

from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from env import CloudLogisticsEnv
from models import Action

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="DISPATCH — AI Logistics Dispatcher API",
    description=(
        "OpenEnv-compliant supply chain disruption environment + "
        "full REST API for the DISPATCH logistics dashboard. "
        "Supports shipment routing, fleet management, warehouse ops, "
        "AI decisions (Gemini-powered), scenario simulation, and analytics."
    ),
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-process session store (shared across all routers via late import)
# ---------------------------------------------------------------------------

_sessions: Dict[str, CloudLogisticsEnv] = {}

VALID_DIFFICULTIES = ("easy", "medium", "hard")


def _get_env(session_id: str) -> CloudLogisticsEnv:
    if session_id not in _sessions:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found. Call /reset first.",
        )
    return _sessions[session_id]


# ---------------------------------------------------------------------------
# Register routers
# ---------------------------------------------------------------------------

from routers.dashboard import router as dashboard_router
from routers.shipments import router as shipments_router
from routers.warehouses import router as warehouses_router
from routers.fleet import router as fleet_router
from routers.alerts import router as alerts_router
from routers.ai_decisions import router as ai_router
from routers.simulator import router as simulator_router
from routers.analytics import router as analytics_router
from routers.map_routing import router as map_router

app.include_router(dashboard_router)
app.include_router(shipments_router)
app.include_router(warehouses_router)
app.include_router(fleet_router)
app.include_router(alerts_router)
app.include_router(ai_router)
app.include_router(simulator_router)
app.include_router(analytics_router)
app.include_router(map_router)

# ---------------------------------------------------------------------------
# Core OpenEnv endpoints (unchanged API contract)
# ---------------------------------------------------------------------------

class ResetRequest(BaseModel):
    session_id: str = "default"
    difficulty: str = "easy"
    seed: Optional[int] = None


class StepRequest(BaseModel):
    session_id: str = "default"
    action: Action


@app.get("/health")
def health() -> Dict[str, Any]:
    """Phase 1 automated validation: environment responds."""
    return {
        "status": "ok",
        "environment": "dispatch-ai-logistics",
        "version": "2.0.0",
        "active_sessions": len(_sessions),
    }


@app.post("/reset")
def reset(req: ResetRequest) -> Dict[str, Any]:
    """
    Initialise or re-initialise a session.
    Returns the first Observation.
    Also clears any cached AI decisions for this session.
    """
    if req.difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(
            status_code=422,
            detail=f"difficulty must be one of {VALID_DIFFICULTIES}.",
        )
    env = CloudLogisticsEnv(difficulty=req.difficulty, seed=req.seed)
    _sessions[req.session_id] = env

    # Clear stale AI decisions for this session
    from routers.ai_decisions import _decision_store
    _decision_store.pop(req.session_id, None)

    obs = env.reset()
    return {
        "session_id": req.session_id,
        "difficulty": req.difficulty,
        "seed": req.seed,
        "observation": obs.model_dump(),
    }


@app.post("/step")
def step(req: StepRequest) -> Dict[str, Any]:
    """Execute one action and return (observation, reward, done, info)."""
    env = _get_env(req.session_id)
    obs, reward, done, info = env.step(req.action)
    return {
        "observation": obs.model_dump(),
        "reward": reward,
        "done": done,
        "info": info,
    }


@app.get("/state")
def state(session_id: str = Query(default="default")) -> Dict[str, Any]:
    """Return current observation without advancing the step counter."""
    env = _get_env(session_id)
    obs = env.state()
    return {"session_id": session_id, "observation": obs.model_dump()}


@app.get("/sessions")
def list_sessions() -> Dict[str, Any]:
    """Lists active session IDs and their difficulty."""
    return {
        "active_sessions": {
            sid: {
                "difficulty": env.difficulty,
                "current_step": env._state.current_step if env._state else 0,
                "max_steps": env._state.max_steps if env._state else 0,
            }
            for sid, env in _sessions.items()
        }
    }


@app.delete("/sessions/{session_id}")
def delete_session(session_id: str) -> Dict[str, Any]:
    """Remove a session from the store."""
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    del _sessions[session_id]
    from routers.ai_decisions import _decision_store
    _decision_store.pop(session_id, None)
    return {"session_id": session_id, "message": "Session deleted."}


# ---------------------------------------------------------------------------
# Convenience: auto-init default session on startup
# ---------------------------------------------------------------------------

@app.on_event("startup")
async def startup_event():
    """Auto-create a default session so the dashboard works without manual /reset."""
    env = CloudLogisticsEnv(difficulty="easy", seed=42)
    _sessions["default"] = env
    env.reset()
    print("✓ Default session initialised (difficulty=easy, seed=42)")
    print(f"✓ DISPATCH API ready — {len(app.routes)} routes registered")
