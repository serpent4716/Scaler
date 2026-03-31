// src/api.js
// Central API client — all backend calls go through here.
// Set VITE_API_BASE in .env to point to your backend.

const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:7860'

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

const get  = (path)        => request('GET',    path)
const post = (path, body)  => request('POST',   path, body)
const del  = (path)        => request('DELETE', path)

// ── Session ──────────────────────────────────────────────
export const resetSession = (difficulty = 'easy', seed = 42) =>
  post('/reset', { session_id: 'default', difficulty, seed })

export const getState = () => get('/state?session_id=default')

// ── Dashboard ─────────────────────────────────────────────
export const getDashboardSummary = () =>
  get('/dashboard/summary?session_id=default')

// ── Shipments ─────────────────────────────────────────────
export const getShipments = (status, priority) => {
  const params = new URLSearchParams({ session_id: 'default' })
  if (status)   params.append('status', status)
  if (priority) params.append('priority', priority)
  return get(`/shipments?${params}`)
}

export const getShipment = (id) =>
  get(`/shipments/${id}?session_id=default`)

export const rerouteShipment = (id, target_warehouse, rationale) =>
  post(`/shipments/${id}/reroute?session_id=default`, { target_warehouse, rationale })

export const holdShipment = (id) =>
  post(`/shipments/${id}/hold?session_id=default`, { rationale: 'Hold via dashboard.' })

export const cancelRoute = (id) =>
  post(`/shipments/${id}/cancel-route?session_id=default`)

export const prioritizeShipment = (id) =>
  post(`/shipments/${id}/prioritize?session_id=default`)

// ── Warehouses ────────────────────────────────────────────
export const getWarehouses = () =>
  get('/warehouses?session_id=default')

export const getWarehouse = (id) =>
  get(`/warehouses/${id}?session_id=default`)

// ── Fleet ─────────────────────────────────────────────────
export const getFleet = () =>
  get('/fleet?session_id=default')

export const dispatchTruck = (truckId, shipment_id, target_warehouse) =>
  post(`/fleet/${truckId}/dispatch?session_id=default`, { shipment_id, target_warehouse, rationale: 'Dispatched via fleet panel.' })

// ── Alerts ────────────────────────────────────────────────
export const getAlerts = (unreadOnly = false) =>
  get(`/alerts?session_id=default&unread_only=${unreadOnly}`)

export const readAlert = (alertId) =>
  post(`/alerts/${alertId}/read?session_id=default`)

// ── AI Decisions ──────────────────────────────────────────
export const getDecisions = (refresh = false) =>
  get(`/ai/decisions?session_id=default&refresh=${refresh}`)

export const acceptDecision = (id, rationale = '') =>
  post(`/ai/decisions/${id}/accept?session_id=default`, { rationale })

export const rejectDecision = (id, rationale = '') =>
  post(`/ai/decisions/${id}/reject?session_id=default`, { rationale })

// ── Simulator ─────────────────────────────────────────────
export const getScenarios = () => get('/simulator/scenarios')

export const triggerScenario = (scenario) =>
  post('/simulator/trigger', { scenario, session_id: 'default' })

export const getSimulatorLog = () =>
  get('/simulator/log?session_id=default')

// ── Analytics ─────────────────────────────────────────────
export const getAnalytics = () =>
  get('/analytics?session_id=default')

// ── Map ───────────────────────────────────────────────────
export const getMapState = () =>
  get('/map/state?session_id=default')
