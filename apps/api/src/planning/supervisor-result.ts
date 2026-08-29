import {
  SupervisorPlanningResultSchema,
  type PlanningRun,
  type SupervisorPlanningResult,
} from "@heatops/contracts";

export function toSupervisorPlanningResult(
  run: PlanningRun,
): SupervisorPlanningResult {
  const thermalResults = run.thermal.flatMap((batch) => batch.results);
  const safetyResults = run.safety.flatMap((batch) => batch.results);
  const optimization = run.optimization;
  return SupervisorPlanningResultSchema.parse({
    planningRunId: run.id,
    status: run.status,
    site: run.request.site ?? null,
    environment: run.normalizedSnapshots.map((snapshot) => ({
      snapshot,
      providerEvidence:
        run.environmentalEvidence.find(
          (evidence) => evidence.snapshotId === snapshot.snapshotId,
        ) ?? null,
      thermal:
        thermalResults.find(
          (result) => result.snapshotId === snapshot.snapshotId,
        ) ?? null,
    })),
    safety: run.safetyEvaluationContexts.flatMap((context) => {
      const result = safetyResults.find(
        (candidate) => candidate.evaluationRef === context.evaluationRef,
      );
      return result ? [{ context, result }] : [];
    }),
    schedule: optimization
      ? {
          solverStatus: optimization.status,
          assignments: optimization.assignments.map((assignment) => ({
            taskId: assignment.taskId,
            crewId: assignment.crewId,
            zoneId: assignment.zoneId,
            slotIds: run.request.timeSlots
              .slice(
                assignment.startSlotIndex,
                assignment.endSlotIndexExclusive,
              )
              .map((slot) => slot.id),
            slotEndsAt: run.request.timeSlots
              .slice(
                assignment.startSlotIndex,
                assignment.endSlotIndexExclusive,
              )
              .map((slot) => slot.endAt),
            safetyEvaluationRefs: assignment.safetyEvaluationRefs,
          })),
          unscheduledTaskIds: optimization.unscheduledTaskIds,
          reasonCode: optimization.reasonCode,
        }
      : null,
    error: run.error,
  });
}
