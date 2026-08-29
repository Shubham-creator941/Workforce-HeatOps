import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThermalZoneMap } from "./ThermalZoneMap.js";

describe("ThermalZoneMap states", () => {
  it("shows an explicit loading state", () => {
    render(
      <ThermalZoneMap
        result={undefined}
        loading
        selectedZoneId={undefined}
        onSelectZone={vi.fn()}
      />,
    );
    expect(screen.getByText("Loading verified zone geometry…")).toBeVisible();
  });

  it("fails visibly when a result contains no verified geometry", () => {
    render(
      <ThermalZoneMap
        result={{
          planningRunId: "d84a052f-58fa-4bea-9c2c-b8457803bfb8",
          status: "READY_FOR_REVIEW",
          site: null,
          environment: [],
          safety: [],
          schedule: {
            solverStatus: "OPTIMAL",
            assignments: [],
            unscheduledTaskIds: [],
            reasonCode: null,
          },
          error: null,
        }}
        loading={false}
        selectedZoneId={undefined}
        onSelectZone={vi.fn()}
      />,
    );
    expect(
      screen.getByText(
        "No verified zone geometry is available for this result.",
      ),
    ).toBeVisible();
  });
});
