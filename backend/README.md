---
title: Supply Chain Disruption Dispatcher
emoji: 🚛
colorFrom: blue
colorTo: indigo
sdk: docker
app_file: server.py
pinned: false
---

Check out the configuration reference at https://huggingface.co/docs/hub/spaces-config-reference


# Supply Chain Disruption Dispatcher

An OpenEnv-compliant reinforcement learning environment where an AI agent
acts as a logistics dispatcher rerouting shipments after the Port of Seattle
closes due to a severe storm.

## Motivation

Real-world logistics dispatch is one of the highest-value planning tasks
for AI agents. Dispatchers must synthesise structured data (warehouse
capacity, fleet status) with unstructured information (email alerts, strike
notices) under hard time pressure. This environment captures that challenge
at three difficulty tiers.

## Environment Description

**Scenario:** A storm closes the Port of Seattle. 10–50 inbound shipments
need rerouting to 7 alternative warehouses across the Pacific Northwest.

**The agent must:**
- Read unstructured email alerts to discover strikes and closures
- Route shipments respecting capacity, refrigeration, and hazmat rules
- Dispatch trucks efficiently to meet delivery deadlines
- Avoid penalties for late deliveries, violations, and idle steps

## Action Space

| Action | Description |
|---|---|
| `read_inbox` | Consume one unread email alert |
| `check_warehouse` | Query capacity and status of a warehouse |
| `check_shipment` | Inspect a specific shipment's details |
| `route_shipment` | Assign a shipment to a warehouse |
| `dispatch_truck` | Send a truck to deliver an assigned shipment |
| `prioritize_shipment` | Tighten effective deadline for urgent cargo |
| `hold_shipment` | Place a shipment on hold |
| `cancel_route` | Undo an assignment and restore capacity |
| `query_fleet` | Get full fleet availability and locations |
| `no_op` | Intentional pass (must be justified) |

All actions require a `rationale` string (min 10 chars).

## Observation Space
```json
{
  "current_step": 5,
  "steps_remaining": 35,
  "visible_shipments": [...],
  "warehouse_status": [...],
  "unread_alert_count": 2,
  "alert_severity_summary": {"critical": 1, "high": 1},
  "current_penalty_accrued": -0.03,
  "current_reward_earned": 0.25
}
```

## Tasks & Difficulty

| Task | Shipments | Max Steps | Key Challenge |
|---|---|---|---|
| Easy | 10 | 40 | Basic rerouting around 1 closed warehouse |
| Medium | 25 | 80 | Capacity splitting across destinations |
| Hard | 50 | 150 | Parse strike alert, route 5 refrigerated shipments |

## Reward Function

| Event | Reward |
|---|---|
| Base step penalty | -0.01 |
| Read critical alert (first time) | +0.05 |
| Successful dispatch | +0.20 |
| On-time delivery | +0.30 |
| Capacity / closed warehouse violation | -0.50 |
| Strike violation | -0.50 |
| Refrigeration violation | -0.40 |
| Re-reading same alert | -0.02 |
| NO_OP streak (3+ consecutive) | -0.03 |

## Setup & Usage

### Local
```bash
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 7860
```

### Docker
```bash
docker build -t supply-chain-dispatcher .
docker run -p 7860:7860 supply-chain-dispatcher
```

### Run Baseline
```bash
export GEMINI_API_KEY=your-key-here
export ENV_BASE_URL=http://localhost:7860
python inference.py
```

## Baseline Scores

| Difficulty | Model | Episode Score |
|---|---|---|
| Easy | gpt-4o-mini | TBD after run |
| Medium | gpt-4o-mini | TBD after run |
| Hard | gpt-4o-mini | TBD after run |


*Run `python inference.py` locally and paste your scores here before submitting.*

## API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/health` | GET | Liveness check |
| `/reset` | POST | Start new episode |
| `/step` | POST | Execute one action |
| `/state` | GET | Current observation (no step advance) |

