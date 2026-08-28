import { randomUUID } from "node:crypto";
import {
  PlanningRequestSchema,
  PlanningRunSchema,
  ThermalBatchResponseSchema,
  SafetyBatchResponseSchema,
  OptimizationBatchResponseSchema,
  type PlanningRun,
  type PlanningRunStatus,
  type SafetyBatchRequest,
  type OptimizationBatchRequest,
} from "@heatops/contracts";
import {
  DecisionEngineError,
  type PlanningDecisionEngine,
} from "../decision-engine/planning-client.js";
import { PlanningPersistenceError, type PlanningRunStore } from "./store.js";

const transitions: Partial<Record<PlanningRunStatus, PlanningRunStatus[]>> = {
  QUEUED: ["ALIGNING_DATA", "FAILED"],
  ALIGNING_DATA: ["CALCULATING_THERMAL", "INSUFFICIENT_DATA", "FAILED"],
  CALCULATING_THERMAL: ["EVALUATING_SAFETY", "INSUFFICIENT_DATA", "FAILED"],
  EVALUATING_SAFETY: ["OPTIMIZING", "INSUFFICIENT_DATA", "FAILED"],
  OPTIMIZING: ["READY_FOR_REVIEW", "INFEASIBLE", "FAILED"],
};
function requireMatchingIds(expected: string[], actual: string[]): void {
  if (
    expected.length !== actual.length ||
    new Set(actual).size !== actual.length ||
    actual.some((id) => !expected.includes(id))
  )
    throw new DecisionEngineError("DECISION_ENGINE_ID_MISMATCH");
}
export function createPlanningService(
  store: PlanningRunStore,
  engine: PlanningDecisionEngine,
) {
  return {
    get: (id: string) => store.get(id),
    async run(input: unknown, correlationId: string): Promise<PlanningRun> {
      const request = PlanningRequestSchema.parse(input);
      let run: PlanningRun = {
        id: randomUUID(),
        correlationId,
        status: "QUEUED",
        history: ["QUEUED"],
        request,
        thermal: [],
        safety: [],
        optimization: null,
        error: null,
      };
      await store.create(run);
      async function advance(
        status: PlanningRunStatus,
        patch: Partial<PlanningRun> = {},
      ): Promise<void> {
        if (!transitions[run.status]?.includes(status))
          throw new Error("Invalid planning transition");
        const next = PlanningRunSchema.parse({
          ...run,
          ...patch,
          status,
          history: [...run.history, status],
        });
        await store.save(next, run.status);
        run = next;
      }
      try {
        await advance("ALIGNING_DATA");
        const snapshotFor = (zone: string, slot: string) =>
          request.snapshots.find(
            (snapshot) => snapshot.zoneId === zone && snapshot.slotId === slot,
          );
        if (
          request.tasks.some((task) =>
            request.timeSlots.some(
              (slot) => !snapshotFor(task.zoneId, slot.id),
            ),
          )
        ) {
          await advance("INSUFFICIENT_DATA", {
            error: {
              code: "MISSING_ENVIRONMENTAL_INPUT",
              message: "Every task zone/slot requires a normalized snapshot.",
            },
          });
          return run;
        }
        await advance("CALCULATING_THERMAL");
        const thermal = ThermalBatchResponseSchema.parse(
          await engine.thermal(
            {
              contractVersion: "1.0",
              planningRunId: run.id,
              model: "LILJEGREN",
              items: request.snapshots.map(({ slotId: _slot, ...snapshot }) => {
                void _slot;
                return snapshot;
              }),
            },
            correlationId,
          ),
        );
        run = { ...run, thermal: [thermal] };
        requireMatchingIds(
          request.snapshots.map((s) => s.snapshotId),
          thermal.results.map((s) => s.snapshotId),
        );
        if (thermal.results.some((item) => item.status !== "VALID")) {
          const failed = thermal.results.some(
            (item) => item.status === "MODEL_NON_CONVERGENCE",
          );
          await advance(failed ? "FAILED" : "INSUFFICIENT_DATA", {
            error: {
              code: failed
                ? "THERMAL_MODEL_FAILURE"
                : "THERMAL_INPUT_UNSUPPORTED",
              message: "Thermal batch did not produce all required estimates.",
            },
          });
          return run;
        }
        await advance("EVALUATING_SAFETY");
        const evaluations: SafetyBatchRequest["evaluations"] = [];
        const keys: {
          taskId: string;
          crewId: string;
          zoneId: string;
          slotId: string;
          evaluationRef: string;
        }[] = [];
        for (const task of request.tasks)
          for (const crewId of task.eligibleCrewIds)
            for (const slot of request.timeSlots) {
              const crew = request.crews.find((item) => item.id === crewId);
              const snapshot = snapshotFor(task.zoneId, slot.id);
              const estimate = thermal.results.find(
                (item) => item.snapshotId === snapshot?.snapshotId,
              );
              if (
                !crew ||
                !snapshot ||
                !estimate ||
                estimate.status !== "VALID"
              )
                throw new DecisionEngineError("MISSING_STAGE_INPUT");
              const evaluationRef = `${run.id}:${evaluations.length}`;
              keys.push({
                taskId: task.id,
                crewId,
                zoneId: task.zoneId,
                slotId: slot.id,
                evaluationRef,
              });
              evaluations.push({
                evaluationRef,
                thermalEstimateId: snapshot.snapshotId,
                estimatedWbgtC: estimate.estimatedWbgtC,
                workloadCategory: task.workloadCategory,
                ppeCategory: crew.ppeCategory,
                acclimatization: crew.acclimatization,
                recoveryEnvironment: { mode: "SAME_AS_WORK" },
              });
            }
        for (let offset = 0; offset < evaluations.length; offset += 1000) {
          const batch = evaluations.slice(offset, offset + 1000);
          const safety = SafetyBatchResponseSchema.parse(
            await engine.safety(
              {
                contractVersion: "1.0",
                rulesetVersion: "NIOSH_2016_MVP_V1",
                evaluations: batch,
              },
              correlationId,
            ),
          );
          run = { ...run, safety: [...run.safety, safety] };
          requireMatchingIds(
            batch.map((item) => item.evaluationRef),
            safety.results.map((item) => item.evaluationRef),
          );
          for (const result of safety.results) {
            const original = batch.find(
              (item) => item.evaluationRef === result.evaluationRef,
            );
            if (
              !original ||
              result.thermalEstimateId !== original.thermalEstimateId ||
              result.estimatedWbgtC !== original.estimatedWbgtC ||
              result.workloadCategory !== original.workloadCategory
            )
              throw new DecisionEngineError("DECISION_ENGINE_ID_MISMATCH");
          }
        }
        const results = run.safety.flatMap((batch) => batch.results);
        if (results.some((item) => item.decision === "INSUFFICIENT_DATA")) {
          await advance("INSUFFICIENT_DATA", {
            error: {
              code: "SAFETY_INPUT_INSUFFICIENT",
              message: "Safety service requires additional data.",
            },
          });
          return run;
        }
        await advance("OPTIMIZING");
        const plan: OptimizationBatchRequest["plans"][number] = {
          planningRef: run.id,
          safetyRulesetVersion: "NIOSH_2016_MVP_V1",
          timeSlotIds: request.timeSlots.map((slot) => slot.id),
          slotDurationMinutes: request.slotDurationMinutes,
          tasks: request.tasks.map(
            ({ workloadCategory: _workload, ...task }) => {
              void _workload;
              return task;
            },
          ),
          crews: request.crews.map(
            ({
              ppeCategory: _ppe,
              acclimatization: _accl,
              exposureBudgetRef: _ref,
              ...crew
            }) => {
              void _ppe;
              void _accl;
              void _ref;
              return crew;
            },
          ),
          zones: request.zones,
          safetyFeasibility: keys.map((key) => {
            const result = results.find(
              (item) => item.evaluationRef === key.evaluationRef,
            );
            if (!result) throw new DecisionEngineError("MISSING_STAGE_INPUT");
            return { ...key, decision: result.decision };
          }),
        };
        const optimized = OptimizationBatchResponseSchema.parse(
          await engine.optimize(
            { contractVersion: "1.0", plans: [plan] },
            correlationId,
          ),
        );
        requireMatchingIds(
          [run.id],
          optimized.results.map((item) => item.planningRef),
        );
        const result = optimized.results[0];
        if (!result) throw new DecisionEngineError("MISSING_STAGE_OUTPUT");
        // Validate provenance, not scientific values or schedule optimality.
        requireMatchingIds(
          request.tasks.map((task) => task.id),
          [
            ...result.assignments.map((a) => a.taskId),
            ...result.unscheduledTaskIds,
          ],
        );
        for (const assignment of result.assignments) {
          const task = request.tasks.find(
            (item) => item.id === assignment.taskId,
          );
          if (
            !task ||
            assignment.zoneId !== task.zoneId ||
            !task.eligibleCrewIds.includes(assignment.crewId) ||
            assignment.endSlotIndexExclusive - assignment.startSlotIndex !==
              task.durationSlots
          )
            throw new DecisionEngineError("INVALID_ASSIGNMENT_EVIDENCE");
          if (
            assignment.endSlotIndexExclusive > plan.timeSlotIds.length ||
            assignment.startSlotIndex >= assignment.endSlotIndexExclusive
          )
            throw new DecisionEngineError("INVALID_ASSIGNMENT_EVIDENCE");
          const slots = plan.timeSlotIds.slice(
            assignment.startSlotIndex,
            assignment.endSlotIndexExclusive,
          );
          const expected = slots.map((slotId) =>
            plan.safetyFeasibility.find(
              (key) =>
                key.taskId === assignment.taskId &&
                key.crewId === assignment.crewId &&
                key.zoneId === assignment.zoneId &&
                key.slotId === slotId,
            ),
          );
          if (
            expected.some(
              (item) => !item || item.decision !== "CONTINUOUS_WORK_ALLOWED",
            ) ||
            JSON.stringify(expected.map((item) => item?.evaluationRef)) !==
              JSON.stringify(assignment.safetyEvaluationRefs)
          )
            throw new DecisionEngineError("INVALID_ASSIGNMENT_EVIDENCE");
        }
        if (
          (result.status === "OPTIMAL" || result.status === "FEASIBLE") &&
          request.tasks.some(
            (task) =>
              task.required && result.unscheduledTaskIds.includes(task.id),
          )
        )
          throw new DecisionEngineError("INVALID_ASSIGNMENT_EVIDENCE");
        await advance(
          result.status === "INFEASIBLE"
            ? "INFEASIBLE"
            : result.status === "FAILED"
              ? "FAILED"
              : "READY_FOR_REVIEW",
          {
            optimization: result,
            error:
              result.status === "FAILED"
                ? {
                    code: "OPTIMIZER_FAILED",
                    message: result.reasonCode ?? "Optimizer failed.",
                  }
                : null,
          },
        );
      } catch (error) {
        if (error instanceof PlanningPersistenceError) throw error;
        await advance("FAILED", {
          error: {
            code:
              error instanceof DecisionEngineError
                ? error.code
                : "PLANNING_FAILED",
            message:
              "Planning could not complete; no automatic approval was issued.",
          },
        });
      }
      return run;
    },
  };
}
export type PlanningService = ReturnType<typeof createPlanningService>;
