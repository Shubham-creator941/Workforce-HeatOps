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
  type PlanningRequest,
  type EnvironmentalEvidence,
} from "@heatops/contracts";
import {
  DecisionEngineError,
  type PlanningDecisionEngine,
} from "../decision-engine/planning-client.js";
import { PlanningPersistenceError, type PlanningRunStore } from "./store.js";
import { ProviderError } from "../providers/errors.js";
import type { FortyGuardClient } from "../providers/fortyguard.js";
import type { MeteorologyClient } from "../providers/open-meteo.js";

export interface PlanningProviders {
  fortyGuard: FortyGuardClient;
  meteorology: MeteorologyClient;
}

const transitions: Partial<Record<PlanningRunStatus, PlanningRunStatus[]>> = {
  QUEUED: ["FETCHING_FORTYGUARD", "ALIGNING_DATA", "FAILED"],
  FETCHING_FORTYGUARD: ["FETCHING_METEOROLOGY", "INSUFFICIENT_DATA", "FAILED"],
  FETCHING_METEOROLOGY: ["ALIGNING_DATA", "INSUFFICIENT_DATA", "FAILED"],
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
  providers?: PlanningProviders,
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
        normalizedSnapshots: [],
        thermal: [],
        safety: [],
        environmentalEvidence: [],
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
        let snapshots: PlanningRequest["snapshots"] = request.snapshots;
        if (request.environmentalSource.mode === "PROVIDERS") {
          await advance("FETCHING_FORTYGUARD");
          if (!providers)
            throw new ProviderError("FORTYGUARD", "CONFIGURATION");
          const pairs = request.tasks
            .flatMap((task) =>
              request.timeSlots.map((slot) => ({ zoneId: task.zoneId, slot })),
            )
            .filter(
              (pair, index, all) =>
                all.findIndex(
                  (item) =>
                    item.zoneId === pair.zoneId &&
                    item.slot.id === pair.slot.id,
                ) === index,
            );
          const temperatures: Array<{
            zoneId: string;
            slot: PlanningRequest["timeSlots"][number];
            zone: Extract<
              PlanningRequest["environmentalSource"],
              { mode: "PROVIDERS" }
            >["zones"][number];
            temperature: Awaited<ReturnType<FortyGuardClient["temperature"]>>;
          }> = [];
          for (const pair of pairs) {
            const zone = request.environmentalSource.zones.find(
              (item) => item.zoneId === pair.zoneId,
            );
            if (!zone) throw new ProviderError("FORTYGUARD", "MISSING_DATA");
            const end = new Date(pair.slot.endAt);
            const start = new Date(end.valueOf() - 3_600_000);
            temperatures.push({
              ...pair,
              zone,
              temperature: await providers.fortyGuard.temperature({
                polygon: zone.polygon,
                samplePoint: zone.samplePoint,
                intervalStartUtc: start.toISOString(),
                intervalEndUtc: end.toISOString(),
                timeZone: request.environmentalSource.timeZone,
              }),
            });
          }
          await advance("FETCHING_METEOROLOGY");
          const normalized: PlanningRequest["snapshots"] = [];
          const evidence: EnvironmentalEvidence[] = [];
          for (const item of temperatures) {
            const [longitude, latitude] = item.zone.samplePoint;
            const meteorology = await providers.meteorology.meteorology({
              latitude,
              longitude,
              timestamp: item.slot.endAt,
            });
            const expectedEnd = new Date(item.slot.endAt);
            const expectedStart = new Date(expectedEnd.valueOf() - 3_600_000);
            if (
              item.temperature.submittedTimeZone !==
                request.environmentalSource.timeZone ||
              Date.parse(item.temperature.alignedIntervalStart) !==
                expectedStart.valueOf() ||
              Date.parse(item.temperature.alignedIntervalEnd) !==
                expectedEnd.valueOf() ||
              meteorology.returnedTimestamp !==
                expectedEnd.toISOString().slice(0, 16)
            )
              throw new ProviderError("OPEN_METEO", "TEMPORAL_ALIGNMENT");
            const wind = request.environmentalSource.verifiedWind2m.find(
              (candidate) =>
                candidate.zoneId === item.zoneId &&
                candidate.slotId === item.slot.id,
            );
            if (
              !wind ||
              Date.parse(wind.observedAt) !== Date.parse(item.slot.endAt)
            )
              throw new ProviderError("OPEN_METEO", "MISSING_DATA");
            const snapshotId = `provider:${item.zoneId}:${item.slot.id}`;
            normalized.push({
              snapshotId,
              zoneId: item.zoneId,
              slotId: item.slot.id,
              timestamp: item.slot.endAt,
              latitude,
              longitude,
              airTemperatureC: item.temperature.averageTemperatureC,
              relativeHumidityPercent: meteorology.relativeHumidityPercent,
              solarRadiationWm2: meteorology.shortwaveRadiationWm2,
              windSpeedMs: wind.windSpeedMs,
              windMeasurementHeightM: 2,
              surfacePressureHpa: meteorology.surfacePressureHpa,
              solarAveragingPeriodMinutes: 60,
            });
            evidence.push({
              snapshotId,
              zoneId: item.zoneId,
              slotId: item.slot.id,
              fortyGuard: {
                provider: "FORTYGUARD_TEMPERATURE_API_V1",
                ...item.temperature,
                granularityM: 60,
                responseTimestampSemantics: "NOT_PROVIDED",
              },
              meteorology: {
                provider: "OPEN_METEO_FORECAST_API",
                requestedTimestamp: item.slot.endAt,
                ...meteorology,
                radiationSemantics: "PRECEDING_HOUR_MEAN",
              },
              wind: {
                sourceRef: wind.sourceRef,
                observedAt: wind.observedAt,
                windSpeedMs: wind.windSpeedMs,
                measurementHeightM: 2,
              },
            });
          }
          snapshots = normalized;
          await advance("ALIGNING_DATA", {
            normalizedSnapshots: snapshots,
            environmentalEvidence: evidence,
          });
        } else {
          await advance("ALIGNING_DATA", { normalizedSnapshots: snapshots });
        }
        const snapshotFor = (zone: string, slot: string) =>
          snapshots.find(
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
              items: snapshots.map(({ slotId: _slot, ...snapshot }) => {
                void _slot;
                return snapshot;
              }),
            },
            correlationId,
          ),
        );
        run = { ...run, thermal: [thermal] };
        requireMatchingIds(
          snapshots.map((s) => s.snapshotId),
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
        const insufficient =
          error instanceof ProviderError &&
          [
            "INVALID_REQUEST",
            "INVALID_RESPONSE",
            "MISSING_DATA",
            "TEMPORAL_ALIGNMENT",
          ].includes(error.kind);
        await advance(insufficient ? "INSUFFICIENT_DATA" : "FAILED", {
          error: {
            code:
              error instanceof ProviderError
                ? error.message
                : error instanceof DecisionEngineError
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
