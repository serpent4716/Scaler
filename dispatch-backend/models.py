# models.py
# Phase 1: Data Architecture & Action Space
# Supply Chain Disruption Dispatcher — OpenEnv Environment

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enumerations — hard-coded domain constraints
# These make physically impossible choices unrepresentable at the type level.
# ---------------------------------------------------------------------------


class ActionType(str, Enum):
    """Every legal move an agent can make. Nothing outside this list is valid."""

    READ_INBOX = "read_inbox"  # Consume one unread email alert
    CHECK_WAREHOUSE = "check_warehouse"  # Query capacity / refrigeration status
    CHECK_SHIPMENT = "check_shipment"  # Query a single shipment's details
    ROUTE_SHIPMENT = "route_shipment"  # Assign shipment → warehouse
    PRIORITIZE_SHIPMENT = (
        "prioritize_shipment"  # Mark shipment as high-priority (costs 1 step)
    )
    HOLD_SHIPMENT = "hold_shipment"  # Hold a shipment at current node
    CANCEL_ROUTE = (
        "cancel_route"  # Undo a routing decision (if shipment not dispatched)
    )
    QUERY_FLEET = "query_fleet"  # Get truck availability & location
    DISPATCH_TRUCK = "dispatch_truck"  # Send a specific truck to a warehouse
    NO_OP = "no_op"  # Intentional pass (agent must justify this)


class WarehouseID(str, Enum):
    """Fixed set of alternative warehouses. Agent cannot invent new destinations."""

    PORTLAND_MAIN = "WH_PDX_MAIN"
    PORTLAND_COLD = "WH_PDX_COLD"  # Refrigerated
    TACOMA_NORTH = "WH_TAC_NORTH"
    TACOMA_SOUTH = "WH_TAC_SOUTH"
    SPOKANE_CENTRAL = "WH_SPK_CENTRAL"
    VANCOUVER_BC = "WH_VAN_BC"  # Cross-border — triggers customs flag
    BOISE_LOGISTICS = "WH_BOI_LOGISTICS"


class TruckID(str, Enum):
    """Physical fleet. Agent cannot hallucinate truck IDs."""

    TRUCK_01 = "TRK_001"
    TRUCK_02 = "TRK_002"
    TRUCK_03 = "TRK_003"
    TRUCK_04 = "TRK_004"
    TRUCK_05 = "TRK_005"
    TRUCK_06 = "TRK_006"
    TRUCK_07 = "TRK_007"
    TRUCK_08 = "TRK_008"


class CargoFlag(str, Enum):
    """Special handling requirements. Drives constraint checks in env.py."""

    STANDARD = "standard"
    REFRIGERATED = "refrigerated"  # Must go to a cold-capable warehouse
    HAZMAT = "hazmat"  # Requires certified driver
    OVERSIZED = "oversized"  # Truck capacity weight × 0.5
    FRAGILE = "fragile"  # Speed limit on dispatch truck


class AlertSeverity(str, Enum):
    CRITICAL = "critical"  # Immediate re-routing required
    HIGH = "high"  # Should be addressed this step
    MEDIUM = "medium"  # Advisory
    LOW = "low"  # Informational


class ShipmentStatus(str, Enum):
    UNASSIGNED = "unassigned"  # No route set
    ASSIGNED = "assigned"  # Route set, not dispatched
    IN_TRANSIT = "in_transit"  # Truck dispatched
    DELIVERED = "delivered"
    DELAYED = "delayed"
    CANCELLED = "cancelled"


# ---------------------------------------------------------------------------
# Sub-models — composable building blocks
# ---------------------------------------------------------------------------


class ShipmentSummary(BaseModel):
    """Lightweight view of a shipment used inside Observations."""

    shipment_id: str = Field(..., pattern=r"^SHP-\d{4}$")
    cargo_flags: List[CargoFlag] = Field(default_factory=list)
    deadline_step: int = Field(
        ..., ge=0, description="Absolute time step by which delivery earns full reward"
    )
    penalty_per_step_late: float = Field(..., ge=0.0, le=1.0)
    status: ShipmentStatus = ShipmentStatus.UNASSIGNED
    assigned_warehouse: Optional[WarehouseID] = None
    assigned_truck: Optional[TruckID] = None
    weight_tons: float = Field(..., gt=0.0, le=40.0)

    @model_validator(mode="after")
    def refrigerated_needs_cold_warehouse(self) -> "ShipmentSummary":
        if (
            CargoFlag.REFRIGERATED in self.cargo_flags
            and self.assigned_warehouse is not None
            and self.assigned_warehouse != WarehouseID.PORTLAND_COLD
        ):
            raise ValueError(
                f"Refrigerated cargo {self.shipment_id} cannot be routed to "
                f"{self.assigned_warehouse}. Only WH_PDX_COLD supports refrigeration."
            )
        return self


