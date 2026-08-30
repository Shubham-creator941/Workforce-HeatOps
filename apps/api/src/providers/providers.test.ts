import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { createFortyGuardClient } from "./fortyguard.js";
import { createOpenMeteoClient } from "./open-meteo.js";
import { ProviderError } from "./errors.js";

const polygon = [
  [-112.01, 32.99],
  [-111.99, 32.99],
  [-111.99, 33.01],
  [-112.01, 33.01],
  [-112.01, 32.99],
] as [number, number][];
const completed = JSON.parse(
  await readFile(
    new URL(
      "../../../../fixtures/providers/fortyguard-completed.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as unknown;

function fortyGuardTransport(statuses: unknown[]) {
  let index = 0;
  return vi.fn<typeof fetch>(async (url, init) => {
    await Promise.resolve();
    const path = new URL(url instanceof Request ? url.url : url).pathname;
    if (path === "/v1/heatmap") {
      expect(new Headers(init?.headers).get("api-key")).toBe("secret-test-key");
      if (typeof init?.body !== "string") throw new Error("Expected JSON body");
      const body = JSON.parse(init.body) as Record<string, unknown>;
      expect(body).toMatchObject({
        granularity: 60,
        analytic_type: "tcm",
        date_time: {
          start_date: "2026-08-28",
          start_time: "10:00",
          filter_type: 1,
        },
      });
      return Response.json({ data: { activity_id: "verified-activity" } });
    }
    return Response.json(statuses[Math.min(index++, statuses.length - 1)]);
  });
}

describe("FortyGuard adapter", () => {
  it("polls to completion and maps only verified air-temperature fields", async () => {
    const transport = fortyGuardTransport([
      { data: { activity_id: "verified-activity", status: "Processing" } },
      completed,
    ]);
    const sleep = vi.fn(() => Promise.resolve());
    const client = createFortyGuardClient({
      apiKey: "secret-test-key",
      baseUrl: "https://fortyguard.test",
      transport,
      sleep,
      pollAttempts: 3,
      now: () => new Date("2026-08-28T12:00:00Z"),
    });
    await expect(
      client.temperature({
        polygon,
        samplePoint: [-112, 33],
        intervalStartUtc: "2026-08-28T17:00:00Z",
        intervalEndUtc: "2026-08-28T18:00:00Z",
        timeZone: "America/Phoenix",
      }),
    ).resolves.toEqual({
      activityId: "verified-activity",
      tileId: "tile-60m-1",
      averageTemperatureC: 34.25,
      minTemperatureC: 33.8,
      maxTemperatureC: 34.9,
      submittedStartDate: "2026-08-28",
      submittedStartTime: "10:00",
      submittedTimeZone: "America/Phoenix",
      alignedIntervalStart: "2026-08-28T17:00:00.000Z",
      alignedIntervalEnd: "2026-08-28T18:00:00.000Z",
      tileGeometry: { type: "Polygon", coordinates: [polygon] },
    });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("returns all validated heatmap tiles for a thermal-only preview", async () => {
    const client = createFortyGuardClient({
      apiKey: "secret-test-key",
      baseUrl: "https://fortyguard.test",
      transport: fortyGuardTransport([completed]),
      now: () => new Date("2026-08-28T19:00:00Z"),
    });
    const result = await client.preview({
      polygon,
      samplePoint: [-112, 33],
      intervalStartUtc: "2026-08-28T17:00:00Z",
      intervalEndUtc: "2026-08-28T18:00:00Z",
      timeZone: "America/Phoenix",
    });
    expect(result).toMatchObject({
      activityId: "verified-activity",
      tiles: [{ tileId: "tile-60m-1", averageTemperatureC: 34.25 }],
    });
  });

  it("uses bounded polling and reports timeout", async () => {
    const client = createFortyGuardClient({
      apiKey: "secret-test-key",
      baseUrl: "https://fortyguard.test",
      transport: fortyGuardTransport([
        { data: { activity_id: "verified-activity", status: "Processing" } },
      ]),
      sleep: () => Promise.resolve(),
      pollAttempts: 2,
      now: () => new Date("2026-08-28T12:00:00Z"),
    });
    await expect(
      client.temperature({
        polygon,
        samplePoint: [-112, 33],
        intervalStartUtc: "2026-08-28T10:00:00Z",
        intervalEndUtc: "2026-08-28T11:00:00Z",
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ provider: "FORTYGUARD", kind: "TIMEOUT" });
  });

  it("fails closed without a key or an unambiguous containing tile", async () => {
    const missingKey = createFortyGuardClient({
      baseUrl: "https://fortyguard.test",
    });
    await expect(
      missingKey.temperature({
        polygon,
        samplePoint: [-112, 33],
        intervalStartUtc: "2026-08-28T10:00:00Z",
        intervalEndUtc: "2026-08-28T11:00:00Z",
        timeZone: "UTC",
      }),
    ).rejects.toBeInstanceOf(ProviderError);
    const response = structuredClone(completed) as {
      data: { result: { map_data: { features: unknown[] } } };
    };
    response.data.result.map_data.features = [];
    const noTile = createFortyGuardClient({
      apiKey: "secret-test-key",
      baseUrl: "https://fortyguard.test",
      transport: fortyGuardTransport([response]),
      now: () => new Date("2026-08-28T12:00:00Z"),
    });
    await expect(
      noTile.temperature({
        polygon,
        samplePoint: [-112, 33],
        intervalStartUtc: "2026-08-28T10:00:00Z",
        intervalEndUtc: "2026-08-28T11:00:00Z",
        timeZone: "UTC",
      }),
    ).rejects.toMatchObject({ kind: "MISSING_DATA" });
  });
});

describe("Open-Meteo adapter", () => {
  it("maps humidity, surface pressure, and preceding-hour radiation without requesting wind", async () => {
    const transport = vi.fn<typeof fetch>(async (url) => {
      await Promise.resolve();
      const parsed = new URL(url instanceof Request ? url.url : url);
      expect(parsed.searchParams.get("hourly")).toBe(
        "relative_humidity_2m,surface_pressure,shortwave_radiation",
      );
      expect(parsed.searchParams.get("hourly")).not.toContain("wind");
      expect(parsed.searchParams.get("timezone")).toBe("GMT");
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
    const client = createOpenMeteoClient({
      baseUrl: "https://meteo.test",
      transport,
    });
    await expect(
      client.meteorology({
        latitude: 33,
        longitude: -112,
        timestamp: "2026-08-28T18:00:00Z",
      }),
    ).resolves.toEqual({
      returnedTimestamp: "2026-08-28T18:00",
      relativeHumidityPercent: 36,
      surfacePressureHpa: 991.2,
      shortwaveRadiationWm2: 642,
    });
  });

  it("rejects temporal mismatch and missing values", async () => {
    const client = createOpenMeteoClient({
      baseUrl: "https://meteo.test",
      transport: async () => {
        await Promise.resolve();
        return Response.json({
          hourly_units: {
            relative_humidity_2m: "%",
            surface_pressure: "hPa",
            shortwave_radiation: "W/m²",
          },
          hourly: {
            time: ["2026-08-28T17:00"],
            relative_humidity_2m: [36],
            surface_pressure: [991],
            shortwave_radiation: [null],
          },
        });
      },
    });
    await expect(
      client.meteorology({
        latitude: 33,
        longitude: -112,
        timestamp: "2026-08-28T18:00:00Z",
      }),
    ).rejects.toMatchObject({ kind: "TEMPORAL_ALIGNMENT" });
    await expect(
      client.meteorology({
        latitude: 33,
        longitude: -112,
        timestamp: "2026-08-28T18:15:00Z",
      }),
    ).rejects.toMatchObject({ kind: "TEMPORAL_ALIGNMENT" });
  });
});
