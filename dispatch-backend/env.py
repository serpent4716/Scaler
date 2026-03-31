# env.py
# Phase 2 + 3: Full Environment — State Management, Execution Loop & Grader
# Supply Chain Disruption Dispatcher — OpenEnv Environment

from __future__ import annotations

import copy
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from models import (
    Action, ActionType, AlertSeverity, CargoFlag, Observation,
    RewardInfo, ShipmentStatus, ShipmentSummary, TruckID, TruckSummary,
    UnstructuredAlert, WarehouseID, WarehouseSummary,
)


# ---------------------------------------------------------------------------
# Internal State Container
# ---------------------------------------------------------------------------

@dataclass
class _EnvState:
    current_step: int = 0
    max_steps: int = 0
    difficulty: str = "easy"

    warehouses: Dict[WarehouseID, WarehouseSummary] = field(default_factory=dict)
    trucks: Dict[TruckID, TruckSummary] = field(default_factory=dict)
    shipments: Dict[str, ShipmentSummary] = field(default_factory=dict)
    alerts: List[UnstructuredAlert] = field(default_factory=list)

    penalty_accrued: float = 0.0
    reward_earned: float = 0.0

    # Anti-hack registries
    read_alert_ids: set = field(default_factory=set)       # ALT-IDs already rewarded
    inspected_shipment_ids: set = field(default_factory=set)
    no_op_streak: int = 0                                  # Consecutive NO_OPs
    repeated_action_counts: Dict[str, int] = field(default_factory=dict)

    # Violation ledger — grader reads these at episode end
    capacity_violations: int = 0
    strike_violations: int = 0
    refrigeration_violations: int = 0
    hazmat_violations: int = 0


# ---------------------------------------------------------------------------
# Environment Class
# ---------------------------------------------------------------------------

