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
      .mockResolvedValue(
        Response.json(
          { data: result, meta: { evidenceMode: "CHECKED_IN_DEMO_FIXTURE" } },
          { status: 201 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /Run HeatOps/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/v1/planning-runs/demo");
    expect(
      await screen.findByRole("heading", { name: "Optimized Plan" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("OPTIMAL")).toHaveLength(3);
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
