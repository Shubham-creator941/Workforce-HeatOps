import { z } from "zod";
import {
  AcclimatizationStateSchema,
  PPECategorySchema,
  PlanningRunStatusSchema,
  SafetyDecisionSchema,
  SolverStatusSchema,
  WorkloadCategorySchema,
} from "./enums.js";

const Id = z.string().min(1).max(128);
const Finite = z.number().finite();
const Slots = z.array(Id).max(96);
const Reason = z.object({ code: Id, message: z.string() }).passthrough();
export const RulesetSchema = z.literal("NIOSH_2016_MVP_V1");
export const ThermalInputSchema = z
  .object({
    snapshotId: Id,
    zoneId: Id,
    timestamp: z.iso.datetime({ offset: true }),
    latitude: Finite,
    longitude: Finite,
    airTemperatureC: Finite,
    relativeHumidityPercent: Finite,
    solarRadiationWm2: Finite,
    windSpeedMs: Finite,
    windMeasurementHeightM: Finite,
    surfacePressureHpa: Finite,
    solarAveragingPeriodMinutes: z.number().int(),
  })
  .strict();
const CoordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const ProviderEnvironmentalSourceSchema = z
  .object({
    mode: z.literal("PROVIDERS"),
    timeZone: z.string().min(1).max(128),
    zones: z
      .array(
        z
          .object({
            zoneId: Id,
            samplePoint: CoordinateSchema,
            polygon: z.array(CoordinateSchema).min(4).max(500),
          })
          .strict(),
      )
      .min(1)
      .max(30),
    verifiedWind2m: z
      .array(
        z
          .object({
            zoneId: Id,
            slotId: Id,
            windSpeedMs: Finite.min(0),
            measurementHeightM: z.literal(2),
            observedAt: z.iso.datetime({ offset: true }),
            sourceRef: Id,
          })
          .strict(),
      )
      .min(1)
      .max(720),
  })
  .strict();
export const EnvironmentalSourceSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NORMALIZED") }).strict(),
  ProviderEnvironmentalSourceSchema,
]);

export const EnvironmentalEvidenceSchema = z
  .object({
    snapshotId: Id,
    zoneId: Id,
    slotId: Id,
    fortyGuard: z
      .object({
        provider: z.literal("FORTYGUARD_TEMPERATURE_API_V1"),
        activityId: Id,
        tileId: Id,
        granularityM: z.literal(60),
        averageTemperatureC: Finite,
        minTemperatureC: Finite,
        maxTemperatureC: Finite,
        submittedStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        submittedStartTime: z.string().regex(/^\d{2}:\d{2}$/),
        submittedTimeZone: z.string().min(1),
        alignedIntervalStart: z.iso.datetime({ offset: true }),
        alignedIntervalEnd: z.iso.datetime({ offset: true }),
        responseTimestampSemantics: z.literal("NOT_PROVIDED"),
      })
      .strict(),
    meteorology: z
      .object({
        provider: z.literal("OPEN_METEO_FORECAST_API"),
        requestedTimestamp: z.iso.datetime({ offset: true }),
        returnedTimestamp: z.string().min(1),
        relativeHumidityPercent: Finite,
        surfacePressureHpa: Finite,
        shortwaveRadiationWm2: Finite,
        radiationSemantics: z.literal("PRECEDING_HOUR_MEAN"),
      })
      .strict(),
    wind: z
      .object({
        sourceRef: Id,
        observedAt: z.iso.datetime({ offset: true }),
        windSpeedMs: Finite.min(0),
        measurementHeightM: z.literal(2),
      })
      .strict(),
  })
  .strict();
export const ThermalBatchRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    planningRunId: Id,
    model: z.literal("LILJEGREN"),
    items: z.array(ThermalInputSchema).min(1).max(1000),
  })
  .strict();
