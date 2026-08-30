import { readFile } from "node:fs/promises";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  OptimizationBatchRequestSchema,
  PlanningRequestSchema,
  PlanningRunSchema,
  SafetyBatchRequestSchema,
  SupervisorPlanningResultSchema,
  ThermalBatchRequestSchema,
  type PlanningRun,
  type PlanningRunStatus,
} from "@heatops/contracts";
import { createApp } from "../app.js";
import { createPlanningDecisionEngine } from "../decision-engine/planning-client.js";
import { createFortyGuardClient } from "../providers/fortyguard.js";
import { createOpenMeteoClient } from "../providers/open-meteo.js";
import { createPlanningService } from "./service.js";
import type { PlanningRunStore } from "./store.js";

class FixtureStore implements PlanningRunStore {
  readonly rows = new Map<string, PlanningRun>();
  create(run: PlanningRun): Promise<void> {
    this.rows.set(run.id, structuredClone(run));
    return Promise.resolve();
  }
  save(run: PlanningRun, expectedStatus: PlanningRunStatus): Promise<void> {
    if (this.rows.get(run.id)?.status !== expectedStatus)
      return Promise.reject(new Error("status mismatch"));
    this.rows.set(run.id, structuredClone(run));
    return Promise.resolve();
  }
  get(id: string): Promise<PlanningRun | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }
}

async function fixture(path: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      new URL(`../../../../fixtures/${path}`, import.meta.url),
      "utf8",
    ),
  ) as unknown;
}
function jsonBody(init?: RequestInit): unknown {
  if (typeof init?.body !== "string") throw new Error("Expected JSON body");
  return JSON.parse(init.body) as unknown;
}