class WarehouseSummary(BaseModel):
    """Snapshot of one warehouse — included in every Observation."""

    warehouse_id: WarehouseID
    current_load_tons: float = Field(..., ge=0.0)
    capacity_tons: float = Field(..., gt=0.0)
    is_refrigerated: bool = False
    is_operational: bool = True  # Strikes/closures set this False
    accepts_hazmat: bool = False
    strike_active: bool = False  # Hard-tier flag
    eta_reopen_step: Optional[int] = None  # When strike ends (if known)

    @property
    def available_capacity_tons(self) -> float:
        return max(0.0, self.capacity_tons - self.current_load_tons)

    @property
    def utilization_pct(self) -> float:
        return round(self.current_load_tons / self.capacity_tons * 100, 1)


class TruckSummary(BaseModel):
    """Fleet status — included in Observation when agent calls QUERY_FLEET."""

    truck_id: TruckID
    is_available: bool = True
    current_location: Optional[WarehouseID] = None  # None = in transit
    capacity_tons: float = Field(default=20.0, gt=0.0)
    is_hazmat_certified: bool = False
    current_load_tons: float = Field(default=0.0, ge=0.0)

    @model_validator(mode="after")
    def load_within_capacity(self) -> "TruckSummary":
        if self.current_load_tons > self.capacity_tons:
            raise ValueError(
                f"{self.truck_id}: current_load {self.current_load_tons}t "
                f"exceeds capacity {self.capacity_tons}t"
            )
        return self


class UnstructuredAlert(BaseModel):
    """
    Simulates a raw email/radio update the dispatcher receives.
    The agent must READ_INBOX to consume these — they are not pre-parsed.
    This drives the Hard-tier challenge: the agent must extract signal from noise.
    """

    alert_id: str
    severity: AlertSeverity
    subject: str
    body: str  # Deliberately unstructured prose
    affects_warehouse: Optional[WarehouseID] = None
    affects_truck: Optional[TruckID] = None
    is_read: bool = False
    received_at_step: int = Field(..., ge=0)


# ---------------------------------------------------------------------------
# ACTION MODEL
# ---------------------------------------------------------------------------


