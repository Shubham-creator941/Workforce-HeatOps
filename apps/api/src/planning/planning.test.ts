// Synthetic transport fixtures only; no production provider or science substitute.
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { PrismaClient } from "@prisma/client";
import {
  PlanningRequestSchema,
  PlanningRunSchema,
  SupervisorPlanningResultSchema,
  ThermalBatchRequestSchema,
  SafetyBatchRequestSchema,
  OptimizationBatchRequestSchema,
  type PlanningRun,
  type PlanningRunStatus,
} from "@heatops/contracts";
import { createApp } from "../app.js";
import { createPlanningDecisionEngine } from "../decision-engine/planning-client.js";
import { createPlanningService } from "./service.js";
import type { PlanningProviders } from "./service.js";
import {
  PlanningPersistenceError,
  createPrismaPlanningRunStore,
  type PlanningRunStore,
} from "./store.js";

function input() {
  return PlanningRequestSchema.parse({
    contractVersion: "1.0",
    slotDurationMinutes: 15,
    timeSlots: [{ id: "s0", endAt: "2026-08-28T08:00:00Z" }],
    tasks: [
      {
        id: "t",
        zoneId: "z",
        durationSlots: 1,
        eligibleCrewIds: ["c"],
        availableSlotIds: ["s0"],
        requiredSkills: ["masonry"],
        workloadCategory: "LIGHT",
      },
    ],
    crews: [
      {
        id: "c",
        skills: ["masonry"],
        availableSlotIds: ["s0"],
        maxHeatExposureSlots: 1,
        exposureBudgetRef: "supervisor-approved-budget",
        ppeCategory: "NORMAL_WORK_CLOTHING",
        acclimatization: { state: "ACCLIMATIZED" },
      },
    ],
    zones: [{ id: "z", capacity: 1, availableSlotIds: ["s0"] }],
    snapshots: [
      {
        slotId: "s0",
        snapshotId: "env",
        zoneId: "z",
        timestamp: "2026-08-28T08:00:00Z",
        latitude: 33,
        longitude: -112,
        airTemperatureC: 30,
        relativeHumidityPercent: 40,
        solarRadiationWm2: 500,
        windSpeedMs: 2,
        windMeasurementHeightM: 2,
        surfacePressureHpa: 1000,
        solarAveragingPeriodMinutes: 15,
      },
    ],
  });
}

class MemoryStore implements PlanningRunStore {
  rows = new Map<string, PlanningRun>();
  failAt: PlanningRunStatus | undefined;
  create(run: PlanningRun): Promise<void> {
    this.rows.set(run.id, structuredClone(run));
    return Promise.resolve();
  }
  save(run: PlanningRun, expectedStatus: PlanningRunStatus): Promise<void> {
    if (
      run.status === this.failAt ||
      this.rows.get(run.id)?.status !== expectedStatus
    )
      return Promise.reject(new PlanningPersistenceError());
    this.rows.set(run.id, structuredClone(run));
    return Promise.resolve();
  }
  get(id: string): Promise<PlanningRun | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
}

type Mode =
  | "ok"
  | "manual"
  | "thermal-invalid"
  | "thermal-failure"
  | "missing-thermal"
  | "duplicate-thermal"
  | "missing-safety"
  | "wrong-safety-id"
  | "invalid-allowed"
  | "insufficient-safety"
  | "solver-failed"
  | "solver-feasible"
  | "unsafe-assignment"
  | "wrong-plan-id"
  | "missing-assignment"
  | "invalid-json"
  | "http-error"
  | "timeout";