describe("provider-backed planning golden path", () => {
  it("persists and exposes a supervisor-readable complete planning result", async () => {
    const planningInput = PlanningRequestSchema.parse(
      await fixture("planning/golden-provider-request.json"),
    );
    const completed = await fixture("providers/fortyguard-completed.json");
    const fortyGuardTransport = vi.fn<typeof fetch>(async (url) => {
      await Promise.resolve();
      const path = new URL(url instanceof Request ? url.url : url).pathname;
      return path === "/v1/heatmap"
        ? Response.json({ data: { activity_id: "verified-activity" } })
        : Response.json(completed);
    });
    const meteorologyTransport = vi.fn<typeof fetch>(async () => {
      await Promise.resolve();
      return Response.json({
        hourly_units: {
          relative_humidity_2m: "%",
          surface_pressure: "hPa",
          shortwave_radiation: "W/m²",
        },
        hourly: {
          time: ["2026-08-28T18:00"],
          relative_humidity_2m: [36],
          surface_pressure: [991.2],
          shortwave_radiation: [642],
        },
      });
    });
    const pythonTransport = vi.fn<typeof fetch>(async (url, init) => {
      await Promise.resolve();
      const path = new URL(url instanceof Request ? url.url : url).pathname;
      const body = jsonBody(init);
      if (path.includes("thermal")) {
        const batch = ThermalBatchRequestSchema.parse(body);
        return Response.json({
          contractVersion: "1.0",
          model: {
            name: "liljegren",
            implementationVersion: "1.0.0",
            reference: "Liljegren et al. 2008",
            referenceCodeVersion: "WBGT 1.1",
          },
          results: batch.items.map((item) => ({
            snapshotId: item.snapshotId,
            status: "VALID",
            estimatedWbgtC: 27.125,
            components: {
              globeTemperatureC: 38,
              naturalWetBulbTemperatureC: 23,
              psychrometricWetBulbTemperatureC: 21.5,
            },
            modelDiagnostics: {
              effectiveWindSpeedMs: 1.7,
              adjustedSolarRadiationWm2: 642,
              cosineSolarZenith: 0.71,
            },
            warnings: [],
          })),
        });
      }
      if (path.includes("safety")) {
        const batch = SafetyBatchRequestSchema.parse(body);
        return Response.json({
          contractVersion: "1.0",
          rulesetVersion: "NIOSH_2016_MVP_V1",
          results: batch.evaluations.map((item) => ({
            evaluationRef: item.evaluationRef,
            thermalEstimateId: item.thermalEstimateId,
            decision: "CONTINUOUS_WORK_ALLOWED",
            estimatedWbgtC: item.estimatedWbgtC,
            clothingAdjustmentC: 0,
            effectiveWorkWbgtC: item.estimatedWbgtC,
            workloadCategory: item.workloadCategory,
            workMetabolicRateWatts: 180,
            restMetabolicRateWatts: 115,
            limitType: "REL",
            applicableContinuousWorkLimitWbgtC: 30.763,
            marginC: 3.638,
            maxWorkMinutesPerHour: 60,
            requiredRestMinutesPerHour: 0,
            acclimatizationConstraint: { maxHeatExposureFraction: 1 },
            ruleEvidence: [
              {
                ruleId: "CONTINUOUS_REL_LIGHT",
                sourceTitle: "NIOSH 2016-106",
                sourceOrganization: "NIOSH",
                sourceYear: 2016,
                publicationId: "2016-106",
              },
            ],
            reason: null,
          })),
        });
      }
      const batch = OptimizationBatchRequestSchema.parse(body);
      return Response.json({
        contractVersion: "1.0",
        results: batch.plans.map((plan) => ({
          planningRef: plan.planningRef,
          safetyRulesetVersion: plan.safetyRulesetVersion,
          optimizerVersion: "CP_SAT_SLOTS_V1",
          status: "OPTIMAL",
          assignments: [
            {
              taskId: "task-wall",
              crewId: "crew-masons",
              zoneId: "zone-east",
              startSlotIndex: 0,
              endSlotIndexExclusive: 1,
              safetyEvaluationRefs: [plan.safetyFeasibility[0]?.evaluationRef],
            },
          ],
          unscheduledTaskIds: [],
          objective: {
            weightedWorkSlots: 1,
            totalStartSlotDelay: 0,
            crewPreferenceViolations: 0,
          },
          reasonCode: null,
        })),
      });
    });
    const store = new FixtureStore();
    const service = createPlanningService(
      store,
      createPlanningDecisionEngine(
        "http://python.test",
        1_000,
        pythonTransport,
      ),
      {
        fortyGuard: createFortyGuardClient({
          apiKey: "fixture-key",
          baseUrl: "https://fortyguard.test",
          transport: fortyGuardTransport,
          sleep: () => Promise.resolve(),
          now: () => new Date("2026-08-29T00:00:00Z"),
        }),
        meteorology: createOpenMeteoClient({
          baseUrl: "https://meteo.test",
          transport: meteorologyTransport,
        }),
      },
    );
    const app = createApp(
      { CORS_ORIGIN: "http://localhost:5173", LOG_LEVEL: "silent" },
      {
        check: () => Promise.resolve("ok"),
        disconnect: () => Promise.resolve(),
      },
      { check: () => Promise.resolve("ok") },
      service,
    );

    const demo = await request(app)
      .post("/api/v1/planning-runs/demo")
      .send({ scenarioId: "phoenix-golden-v1" })
      .expect(201);
    const demoBody: unknown = demo.body;
    const parsedDemo = z
      .object({ data: SupervisorPlanningResultSchema })
      .parse(demoBody).data;
    expect(parsedDemo).toMatchObject({
      status: "READY_FOR_REVIEW",
      site: { name: "Phoenix Riverside Build · Demo Scenario" },
      schedule: { solverStatus: "OPTIMAL" },
    });
    const demoProviderEvidence = parsedDemo.environment[0]?.providerEvidence;
    expect(demoProviderEvidence).not.toBeNull();
    if (!demoProviderEvidence)
      throw new Error("Expected demo provider evidence");
    expect(demoProviderEvidence.fortyGuard.tileGeometry).toEqual({
      type: "Polygon",
      coordinates: [
        [
          [-112.01, 32.99],
          [-111.99, 32.99],
          [-111.99, 33.01],
          [-112.01, 33.01],
          [-112.01, 32.99],
        ],
      ],
    });
    expect(fortyGuardTransport).not.toHaveBeenCalled();
    expect(meteorologyTransport).not.toHaveBeenCalled();
    expect(pythonTransport).not.toHaveBeenCalled();

    const created = await request(app)
      .post("/api/v1/planning-runs")
      .set("x-correlation-id", "golden-demo")
      .send(planningInput)
      .expect(201);
    const createdBody: unknown = created.body;
    const run = PlanningRunSchema.parse(
      z.object({ data: PlanningRunSchema }).parse(createdBody).data,
    );
    expect(run.status).toBe("READY_FOR_REVIEW");
    expect(await store.get(run.id)).toEqual(run);

    const response = await request(app)
      .get(`/api/v1/planning-runs/${run.id}/result`)
      .expect(200);
    const responseBody: unknown = response.body;
    const result = z
      .object({ data: SupervisorPlanningResultSchema })
      .parse(responseBody).data;
    expect(result).toMatchObject({
      status: "READY_FOR_REVIEW",
      site: { id: "site-demo", name: "Phoenix Demo Site" },
      environment: [
        {
          snapshot: { zoneId: "zone-east", airTemperatureC: 34.25 },
          providerEvidence: {
            fortyGuard: {
              tileId: "tile-60m-1",
              minTemperatureC: 33.8,
              maxTemperatureC: 34.9,
            },
            wind: { sourceRef: "trusted-onsite-anemometer-demo" },
          },
          thermal: { status: "VALID", estimatedWbgtC: 27.125 },
        },
      ],
      safety: [
        {
          context: {
            taskId: "task-wall",
            crewId: "crew-masons",
            zoneId: "zone-east",
            slotId: "hour-1",
          },
          result: { decision: "CONTINUOUS_WORK_ALLOWED" },
        },
      ],
      schedule: {
        solverStatus: "OPTIMAL",
        assignments: [
          {
            taskId: "task-wall",
            crewId: "crew-masons",
            slotIds: ["hour-1"],
          },
        ],
      },
    });

    const providerCalls = fortyGuardTransport.mock.calls.length;
    const invalid = structuredClone(planningInput);
    if (invalid.environmentalSource.mode !== "PROVIDERS")
      throw new Error("Expected provider fixture");
    invalid.environmentalSource.verifiedWind2m = [];
    await request(app).post("/api/v1/planning-runs").send(invalid).expect(400);
    expect(fortyGuardTransport).toHaveBeenCalledTimes(providerCalls);
  });
});
