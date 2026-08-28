"""Deterministic bounded CP-SAT planning over upstream safety decisions."""

from collections import defaultdict
from dataclasses import dataclass

from ortools.sat.python import cp_model

from app.contracts.optimization import Assignment, Objective, OptimizationInput, OptimizationResult
from app.optimizer.validation import validate_schedule

MAX_CANDIDATES = 20000
MAX_DETERMINISTIC_TIME = 5.0


@dataclass(frozen=True)
class Candidate:
    task_id: str
    crew_id: str
    zone_id: str
    start: int
    end: int
    preference_cost: int
    evidence_refs: tuple[str, ...]
    variable: cp_model.IntVar


def failure(
    plan: OptimizationInput, reason: str, *, infeasible: bool = False
) -> OptimizationResult:
    return OptimizationResult(
        planning_ref=plan.planning_ref,
        safety_ruleset_version=plan.safety_ruleset_version,
        status="INFEASIBLE" if infeasible else "FAILED",
        unscheduled_task_ids=sorted(task.id for task in plan.tasks),
        reason_code=reason,
    )


class ScheduleOptimizer:
    def solve(self, plan: OptimizationInput) -> OptimizationResult:
        model = cp_model.CpModel()
        tasks = sorted(plan.tasks, key=lambda task: task.id)
        crews = sorted(plan.crews, key=lambda crew: crew.id)
        zones = {zone.id: zone for zone in plan.zones}
        safety = {(s.task_id, s.crew_id, s.zone_id, s.slot_id): s for s in plan.safety_feasibility}
        candidates: list[Candidate] = []
        by_task: dict[str, list[Candidate]] = defaultdict(list)
        crew_slots: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
        zone_slots: dict[tuple[str, int], list[cp_model.IntVar]] = defaultdict(list)
        by_crew: dict[str, list[Candidate]] = defaultdict(list)
        for task in tasks:
            for crew in crews:
                if crew.id not in task.eligible_crew_ids or not set(task.required_skills) <= set(
                    crew.skills
                ):
                    continue
                available = (
                    set(task.available_slot_ids)
                    & set(crew.available_slot_ids)
                    & set(zones[task.zone_id].available_slot_ids)
                )
                for start in range(len(plan.time_slot_ids) - task.duration_slots + 1):
                    end = start + task.duration_slots
                    slots = plan.time_slot_ids[start:end]
                    entries = [safety.get((task.id, crew.id, task.zone_id, slot)) for slot in slots]
                    if not set(slots) <= available or any(
                        entry is None or entry.decision != "CONTINUOUS_WORK_ALLOWED"
                        for entry in entries
                    ):
                        continue
                    if len(candidates) >= MAX_CANDIDATES:
                        return failure(plan, "MODEL_SIZE_LIMIT")
                    variable = model.new_bool_var(f"assignment_{len(candidates)}")
                    candidate = Candidate(
                        task.id,
                        crew.id,
                        task.zone_id,
                        start,
                        end,
                        int(
                            bool(task.preferred_crew_ids) and crew.id not in task.preferred_crew_ids
                        ),
                        tuple(entry.evaluation_ref for entry in entries if entry is not None),
                        variable,
                    )
                    candidates.append(candidate)
                    by_task[task.id].append(candidate)
                    by_crew[crew.id].append(candidate)
                    for index in range(start, end):
                        crew_slots[crew.id, index].append(variable)
                        zone_slots[task.zone_id, index].append(variable)
        present = {
            task.id: model.new_bool_var(f"present_{index}") for index, task in enumerate(tasks)
        }
        for task in tasks:
            model.add(sum(c.variable for c in by_task[task.id]) == present[task.id])
            if task.required:
                model.add(present[task.id] == 1)
            for predecessor in sorted(set(task.predecessor_ids)):
                model.add(present[task.id] <= present[predecessor])
                model.add(
                    sum(c.end * c.variable for c in by_task[predecessor])
                    <= sum(c.start * c.variable for c in by_task[task.id])
                ).only_enforce_if(present[task.id])
        for key in sorted(crew_slots):
            model.add(sum(crew_slots[key]) <= 1)
        for zone, index in sorted(zone_slots):
            model.add(sum(zone_slots[zone, index]) <= zones[zone].capacity)
        for crew in crews:
            model.add(
                sum((c.end - c.start) * c.variable for c in by_crew[crew.id])
                <= crew.max_heat_exposure_slots
            )
        # One unit of work dominates every possible aggregate secondary cost.
        secondary_bound = len(tasks) * (len(plan.time_slot_ids) + 1)
        model.maximize(
            (secondary_bound + 1)
            * sum(
                task.duration_slots * task.productivity_weight * present[task.id] for task in tasks
            )
            - sum((c.start + c.preference_cost) * c.variable for c in candidates)
        )
        solver = cp_model.CpSolver()
        solver.parameters.num_search_workers = 1
        solver.parameters.random_seed = 0
        solver.parameters.max_deterministic_time = MAX_DETERMINISTIC_TIME
        status = solver.solve(model)
        if status == cp_model.INFEASIBLE:
            return failure(plan, "HARD_CONSTRAINTS_INFEASIBLE", infeasible=True)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            return failure(
                plan,
                "SEARCH_LIMIT_NO_SOLUTION"
                if status == cp_model.UNKNOWN
                else "SOLVER_MODEL_INVALID",
            )
        chosen = [candidate for candidate in candidates if solver.boolean_value(candidate.variable)]
        assignments = [
            Assignment(
                task_id=c.task_id,
                crew_id=c.crew_id,
                zone_id=c.zone_id,
                start_slot_index=c.start,
                end_slot_index_exclusive=c.end,
                safety_evaluation_refs=list(c.evidence_refs),
            )
            for c in chosen
        ]
        if not validate_schedule(plan, assignments):
            return failure(plan, "OUTPUT_VALIDATION_FAILED")
        selected = {c.task_id for c in chosen}
        return OptimizationResult(
            planning_ref=plan.planning_ref,
            safety_ruleset_version=plan.safety_ruleset_version,
            status="OPTIMAL" if status == cp_model.OPTIMAL else "FEASIBLE",
            assignments=assignments,
            unscheduled_task_ids=sorted(task.id for task in tasks if task.id not in selected),
            objective=Objective(
                weighted_work_slots=sum(
                    t.duration_slots * t.productivity_weight for t in tasks if t.id in selected
                ),
                total_start_slot_delay=sum(c.start for c in chosen),
                crew_preference_violations=sum(c.preference_cost for c in chosen),
            ),
        )
