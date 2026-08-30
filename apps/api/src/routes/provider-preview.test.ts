import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { FortyGuardPreviewResultSchema } from "@heatops/contracts";
import { createApp } from "../app.js";
import type { FortyGuardClient } from "../providers/fortyguard.js";

const polygon = [
  [
    [-112.01, 32.99],
    [-111.99, 32.99],
    [-111.99, 33.01],
    [-112.01, 33.01],
    [-112.01, 32.99],
  ],
] as [number, number][][];

describe("POST /api/v1/provider-previews/fortyguard", () => {
  it("returns strict temperature-only preview evidence through Node", async () => {
    const preview = vi.fn<FortyGuardClient["preview"]>().mockResolvedValue({
      activityId: "live-activity-1",
      submittedStartDate: "2026-08-30",
      submittedStartTime: "10:00",
      submittedTimeZone: "America/Phoenix",
      alignedIntervalStart: "2026-08-30T16:00:00.000Z",
      alignedIntervalEnd: "2026-08-30T17:00:00.000Z",
      tiles: [
        {
          tileId: "tile-live-1",
          averageTemperatureC: 35.2,
          minTemperatureC: 34.8,
          maxTemperatureC: 35.9,
          geometry: { type: "Polygon", coordinates: polygon },
        },
      ],
    });
    const client = { preview, temperature: vi.fn() } as FortyGuardClient;
    const app = createApp(
      { CORS_ORIGIN: "http://localhost:5173", LOG_LEVEL: "silent" },
      {
        check: () => Promise.resolve("ok"),
        disconnect: () => Promise.resolve(),
      },
      { check: () => Promise.resolve("ok") },
      undefined,
      undefined,
      client,
    );
    const response = await request(app)
      .post("/api/v1/provider-previews/fortyguard")
      .send({
        polygon: polygon[0],
        samplePoint: [-112, 33],
        intervalStartUtc: "2026-08-30T16:00:00.000Z",
        intervalEndUtc: "2026-08-30T17:00:00.000Z",
        timeZone: "America/Phoenix",
      })
      .expect(201);
    const responseBody: unknown = response.body;
    const result = z
      .object({ data: FortyGuardPreviewResultSchema })
      .parse(responseBody).data;
    expect(result.tiles[0]).toMatchObject({
      tileId: "tile-live-1",
      averageTemperatureC: 35.2,
    });
    expect(response.text).not.toContain("api-key");
    expect(preview).toHaveBeenCalledOnce();
  });
});
