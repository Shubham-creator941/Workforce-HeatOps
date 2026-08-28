"""Optimizer hard constraints, deterministic objectives, API and failure isolation."""

import itertools
import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from ortools.sat.python import cp_model
from pydantic import ValidationError

from app.contracts.optimization import (
    OptimizationBatchRequest,
    OptimizationInput,
    OptimizationResult,
)
from app.optimizer import engine as engine_module
from app.optimizer.engine import ScheduleOptimizer
from app.optimizer.validation import validate_schedule
from app.routes.optimization import router


def payload(task_count: int = 1, crew_count: int = 1, slots: int = 4) -> dict[str, object]:
    slot_ids = [f"slot-{i}" for i in range(slots)]
    crew_ids = [f"crew-{i}" for i in range(crew_count)]
    return {
        "planningRef": "plan-1",
        "safetyRulesetVersion": "NIOSH_2016_MVP_V1",
        "slotDurationMinutes": 15,
        "timeSlotIds": slot_ids,
        "tasks": [
            {
                "id": f"task-{i}",
                "zoneId": "zone-1",
                "durationSlots": 2,
                "eligibleCrewIds": crew_ids,
                "availableSlotIds": slot_ids,
                "requiredSkills": ["masonry"],
            }
            for i in range(task_count)
        ],
        "crews": [
            {
                "id": crew,
                "skills": ["masonry"],
                "availableSlotIds": slot_ids,
                "maxHeatExposureSlots": slots,
            }
            for crew in crew_ids
        ],
        "zones": [{"id": "zone-1", "availableSlotIds": slot_ids, "capacity": 1}],
        "safetyFeasibility": [
            {
                "taskId": f"task-{i}",
                "crewId": crew,
                "zoneId": "zone-1",
                "slotId": slot,
                "evaluationRef": f"e-{i}-{crew}-{slot}",
                "decision": "CONTINUOUS_WORK_ALLOWED",
            }
            for i, crew, slot in itertools.product(range(task_count), crew_ids, slot_ids)
        ],
    }


def plan(task_count: int = 1, crew_count: int = 1, slots: int = 4) -> OptimizationInput:
    return OptimizationInput.model_validate(payload(task_count, crew_count, slots))


def test_feasible_assignment_and_evidence() -> None:
    request = plan()
    result = ScheduleOptimizer().solve(request)
    assert result.status == "OPTIMAL"
    assert result.objective is not None and result.objective.weighted_work_slots == 2
    assert result.assignments[0].start_slot_index == 0
    assert result.assignments[0].end_slot_index_exclusive == 2
    assert len(result.assignments[0].safety_evaluation_refs) == 2
    assert validate_schedule(request, result.assignments)


def test_documented_request_fixture() -> None:
    fixture = Path(__file__).parents[3] / "fixtures/optimization/continuous_work_plan.json"
    batch = OptimizationBatchRequest.model_validate(json.loads(fixture.read_text()))
    result = ScheduleOptimizer().solve(batch.plans[0])
    assert result.status == "OPTIMAL"
    assert result.assignments[0].model_dump(by_alias=True) == {
        "taskId": "wall",
        "crewId": "crew-a",
        "zoneId": "north",
        "startSlotIndex": 0,
        "endSlotIndexExclusive": 2,
        "safetyEvaluationRefs": ["confirmed-safety-1", "confirmed-safety-2"],
    }


@pytest.mark.parametrize(
    "decision",
    [
        "UNSAFE",
        "UNKNOWN",
        "MANUAL_REVIEW_REQUIRED",
        "INSUFFICIENT_DATA",
        "WORK_REST_REQUIRED",
        "RESCHEDULE_REQUIRED",
    ],
)
def test_no_safety_override_even_for_high_productivity(decision: str) -> None:
    request = plan(slots=2)
    request.tasks[0].productivity_weight = 1000
    request.safety_feasibility[1] = request.safety_feasibility[1].model_copy(
        update={"decision": decision}
    )
    result = ScheduleOptimizer().solve(request)
    assert result.status == "INFEASIBLE"
    assert result.assignments == []


def test_missing_safety_for_any_occupied_slot_forbids_assignment() -> None:
    request = plan(slots=2)
    request.safety_feasibility.pop()
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"


@pytest.mark.parametrize("entity", ["tasks", "crews", "zones"])
def test_availability_is_hard(entity: str) -> None:
    request = plan(slots=2)
    getattr(request, entity)[0].available_slot_ids = ["slot-0"]
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"