export const ThermalResultSchema = z.discriminatedUnion("status", [
  z
    .object({
      snapshotId: Id,
      status: z.literal("VALID"),
      estimatedWbgtC: Finite,
      components: z
        .object({
          globeTemperatureC: Finite,
          naturalWetBulbTemperatureC: Finite,
          psychrometricWetBulbTemperatureC: Finite,
        })
        .passthrough(),
      modelDiagnostics: z
        .object({
          effectiveWindSpeedMs: Finite,
          adjustedSolarRadiationWm2: Finite,
          cosineSolarZenith: Finite,
        })
        .passthrough(),
      warnings: z.array(z.string()),
    })
    .passthrough(),
  z
    .object({
      snapshotId: Id,
      status: z.enum([
        "INVALID_INPUT",
        "MODEL_NON_CONVERGENCE",
        "UNSUPPORTED_INPUT",
      ]),
      error: Reason,
      warnings: z.array(z.string()),
    })
    .passthrough(),
]);
export const ThermalBatchResponseSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    model: z
      .object({
        name: z.literal("liljegren"),
        implementationVersion: z.literal("1.0.0"),
        reference: z.literal("Liljegren et al. 2008"),
        referenceCodeVersion: z.literal("WBGT 1.1"),
      })
      .passthrough(),
    results: z.array(ThermalResultSchema).max(1000),
  })
  .passthrough();
export const AcclimatizationSchema = z
  .object({
    state: AcclimatizationStateSchema,
    day: z.number().int().min(1).optional(),
  })
  .strict()
  .refine((value) => {
    const ramp =
      value.state === "NEW_WORKER_RAMP" ||
      value.state === "RETURNING_WORKER_RAMP";
    return ramp ? value.day !== undefined : value.day === undefined;
  }, "Ramp state requires day; non-ramp state must omit day");
export const SafetyInputSchema = z
  .object({
    evaluationRef: Id,
    thermalEstimateId: Id,
    estimatedWbgtC: Finite,
    workloadCategory: WorkloadCategorySchema,
    ppeCategory: PPECategorySchema,
    acclimatization: AcclimatizationSchema,
    recoveryEnvironment: z.object({ mode: z.literal("SAME_AS_WORK") }).strict(),
  })
  .strict();
export const SafetyBatchRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    rulesetVersion: RulesetSchema,
    evaluations: z.array(SafetyInputSchema).min(1).max(1000),
  })
  .strict();
export const SafetyResultSchema = z
  .object({
    evaluationRef: Id,
    thermalEstimateId: Id,
    decision: SafetyDecisionSchema,
    estimatedWbgtC: Finite,
    clothingAdjustmentC: Finite.nullable(),
    effectiveWorkWbgtC: Finite.nullable(),
    workloadCategory: WorkloadCategorySchema,
    workMetabolicRateWatts: Finite.nullable(),
    restMetabolicRateWatts: Finite,
    limitType: z.enum(["RAL", "REL"]).nullable(),
    applicableContinuousWorkLimitWbgtC: Finite.nullable(),
    marginC: Finite.nullable(),
    maxWorkMinutesPerHour: z.number().int().nullable(),
    requiredRestMinutesPerHour: z.number().int().nullable(),
    acclimatizationConstraint: z
      .object({ maxHeatExposureFraction: Finite.min(0).max(1) })
      .nullable(),
    ruleEvidence: z.array(
      z
        .object({
          ruleId: Id,
          sourceTitle: z.string().min(1),
          sourceOrganization: Id,
          sourceYear: z.number().int(),
          publicationId: z.string().nullable().optional(),
        })
        .passthrough(),
    ),
    reason: Reason.nullable(),
  })
  .passthrough()
  .refine(
    (value) =>
      value.decision !== "CONTINUOUS_WORK_ALLOWED" ||
      (value.maxWorkMinutesPerHour === 60 &&
        value.requiredRestMinutesPerHour === 0 &&
        value.clothingAdjustmentC !== null &&
        value.effectiveWorkWbgtC !== null &&
        value.workMetabolicRateWatts !== null &&
        value.limitType !== null &&
        value.applicableContinuousWorkLimitWbgtC !== null &&
        value.marginC !== null &&
        value.acclimatizationConstraint !== null &&
        value.ruleEvidence.length > 0 &&
        value.reason === null),
    "Continuous authorization requires complete evidence and a 60/0 contract",
  );
export const SafetyBatchResponseSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    rulesetVersion: RulesetSchema,
    results: z.array(SafetyResultSchema).max(1000),
  })
  .passthrough();

export const OptimizationTaskSchema = z
  .object({
    id: Id,
    zoneId: Id,
    durationSlots: z.number().int().min(1).max(96),
    eligibleCrewIds: z.array(Id).max(30),
    availableSlotIds: Slots,
    requiredSkills: z.array(Id).max(30),
    predecessorIds: z.array(Id).max(100).default([]),
    required: z.boolean().default(true),
    productivityWeight: z.number().int().min(1).max(1000).default(1),
    preferredCrewIds: z.array(Id).max(30).default([]),
  })
  .strict();