class CloudLogisticsEnv:
    """
    OpenEnv-compliant environment: Supply Chain Disruption Dispatcher.
    step() / reset() / state() API.
    """

    DIFFICULTY_LEVELS = ("easy", "medium", "hard")
    MAX_STEPS: Dict[str, int] = {"easy": 40, "medium": 80, "hard": 150}

    # Reward constants — centralised so grader and step() stay in sync
    R_BASE_STEP_PENALTY        = -0.01
    R_READ_CRITICAL_ALERT      = +0.05
    R_READ_DUPLICATE_ALERT     = -0.02   # Anti-hack: re-reading same alert
    R_DISPATCH_SUCCESS         = +0.20
    R_DELIVERY_ON_TIME         = +0.30
    R_DELIVERY_LATE_BASE       = -0.05   # Per step late, scaled by penalty_per_step_late
    R_CAPACITY_VIOLATION       = -0.50
    R_STRIKE_VIOLATION         = -0.50
    R_REFRIGERATION_VIOLATION  = -0.40
    R_HAZMAT_VIOLATION         = -0.35
    R_NO_OP_STREAK_PENALTY     = -0.03   # Applied from 3rd consecutive NO_OP onward
    R_REPEATED_ACTION_PENALTY  = -0.02   # Identical action fingerprint repeated > 3×
    R_RATIONALE_BONUS_MAX      = +0.05

    def __init__(self, difficulty: str = "easy", seed: Optional[int] = None) -> None:
        if difficulty not in self.DIFFICULTY_LEVELS:
            raise ValueError(
                f"difficulty must be one of {self.DIFFICULTY_LEVELS}, got '{difficulty}'"
            )
        self.difficulty = difficulty
        self.seed = seed
        self._rng = random.Random(seed)
        self._state: Optional[_EnvState] = None

    # ------------------------------------------------------------------
    # PUBLIC OpenEnv API
    # ------------------------------------------------------------------

    def reset(self) -> Observation:
        self._rng = random.Random(self.seed)
        self._state = self._generate_scenario(self.difficulty)
        return self._build_observation(
            last_action_type=None,
            last_action_success=True,
            last_action_message=(
                "Dispatch centre online. Port of Seattle closed. Awaiting orders."
            ),
            recently_read_alert=None,
            include_fleet=False,
        )

    def state(self) -> Observation:
        """Return current observation without advancing the step counter."""
        if self._state is None:
            raise RuntimeError("Call reset() before state().")
        return self._build_observation(
            last_action_type=None,
            last_action_success=True,
            last_action_message="State snapshot requested.",
            recently_read_alert=None,
            include_fleet=False,
        )

    def step(self, action: Action) -> Tuple[Observation, float, bool, dict]:
        """
        Execute one action and advance the world by one time step.

        Returns
        -------
        observation : Observation
        reward      : float          — scalar in [-1, 1]
        done        : bool
        info        : dict           — contains full RewardInfo + debug data
        """
        if self._state is None:
            raise RuntimeError("Call reset() before step().")

        s = self._state

        # --- Initialise reward components for this step ---
        reward_parts = _RewardAccumulator()
        reward_parts.add(self.R_BASE_STEP_PENALTY, "base_step_penalty")

        recently_read_alert: Optional[UnstructuredAlert] = None
        action_success = True
        message = ""
        include_fleet = False

        # ------------------------------------------------------------------
        # Anti-hack: repeated identical action fingerprint
        # ------------------------------------------------------------------
        action_key = self._action_fingerprint(action)
        s.repeated_action_counts[action_key] = (
            s.repeated_action_counts.get(action_key, 0) + 1
        )
        if s.repeated_action_counts[action_key] > 3:
            reward_parts.add(
                self.R_REPEATED_ACTION_PENALTY,
                f"repeated_action_penalty({action_key})"
            )

        # ------------------------------------------------------------------
        # Dispatch to action handlers
        # ------------------------------------------------------------------
        t = action.action_type

        if t == ActionType.NO_OP:
            s.no_op_streak += 1
            if s.no_op_streak >= 3:
                reward_parts.add(
                    self.R_NO_OP_STREAK_PENALTY,
                    f"no_op_streak({s.no_op_streak})"
                )
            message = f"No operation taken. Streak: {s.no_op_streak}."

        else:
            s.no_op_streak = 0  # Any real action resets the streak

            if t == ActionType.READ_INBOX:
                recently_read_alert, action_success, message = (
                    self._handle_read_inbox(action, reward_parts)
                )

            elif t == ActionType.CHECK_SHIPMENT:
                action_success, message = self._handle_check_shipment(action)

            elif t == ActionType.CHECK_WAREHOUSE:
                action_success, message = self._handle_check_warehouse(action)

            elif t == ActionType.QUERY_FLEET:
                include_fleet = True
                action_success = True
                message = "Fleet status retrieved."

            elif t == ActionType.ROUTE_SHIPMENT:
                action_success, message = self._handle_route_shipment(
                    action, reward_parts
                )

            elif t == ActionType.DISPATCH_TRUCK:
                action_success, message = self._handle_dispatch_truck(
                    action, reward_parts
                )

            elif t == ActionType.PRIORITIZE_SHIPMENT:
                action_success, message = self._handle_prioritize_shipment(action)

            elif t == ActionType.HOLD_SHIPMENT:
                action_success, message = self._handle_hold_shipment(action)

            elif t == ActionType.CANCEL_ROUTE:
                action_success, message = self._handle_cancel_route(action)

        # ------------------------------------------------------------------
        # Rationale quality bonus (heuristic)
        # ------------------------------------------------------------------
        rationale_bonus = self._score_rationale(action.rationale, t)
        if rationale_bonus > 0:
            reward_parts.add(rationale_bonus, "rationale_quality_bonus")

        # ------------------------------------------------------------------
        # Advance time — check for late deliveries
        # ------------------------------------------------------------------
        s.current_step += 1
        late_penalty = self._apply_late_penalties(reward_parts)

        # ------------------------------------------------------------------
        # Termination check
        # ------------------------------------------------------------------
        all_resolved = all(
            sh.status in (ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED)
            for sh in s.shipments.values()
        )
        truncated = s.current_step >= s.max_steps
        done = all_resolved or truncated

        # ------------------------------------------------------------------
        # Assemble scalar reward (clamped to [-1, 1])
        # ------------------------------------------------------------------
        raw_reward = reward_parts.total()
        scalar_reward = max(-1.0, min(1.0, raw_reward))

        s.penalty_accrued += min(0.0, scalar_reward)
        s.reward_earned   += max(0.0, scalar_reward)

        # ------------------------------------------------------------------
        # Build RewardInfo
        # ------------------------------------------------------------------
        episode_score: Optional[float] = None
        terminal_reason: Optional[str] = None

        if done:
            episode_score = self.get_episode_score()
            terminal_reason = (
                "all_shipments_resolved" if all_resolved else "max_steps_reached"
            )

        reward_info = self._build_reward_info(
            reward_parts=reward_parts,
            scalar_reward=scalar_reward,
            done=done,
            is_truncated=truncated,
            terminal_reason=terminal_reason,
            episode_score=episode_score,
        )

        obs = self._build_observation(
            last_action_type=t,
            last_action_success=action_success,
            last_action_message=message,
            recently_read_alert=recently_read_alert,
            include_fleet=include_fleet,
        )

        return obs, scalar_reward, done, {"reward_info": reward_info.model_dump()}

    # ------------------------------------------------------------------
    # GRADER  (0.0 – 1.0)
    # ------------------------------------------------------------------

    def get_episode_score(self) -> float:
        """
        Deterministic grader.  Called once when done=True.

        Scoring anatomy
        ---------------
        Start at 1.0 and subtract penalties:

        Component                           Max deduction
        --------------------------------------------- ----
        Unresolved / cancelled shipments    up to 0.40
        Late deliveries                     up to 0.30
        Refrigeration violations            up to 0.15
        Capacity / strike violations        up to 0.10
        Hazmat violations                   up to 0.05
        --------------------------------------------- ----
        Total possible deduction            1.00
        """
        s = self._state
        if s is None:
            return 0.0

        score = 1.0
        n = len(s.shipments)
        if n == 0:
            return 1.0

        # --- Unresolved shipments (-0.40 max) ---
        unresolved = sum(
            1 for sh in s.shipments.values()
            if sh.status not in (ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED)
        )
        score -= 0.40 * (unresolved / n)

        # --- Late deliveries (-0.30 max) ---
        # We track lateness as (actual_delivery_step - deadline_step) stored
        # in the shipment's _delivery_step attribute (set by _handle_dispatch_truck).
        # For undelivered, count as maximally late.
        total_late_fraction = 0.0
        for sh in s.shipments.values():
            delivery_step = getattr(sh, "_delivery_step", None)
            if sh.status == ShipmentStatus.DELIVERED and delivery_step is not None:
                steps_late = max(0, delivery_step - sh.deadline_step)
                if steps_late > 0:
                    # Scale: each step late costs penalty_per_step_late, capped at 1.0
                    fraction = min(1.0, steps_late * sh.penalty_per_step_late)
                    total_late_fraction += fraction
            elif sh.status not in (ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED):
                total_late_fraction += 1.0  # Unresolved = maximally late

        score -= 0.30 * (total_late_fraction / n)

        # --- Refrigeration violations (-0.15 max) ---
        refrig_total = sum(
            1 for sh in s.shipments.values()
            if CargoFlag.REFRIGERATED in sh.cargo_flags
        )
        if refrig_total > 0:
            score -= 0.15 * min(1.0, s.refrigeration_violations / refrig_total)

        # --- Capacity + strike violations (-0.10 max) ---
        total_violations = s.capacity_violations + s.strike_violations
        # Normalised against total shipments — 1 violation per 10 shipments = full deduction
        score -= 0.10 * min(1.0, total_violations / max(1, n // 10))

        # --- Hazmat violations (-0.05 max) ---
        hazmat_total = sum(
            1 for sh in s.shipments.values()
            if CargoFlag.HAZMAT in sh.cargo_flags
        )
        if hazmat_total > 0:
            score -= 0.05 * min(1.0, s.hazmat_violations / hazmat_total)

        return round(max(0.0, min(1.0, score)), 4)

    # ------------------------------------------------------------------
    # ACTION HANDLERS  (each returns success: bool, message: str)
    # ------------------------------------------------------------------

    def _handle_read_inbox(
        self,
        action: Action,
        rp: "_RewardAccumulator",
    ) -> Tuple[Optional[UnstructuredAlert], bool, str]:
        s = self._state
        unread = [a for a in s.alerts if not a.is_read]

        if action.inbox_index >= len(unread):
            return None, False, (
                f"inbox_index={action.inbox_index} out of range. "
                f"{len(unread)} unread alert(s) available."
            )

        alert = unread[action.inbox_index]

        # --- Anti-hack: reward only the FIRST read of each alert ---
        if alert.alert_id in s.read_alert_ids:
            rp.add(self.R_READ_DUPLICATE_ALERT, f"duplicate_read({alert.alert_id})")
            return alert, True, (
                f"[Already read] Alert '{alert.subject}' — no new information."
            )

        # First read — mark and potentially reward
        alert.is_read = True
        s.read_alert_ids.add(alert.alert_id)

        # Hard mode: reading the strike alert flips WH_TAC_NORTH operational status
        if (
            self.difficulty == "hard"
            and alert.affects_warehouse == WarehouseID.TACOMA_NORTH
            and "strike" in alert.body.lower()
        ):
            wh = s.warehouses[WarehouseID.TACOMA_NORTH]
            s.warehouses[WarehouseID.TACOMA_NORTH] = WarehouseSummary(
                **{**wh.model_dump(), "is_operational": False, "strike_active": True}
            )

        if alert.severity in (AlertSeverity.CRITICAL, AlertSeverity.HIGH):
            rp.add(self.R_READ_CRITICAL_ALERT, f"read_critical_alert({alert.alert_id})")
            msg = f"[CRITICAL] Read alert '{alert.subject}'. Action recommended."
        else:
            msg = f"Read alert '{alert.subject}'."

        return alert, True, msg

    def _handle_check_shipment(
        self, action: Action
    ) -> Tuple[bool, str]:
        s = self._state
        if action.shipment_id not in s.shipments:
            return False, f"Unknown shipment_id: {action.shipment_id}."
        s.inspected_shipment_ids.add(action.shipment_id)
        sh = s.shipments[action.shipment_id]
        return True, (
            f"Shipment {action.shipment_id}: status={sh.status}, "
            f"flags={sh.cargo_flags}, weight={sh.weight_tons}t, "
            f"deadline=step {sh.deadline_step}, "
            f"assigned_wh={sh.assigned_warehouse}, assigned_truck={sh.assigned_truck}."
        )

    def _handle_check_warehouse(
        self, action: Action
    ) -> Tuple[bool, str]:
        s = self._state
        wh = s.warehouses.get(action.target_warehouse)
        if wh is None:
            return False, f"Unknown warehouse: {action.target_warehouse}."
        return True, (
            f"{wh.warehouse_id}: operational={wh.is_operational}, "
            f"strike={wh.strike_active}, "
            f"load={wh.current_load_tons}/{wh.capacity_tons}t "
            f"({wh.utilization_pct}%), refrigerated={wh.is_refrigerated}, "
            f"hazmat={wh.accepts_hazmat}."
        )

    def _handle_route_shipment(
        self,
        action: Action,
        rp: "_RewardAccumulator",
    ) -> Tuple[bool, str]:
        """
        Assign a shipment to a warehouse.
        Enforces: capacity, operational status, strike, refrigeration, hazmat.
        Does NOT dispatch a truck — that is a separate action.
        """
        s = self._state
        sh = s.shipments.get(action.shipment_id)
        if sh is None:
            return False, f"Unknown shipment: {action.shipment_id}."

        if sh.status not in (ShipmentStatus.UNASSIGNED, ShipmentStatus.DELAYED):
            return False, (
                f"{action.shipment_id} is already {sh.status}. Cannot re-route."
            )

        wh = s.warehouses.get(action.target_warehouse)
        if wh is None:
            return False, f"Unknown warehouse: {action.target_warehouse}."

        # --- Guard: strike ---
        if wh.strike_active:
            rp.add(self.R_STRIKE_VIOLATION, f"strike_violation({wh.warehouse_id})")
            s.strike_violations += 1
            return False, (
                f"VIOLATION: {wh.warehouse_id} has an active strike. Route rejected."
            )

        # --- Guard: operational ---
        if not wh.is_operational:
            rp.add(self.R_CAPACITY_VIOLATION, f"closed_warehouse({wh.warehouse_id})")
            s.capacity_violations += 1
            return False, (
                f"VIOLATION: {wh.warehouse_id} is not operational. Route rejected."
            )

        # --- Guard: capacity ---
        effective_weight = sh.weight_tons
        if CargoFlag.OVERSIZED in sh.cargo_flags:
            effective_weight *= 2.0

        if effective_weight > wh.available_capacity_tons:
            rp.add(self.R_CAPACITY_VIOLATION, f"capacity_violation({wh.warehouse_id})")
            s.capacity_violations += 1
            return False, (
                f"VIOLATION: {wh.warehouse_id} has only "
                f"{wh.available_capacity_tons:.1f}t available; "
                f"{action.shipment_id} needs {effective_weight:.1f}t. Route rejected."
            )

        # --- Guard: refrigeration ---
        if CargoFlag.REFRIGERATED in sh.cargo_flags and not wh.is_refrigerated:
            rp.add(
                self.R_REFRIGERATION_VIOLATION,
                f"refrigeration_violation({wh.warehouse_id})"
            )
            s.refrigeration_violations += 1
            return False, (
                f"VIOLATION: {action.shipment_id} is REFRIGERATED but "
                f"{wh.warehouse_id} has no cold storage. Route rejected."
            )

        # --- Guard: hazmat ---
        if CargoFlag.HAZMAT in sh.cargo_flags and not wh.accepts_hazmat:
            rp.add(
                self.R_HAZMAT_VIOLATION,
                f"hazmat_violation({wh.warehouse_id})"
            )
            s.hazmat_violations += 1
            return False, (
                f"VIOLATION: {action.shipment_id} is HAZMAT but "
                f"{wh.warehouse_id} does not accept hazmat. Route rejected."
            )

        # --- All guards passed: commit ---
        # Deduct capacity from warehouse
        s.warehouses[action.target_warehouse] = WarehouseSummary(
            **{
                **wh.model_dump(),
                "current_load_tons": wh.current_load_tons + effective_weight,
            }
        )
        # Update shipment
        s.shipments[action.shipment_id] = ShipmentSummary(
            **{
                **sh.model_dump(),
                "status": ShipmentStatus.ASSIGNED,
                "assigned_warehouse": action.target_warehouse,
            }
        )

        return True, (
            f"{action.shipment_id} ({effective_weight:.1f}t) routed to "
            f"{action.target_warehouse}. "
            f"Warehouse now at {wh.current_load_tons + effective_weight:.1f}/"
            f"{wh.capacity_tons:.1f}t."
        )

    def _handle_dispatch_truck(
        self,
        action: Action,
        rp: "_RewardAccumulator",
    ) -> Tuple[bool, str]:
        """
        Dispatch a truck to deliver an assigned shipment.
        Enforces: truck availability, truck capacity, hazmat certification.
        On success, marks shipment DELIVERED and frees truck capacity.
        """
        s = self._state

        # Require shipment_id for dispatch
        if action.shipment_id is None:
            return False, "DISPATCH_TRUCK requires shipment_id."

        sh = s.shipments.get(action.shipment_id)
        if sh is None:
            return False, f"Unknown shipment: {action.shipment_id}."

        if sh.status != ShipmentStatus.ASSIGNED:
            return False, (
                f"{action.shipment_id} must be ASSIGNED before dispatch "
                f"(current status: {sh.status})."
            )

        truck = s.trucks.get(action.truck_id)
        if truck is None:
            return False, f"Unknown truck: {action.truck_id}."

        if not truck.is_available:
            return False, f"{action.truck_id} is not available (currently in transit)."

        # --- Capacity check ---
        effective_weight = sh.weight_tons
        if CargoFlag.OVERSIZED in sh.cargo_flags:
            effective_weight *= 2.0

        available_truck_capacity = truck.capacity_tons - truck.current_load_tons
        if effective_weight > available_truck_capacity:
            rp.add(self.R_CAPACITY_VIOLATION, f"truck_capacity_violation({action.truck_id})")
            s.capacity_violations += 1
            return False, (
                f"VIOLATION: {action.truck_id} has only "
                f"{available_truck_capacity:.1f}t available; "
                f"{action.shipment_id} needs {effective_weight:.1f}t."
            )

        # --- Hazmat certification check ---
        if (
            CargoFlag.HAZMAT in sh.cargo_flags
            and not truck.is_hazmat_certified
        ):
            rp.add(self.R_HAZMAT_VIOLATION, f"hazmat_truck_violation({action.truck_id})")
            s.hazmat_violations += 1
            return False, (
                f"VIOLATION: {action.truck_id} is not hazmat-certified. "
                f"Cannot carry {action.shipment_id}."
            )

        # --- All guards passed: commit ---
        # Mark truck in-transit (unavailable), update load
        s.trucks[action.truck_id] = TruckSummary(
            **{
                **truck.model_dump(),
                "is_available": False,
                "current_load_tons": truck.current_load_tons + effective_weight,
                "current_location": None,   # In transit
            }
        )

        # Mark shipment delivered, stamp delivery step
        delivered_sh = ShipmentSummary(
            **{
                **sh.model_dump(),
                "status": ShipmentStatus.DELIVERED,
                "assigned_truck": action.truck_id,
            }
        )
        # Attach delivery step as private attr (read by grader)
        object.__setattr__(delivered_sh, "_delivery_step", s.current_step)
        s.shipments[action.shipment_id] = delivered_sh

        # Reward: on-time vs late
        steps_late = max(0, s.current_step - sh.deadline_step)
        if steps_late == 0:
            rp.add(self.R_DELIVERY_ON_TIME, f"on_time_delivery({action.shipment_id})")
            timing_msg = "ON TIME"
        else:
            late_penalty = max(
                -0.30,
                self.R_DELIVERY_LATE_BASE * steps_late * sh.penalty_per_step_late * 10
            )
            rp.add(late_penalty, f"late_delivery({action.shipment_id},{steps_late}steps)")
            timing_msg = f"LATE by {steps_late} step(s)"

        rp.add(self.R_DISPATCH_SUCCESS, f"dispatch_success({action.shipment_id})")

        return True, (
            f"Dispatched {action.truck_id} → {sh.assigned_warehouse} "
            f"with {action.shipment_id} ({effective_weight:.1f}t). "
            f"Delivery: {timing_msg}."
        )

    def _handle_prioritize_shipment(self, action: Action) -> Tuple[bool, str]:
        s = self._state
        sh = s.shipments.get(action.shipment_id)
        if sh is None:
            return False, f"Unknown shipment: {action.shipment_id}."
        if sh.status != ShipmentStatus.UNASSIGNED:
            return False, f"{action.shipment_id} is not UNASSIGNED; cannot prioritize."
        # Tighten effective deadline by 20% as a signal to the agent
        new_deadline = max(s.current_step + 1, int(sh.deadline_step * 0.8))
        s.shipments[action.shipment_id] = ShipmentSummary(
            **{**sh.model_dump(), "deadline_step": new_deadline}
        )
        return True, (
            f"{action.shipment_id} prioritized. Effective deadline moved to step "
            f"{new_deadline}."
        )

    def _handle_hold_shipment(self, action: Action) -> Tuple[bool, str]:
        s = self._state
        sh = s.shipments.get(action.shipment_id)
        if sh is None:
            return False, f"Unknown shipment: {action.shipment_id}."
        if sh.status not in (ShipmentStatus.UNASSIGNED, ShipmentStatus.ASSIGNED):
            return False, f"Cannot hold {action.shipment_id} (status: {sh.status})."
        s.shipments[action.shipment_id] = ShipmentSummary(
            **{**sh.model_dump(), "status": ShipmentStatus.DELAYED}
        )
        return True, f"{action.shipment_id} placed on hold (DELAYED)."

    def _handle_cancel_route(self, action: Action) -> Tuple[bool, str]:
        s = self._state
        sh = s.shipments.get(action.shipment_id)
        if sh is None:
            return False, f"Unknown shipment: {action.shipment_id}."
        if sh.status != ShipmentStatus.ASSIGNED:
            return False, (
                f"Can only cancel ASSIGNED shipments "
                f"(current: {sh.status})."
            )
        # Restore warehouse capacity
        if sh.assigned_warehouse:
            wh = s.warehouses[sh.assigned_warehouse]
            effective_weight = sh.weight_tons * (
                2.0 if CargoFlag.OVERSIZED in sh.cargo_flags else 1.0
            )
            s.warehouses[sh.assigned_warehouse] = WarehouseSummary(
                **{
                    **wh.model_dump(),
                    "current_load_tons": max(
                        0.0, wh.current_load_tons - effective_weight
                    ),
                }
            )
        s.shipments[action.shipment_id] = ShipmentSummary(
            **{
                **sh.model_dump(),
                "status": ShipmentStatus.UNASSIGNED,
                "assigned_warehouse": None,
                "assigned_truck": None,
            }
        )
        return True, f"Route cancelled for {action.shipment_id}. Capacity restored."

    # ------------------------------------------------------------------
    # LATE PENALTY  (applied each step regardless of action)
    # ------------------------------------------------------------------

    def _apply_late_penalties(self, rp: "_RewardAccumulator") -> float:
        """
        At each step tick, every shipment that has passed its deadline
        and is not yet delivered accrues a late penalty.
        This ensures reward signal is dense across the trajectory.
        """
        s = self._state
        total = 0.0
        for sh in s.shipments.values():
            if sh.status in (ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED):
                continue
            if s.current_step > sh.deadline_step:
                steps_over = s.current_step - sh.deadline_step
                # Exponential urgency: first step over = base, subsequent = compounding
                penalty = -(sh.penalty_per_step_late * (1.0 + 0.1 * steps_over))
                penalty = max(-0.05, penalty)   # Per-shipment per-step cap
                rp.add(penalty, f"tick_late({sh.shipment_id})")
                total += penalty
                # Flip status to DELAYED if still UNASSIGNED/ASSIGNED
                if sh.status in (ShipmentStatus.UNASSIGNED, ShipmentStatus.ASSIGNED):
                    s.shipments[sh.shipment_id] = ShipmentSummary(
                        **{**sh.model_dump(), "status": ShipmentStatus.DELAYED}
                    )
        return total

    # ------------------------------------------------------------------
    # RATIONALE SCORER (heuristic)
    # ------------------------------------------------------------------

    def _score_rationale(self, rationale: str, action_type: ActionType) -> float:
        """
        Awards up to R_RATIONALE_BONUS_MAX for rationale that:
        - References specific IDs (SHP-XXXX, WH_*, TRK_*)
        - Mentions constraint awareness (capacity, strike, cold, hazmat)
        - Is proportionate to action complexity

        Deliberately capped low (0.05) so it cannot be farmed into
        a dominant reward signal.
        """
        score = 0.0
        r = rationale.lower()

        # Contains a specific entity reference
        import re
        if re.search(r"(shp-\d{4}|wh_[a-z_]+|trk_\d{3})", r):
            score += 0.02

        # References a constraint
        constraint_words = {
            "capacity", "strike", "refrigerat", "cold", "hazmat",
            "deadline", "late", "oversize", "certif"
        }
        if any(w in r for w in constraint_words):
            score += 0.02

        # Longer rationale for complex actions (not just padding check)
        complex_actions = {
            ActionType.ROUTE_SHIPMENT, ActionType.DISPATCH_TRUCK,
            ActionType.CANCEL_ROUTE
        }
        if action_type in complex_actions and len(rationale.split()) >= 8:
            score += 0.01

        return round(min(self.R_RATIONALE_BONUS_MAX, score), 4)

    # ------------------------------------------------------------------
    # HELPERS
    # ------------------------------------------------------------------

    def _action_fingerprint(self, action: Action) -> str:
        """Canonical string key for repeated-action detection."""
        return (
            f"{action.action_type}|"
            f"{action.shipment_id}|"
            f"{action.target_warehouse}|"
            f"{action.truck_id}|"
            f"{action.inbox_index}"
        )

    def _build_reward_info(
        self,
        reward_parts: "_RewardAccumulator",
        scalar_reward: float,
        done: bool,
        is_truncated: bool,
        terminal_reason: Optional[str],
        episode_score: Optional[float],
    ) -> RewardInfo:
        s = self._state
        comps = reward_parts.components

        def _get(key_fragment: str) -> float:
            return sum(v for k, v in comps.items() if key_fragment in k)

        all_shipments = list(s.shipments.values())

        return RewardInfo(
            reward=scalar_reward,
            on_time_delivery_bonus=max(0.0, _get("on_time_delivery")),
            late_delivery_penalty=min(0.0, _get("late_delivery") + _get("tick_late")),
            capacity_violation_penalty=min(0.0, _get("capacity_violation")),
            refrigeration_violation_penalty=min(0.0, _get("refrigeration_violation")),
            hazmat_violation_penalty=min(0.0, _get("hazmat_violation")),
            strike_ignored_penalty=min(0.0, _get("strike_violation")),
            inefficiency_penalty=min(
                0.0,
                _get("no_op_streak") + _get("repeated_action") + _get("duplicate_read")
            ),
            rationale_quality_bonus=max(0.0, _get("rationale_quality_bonus")),
            done=done,
            is_truncated=is_truncated,
            terminal_reason=terminal_reason,
            shipments_delivered_on_time=sum(
                1 for sh in all_shipments
                if sh.status == ShipmentStatus.DELIVERED
                and getattr(sh, "_delivery_step", sh.deadline_step + 1) <= sh.deadline_step
            ),
            shipments_delivered_late=sum(
                1 for sh in all_shipments
                if sh.status == ShipmentStatus.DELIVERED
                and getattr(sh, "_delivery_step", sh.deadline_step) > sh.deadline_step
            ),
            shipments_unresolved=sum(
                1 for sh in all_shipments
                if sh.status not in (ShipmentStatus.DELIVERED, ShipmentStatus.CANCELLED)
            ),
            episode_score=episode_score,
        )

    def _build_observation(
        self,
        last_action_type: Optional[ActionType],
        last_action_success: bool,
        last_action_message: str,
        recently_read_alert: Optional[UnstructuredAlert],
        include_fleet: bool,
    ) -> Observation:
        s = self._state
        all_shipments = list(s.shipments.values())

        if self.difficulty == "easy":
            visible = all_shipments
        elif self.difficulty == "medium":
            visible = [
                sh for sh in all_shipments
                if sh.status in (ShipmentStatus.UNASSIGNED, ShipmentStatus.DELAYED)
            ]
        else:
            visible = [
                sh for sh in all_shipments
                if sh.shipment_id in s.inspected_shipment_ids
            ]

        unread = [a for a in s.alerts if not a.is_read]
        severity_summary: Dict[AlertSeverity, int] = {}
        for a in unread:
            severity_summary[a.severity] = severity_summary.get(a.severity, 0) + 1

        return Observation(
            current_step=s.current_step,
            max_steps=s.max_steps,
            steps_remaining=s.max_steps - s.current_step,
            last_action_type=last_action_type,
            last_action_success=last_action_success,
            last_action_message=last_action_message,
            visible_shipments=visible,
            total_shipments=len(s.shipments),
            unassigned_count=sum(
                1 for sh in all_shipments if sh.status == ShipmentStatus.UNASSIGNED
            ),
            delayed_count=sum(
                1 for sh in all_shipments if sh.status == ShipmentStatus.DELAYED
            ),
            delivered_count=sum(
                1 for sh in all_shipments if sh.status == ShipmentStatus.DELIVERED
            ),
            unread_alert_count=len(unread),
            recently_read_alert=recently_read_alert,
            alert_severity_summary=severity_summary,
            warehouse_status=list(s.warehouses.values()),
            fleet_status=list(s.trucks.values()) if include_fleet else None,
            current_penalty_accrued=s.penalty_accrued,
            current_reward_earned=s.reward_earned,
        )

    # ------------------------------------------------------------------
    # SCENARIO GENERATOR (from Phase 2, unchanged)
    # ------------------------------------------------------------------

    def _generate_scenario(self, difficulty: str) -> _EnvState:
        state = _EnvState(
            difficulty=difficulty,
            current_step=0,
            max_steps=self.MAX_STEPS[difficulty],
        )
        state.warehouses = self._build_warehouses(difficulty)
        state.trucks     = self._build_trucks(difficulty)
        state.shipments  = self._build_shipments(difficulty, state.warehouses)
        state.alerts     = self._build_alerts(difficulty)
        return state

    def _build_warehouses(self, difficulty: str) -> Dict[WarehouseID, WarehouseSummary]:
        base = {
            WarehouseID.PORTLAND_MAIN: WarehouseSummary(
                warehouse_id=WarehouseID.PORTLAND_MAIN, capacity_tons=500.0,
                current_load_tons=120.0, is_refrigerated=False,
                is_operational=True, accepts_hazmat=False),
            WarehouseID.PORTLAND_COLD: WarehouseSummary(
                warehouse_id=WarehouseID.PORTLAND_COLD, capacity_tons=200.0,
                current_load_tons=40.0, is_refrigerated=True,
                is_operational=True, accepts_hazmat=False),
            WarehouseID.TACOMA_NORTH: WarehouseSummary(
                warehouse_id=WarehouseID.TACOMA_NORTH, capacity_tons=400.0,
                current_load_tons=60.0, is_refrigerated=False,
                is_operational=True, accepts_hazmat=True),
            WarehouseID.TACOMA_SOUTH: WarehouseSummary(
                warehouse_id=WarehouseID.TACOMA_SOUTH, capacity_tons=350.0,
                current_load_tons=50.0, is_refrigerated=False,
                is_operational=True, accepts_hazmat=False),
            WarehouseID.SPOKANE_CENTRAL: WarehouseSummary(
                warehouse_id=WarehouseID.SPOKANE_CENTRAL, capacity_tons=600.0,
                current_load_tons=200.0, is_refrigerated=False,
                is_operational=True, accepts_hazmat=True),
            WarehouseID.VANCOUVER_BC: WarehouseSummary(
                warehouse_id=WarehouseID.VANCOUVER_BC, capacity_tons=300.0,
                current_load_tons=80.0, is_refrigerated=False,
                is_operational=True, accepts_hazmat=False),
            WarehouseID.BOISE_LOGISTICS: WarehouseSummary(
                warehouse_id=WarehouseID.BOISE_LOGISTICS, capacity_tons=450.0,
                current_load_tons=90.0, is_refrigerated=False,
                is_operational=True, accepts_hazmat=True),
        }
        if difficulty == "easy":
            base[WarehouseID.TACOMA_NORTH] = WarehouseSummary(
                **{**base[WarehouseID.TACOMA_NORTH].model_dump(),
                   "is_operational": False, "current_load_tons": 0.0})
        elif difficulty == "medium":
            base[WarehouseID.TACOMA_NORTH] = WarehouseSummary(
                **{**base[WarehouseID.TACOMA_NORTH].model_dump(),
                   "is_operational": False, "current_load_tons": 0.0})
            base[WarehouseID.PORTLAND_MAIN] = WarehouseSummary(
                **{**base[WarehouseID.PORTLAND_MAIN].model_dump(),
                   "current_load_tons": 400.0})
        elif difficulty == "hard":
            base[WarehouseID.TACOMA_NORTH] = WarehouseSummary(
                **{**base[WarehouseID.TACOMA_NORTH].model_dump(),
                   "strike_active": True})
        return base

    def _build_trucks(self, difficulty: str) -> Dict[TruckID, TruckSummary]:
        configs = [
            (TruckID.TRUCK_01, 20.0, False), (TruckID.TRUCK_02, 20.0, False),
            (TruckID.TRUCK_03, 15.0, True),  (TruckID.TRUCK_04, 25.0, False),
            (TruckID.TRUCK_05, 25.0, False),  (TruckID.TRUCK_06, 10.0, True),
            (TruckID.TRUCK_07, 30.0, False),  (TruckID.TRUCK_08, 30.0, False),
        ]
        count = {"easy": 4, "medium": 6, "hard": 8}[difficulty]
        return {
            tid: TruckSummary(
                truck_id=tid, is_available=True,
                current_location=WarehouseID.TACOMA_SOUTH,
                capacity_tons=cap, is_hazmat_certified=hazmat,
                current_load_tons=0.0,
            )
            for tid, cap, hazmat in configs[:count]
        }

    def _build_shipments(
        self, difficulty: str,
        warehouses: Dict[WarehouseID, WarehouseSummary]
    ) -> Dict[str, ShipmentSummary]:
        count = {"easy": 10, "medium": 25, "hard": 50}[difficulty]
        max_steps = self.MAX_STEPS[difficulty]
        shipments: Dict[str, ShipmentSummary] = {}

        if difficulty == "hard":
            for i in range(1, 6):
                sid = f"SHP-{i:04d}"
                shipments[sid] = ShipmentSummary(
                    shipment_id=sid, cargo_flags=[CargoFlag.REFRIGERATED],
                    deadline_step=self._rng.randint(max_steps // 4, max_steps // 2),
                    penalty_per_step_late=0.05, status=ShipmentStatus.UNASSIGNED,
                    weight_tons=round(self._rng.uniform(1.0, 8.0), 1),
                )

        start = len(shipments) + 1
        for i in range(start, count + 1):
            sid = f"SHP-{i:04d}"
            if difficulty == "easy":
                flags = [CargoFlag.STANDARD]
            else:
                flags = self._rng.choices(
                    [[CargoFlag.STANDARD], [CargoFlag.HAZMAT],
                     [CargoFlag.FRAGILE], [CargoFlag.OVERSIZED]],
                    weights=[55, 18, 15, 12], k=1
                )[0]
            earliest = max(5, max_steps // 6)
            shipments[sid] = ShipmentSummary(
                shipment_id=sid, cargo_flags=flags,
                deadline_step=self._rng.randint(earliest, max_steps - 5),
                penalty_per_step_late=round(self._rng.uniform(0.01, 0.04), 3),
                status=ShipmentStatus.UNASSIGNED,
                weight_tons=round(self._rng.uniform(0.5, 12.0), 1),
            )
        return shipments

    def _build_alerts(self, difficulty: str) -> List[UnstructuredAlert]:
        alerts = []
        if difficulty in ("easy", "medium", "hard"):
            alerts.append(UnstructuredAlert(
                alert_id="ALT-0001", severity=AlertSeverity.HIGH,
                subject="Port of Seattle — All outbound suspended",
                body="Storm closure confirmed. All inbound shipments must be rerouted.",
                affects_warehouse=None, is_read=False, received_at_step=0,
            ))
        if difficulty in ("medium", "hard"):
            alerts.append(UnstructuredAlert(
                alert_id="ALT-0002", severity=AlertSeverity.MEDIUM,
                subject="Portland Main — Receiving backlog warning",
                body=(
                    "Dock supervisor: nearly maxed out here (~80%). "
                    "Can take maybe 100t more. Coordinate before sending more. — R. Kaur"
                ),
                affects_warehouse=WarehouseID.PORTLAND_MAIN,
                is_read=False, received_at_step=0,
            ))
        if difficulty == "hard":
            alerts.insert(0, UnstructuredAlert(
                alert_id="ALT-0000", severity=AlertSeverity.CRITICAL,
                subject="FWD: FWD: Urgent — Tacoma North situation",
                body=(
                    "Teamsters Local 117 has officially voted to walk out at WH_TAC_NORTH "
                    "starting this morning. Picket lines forming as of 06:00. No crossing. "
                    "Do NOT dispatch trucks to Tacoma North. Reroute to Portland or Spokane.\n"
                    "— Dave Okonkwo\n\n"
                    "[unrelated: coffee machine on level 2 broken again, ticket submitted]"
                ),
                affects_warehouse=WarehouseID.TACOMA_NORTH,
                is_read=False, received_at_step=0,
            ))
            alerts.append(UnstructuredAlert(
                alert_id="ALT-0003", severity=AlertSeverity.HIGH,
                subject="Cold chain integrity — SHP-0001 through SHP-0005",
                body=(
                    "Refrigerated units SHP-0001–SHP-0005 must reach WH_PDX_COLD. "
                    "No other facility qualified. Current cold store at 20% — room available."
                ),
                affects_warehouse=WarehouseID.PORTLAND_COLD,
                is_read=False, received_at_step=0,
            ))
        return alerts


# ---------------------------------------------------------------------------
# Internal reward accumulator — not exported
# ---------------------------------------------------------------------------

class _RewardAccumulator:
    """Lightweight ledger for named reward components within a single step."""

    def __init__(self) -> None:
        self.components: Dict[str, float] = {}

    def add(self, value: float, label: str) -> None:
        # If label collides (e.g. two tick_late in one step), append index
        key = label
        i = 1
        while key in self.components:
            key = f"{label}_{i}"
            i += 1
        self.components[key] = value

    def total(self) -> float:
        return sum(self.components.values())