class Action(BaseModel):
    """
    The complete action space. A discriminated union ensures only internally
    consistent combinations of fields are ever valid.

    Design principle: The `action_type` field acts as a discriminator.
    Fields required for one action type are Optional for others but are
    validated by the model_validator to be present when needed. This gives
    the agent a single unified action schema while preventing impossible moves.
    """

    action_type: ActionType

    # --- Context-dependent fields (validated below) ---
    shipment_id: Optional[str] = Field(
        default=None,
        pattern=r"^SHP-\d{4}$",
        description="Required for: ROUTE_SHIPMENT, CHECK_SHIPMENT, PRIORITIZE_SHIPMENT, HOLD_SHIPMENT, CANCEL_ROUTE",
    )
    target_warehouse: Optional[WarehouseID] = Field(
        default=None,
        description="Required for: ROUTE_SHIPMENT, CHECK_WAREHOUSE, DISPATCH_TRUCK",
    )
    truck_id: Optional[TruckID] = Field(
        default=None,
        description="Required for: DISPATCH_TRUCK, ROUTE_SHIPMENT (optional truck override)",
    )
    inbox_index: Optional[int] = Field(
        default=None,
        ge=0,
        description="Required for READ_INBOX: which unread alert to consume (0-indexed)",
    )

    # --- Mandatory reasoning field ---
    rationale: str = Field(
        ...,
        min_length=10,
        max_length=500,
        description=(
            "Agent MUST explain why it is taking this action. "
            "Used for scoring transparency and debugging agent behaviour. "
            "Min 10 chars enforced — 'no_op' still requires justification."
        ),
    )

    @field_validator("rationale")
    @classmethod
    def rationale_not_boilerplate(cls, v: str) -> str:
        blocked = {"n/a", "none", "na", "just because", "idk", "test"}
        if v.strip().lower() in blocked:
            raise ValueError(
                "Rationale must be a genuine explanation, not a placeholder."
            )
        return v.strip()

    @model_validator(mode="after")
    def validate_action_consistency(self) -> "Action":
        t = self.action_type

        # Actions requiring shipment_id
        needs_shipment = {
            ActionType.ROUTE_SHIPMENT,
            ActionType.CHECK_SHIPMENT,
            ActionType.PRIORITIZE_SHIPMENT,
            ActionType.HOLD_SHIPMENT,
            ActionType.CANCEL_ROUTE,
        }
        if t in needs_shipment and self.shipment_id is None:
            raise ValueError(f"action_type='{t}' requires shipment_id.")

        # Actions requiring target_warehouse
        needs_warehouse = {ActionType.CHECK_WAREHOUSE, ActionType.DISPATCH_TRUCK}
        if t == ActionType.ROUTE_SHIPMENT and self.target_warehouse is None:
            raise ValueError("ROUTE_SHIPMENT requires target_warehouse.")
        if t in needs_warehouse and self.target_warehouse is None:
            raise ValueError(f"action_type='{t}' requires target_warehouse.")

        # DISPATCH_TRUCK needs both truck and destination
        if t == ActionType.DISPATCH_TRUCK and self.truck_id is None:
            raise ValueError("DISPATCH_TRUCK requires truck_id.")

        # READ_INBOX needs an index
        if t == ActionType.READ_INBOX and self.inbox_index is None:
            raise ValueError("READ_INBOX requires inbox_index.")

        # NO_OP must not have side-effect fields (prevent accidental no-ops)
        if t == ActionType.NO_OP:
            if any([self.shipment_id, self.target_warehouse, self.truck_id]):
                raise ValueError(
                    "NO_OP must have null shipment_id, target_warehouse, and truck_id. "
                    "Did you mean to take a different action?"
                )
        return self

    model_config = {"use_enum_values": True}


# ---------------------------------------------------------------------------
# OBSERVATION MODEL
# ---------------------------------------------------------------------------


class Observation(BaseModel):
    """
    Returned by env.step() and env.reset().
    Gives the agent exactly the information it needs — no hidden state leakage.
    """

    # --- Temporal context ---
    current_step: int = Field(
        ..., ge=0, description="Current discrete time step (0-indexed)"
    )
    max_steps: int = Field(..., gt=0, description="Episode horizon")
    steps_remaining: int = Field(..., ge=0)

    # --- Result of last action ---
    last_action_type: Optional[ActionType] = None
    last_action_success: bool = True
    last_action_message: str = Field(
        default="Episode started.",
        description="Human-readable result of the previous action, including failure reasons.",
    )

    # --- Shipment visibility (scoped by task difficulty) ---
    visible_shipments: List[ShipmentSummary] = Field(
        default_factory=list,
        description=(
            "Easy: all 50 shipments visible. "
            "Medium: only unassigned + delayed. "
            "Hard: only shipments the agent has explicitly checked."
        ),
    )
    total_shipments: int = Field(..., ge=0)
    unassigned_count: int = Field(..., ge=0)
    delayed_count: int = Field(..., ge=0)
    delivered_count: int = Field(..., ge=0)

    # --- Inbox ---
    unread_alert_count: int = Field(..., ge=0)
    recently_read_alert: Optional[UnstructuredAlert] = Field(
        default=None, description="Populated only after a READ_INBOX action."
    )
    alert_severity_summary: Dict[AlertSeverity, int] = Field(
        default_factory=dict,
        description="Count of unread alerts per severity level — always visible.",
    )

    # --- Warehouse status (always visible) ---
    warehouse_status: List[WarehouseSummary] = Field(
        default_factory=list, description="Current snapshot of all warehouses."
    )

    # --- Fleet status (populated only after QUERY_FLEET) ---
    fleet_status: Optional[List[TruckSummary]] = Field(
        default=None,
        description="Populated only after QUERY_FLEET action to simulate realistic info cost.",
    )

    # --- Score signals (partial progress feedback) ---
    current_penalty_accrued: float = Field(
        default=0.0,
        description="Running total of late-delivery penalties so far this episode.",
    )
    current_reward_earned: float = Field(
        default=0.0,
        ge=0.0,
        description="Running reward from successful on-time deliveries.",
    )

    @model_validator(mode="after")
    def steps_remaining_consistent(self) -> "Observation":
        expected = self.max_steps - self.current_step
        if self.steps_remaining != expected:
            raise ValueError(
                f"steps_remaining={self.steps_remaining} inconsistent with "
                f"max_steps={self.max_steps} - current_step={self.current_step} = {expected}"
            )
        return self

    model_config = {"use_enum_values": True}