function bodyOf(init?: RequestInit): string {
  if (typeof init?.body !== "string") throw new Error("Expected JSON body");
  return init.body;
}
function pathOf(url: Parameters<typeof fetch>[0]): string {
  return new URL(
    typeof url === "string" ? url : url instanceof URL ? url.href : url.url,
  ).pathname;
}
function transport(mode: Mode = "ok") {
  return vi.fn<typeof fetch>(async (url, init) => {
    if (mode === "timeout") throw new DOMException("timed out", "TimeoutError");
    if (mode === "http-error")
      return new Response("unavailable", { status: 503 });
    if (mode === "invalid-json") return new Response("not-json");
    const body: unknown = await new Response(bodyOf(init)).json();
    const path = pathOf(url);
    if (path.includes("thermal")) {
      const batch = ThermalBatchRequestSchema.parse(body);
      const valid = batch.items.map((item) => ({
        snapshotId: item.snapshotId,
        status: "VALID",
        estimatedWbgtC: 23.456789,
        components: {
          globeTemperatureC: 25,
          naturalWetBulbTemperatureC: 22,
          psychrometricWetBulbTemperatureC: 21,
        },
        modelDiagnostics: {
          effectiveWindSpeedMs: 2,
          adjustedSolarRadiationWm2: 500,
          cosineSolarZenith: 0.5,
          extraDiagnostic: "retained",
        },
        warnings: ["test-warning"],
      }));
      return Response.json({
        contractVersion: "1.0",
        model: {
          name: "liljegren",
          implementationVersion: "1.0.0",
          reference: "Liljegren et al. 2008",
          referenceCodeVersion: "WBGT 1.1",
        },
        results:
          mode === "missing-thermal"
            ? []
            : mode === "duplicate-thermal"
              ? [...valid, ...valid]
              : mode === "thermal-invalid" || mode === "thermal-failure"
                ? batch.items.map((item) => ({
                    snapshotId: item.snapshotId,
                    status:
                      mode === "thermal-invalid"
                        ? "INVALID_INPUT"
                        : "MODEL_NON_CONVERGENCE",
                    error: { code: "TEST_ERROR", message: "fixture" },
                    warnings: [],
                  }))
                : valid,
      });
    }
    if (path.includes("safety")) {
      const batch = SafetyBatchRequestSchema.parse(body);
      return Response.json({
        contractVersion: "1.0",
        rulesetVersion: "NIOSH_2016_MVP_V1",
        results:
          mode === "missing-safety"
            ? []
            : batch.evaluations.map((item) => ({
                evaluationRef:
                  mode === "wrong-safety-id" ? "wrong" : item.evaluationRef,
                thermalEstimateId: item.thermalEstimateId,
                estimatedWbgtC: item.estimatedWbgtC,
                decision:
                  mode === "insufficient-safety"
                    ? "INSUFFICIENT_DATA"
                    : mode === "manual" || mode === "unsafe-assignment"
                      ? "MANUAL_REVIEW_REQUIRED"
                      : "CONTINUOUS_WORK_ALLOWED",
                clothingAdjustmentC: 0,
                effectiveWorkWbgtC: 23.456789,
                workloadCategory: item.workloadCategory,
                workMetabolicRateWatts: 180,
                restMetabolicRateWatts: 115,
                limitType: "REL",
                applicableContinuousWorkLimitWbgtC: 30,
                marginC: 6.543211,
                maxWorkMinutesPerHour: 60,
                requiredRestMinutesPerHour: 0,
                acclimatizationConstraint: { maxHeatExposureFraction: 1 },
                ruleEvidence:
                  mode === "invalid-allowed"
                    ? []
                    : [
                        {
                          ruleId: "TEST_RULE",
                          sourceTitle: "Test fixture",
                          sourceOrganization: "TEST",
                          sourceYear: 2026,
                          publicationId: null,
                        },
                      ],
                reason:
                  mode === "manual" ||
                  mode === "unsafe-assignment" ||
                  mode === "insufficient-safety"
                    ? {
                        code: "DETAILED_WORK_REST_ASSESSMENT_REQUIRED",
                        message: "Test review",
                      }
                    : null,
              })),
      });
    }
    const batch = OptimizationBatchRequestSchema.parse(body);
    return Response.json({
      contractVersion: "1.0",
      results: batch.plans.map((plan) => ({
        planningRef: mode === "wrong-plan-id" ? "wrong" : plan.planningRef,
        safetyRulesetVersion: plan.safetyRulesetVersion,
        optimizerVersion: "CP_SAT_SLOTS_V1",
        status:
          mode === "solver-failed"
            ? "FAILED"
            : mode === "manual"
              ? "INFEASIBLE"
              : mode === "solver-feasible"
                ? "FEASIBLE"
                : "OPTIMAL",
        assignments:
          mode === "solver-failed" ||
          mode === "manual" ||
          mode === "missing-assignment"
            ? []
            : [
                {
                  taskId: "t",
                  crewId: "c",
                  zoneId: "z",
                  startSlotIndex: 0,
                  endSlotIndexExclusive: 1,
                  safetyEvaluationRefs: [
                    plan.safetyFeasibility[0]?.evaluationRef,
                  ],
                },
              ],
        unscheduledTaskIds:
          mode === "solver-failed" ||
          mode === "manual" ||
          mode === "missing-assignment"
            ? plan.tasks.map((task) => task.id)
            : [],
        objective:
          mode === "solver-failed" || mode === "manual"
            ? null
            : {
                weightedWorkSlots: 1,
                totalStartSlotDelay: 0,
                crewPreferenceViolations: 0,
              },
        reasonCode:
          mode === "solver-failed"
            ? "SEARCH_LIMIT_NO_SOLUTION"
            : mode === "manual"
              ? "HARD_CONSTRAINTS_INFEASIBLE"
              : null,
      })),
    });
  });
}