def test_skills_and_eligibility_are_hard() -> None:
    request = plan()
    request.crews[0].skills = []
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"
    request.crews[0].skills = ["masonry"]
    request.tasks[0].eligible_crew_ids = []
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"


def test_crew_conflict_and_exposure_budget() -> None:
    request = plan(task_count=2, slots=2)
    request.zones[0].capacity = 2
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"
    request = plan(task_count=2)
    request.crews[0].max_heat_exposure_slots = 3
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"
    request.crews[0].max_heat_exposure_slots = 4
    result = ScheduleOptimizer().solve(request)
    assert result.status == "OPTIMAL"
    assert {a.start_slot_index for a in result.assignments} == {0, 2}


def test_zone_conflict_with_distinct_crews() -> None:
    request = plan(task_count=2, crew_count=2, slots=2)
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"
    request.zones[0].capacity = 2
    result = ScheduleOptimizer().solve(request)
    assert result.status == "OPTIMAL"
    assert len({a.crew_id for a in result.assignments}) == 2


def test_precedence_and_optional_predecessor() -> None:
    request = plan(task_count=2, crew_count=2)
    request.tasks[0].predecessor_ids = ["task-1"]
    request.tasks[1].required = False
    result = ScheduleOptimizer().solve(request)
    by_task = {a.task_id: a for a in result.assignments}
    assert by_task["task-1"].end_slot_index_exclusive <= by_task["task-0"].start_slot_index
    request.tasks[1].available_slot_ids = []
    assert ScheduleOptimizer().solve(request).status == "INFEASIBLE"


def test_optional_work_productivity_dominates_delay_and_preference() -> None:
    request = plan(task_count=2, slots=3)
    for task in request.tasks:
        task.required = False
    request.tasks[1].productivity_weight = 2
    request.tasks[1].available_slot_ids = ["slot-1", "slot-2"]
    result = ScheduleOptimizer().solve(request)
    assert [a.task_id for a in result.assignments] == ["task-1"]
    assert result.unscheduled_task_ids == ["task-0"]
    assert result.objective is not None and result.objective.weighted_work_slots == 4


def test_preferred_crew_never_bypasses_safety() -> None:
    request = plan(crew_count=2, slots=2)
    request.tasks[0].preferred_crew_ids = ["crew-1"]
    assert ScheduleOptimizer().solve(request).assignments[0].crew_id == "crew-1"
    request.safety_feasibility = [s for s in request.safety_feasibility if s.crew_id == "crew-0"]
    result = ScheduleOptimizer().solve(request)
    assert result.assignments[0].crew_id == "crew-0"
    assert result.objective is not None and result.objective.crew_preference_violations == 1


def test_optional_only_can_return_empty_optimal_schedule() -> None:
    request = plan()
    request.tasks[0].required = False
    request.safety_feasibility = []
    result = ScheduleOptimizer().solve(request)
    assert result.status == "OPTIMAL" and result.assignments == []
    assert result.unscheduled_task_ids == ["task-0"]


def test_deterministic_repetition_and_input_order() -> None:
    request = plan(task_count=2, crew_count=2)
    expected = ScheduleOptimizer().solve(request).model_dump()
    for _ in range(3):
        assert ScheduleOptimizer().solve(request).model_dump() == expected
    request.tasks.reverse()
    request.crews.reverse()
    request.safety_feasibility.reverse()
    assert ScheduleOptimizer().solve(request).model_dump() == expected


@pytest.mark.parametrize("change", ["duplicate", "cycle", "reference", "missing_budget", "extra"])
def test_malformed_contract_rejected(change: str) -> None:
    data = plan().model_dump()
    if change == "duplicate":
        request = plan()
        request.safety_feasibility.append(request.safety_feasibility[0])
        data = request.model_dump()
    elif change == "cycle":
        request = plan()
        request.tasks[0].predecessor_ids = ["task-0"]
        data = request.model_dump()
    elif change == "reference":
        request = plan()
        request.tasks[0].eligible_crew_ids = ["missing"]
        data = request.model_dump()
    elif change == "missing_budget":
        del data["crews"][0]["max_heat_exposure_slots"]
    else:
        data["override_safety"] = True
    with pytest.raises(ValidationError):
        OptimizationInput.model_validate(data)


@pytest.mark.parametrize(
    "status,reason",
    [
        (cp_model.UNKNOWN, "SEARCH_LIMIT_NO_SOLUTION"),
        (cp_model.MODEL_INVALID, "SOLVER_MODEL_INVALID"),
    ],
)
def test_failed_not_misreported_as_infeasible(
    monkeypatch: pytest.MonkeyPatch, status: cp_model.CpSolverStatus, reason: str
) -> None:
    monkeypatch.setattr(cp_model.CpSolver, "solve", lambda self, model: status)
    result = ScheduleOptimizer().solve(plan())
    assert result.status == "FAILED" and result.reason_code == reason
    assert result.assignments == []