# ---------------------------------------------------------------------------
# REWARD MODEL
# ---------------------------------------------------------------------------


class RewardInfo(BaseModel):
    """
    Granular reward breakdown returned alongside every step().
    Enables partial-progress signals across the full trajectory — not just
    binary end-of-episode scoring (required by the OpenEnv spec).
    """

    # --- Scalar reward (what the RL loop consumes) ---
    reward: float = Field(
        ...,
        ge=-1.0,
        le=1.0,
        description="Normalised step reward in [-1, 1]. Negative = bad action or late penalty.",
    )

    # --- Decomposed components (for debugging + human review) ---
    on_time_delivery_bonus: float = Field(default=0.0, ge=0.0, le=1.0)
    late_delivery_penalty: float = Field(
        default=0.0,
        le=0.0,
        description="Always ≤ 0. Magnitude scales with steps_late × cargo_value.",
    )
    capacity_violation_penalty: float = Field(
        default=0.0,
        le=0.0,
        description="Agent attempted to route cargo to a full warehouse.",
    )
    refrigeration_violation_penalty: float = Field(
        default=0.0,
        le=0.0,
        description="Refrigerated cargo sent to non-cold warehouse.",
    )
    hazmat_violation_penalty: float = Field(
        default=0.0, le=0.0, description="Hazmat cargo sent with non-certified truck."
    )
    strike_ignored_penalty: float = Field(
        default=0.0,
        le=0.0,
        description="Agent dispatched to a warehouse with active strike.",
    )
    inefficiency_penalty: float = Field(
        default=0.0,
        le=0.0,
        description="Repeated no-ops, redundant reads, or dispatching empty trucks.",
    )
    rationale_quality_bonus: float = Field(
        default=0.0,
        ge=0.0,
        le=0.05,
        description="Small bonus for coherent rationale (assessed heuristically).",
    )

    # --- Metadata for grader ---
    done: bool = False
    is_truncated: bool = False  # Hit max_steps without finishing
    terminal_reason: Optional[str] = None  # e.g. "all_shipments_resolved", "max_steps"
    shipments_delivered_on_time: int = Field(default=0, ge=0)
    shipments_delivered_late: int = Field(default=0, ge=0)
    shipments_unresolved: int = Field(default=0, ge=0)

    # --- Final episode score (0.0–1.0 per OpenEnv spec) ---
    episode_score: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Populated only when done=True. This is the grader's output.",
    )

    @model_validator(mode="after")
    def episode_score_only_when_done(self) -> "RewardInfo":
        if not self.done and self.episode_score is not None:
            raise ValueError("episode_score must be None until done=True.")
        if self.done and self.episode_score is None:
            raise ValueError("episode_score must be set when done=True.")
        return self

    @model_validator(mode="after")
    def reward_components_sum_plausibly(self) -> "RewardInfo":
        """Soft sanity check — components should bracket the scalar reward."""
        total_negative = (
            self.late_delivery_penalty
            + self.capacity_violation_penalty
            + self.refrigeration_violation_penalty
            + self.hazmat_violation_penalty
            + self.strike_ignored_penalty
            + self.inefficiency_penalty
        )
        total_positive = self.on_time_delivery_bonus + self.rationale_quality_bonus
        approx = round(total_positive + total_negative, 4)
        if abs(approx - self.reward) > 0.15:  # Tolerance for normalisation rounding
            raise ValueError(
                f"reward={self.reward} deviates too far from component sum={approx}. "
                "Check reward shaping logic in env.py."
            )
        return self

    model_config = {"use_enum_values": True}
