# server.py
# FastAPI HTTP wrapper — exposes step() / reset() / state() as REST endpoints
# This is what HuggingFace Spaces calls via the OpenEnv client.

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
    title="Supply Chain Disruption Dispatcher",
    description=(
        "An OpenEnv-compliant environment where an AI agent acts as a logistics "
        "dispatcher rerouting 10-50 shipments after the Port of Seattle closes."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# In-process session store
# One environment instance per session_id (keyed by string).
# HuggingFace Spaces is single-process — this is safe for the hackathon.
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
# Request / Response schemas
# ---------------------------------------------------------------------------

class ResetRequest(BaseModel):
    session_id: str = "default"
    difficulty: str = "easy"
    seed: Optional[int] = None


class StepRequest(BaseModel):
    session_id: str = "default"
    action: Action


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> Dict[str, str]:
    """Phase 1 automated validation: environment responds."""
    return {"status": "ok", "environment": "supply-chain-dispatcher"}


@app.post("/reset")
def reset(req: ResetRequest) -> Dict[str, Any]:
    """
    Initialise or re-initialise a session.
    Returns the first Observation.
    """
    if req.difficulty not in VALID_DIFFICULTIES:
        raise HTTPException(
            status_code=422,
            detail=f"difficulty must be one of {VALID_DIFFICULTIES}.",
        )
    env = CloudLogisticsEnv(difficulty=req.difficulty, seed=req.seed)
    _sessions[req.session_id] = env
    obs = env.reset()
    return {
        "session_id": req.session_id,
        "difficulty": req.difficulty,
        "observation": obs.model_dump(),
    }


@app.post("/step")
def step(req: StepRequest) -> Dict[str, Any]:
    """
    Execute one action and return (observation, reward, done, info).
    """
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
    """
    Return the current observation without advancing the step counter.
    """
    env = _get_env(session_id)
    obs = env.state()
    return {"session_id": session_id, "observation": obs.model_dump()}


@app.get("/sessions")
def list_sessions() -> Dict[str, Any]:
    """Debug endpoint — lists active session IDs and their difficulty."""
    return {
        "active_sessions": {
            sid: env.difficulty for sid, env in _sessions.items()
        }
    }