export const OptimizationCrewSchema = z
  .object({
    id: Id,
    skills: z.array(Id).max(30),
    availableSlotIds: Slots,
    maxHeatExposureSlots: z.number().int().min(0).max(96),
  })
  .strict();
export const OptimizationZoneSchema = z
  .object({
    id: Id,
    availableSlotIds: Slots,
    capacity: z.number().int().min(1).max(30),
  })
  .strict();
export const OptimizationInputSchema = z
  .object({
    planningRef: Id,
    safetyRulesetVersion: RulesetSchema,
    timeSlotIds: z.array(Id).min(1).max(96),
    slotDurationMinutes: z.number().int().min(1).max(60),
    tasks: z.array(OptimizationTaskSchema).min(1).max(100),
    crews: z.array(OptimizationCrewSchema).min(1).max(30),
    zones: z.array(OptimizationZoneSchema).min(1).max(30),
    safetyFeasibility: z
      .array(
        z
          .object({
            taskId: Id,
            crewId: Id,
            zoneId: Id,
            slotId: Id,
            evaluationRef: Id,
            decision: SafetyDecisionSchema,
          })
          .strict(),
      )
      .max(100000),
  })
  .strict();
export const OptimizationBatchRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    plans: z.array(OptimizationInputSchema).min(1).max(10),
  })
  .strict();
export const OptimizationResultSchema = z
  .object({
    planningRef: Id,
    safetyRulesetVersion: RulesetSchema,
    optimizerVersion: z.literal("CP_SAT_SLOTS_V1"),
    status: SolverStatusSchema,
    assignments: z.array(
      z
        .object({
          taskId: Id,
          crewId: Id,
          zoneId: Id,
          startSlotIndex: z.number().int().min(0),
          endSlotIndexExclusive: z.number().int().min(1),
          safetyEvaluationRefs: z.array(Id).min(1),
        })
        .passthrough(),
    ),
    unscheduledTaskIds: z.array(Id),
    objective: z
      .object({
        weightedWorkSlots: z.number().int().min(0),
        totalStartSlotDelay: z.number().int().min(0),
        crewPreferenceViolations: z.number().int().min(0),
      })
      .nullable(),
    reasonCode: z.string().nullable(),
  })
  .passthrough()
  .refine(
    (value) =>
      value.status === "OPTIMAL" || value.status === "FEASIBLE"
        ? value.objective !== null && value.reasonCode === null
        : value.assignments.length === 0 && value.reasonCode !== null,
    "Solver result must agree with status",
  );
export const OptimizationBatchResponseSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    results: z.array(OptimizationResultSchema).max(10),
  })
  .passthrough();