function setup(mode: Mode = "ok", providers?: PlanningProviders) {
  const store = new MemoryStore();
  const fetcher = transport(mode);
  const service = createPlanningService(
    store,
    createPlanningDecisionEngine("http://python.test", 100, fetcher),
    providers,
  );
  return { store, fetcher, service };
}

describe("planning orchestration", () => {
  it("fetches providers, normalizes verified fields, and preserves provenance", async () => {
    const data = input();
    const providerInput = PlanningRequestSchema.parse({
      ...data,
      slotDurationMinutes: 60,
      timeSlots: [{ id: "s0", endAt: "2026-08-28T18:00:00Z" }],
      tasks: data.tasks.map((task) => ({
        ...task,
        availableSlotIds: ["s0"],
      })),
      crews: data.crews.map((crew) => ({
        ...crew,
        availableSlotIds: ["s0"],
      })),
      zones: [{ id: "z", capacity: 1, availableSlotIds: ["s0"] }],
      snapshots: [],
      environmentalSource: {
        mode: "PROVIDERS",
        timeZone: "America/Phoenix",
        zones: [
          {
            zoneId: "z",
            samplePoint: [-112, 33],
            polygon: [
              [-112.01, 32.99],
              [-111.99, 32.99],
              [-111.99, 33.01],
              [-112.01, 33.01],
              [-112.01, 32.99],
            ],
          },
        ],
        verifiedWind2m: [
          {
            zoneId: "z",
            slotId: "s0",
            windSpeedMs: 1.7,
            measurementHeightM: 2,
            observedAt: "2026-08-28T18:00:00Z",
            sourceRef: "onsite-anemometer-17",
          },
        ],
      },
    });
    const meteorologyMock = vi.fn(() =>
      Promise.resolve({
        returnedTimestamp: "2026-08-28T18:00",
        relativeHumidityPercent: 36,
        surfacePressureHpa: 991.2,
        shortwaveRadiationWm2: 642,
      }),
    );
    const providers: PlanningProviders = {
      fortyGuard: {
        temperature: vi.fn(() =>
          Promise.resolve({
            activityId: "activity",
            tileId: "tile",
            averageTemperatureC: 34.25,
            minTemperatureC: 33.8,
            maxTemperatureC: 34.9,
            submittedStartDate: "2026-08-28",
            submittedStartTime: "10:00",
            submittedTimeZone: "America/Phoenix",
            alignedIntervalStart: "2026-08-28T17:00:00.000Z",
            alignedIntervalEnd: "2026-08-28T18:00:00.000Z",
          }),
        ),
      },
      meteorology: {
        meteorology: meteorologyMock,
      },
    };
    const { service, fetcher } = setup("ok", providers);
    const result = await service.run(providerInput, "provider-test");
    expect(result.history.slice(0, 4)).toEqual([
      "QUEUED",
      "FETCHING_FORTYGUARD",
      "FETCHING_METEOROLOGY",
      "ALIGNING_DATA",
    ]);
    expect(result.status).toBe("READY_FOR_REVIEW");
    expect(result.normalizedSnapshots[0]).toMatchObject({
      airTemperatureC: 34.25,
      relativeHumidityPercent: 36,
      surfacePressureHpa: 991.2,
      solarRadiationWm2: 642,
      windSpeedMs: 1.7,
      windMeasurementHeightM: 2,
    });
    expect(result.environmentalEvidence[0]).toMatchObject({
      fortyGuard: {
        minTemperatureC: 33.8,
        maxTemperatureC: 34.9,
        responseTimestampSemantics: "NOT_PROVIDED",
      },
      meteorology: { radiationSemantics: "PRECEDING_HOUR_MEAN" },
      wind: { sourceRef: "onsite-anemometer-17" },
    });
    const thermalBody: unknown = JSON.parse(bodyOf(fetcher.mock.calls[0]?.[1]));
    expect(ThermalBatchRequestSchema.parse(thermalBody).items[0]).toMatchObject(
      {
        airTemperatureC: 34.25,
        windSpeedMs: 1.7,
        windMeasurementHeightM: 2,
      },
    );
    meteorologyMock.mockResolvedValueOnce({
      returnedTimestamp: "2026-08-28T17:00",
      relativeHumidityPercent: 36,
      surfacePressureHpa: 991.2,
      shortwaveRadiationWm2: 642,
    });
    const failed = setup("ok", providers);
    const failedRun = await failed.service.run(providerInput, "misaligned");
    expect(failedRun.status).toBe("INSUFFICIENT_DATA");
    expect(failedRun.error?.code).toBe("OPEN_METEO_TEMPORAL_ALIGNMENT");
    expect(failed.fetcher).not.toHaveBeenCalled();
  });
  it("splits safety requests at the Python batch limit without losing entries", async () => {
    const { service, fetcher } = setup("solver-failed");
    const data = input();
    const baseTask = data.tasks[0],
      baseCrew = data.crews[0],
      baseSnapshot = data.snapshots[0];
    if (!baseTask || !baseCrew || !baseSnapshot)
      throw new Error("Missing fixture");
    data.timeSlots = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      endAt: new Date(
        Date.parse("2026-08-28T08:00:00Z") + i * 900000,
      ).toISOString(),
    }));
    const ids = data.timeSlots.map((slot) => slot.id);
    data.crews = Array.from({ length: 10 }, (_, i) => ({
      ...baseCrew,
      id: `c${i}`,
      availableSlotIds: ids,
    }));
    data.tasks = Array.from({ length: 20 }, (_, i) => ({
      ...baseTask,
      id: `t${i}`,
      eligibleCrewIds: data.crews.map((crew) => crew.id),
      availableSlotIds: ids,
    }));
    data.zones = [{ id: "z", availableSlotIds: ids, capacity: 1 }];
    data.snapshots = data.timeSlots.map((slot) => ({
      ...baseSnapshot,
      snapshotId: `env-${slot.id}`,
      slotId: slot.id,
      timestamp: slot.endAt,
    }));
    const result = await service.run(data, "batch-test");
    expect(result.safety.map((batch) => batch.results.length)).toEqual([
      1000, 200,
    ]);
    const safetyCalls = fetcher.mock.calls.filter((call) =>
      pathOf(call[0]).includes("safety"),
    );
    expect(
      safetyCalls.map(
        (call) =>
          SafetyBatchRequestSchema.parse(JSON.parse(bodyOf(call[1])))
            .evaluations.length,
      ),
    ).toEqual([1000, 200]);
    expect(result.optimization?.status).toBe("FAILED");
  });
  it("sequences stages, forwards exact WBGT, preserves evidence, and persists final state", async () => {
    const { service, fetcher, store } = setup();
    const result = await service.run(input(), "correlation-1");
    expect(result.history).toEqual([
      "QUEUED",
      "ALIGNING_DATA",
      "CALCULATING_THERMAL",
      "EVALUATING_SAFETY",
      "OPTIMIZING",
      "READY_FOR_REVIEW",
    ]);
    expect(await store.get(result.id)).toEqual(result);
    expect(result.thermal[0]?.results[0]).toMatchObject({
      warnings: ["test-warning"],
      modelDiagnostics: { extraDiagnostic: "retained" },
    });
    expect(result.safety[0]?.results[0]?.ruleEvidence).toHaveLength(1);
    const sent: unknown = JSON.parse(bodyOf(fetcher.mock.calls[1]?.[1]));
    expect(
      SafetyBatchRequestSchema.parse(sent).evaluations[0]?.estimatedWbgtC,
    ).toBe(23.456789);
    expect(
      fetcher.mock.calls.every(
        (call) =>
          new Headers(call[1]?.headers).get("x-correlation-id") ===
          "correlation-1",
      ),
    ).toBe(true);
    expect(fetcher.mock.calls.map((call) => pathOf(call[0]))).toEqual([
      "/internal/v1/thermal/batch",
      "/internal/v1/safety/batch",
      "/internal/v1/optimization/batch",
    ]);
  });
  it("does not fetch providers or guess a missing snapshot", async () => {
    const { service, fetcher } = setup();
    const data = input();
    data.snapshots = [];
    expect((await service.run(data, "c")).status).toBe("INSUFFICIENT_DATA");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each<[Mode, string, number]>([
    ["thermal-invalid", "INSUFFICIENT_DATA", 1],
    ["thermal-failure", "FAILED", 1],
    ["missing-thermal", "FAILED", 1],
    ["duplicate-thermal", "FAILED", 1],
    ["missing-safety", "FAILED", 2],
    ["wrong-safety-id", "FAILED", 2],
    ["invalid-allowed", "FAILED", 2],
    ["insufficient-safety", "INSUFFICIENT_DATA", 2],
    ["manual", "INFEASIBLE", 3],
    ["solver-failed", "FAILED", 3],
    ["solver-feasible", "READY_FOR_REVIEW", 3],
    ["unsafe-assignment", "FAILED", 3],
    ["wrong-plan-id", "FAILED", 3],
    ["missing-assignment", "FAILED", 3],
    ["invalid-json", "FAILED", 1],
    ["http-error", "FAILED", 1],
    ["timeout", "FAILED", 1],
  ])("handles %s without fallback", async (mode, status, calls) => {
    const { service, fetcher } = setup(mode);
    const result = await service.run(input(), "c");
    expect(result.status).toBe(status);
    expect(fetcher).toHaveBeenCalledTimes(calls);
    if (status === "FAILED")
      expect(result.optimization?.assignments ?? []).toEqual([]);
  });
  it("forwards manual-review decisions unchanged to the optimizer", async () => {
    const { service, fetcher } = setup("manual");
    await service.run(input(), "c");
    const sent: unknown = JSON.parse(bodyOf(fetcher.mock.calls[2]?.[1]));
    expect(
      OptimizationBatchRequestSchema.parse(sent).plans[0]?.safetyFeasibility[0]
        ?.decision,
    ).toBe("MANUAL_REVIEW_REQUIRED");
  });
  it("stops before another service call if a stage cannot be persisted", async () => {
    const { service, store, fetcher } = setup();
    store.failAt = "EVALUATING_SAFETY";
    await expect(service.run(input(), "c")).rejects.toBeInstanceOf(
      PlanningPersistenceError,
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects caller-supplied decisions and invalid alignment", async () => {
    const { service, fetcher } = setup();
    await expect(
      service.run({ ...input(), safetyFeasibility: [] }, "c"),
    ).rejects.toThrow();
    const data = input();
    data.snapshots[0]!.timestamp = "2026-08-28T09:00:00Z";
    await expect(service.run(data, "c")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});

function appFor(mode: Mode = "ok") {
  const deps = setup(mode);
  const app = createApp(
    {
      NODE_ENV: "test",
      API_PORT: 3000,
      DATABASE_URL: "mysql://unused",
      DECISION_ENGINE_BASE_URL: "http://unused",
      CORS_ORIGIN: "http://localhost:5173",
      LOG_LEVEL: "silent",
    },
    { check: () => Promise.resolve("ok"), disconnect: () => Promise.resolve() },
    { check: () => Promise.resolve("ok") },
    deps.service,
  );
  return { app, ...deps };
}
describe("planning API", () => {
  it("creates and retrieves a persisted result with request correlation", async () => {
    const { app } = appFor();
    const created = await request(app)
      .post("/api/v1/planning-runs")
      .set("x-correlation-id", "api-test")
      .send(input())
      .expect(201);
    const result = z
      .object({ data: PlanningRunSchema })
      .parse(created.body).data;
    const read = await request(app)
      .get(`/api/v1/planning-runs/${result.id}`)
      .expect(200);
    expect(z.object({ data: PlanningRunSchema }).parse(read.body).data).toEqual(
      result,
    );
    expect(result.correlationId).toBe("api-test");
  });
  it("returns 400 for malformed input, 404 for unknown runs, and 503 for storage failure", async () => {
    const { app, store } = appFor();
    await request(app).post("/api/v1/planning-runs").send({}).expect(400);
    await request(app)
      .get("/api/v1/planning-runs/00000000-0000-4000-8000-000000000000")
      .expect(404);
    store.failAt = "ALIGNING_DATA";
    await request(app).post("/api/v1/planning-runs").send(input()).expect(503);
  });
  it("exposes infeasibility and manual-review evidence to supervisors", async () => {
    const { app } = appFor("manual");
    const created = await request(app)
      .post("/api/v1/planning-runs")
      .send(input())
      .expect(201);
    const createdBody: unknown = created.body;
    const run = z.object({ data: PlanningRunSchema }).parse(createdBody).data;
    const response = await request(app)
      .get(`/api/v1/planning-runs/${run.id}/result`)
      .expect(200);
    const responseBody: unknown = response.body;
    const result = z
      .object({ data: SupervisorPlanningResultSchema })
      .parse(responseBody).data;
    expect(result.status).toBe("INFEASIBLE");
    expect(result.schedule).toMatchObject({
      solverStatus: "INFEASIBLE",
      reasonCode: "HARD_CONSTRAINTS_INFEASIBLE",
    });
    expect(result.safety[0]).toMatchObject({
      context: { taskId: "t", crewId: "c", zoneId: "z", slotId: "s0" },
      result: {
        decision: "MANUAL_REVIEW_REQUIRED",
        reason: { code: "DETAILED_WORK_REST_ASSESSMENT_REQUIRED" },
      },
    });
  });
});

describe("Prisma planning store", () => {
  it("stores versioned payloads, uses status CAS, and validates readback", async () => {
    const run = await setup().service.run(input(), "c");
    const client = new PrismaClient();
    const row = {
      id: run.id,
      status: run.status,
      payload: JSON.stringify(run),
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
    const create = vi
      .spyOn(client.planningRun, "create")
      .mockResolvedValue(row);
    const update = vi
      .spyOn(client.planningRun, "updateMany")
      .mockResolvedValue({ count: 1 });
    const read = vi
      .spyOn(client.planningRun, "findUnique")
      .mockResolvedValue(row);
    const store = createPrismaPlanningRunStore(client);
    await store.create(run);
    await store.save(run, "OPTIMIZING");
    expect(create).toHaveBeenCalledWith({
      data: { id: run.id, status: run.status, payload: JSON.stringify(run) },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: run.id, status: "OPTIMIZING" },
      data: { status: run.status, payload: JSON.stringify(run) },
    });
    expect(await store.get(run.id)).toEqual(run);
    update.mockResolvedValue({ count: 0 });
    await expect(store.save(run, "OPTIMIZING")).rejects.toBeInstanceOf(
      PlanningPersistenceError,
    );
    read.mockResolvedValue({ ...row, status: "FAILED" });
    await expect(store.get(run.id)).rejects.toBeInstanceOf(
      PlanningPersistenceError,
    );
    create.mockRejectedValue(new Error("database unavailable"));
    await expect(store.create(run)).rejects.toBeInstanceOf(
      PlanningPersistenceError,
    );
  });
});
