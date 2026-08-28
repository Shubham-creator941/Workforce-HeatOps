"""Bounded internal slot-planning contract. No scientific inputs or defaults."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

Identifier = Annotated[str, Field(min_length=1, max_length=128)]
SlotList = Annotated[list[Identifier], Field(max_length=96)]


class Contract(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Task(Contract):
    id: Identifier
    zone_id: Identifier
    duration_slots: int = Field(ge=1, le=96, strict=True)
    eligible_crew_ids: list[Identifier] = Field(max_length=30)
    available_slot_ids: SlotList
    required_skills: list[Identifier] = Field(max_length=30)
    predecessor_ids: list[Identifier] = Field(default_factory=list, max_length=100)
    required: bool = Field(default=True, strict=True)
    productivity_weight: int = Field(default=1, ge=1, le=1000, strict=True)
    preferred_crew_ids: list[Identifier] = Field(default_factory=list, max_length=30)


class Crew(Contract):
    id: Identifier
    skills: list[Identifier] = Field(max_length=30)
    available_slot_ids: SlotList
    # Mandatory upstream operational constraint, including acclimatization limits.
    max_heat_exposure_slots: int = Field(ge=0, le=96, strict=True)


class Zone(Contract):
    id: Identifier
    available_slot_ids: SlotList
    capacity: int = Field(ge=1, le=30, strict=True)


class SafetyFeasibility(Contract):
    task_id: Identifier
    crew_id: Identifier
    zone_id: Identifier
    slot_id: Identifier
    evaluation_ref: Identifier
    decision: Literal[
        "CONTINUOUS_WORK_ALLOWED",
        "MANUAL_REVIEW_REQUIRED",
        "INSUFFICIENT_DATA",
        "WORK_REST_REQUIRED",
        "RESCHEDULE_REQUIRED",
        "UNSAFE",
        "UNKNOWN",
    ]


class OptimizationInput(Contract):
    planning_ref: Identifier
    safety_ruleset_version: Identifier
    # Ordered contiguous equal-duration slots; timestamps are mapped by Node.
    time_slot_ids: list[Identifier] = Field(min_length=1, max_length=96)
    slot_duration_minutes: int = Field(ge=1, le=60, strict=True)
    tasks: list[Task] = Field(min_length=1, max_length=100)
    crews: list[Crew] = Field(min_length=1, max_length=30)
    zones: list[Zone] = Field(min_length=1, max_length=30)
    safety_feasibility: list[SafetyFeasibility] = Field(max_length=100000)

    @model_validator(mode="after")
    def validate_references(self) -> "OptimizationInput":
        tasks = {task.id: task for task in self.tasks}
        crews = {crew.id for crew in self.crews}
        zones = {zone.id for zone in self.zones}
        slots = set(self.time_slot_ids)
        if (
            len(tasks) != len(self.tasks)
            or len(crews) != len(self.crews)
            or len(zones) != len(self.zones)
            or len(slots) != len(self.time_slot_ids)
        ):
            raise ValueError("task, crew, zone and time-slot IDs must be unique")
        entities: list[Task | Crew | Zone] = [*self.tasks, *self.crews, *self.zones]
        for entity in entities:
            if not set(entity.available_slot_ids) <= slots:
                raise ValueError("availability references an unknown slot")
        for task in self.tasks:
            if (
                task.zone_id not in zones
                or not set(task.eligible_crew_ids) <= crews
                or not set(task.preferred_crew_ids) <= set(task.eligible_crew_ids)
                or not set(task.predecessor_ids) <= tasks.keys()
            ):
                raise ValueError("task references an unknown or ineligible entity")
        remaining = set(tasks)
        while remaining:
            ready = {key for key in remaining if not set(tasks[key].predecessor_ids) & remaining}
            if not ready:
                raise ValueError("task dependencies must be acyclic")
            remaining -= ready
        seen: set[tuple[str, str, str, str]] = set()
        for entry in self.safety_feasibility:
            key = (entry.task_id, entry.crew_id, entry.zone_id, entry.slot_id)
            if (
                entry.task_id not in tasks
                or entry.crew_id not in crews
                or entry.slot_id not in slots
                or entry.zone_id != tasks[entry.task_id].zone_id
            ):
                raise ValueError("safety feasibility references an unknown or mismatched entity")
            if key in seen:
                raise ValueError("duplicate safety feasibility is ambiguous")
            seen.add(key)
        return self


class Assignment(Contract):
    task_id: str
    crew_id: str
    zone_id: str
    start_slot_index: int
    end_slot_index_exclusive: int
    safety_evaluation_refs: list[str]


class Objective(Contract):
    weighted_work_slots: int
    total_start_slot_delay: int
    crew_preference_violations: int


class OptimizationResult(Contract):
    planning_ref: str
    safety_ruleset_version: str
    optimizer_version: Literal["CP_SAT_SLOTS_V1"] = "CP_SAT_SLOTS_V1"
    status: Literal["OPTIMAL", "FEASIBLE", "INFEASIBLE", "FAILED"]
    assignments: list[Assignment] = Field(default_factory=list)
    unscheduled_task_ids: list[str]
    objective: Objective | None = None
    reason_code: str | None = None


class OptimizationBatchRequest(Contract):
    contract_version: Literal["1.0"]
    plans: list[OptimizationInput] = Field(min_length=1, max_length=10)


class OptimizationBatchResponse(Contract):
    contract_version: Literal["1.0"] = "1.0"
    results: list[OptimizationResult]