export const PlanningRequestSchema = z
  .object({
    contractVersion: z.literal("1.0"),
    site: z
      .object({ id: Id, name: z.string().min(1).max(200) })
      .strict()
      .optional(),
    slotDurationMinutes: z.number().int().min(1).max(60),
    timeSlots: z
      .array(
        z.object({ id: Id, endAt: z.iso.datetime({ offset: true }) }).strict(),
      )
      .min(1)
      .max(24),
    tasks: z
      .array(
        OptimizationTaskSchema.extend({
          workloadCategory: WorkloadCategorySchema,
        }),
      )
      .min(1)
      .max(20),
    crews: z
      .array(
        OptimizationCrewSchema.extend({
          ppeCategory: PPECategorySchema,
          acclimatization: AcclimatizationSchema,
          exposureBudgetRef: Id,
        }),
      )
      .min(1)
      .max(10),
    zones: z.array(OptimizationZoneSchema).min(1).max(30),
    environmentalSource: EnvironmentalSourceSchema.default({
      mode: "NORMALIZED",
    }),
    snapshots: z
      .array(ThermalInputSchema.extend({ slotId: Id }))
      .max(720)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: "custom", message });
    const unique = (ids: string[]) => new Set(ids).size === ids.length;
    for (const entities of [
      value.tasks,
      value.crews,
      value.zones,
      value.timeSlots,
    ])
      if (!unique(entities.map((item) => item.id)))
        issue("Entity IDs must be unique");
    if (
      !unique(value.snapshots.map((item) => item.snapshotId)) ||
      !unique(
        value.snapshots.map((item) =>
          JSON.stringify([item.zoneId, item.slotId]),
        ),
      )
    )
      issue("Snapshots must be unique");
    const slotIds = new Set(value.timeSlots.map((slot) => slot.id));
    const crewIds = new Set(value.crews.map((crew) => crew.id));
    const taskIds = new Set(value.tasks.map((task) => task.id));
    const zoneIds = new Set(value.zones.map((zone) => zone.id));
    if (value.environmentalSource.mode === "PROVIDERS") {
      try {
        new Intl.DateTimeFormat("en-US", {
          timeZone: value.environmentalSource.timeZone,
        }).format(new Date());
      } catch {
        issue("Provider timezone must be a valid IANA timezone");
      }
      if (value.slotDurationMinutes !== 60)
        issue("Provider mode requires 60-minute slots");
      if (value.snapshots.length !== 0)
        issue("Provider mode must not include caller-supplied snapshots");
      const providerZones = new Set(
        value.environmentalSource.zones.map((zone) => zone.zoneId),
      );
      const windKeys = value.environmentalSource.verifiedWind2m.map((wind) =>
        JSON.stringify([wind.zoneId, wind.slotId]),
      );
      if (!unique([...providerZones])) issue("Provider zones must be unique");
      if (!unique(windKeys)) issue("Verified wind observations must be unique");
      for (const zone of value.environmentalSource.zones) {
        const first = zone.polygon[0];
        const last = zone.polygon.at(-1);
        if (!first || !last || first[0] !== last[0] || first[1] !== last[1])
          issue("Provider polygons must be closed");
      }
      for (const task of value.tasks)
        if (!providerZones.has(task.zoneId)) issue("Missing provider zone");
      for (const task of value.tasks)
        for (const slot of value.timeSlots) {
          const wind = value.environmentalSource.verifiedWind2m.find(
            (item) => item.zoneId === task.zoneId && item.slotId === slot.id,
          );
          if (!wind || Date.parse(wind.observedAt) !== Date.parse(slot.endAt))
            issue(
              "Exact verified 2 m wind is required for each task zone/slot",
            );
        }
    }
    for (const entity of [...value.tasks, ...value.crews, ...value.zones])
      if (entity.availableSlotIds.some((id) => !slotIds.has(id)))
        issue("Unknown availability slot");
    for (const task of value.tasks) {
      if (
        !zoneIds.has(task.zoneId) ||
        task.eligibleCrewIds.some((id) => !crewIds.has(id)) ||
        !unique(task.eligibleCrewIds) ||
        task.predecessorIds.some((id) => !taskIds.has(id)) ||
        task.preferredCrewIds.some((id) => !task.eligibleCrewIds.includes(id))
      )
        issue("Invalid task reference");
    }
    value.timeSlots.forEach((slot, index) => {
      const previous = value.timeSlots[index - 1];
      if (
        previous &&
        Date.parse(slot.endAt) - Date.parse(previous.endAt) !==
          value.slotDurationMinutes * 60000
      )
        issue("Time slots must be ordered, contiguous and equally spaced");
    });
    for (const snapshot of value.snapshots) {
      const slot = value.timeSlots.find((item) => item.id === snapshot.slotId);
      if (
        !slot ||
        !zoneIds.has(snapshot.zoneId) ||
        Date.parse(slot.endAt) !== Date.parse(snapshot.timestamp) ||
        snapshot.solarAveragingPeriodMinutes !== value.slotDurationMinutes
      )
        issue("Snapshot/slot alignment mismatch");
    }
  });
export const PlanningRunSchema = z
  .object({
    id: z.uuid(),
    correlationId: Id,
    status: PlanningRunStatusSchema,
    history: z.array(PlanningRunStatusSchema),
    request: PlanningRequestSchema,
    normalizedSnapshots: z
      .array(ThermalInputSchema.extend({ slotId: Id }))
      .max(720)
      .default([]),
    thermal: z.array(ThermalBatchResponseSchema),
    safety: z.array(SafetyBatchResponseSchema),
    environmentalEvidence: z.array(EnvironmentalEvidenceSchema).default([]),
    safetyEvaluationContexts: z
      .array(
        z
          .object({
            evaluationRef: Id,
            thermalEstimateId: Id,
            taskId: Id,
            crewId: Id,
            zoneId: Id,
            slotId: Id,
          })
          .strict(),
      )
      .default([]),
    optimization: OptimizationResultSchema.nullable(),
    error: z.object({ code: Id, message: z.string() }).nullable(),
  })
  .strict()
  .refine((run) => {
    if (run.history[0] !== "QUEUED" || run.history.at(-1) !== run.status)
      return false;
    if (run.status === "READY_FOR_REVIEW")
      return (
        run.error === null &&
        (run.optimization?.status === "OPTIMAL" ||
          run.optimization?.status === "FEASIBLE")
      );
    if (run.status === "INFEASIBLE")
      return run.optimization?.status === "INFEASIBLE";
    return (
      run.optimization === null ||
      (run.status === "FAILED" && run.optimization.status === "FAILED")
    );
  }, "Planning status and persisted result must agree");
