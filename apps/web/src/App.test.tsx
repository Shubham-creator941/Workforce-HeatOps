import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const request = {
  contractVersion: "1.0",
  site: { id: "site-demo", name: "Phoenix Riverside Build" },
  slotDurationMinutes: 60,
  timeSlots: [{ id: "hour-1", endAt: "2026-08-29T12:00:00.000Z" }],
  tasks: [
    {
      id: "task-wall",
      zoneId: "zone-east",
      durationSlots: 1,
      eligibleCrewIds: ["crew-masons"],
      availableSlotIds: ["hour-1"],
      requiredSkills: ["masonry"],
      workloadCategory: "LIGHT",
      predecessorIds: [],
      required: true,
      productivityWeight: 1,
      preferredCrewIds: [],
    },
  ],
  crews: [
    {
      id: "crew-masons",
      skills: ["masonry"],
      availableSlotIds: ["hour-1"],
      maxHeatExposureSlots: 1,
      exposureBudgetRef: "budget",
      ppeCategory: "NORMAL_WORK_CLOTHING",
      acclimatization: { state: "ACCLIMATIZED" },
    },
  ],
  zones: [{ id: "zone-east", capacity: 1, availableSlotIds: ["hour-1"] }],
  environmentalSource: { mode: "NORMALIZED" },
  snapshots: [
    {
      snapshotId: "s1",
      zoneId: "zone-east",
      slotId: "hour-1",
      timestamp: "2026-08-29T12:00:00.000Z",
      latitude: 33,
      longitude: -112,
      airTemperatureC: 34,
      relativeHumidityPercent: 36,
      solarRadiationWm2: 642,
      windSpeedMs: 1.7,
      windMeasurementHeightM: 2,
      surfacePressureHpa: 991,
      solarAveragingPeriodMinutes: 60,
    },
  ],
};
const run = {
  id: "d84a052f-58fa-4bea-9c2c-b8457803bfb8",
  correlationId: "demo",
  status: "READY_FOR_REVIEW",
  history: [
    "QUEUED",
    "CALCULATING_THERMAL",
    "EVALUATING_SAFETY",
    "OPTIMIZING",
    "READY_FOR_REVIEW",
  ],
  request,
  normalizedSnapshots: request.snapshots,
  thermal: [],
  safety: [],
  environmentalEvidence: [],
  safetyEvaluationContexts: [],
  optimization: {
    planningRef: "demo",
    safetyRulesetVersion: "NIOSH_2016_MVP_V1",
    optimizerVersion: "CP_SAT_SLOTS_V1",
    status: "OPTIMAL",
    assignments: [],
    unscheduledTaskIds: [],
    objective: {
      weightedWorkSlots: 0,
      totalStartSlotDelay: 0,
      crewPreferenceViolations: 0,
    },
    reasonCode: null,
  },
  error: null,
};
const result = {
  planningRunId: run.id,
  status: "READY_FOR_REVIEW",
  site: run.request.site,
  environment: [],
  safety: [],
  schedule: {
    solverStatus: "OPTIMAL",
    assignments: [],
    unscheduledTaskIds: [],
    reasonCode: null,
  },
  error: null,
};
const renderApp = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <App />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Supervisor Mission Control", () => {
  it("renders the planning action and scientific boundary label", () => {
    renderApp();
    expect(
      screen.getByRole("heading", { name: /Turn heat intelligence/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Run HeatOps" }),
    ).toBeInTheDocument();
    expect(screen.getByText("ESTIMATED OUTDOOR WBGT")).toBeInTheDocument();
  });
  it("submits a run and loads the persisted result", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ data: run }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ data: result }));
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Run HeatOps" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/planning-runs");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/v1/planning-runs/${run.id}/result`,
    );
    expect(await screen.findByText("OPTIMAL")).toBeInTheDocument();
  });
  it("shows a backend failure without fabricating a result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(
          {
            error: {
              code: "INSUFFICIENT_DATA",
              message: "Trusted 2 m wind is missing.",
            },
          },
          { status: 400 },
        ),
      ),
    );
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Run HeatOps" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trusted 2 m wind is missing.",
    );
    expect(screen.getByText("Awaiting optimization")).toBeInTheDocument();
  });
});
