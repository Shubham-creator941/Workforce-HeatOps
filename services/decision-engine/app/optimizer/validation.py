"""Independent output validation; never repairs or relaxes an assignment."""

from collections import Counter

from app.contracts.optimization import Assignment, OptimizationInput


def validate_schedule(plan: OptimizationInput, assignments: list[Assignment]) -> bool:
    tasks = {task.id: task for task in plan.tasks}
    crews = {crew.id: crew for crew in plan.crews}
    zones = {zone.id: zone for zone in plan.zones}
    safety = {(s.task_id, s.crew_id, s.zone_id, s.slot_id): s for s in plan.safety_feasibility}
    selected = {a.task_id: a for a in assignments}
    if len(selected) != len(assignments) or any(
        t.required and t.id not in selected for t in plan.tasks
    ):
        return False
    crew_slots: Counter[tuple[str, int]] = Counter()
    zone_slots: Counter[tuple[str, int]] = Counter()
    exposure: Counter[str] = Counter()
    for assignment in assignments:
        if assignment.task_id not in tasks or assignment.crew_id not in crews:
            return False
        task, crew = tasks[assignment.task_id], crews[assignment.crew_id]
        start, end = assignment.start_slot_index, assignment.end_slot_index_exclusive
        if (
            assignment.zone_id != task.zone_id
            or crew.id not in task.eligible_crew_ids
            or not set(task.required_skills) <= set(crew.skills)
            or start < 0
            or end > len(plan.time_slot_ids)
            or end - start != task.duration_slots
        ):
            return False
        refs = []
        for index in range(start, end):
            slot = plan.time_slot_ids[index]
            evidence = safety.get((task.id, crew.id, task.zone_id, slot))
            if (
                slot not in task.available_slot_ids
                or slot not in crew.available_slot_ids
                or slot not in zones[task.zone_id].available_slot_ids
                or evidence is None
                or evidence.decision != "CONTINUOUS_WORK_ALLOWED"
            ):
                return False
            refs.append(evidence.evaluation_ref)
            crew_slots[crew.id, index] += 1
            zone_slots[task.zone_id, index] += 1
            exposure[crew.id] += 1
        if refs != assignment.safety_evaluation_refs:
            return False
        for predecessor in task.predecessor_ids:
            if (
                predecessor not in selected
                or selected[predecessor].end_slot_index_exclusive > start
            ):
                return False
    return (
        all(value <= 1 for value in crew_slots.values())
        and all(value <= zones[zone].capacity for (zone, _), value in zone_slots.items())
        and all(value <= crews[crew].max_heat_exposure_slots for crew, value in exposure.items())
    )
