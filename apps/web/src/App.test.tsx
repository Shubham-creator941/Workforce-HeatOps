import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

const result = {
  planningRunId: "d84a052f-58fa-4bea-9c2c-b8457803bfb8",
  status: "READY_FOR_REVIEW",
  site: { id: "site-demo", name: "Phoenix Riverside Build · Demo Scenario" },
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
const explanation = {
  planningRunId: result.planningRunId,
  kind: "AI_EXPLANATION",
  sourceMode: "CHECKED_IN_DEMO_FIXTURE",
  model: "golden-demo-explanation-v1",
  generatedAt: "2026-08-28T18:00:00Z",
  disclaimer:
    "AI explanation of persisted deterministic results. It does not calculate or change thermal, safety, or optimization decisions.",
  summary: "The persisted optimizer result assigned the task.",
  assignmentExplanations: [],
  unscheduledExplanations: [],
  evidence: {
    estimatedOutdoorWbgtC: [],
    safetyDecisions: [],
    optimizerStatus: "OPTIMAL",
    constraintsReferenced: ["hard safety feasibility"],
  },
};
function renderApp(path = "/mission") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("HeatOps application navigation", () => {
  it("renders six real navigable application views", () => {
    renderApp();
    expect(
      screen.getByRole("link", { name: "Mission Control" }),
    ).toHaveAttribute("href", "/mission");
    expect(
      screen.getByRole("link", { name: "Optimized Plan" }),
    ).toHaveAttribute("href", "/plan");
    expect(screen.getByRole("link", { name: "Evidence" })).toHaveAttribute(
      "href",
      "/evidence",
    );
    expect(screen.getByRole("link", { name: "Alerts" })).toHaveAttribute(
      "href",
      "/alerts",
    );
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute(
      "href",
      "/reports",
    );
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("runs checked-in demo evidence through the Node endpoint and opens the plan", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { data: result, meta: { evidenceMode: "CHECKED_IN_DEMO_FIXTURE" } },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(Response.json({ data: explanation }));
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Run HeatOps/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/planning-runs/demo");
    expect(
      await screen.findByRole("heading", { name: "Optimized Plan" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("OPTIMAL")).toHaveLength(3);
    expect(await screen.findByText(explanation.summary)).toBeInTheDocument();
  });

  it("supports click-through from plan to evidence", () => {
    renderApp("/plan");
    fireEvent.click(screen.getByRole("link", { name: /View evidence/ }));
    expect(
      screen.getByRole("heading", { name: "Evidence" }),
    ).toBeInTheDocument();
  });

  it("shows fail-closed API errors on Mission Control", async () => {
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
    fireEvent.change(screen.getByLabelText("Scenario"), {
      target: { value: "live" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Run HeatOps/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Trusted 2 m wind is missing.",
    );
  });
});
