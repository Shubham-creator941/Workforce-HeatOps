import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FeatureCollection, Polygon } from "geojson";
import { featureCollectionBounds, ThermalZoneMap } from "./ThermalZoneMap.js";

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

  it("calculates fit bounds from all 1,174 returned features", () => {
    const collection: FeatureCollection<Polygon> = {
      type: "FeatureCollection",
      features: Array.from({ length: 1_174 }, (_, index) => {
        const x = -112 + (index % 34) * 0.001;
        const y = 33 + Math.floor(index / 34) * 0.001;
        return {
          type: "Feature",
          properties: { tileId: String(index) },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [x, y],
                [x + 0.0005, y],
                [x + 0.0005, y + 0.0005],
                [x, y + 0.0005],
                [x, y],
              ],
            ],
          },
        };
      }),
    };

    expect(featureCollectionBounds(collection)).toEqual([
      [-112, 33],
      [-111.9665, 33.0345],
    ]);
  });
});