def test_candidate_bound_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine_module, "MAX_CANDIDATES", 0)
    result = ScheduleOptimizer().solve(plan())
    assert result.status == "FAILED" and result.reason_code == "MODEL_SIZE_LIMIT"


def test_feasible_status_preserves_validated_incumbent(monkeypatch: pytest.MonkeyPatch) -> None:
    original = cp_model.CpSolver.solve

    def solve(solver: cp_model.CpSolver, model: cp_model.CpModel) -> cp_model.CpSolverStatus:
        assert original(solver, model) == cp_model.OPTIMAL
        return cp_model.FEASIBLE

    monkeypatch.setattr(cp_model.CpSolver, "solve", solve)
    request = plan()
    result = ScheduleOptimizer().solve(request)
    assert result.status == "FEASIBLE"
    assert validate_schedule(request, result.assignments)


@pytest.mark.parametrize("mask", range(64))
def test_small_objective_matches_exhaustive_enumeration(mask: int) -> None:
    request = plan(task_count=2, slots=3)
    request.tasks[0].duration_slots = 1
    request.tasks[1].productivity_weight = 2
    for task in request.tasks:
        task.required = False
    request.safety_feasibility = [
        entry for i, entry in enumerate(request.safety_feasibility) if mask & (1 << i)
    ]
    expected = (0, 0)
    for first, second in itertools.product([None, 0, 1, 2], [None, 0, 1]):
        first_slots = set() if first is None else {first}
        second_slots = set() if second is None else {second, second + 1}
        if first_slots & second_slots:
            continue
        if any(not mask & (1 << i) for i in first_slots):
            continue
        if any(not mask & (1 << (3 + i)) for i in second_slots):
            continue
        value = (len(first_slots) + 2 * len(second_slots), -(first or 0) - (second or 0))
        expected = max(expected, value)
    result = ScheduleOptimizer().solve(request)
    assert result.status == "OPTIMAL" and result.objective is not None
    assert (
        result.objective.weighted_work_slots,
        -result.objective.total_start_slot_delay,
    ) == expected


def test_independent_validator_rejects_unsafe_output(monkeypatch: pytest.MonkeyPatch) -> None:
    request = plan()
    assignments = ScheduleOptimizer().solve(request).assignments
    request.safety_feasibility = []
    assert not validate_schedule(request, assignments)
    monkeypatch.setattr(engine_module, "validate_schedule", lambda plan, assignments: False)
    result = ScheduleOptimizer().solve(plan())
    assert result.status == "FAILED" and result.assignments == []


def test_batch_statuses_and_exception_isolation(monkeypatch: pytest.MonkeyPatch) -> None:
    app = FastAPI()
    app.include_router(router)
    original = ScheduleOptimizer.solve

    def solve(self: ScheduleOptimizer, request: OptimizationInput) -> OptimizationResult:
        if request.planning_ref == "broken":
            raise RuntimeError("internal failure")
        return original(self, request)

    monkeypatch.setattr(ScheduleOptimizer, "solve", solve)
    good = plan()
    bad = plan()
    bad.planning_ref = "infeasible"
    bad.safety_feasibility = []
    broken = good.model_copy(update={"planning_ref": "broken"})
    response = TestClient(app).post(
        "/internal/v1/optimization/batch",
        json={
            "contractVersion": "1.0",
            "plans": [p.model_dump(by_alias=True) for p in [good, bad, broken, good]],
        },
    )
    assert response.status_code == 200
    assert [r["status"] for r in response.json()["results"]] == [
        "OPTIMAL",
        "INFEASIBLE",
        "FAILED",
        "OPTIMAL",
    ]
    assert response.json()["results"][2]["reasonCode"] == "SOLVER_ERROR"


def test_batch_rejects_missing_safety_and_version() -> None:
    app = FastAPI()
    app.include_router(router)
    data = payload()
    del data["safetyFeasibility"]
    assert (
        TestClient(app)
        .post(
            "/internal/v1/optimization/batch",
            json={
                "contractVersion": "1.0",
                "plans": [data],
            },
        )
        .status_code
        == 422
    )
    assert (
        TestClient(app)
        .post(
            "/internal/v1/optimization/batch",
            json={
                "contractVersion": "2.0",
                "plans": [payload()],
            },
        )
        .status_code
        == 422
    )
