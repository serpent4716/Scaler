# routers/map_routing.py
# Map & Routing endpoint — powers the Map page with geo-enriched data.

from __future__ import annotations
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from models import WarehouseID, ShipmentStatus

router = APIRouter(prefix="/map", tags=["Map & Routing"])

# Static geo coordinates for each warehouse (approximate US Pacific Northwest)
WAREHOUSE_GEO = {
    "WH_PDX_MAIN":      {"city": "Portland",    "state": "OR", "lat": 45.5231, "lng": -122.6765},
    "WH_PDX_COLD":      {"city": "Portland",    "state": "OR", "lat": 45.5051, "lng": -122.6750},
    "WH_TAC_NORTH":     {"city": "Tacoma",      "state": "WA", "lat": 47.2529, "lng": -122.4443},
    "WH_TAC_SOUTH":     {"city": "Tacoma",      "state": "WA", "lat": 47.2000, "lng": -122.4400},
    "WH_SPK_CENTRAL":   {"city": "Spokane",     "state": "WA", "lat": 47.6588, "lng": -117.4260},
    "WH_VAN_BC":        {"city": "Vancouver",   "state": "BC", "lat": 49.2827, "lng": -123.1207},
    "WH_BOI_LOGISTICS": {"city": "Boise",       "state": "ID", "lat": 43.6150, "lng": -116.2023},
    # Seattle port (closed) — origin
    "SEA_PORT":         {"city": "Seattle",     "state": "WA", "lat": 47.6062, "lng": -122.3321},
}

TRUCK_GEO_DEFAULTS = {
    "TRK_001": {"lat": 47.4, "lng": -122.4},
    "TRK_002": {"lat": 47.3, "lng": -122.5},
    "TRK_003": {"lat": 45.6, "lng": -122.7},
    "TRK_004": {"lat": 47.5, "lng": -122.2},
    "TRK_005": {"lat": 47.2, "lng": -122.3},
    "TRK_006": {"lat": 45.4, "lng": -122.6},
    "TRK_007": {"lat": 47.6, "lng": -122.5},
    "TRK_008": {"lat": 47.1, "lng": -122.4},
}


def _get_env(session_id: str):
    from server import _sessions
    if session_id not in _sessions:
        raise HTTPException(404, f"Session '{session_id}' not found.")
    return _sessions[session_id]


@router.get("/state")
def get_map_state(session_id: str = Query(default="default")) -> Dict[str, Any]:
    """
    Returns geo-enriched map state: warehouses with coords, trucks with positions,
    active routes, and disruption zones — all in one payload for the map page.
    """
    env = _get_env(session_id)
    s = env._state

    # Warehouses with geo
    warehouses_geo = []
    for wh in s.warehouses.values():
        geo = WAREHOUSE_GEO.get(str(wh.warehouse_id), {})
        warehouses_geo.append({
            "warehouse_id": wh.warehouse_id,
            "city": geo.get("city", "Unknown"),
            "state": geo.get("state", ""),
            "lat": geo.get("lat"),
            "lng": geo.get("lng"),
            "utilization_pct": round(wh.current_load_tons / wh.capacity_tons * 100, 1),
            "available_tons": round(wh.capacity_tons - wh.current_load_tons, 1),
            "is_operational": wh.is_operational,
            "strike_active": wh.strike_active,
            "is_refrigerated": wh.is_refrigerated,
            "accepts_hazmat": wh.accepts_hazmat,
            "status": (
                "closed" if not wh.is_operational
                else "strike" if wh.strike_active
                else "near-full" if (wh.current_load_tons / wh.capacity_tons) >= 0.85
                else "open"
            ),
        })

    # Trucks with geo
    trucks_geo = []
    for truck in s.trucks.values():
        tid = str(truck.truck_id)
        if truck.current_location:
            wh_geo = WAREHOUSE_GEO.get(str(truck.current_location), {})
            lat = wh_geo.get("lat", TRUCK_GEO_DEFAULTS.get(tid, {}).get("lat"))
            lng = wh_geo.get("lng", TRUCK_GEO_DEFAULTS.get(tid, {}).get("lng"))
        else:
            # In transit — use defaults with slight offset
            defaults = TRUCK_GEO_DEFAULTS.get(tid, {"lat": 47.0, "lng": -122.0})
            lat = defaults["lat"]
            lng = defaults["lng"]

        trucks_geo.append({
            "truck_id": truck.truck_id,
            "status": "idle" if truck.is_available else "in_transit",
            "lat": lat,
            "lng": lng,
            "is_hazmat_certified": truck.is_hazmat_certified,
            "capacity_tons": truck.capacity_tons,
            "current_load_tons": truck.current_load_tons,
            "current_location": truck.current_location,
        })

    # Active routes (assigned + in-transit shipments)
    routes = []
    for sh in s.shipments.values():
        if sh.status in (ShipmentStatus.ASSIGNED, ShipmentStatus.IN_TRANSIT) and sh.assigned_warehouse:
            dest_geo = WAREHOUSE_GEO.get(str(sh.assigned_warehouse), {})
            src_geo = WAREHOUSE_GEO.get("SEA_PORT", {})  # origin = Seattle port
            routes.append({
                "shipment_id": sh.shipment_id,
                "status": sh.status,
                "origin": {"name": "Seattle Port", "lat": src_geo.get("lat"), "lng": src_geo.get("lng")},
                "destination": {
                    "name": str(sh.assigned_warehouse),
                    "lat": dest_geo.get("lat"),
                    "lng": dest_geo.get("lng"),
                },
                "cargo_flags": sh.cargo_flags,
                "weight_tons": sh.weight_tons,
                "deadline_step": sh.deadline_step,
                "assigned_truck": sh.assigned_truck,
                "is_delayed": sh.status == ShipmentStatus.DELAYED,
            })

    # Disruption zones
    disruptions = []
    # Seattle port always closed in this scenario
    sea_geo = WAREHOUSE_GEO["SEA_PORT"]
    disruptions.append({
        "id": "SEA_PORT",
        "name": "Port of Seattle",
        "type": "closure",
        "lat": sea_geo["lat"],
        "lng": sea_geo["lng"],
        "reason": "Storm closure — all operations suspended",
    })
    # Any warehouse with strike or closed
    for wh in s.warehouses.values():
        geo = WAREHOUSE_GEO.get(str(wh.warehouse_id), {})
        if wh.strike_active:
            disruptions.append({
                "id": str(wh.warehouse_id),
                "name": str(wh.warehouse_id),
                "type": "strike",
                "lat": geo.get("lat"),
                "lng": geo.get("lng"),
                "reason": "Labor strike — do not dispatch",
            })
        elif not wh.is_operational:
            disruptions.append({
                "id": str(wh.warehouse_id),
                "name": str(wh.warehouse_id),
                "type": "closed",
                "lat": geo.get("lat"),
                "lng": geo.get("lng"),
                "reason": f"Closed — reopens step {wh.eta_reopen_step or '?'}",
            })

    return {
        "session_id": session_id,
        "current_step": s.current_step,
        "warehouses": warehouses_geo,
        "trucks": trucks_geo,
        "routes": routes,
        "disruptions": disruptions,
        "summary": {
            "active_routes": len(routes),
            "trucks_in_transit": sum(1 for t in trucks_geo if t["status"] == "in_transit"),
            "disrupted_locations": len(disruptions),
            "idle_trucks": sum(1 for t in trucks_geo if t["status"] == "idle"),
        },
    }
