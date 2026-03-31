# DISPATCH — AI Logistics Dispatcher Backend

FastAPI backend for the DISPATCH logistics dashboard.  
OpenEnv-compliant RL environment + full REST API for all 10 dashboard pages.

## Stack
- **FastAPI** 0.111 + **Uvicorn**
- **Pydantic** v2 (strict typed models)
- **Google Gemini** 2.5 Flash (AI decisions, inference agent)
- Pure Python — no database, in-memory session store

---

## Quick Start

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Set your Gemini API key (optional — falls back to rule engine)
export GEMINI_API_KEY=your_key_here

# 3. Run
uvicorn server:app --reload --port 7860

# 4. Open docs
open http://localhost:7860/docs
```

A `default` session (difficulty=easy, seed=42) is auto-created on startup —
the frontend works immediately without a manual `/reset` call.

---

## API Reference

### Core OpenEnv Endpoints (original)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/reset` | Start/restart a session |
| POST | `/step` | Execute one action |
| GET | `/state` | Get current observation |
| GET | `/sessions` | List active sessions |
| DELETE | `/sessions/{id}` | Remove a session |

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/summary` | All KPIs, warehouse snapshot, alert counts |

### Shipments
| Method | Path | Description |
|--------|------|-------------|
| GET | `/shipments` | List all shipments (filter: `status`, `priority`) |
| GET | `/shipments/{id}` | Single shipment detail |
| POST | `/shipments/{id}/reroute` | Assign to warehouse |
| POST | `/shipments/{id}/hold` | Place on hold |
| POST | `/shipments/{id}/cancel-route` | Undo route assignment |
| POST | `/shipments/{id}/prioritize` | Mark high-priority |

### Warehouses
| Method | Path | Description |
|--------|------|-------------|
| GET | `/warehouses` | All warehouses with capacity |
| GET | `/warehouses/{id}` | Single warehouse + assigned shipments |

### Fleet
| Method | Path | Description |
|--------|------|-------------|
| GET | `/fleet` | All trucks (triggers QUERY_FLEET in env) |
| GET | `/fleet/{id}` | Single truck details |
| POST | `/fleet/{id}/dispatch` | Dispatch truck for a shipment |

### Alerts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/alerts` | All alerts (`?unread_only=true`) |
| POST | `/alerts/{id}/read` | Read alert + get AI interpretation |

### AI Decisions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/ai/decisions` | Get decisions (`?refresh=true` to regenerate) |
| POST | `/ai/decisions/{id}/accept` | Accept + execute in env |
| POST | `/ai/decisions/{id}/reject` | Reject (logged) |
| DELETE | `/ai/decisions` | Clear all decisions |

### Simulator
| Method | Path | Description |
|--------|------|-------------|
| GET | `/simulator/scenarios` | List all 6 scenario definitions |
| POST | `/simulator/trigger` | Trigger a scenario (mutates live state) |
| GET | `/simulator/log` | Get last simulation log |

**Available scenarios:** `storm`, `strike`, `capacity`, `truck`, `demand`, `blackout`

### Analytics
| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics` | Full analytics payload (KPIs, charts, trends) |

### Map & Routing
| Method | Path | Description |
|--------|------|-------------|
| GET | `/map/state` | Geo-enriched warehouses, trucks, routes, disruptions |

---

## Session Model

All endpoints accept `?session_id=default` (default: `"default"`).  
Each session is an independent `CloudLogisticsEnv` instance — safe for multi-user demos.

## Difficulty Levels

| Level | Shipments | Max Steps | Warehouses | Special |
|-------|-----------|-----------|------------|---------|
| easy | 10 | 40 | 1 closed | Standard cargo only |
| medium | 25 | 80 | 1 closed, 1 near-full | Mixed cargo |
| hard | 50 | 150 | Strike alert (unstructured) | 5 refrigerated shipments |

## AI Decisions

The `/ai/decisions` endpoint uses **Google Gemini 2.5 Flash** to analyse the current
environment state and generate 4–6 structured routing recommendations.

If no `GEMINI_API_KEY` is set, a deterministic rule-based engine kicks in automatically —
the dashboard works fully without an API key.

When a decision is **accepted**, the underlying action is executed directly in the env
(e.g., `ROUTE_SHIPMENT`, `DISPATCH_TRUCK`) and the reward/penalty are applied.

## Docker

```bash
docker build -t dispatch-backend .
docker run -p 7860:7860 -e GEMINI_API_KEY=your_key dispatch-backend
```

## Frontend Integration

Set `VITE_API_BASE=http://localhost:7860` in the frontend `.env` and all
dashboard API calls will route to this backend.

The React frontend (`dispatch-app/`) maps pages to endpoints:

| Page | Primary endpoint |
|------|-----------------|
| Landing | static |
| Dashboard | `/dashboard/summary` |
| Shipments | `/shipments` |
| Map | `/map/state` |
| Alerts | `/alerts` |
| AI Decisions | `/ai/decisions` |
| Fleet | `/fleet` |
| Warehouses | `/warehouses` |
| Simulator | `/simulator/trigger` |
| Analytics | `/analytics` |