export type PlanningRequest = z.infer<typeof PlanningRequestSchema>;
export type PlanningRun = z.infer<typeof PlanningRunSchema>;
export type EnvironmentalEvidence = z.infer<typeof EnvironmentalEvidenceSchema>;
export const SupervisorPlanningResultSchema = z
  .object({
    planningRunId: z.uuid(),
    status: PlanningRunStatusSchema,
    site: z
      .object({ id: Id, name: z.string().min(1) })
      .strict()
      .nullable(),
    environment: z.array(
      z
        .object({
          snapshot: ThermalInputSchema.extend({ slotId: Id }),
          providerEvidence: EnvironmentalEvidenceSchema.nullable(),
          thermal: ThermalResultSchema.nullable(),
        })
        .strict(),
    ),
    safety: z.array(
      z
        .object({
          context: z.object({
            evaluationRef: Id,
            thermalEstimateId: Id,
            taskId: Id,
            crewId: Id,
            zoneId: Id,
            slotId: Id,
          }),
          result: SafetyResultSchema,
        })
        .strict(),
    ),
    schedule: z
      .object({
        solverStatus: SolverStatusSchema,
        assignments: z.array(
          z.object({
            taskId: Id,
            crewId: Id,
            zoneId: Id,
            slotIds: z.array(Id),
            slotEndsAt: z.array(z.iso.datetime({ offset: true })),
            safetyEvaluationRefs: z.array(Id),
          }),
        ),
        unscheduledTaskIds: z.array(Id),
        reasonCode: z.string().nullable(),
      })
      .strict()
      .nullable(),
    error: z.object({ code: Id, message: z.string() }).nullable(),
  })
  .strict();
export type SupervisorPlanningResult = z.infer<
  typeof SupervisorPlanningResultSchema
>;
export const PlanningExplanationSchema = z
  .object({
    planningRunId: z.uuid(),
    kind: z.literal("AI_EXPLANATION"),
    sourceMode: z.enum(["LIVE_AI", "CHECKED_IN_DEMO_FIXTURE"]),
    model: Id,
    generatedAt: z.iso.datetime({ offset: true }),
    disclaimer: z.literal(
      "AI explanation of persisted deterministic results. It does not calculate or change thermal, safety, or optimization decisions.",
    ),
    summary: z.string().min(1).max(2000),
    assignmentExplanations: z.array(
      z
        .object({
          taskId: Id,
          crewId: Id,
          explanation: z.string().min(1).max(2000),
          deterministicEvidenceRefs: z.array(Id).min(1),
        })
        .strict(),
    ),
    unscheduledExplanations: z.array(
      z
        .object({
          taskId: Id,
          explanation: z.string().min(1).max(2000),
          deterministicEvidenceRefs: z.array(Id),
        })
        .strict(),
    ),
    evidence: z
      .object({
        estimatedOutdoorWbgtC: z.array(Finite),
        safetyDecisions: z.array(SafetyDecisionSchema),
        optimizerStatus: SolverStatusSchema.nullable(),
        constraintsReferenced: z.array(Id),
      })
      .strict(),
  })
  .strict();
export type PlanningExplanation = z.infer<typeof PlanningExplanationSchema>;
export type ThermalBatchRequest = z.infer<typeof ThermalBatchRequestSchema>;
export type ThermalBatchResponse = z.infer<typeof ThermalBatchResponseSchema>;
export type SafetyBatchRequest = z.infer<typeof SafetyBatchRequestSchema>;
export type SafetyBatchResponse = z.infer<typeof SafetyBatchResponseSchema>;
export type OptimizationBatchRequest = z.infer<
  typeof OptimizationBatchRequestSchema
>;
export type OptimizationBatchResponse = z.infer<
  typeof OptimizationBatchResponseSchema
>;
