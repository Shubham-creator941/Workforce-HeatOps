import { z } from "zod";
import { ProviderError, providerKindForStatus } from "./errors.js";

export interface MeteorologyResult {
  returnedTimestamp: string;
  relativeHumidityPercent: number;
  surfacePressureHpa: number;
  shortwaveRadiationWm2: number;
}
export interface MeteorologyClient {
  meteorology(input: {
    latitude: number;
    longitude: number;
    timestamp: string;
  }): Promise<MeteorologyResult>;
}
const ResponseSchema = z
  .object({
    hourly_units: z
      .object({
        relative_humidity_2m: z.literal("%"),
        surface_pressure: z.literal("hPa"),
        shortwave_radiation: z.union([z.literal("W/m²"), z.literal("W/m2")]),
      })
      .passthrough(),
    hourly: z
      .object({
        time: z.array(z.string()),
        relative_humidity_2m: z.array(z.number().finite().nullable()),
        surface_pressure: z.array(z.number().finite().nullable()),
        shortwave_radiation: z.array(z.number().finite().nullable()),
      })
      .passthrough(),
  })
  .passthrough();

export function createOpenMeteoClient(options: {
  baseUrl: string;
  timeoutMs?: number;
  transport?: typeof fetch;
}): MeteorologyClient {
  const transport = options.transport ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  return {
    async meteorology(input) {
      const instant = new Date(input.timestamp);
      if (
        !Number.isFinite(instant.valueOf()) ||
        instant.getUTCMinutes() !== 0 ||
        instant.getUTCSeconds() !== 0 ||
        instant.getUTCMilliseconds() !== 0
      )
        throw new ProviderError("OPEN_METEO", "TEMPORAL_ALIGNMENT");
      const expected = instant.toISOString().slice(0, 16);
      const url = new URL("/v1/forecast", options.baseUrl);
      url.searchParams.set("latitude", String(input.latitude));
      url.searchParams.set("longitude", String(input.longitude));
      url.searchParams.set(
        "hourly",
        "relative_humidity_2m,surface_pressure,shortwave_radiation",
      );
      url.searchParams.set("timezone", "GMT");
      url.searchParams.set("start_hour", expected);
      url.searchParams.set("end_hour", expected);
      let response: Response;
      try {
        response = await transport(url, {
          method: "GET",
          signal: AbortSignal.timeout(timeoutMs),
          redirect: "error",
        });
      } catch (error) {
        throw new ProviderError(
          "OPEN_METEO",
          error instanceof DOMException && error.name === "TimeoutError"
            ? "TIMEOUT"
            : "UPSTREAM",
        );
      }
      if (!response.ok)
        throw new ProviderError(
          "OPEN_METEO",
          providerKindForStatus(response.status),
        );
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new ProviderError("OPEN_METEO", "INVALID_RESPONSE");
      }
      const parsed = ResponseSchema.safeParse(data);
      if (!parsed.success)
        throw new ProviderError("OPEN_METEO", "INVALID_RESPONSE");
      const index = parsed.data.hourly.time.indexOf(expected);
      if (index < 0)
        throw new ProviderError("OPEN_METEO", "TEMPORAL_ALIGNMENT");
      const humidity = parsed.data.hourly.relative_humidity_2m[index];
      const pressure = parsed.data.hourly.surface_pressure[index];
      const radiation = parsed.data.hourly.shortwave_radiation[index];
      if (humidity == null || pressure == null || radiation == null)
        throw new ProviderError("OPEN_METEO", "MISSING_DATA");
      if (humidity < 0 || humidity > 100 || pressure <= 0 || radiation < 0)
        throw new ProviderError("OPEN_METEO", "INVALID_RESPONSE");
      return {
        returnedTimestamp: expected,
        relativeHumidityPercent: humidity,
        surfacePressureHpa: pressure,
        shortwaveRadiationWm2: radiation,
      };
    },
  };
}
