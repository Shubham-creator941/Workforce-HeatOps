import { z } from "zod";
import { ProviderError, providerKindForStatus } from "./errors.js";

type Coordinate = [number, number];
export interface FortyGuardTemperatureRequest {
  polygon: Coordinate[];
  samplePoint: Coordinate;
  intervalStartUtc: string;
  intervalEndUtc: string;
  timeZone: string;
}
export interface FortyGuardTemperature {
  activityId: string;
  tileId: string;
  averageTemperatureC: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  submittedStartDate: string;
  submittedStartTime: string;
  submittedTimeZone: string;
  alignedIntervalStart: string;
  alignedIntervalEnd: string;
  tileGeometry: {
    type: "Polygon";
    coordinates: Coordinate[][];
  };
}
export interface FortyGuardClient {
  temperature(
    request: FortyGuardTemperatureRequest,
  ): Promise<FortyGuardTemperature>;
}

const SubmittedSchema = z
  .object({
    data: z.object({ activity_id: z.string().min(1) }).passthrough(),
  })
  .passthrough();
const FeatureSchema = z
  .object({
    type: z.literal("Feature"),
    properties: z
      .object({
        tile_id: z.union([z.string().min(1), z.number().finite()]),
        average_temperature: z.number().finite(),
        min_temperature: z.number().finite(),
        max_temperature: z.number().finite(),
      })
      .passthrough(),
    geometry: z
      .object({
        type: z.literal("Polygon"),
        coordinates: z
          .array(z.array(z.tuple([z.number(), z.number()])).min(4))
          .min(1),
      })
      .strict(),
  })
  .passthrough();
const StatusSchema = z
  .object({
    data: z
      .object({
        activity_id: z.string().min(1),
        status: z.string().min(1),
        result: z
          .object({
            map_data: z
              .object({
                type: z.literal("FeatureCollection"),
                features: z.array(FeatureSchema),
              })
              .passthrough(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough(),
  })
  .passthrough();

function localParts(
  instant: Date,
  timeZone: string,
): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value;
  const values = {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
  if (Object.values(values).some((value) => value === undefined))
    throw new ProviderError("FORTYGUARD", "TEMPORAL_ALIGNMENT");
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

function onSegment(
  point: Coordinate,
  start: Coordinate,
  end: Coordinate,
): boolean {
  const cross =
    (point[1] - start[1]) * (end[0] - start[0]) -
    (point[0] - start[0]) * (end[1] - start[1]);
  return (
    Math.abs(cross) <= 1e-10 &&
    point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1])
  );
}
function contains(ring: Coordinate[], point: Coordinate): boolean {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    previous = index++
  ) {
    const a = ring[index];
    const b = ring[previous];
    if (!a || !b) continue;
    if (onSegment(point, a, b)) return true;
    if (
      a[1] > point[1] !== b[1] > point[1] &&
      point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}

export function createFortyGuardClient(options: {
  apiKey?: string;
  baseUrl: string;
  timeoutMs?: number;
  pollAttempts?: number;
  pollIntervalMs?: number;
  transport?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}): FortyGuardClient {
  const transport = options.transport ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const pollAttempts = options.pollAttempts ?? 12;
  const pollIntervalMs = options.pollIntervalMs ?? 5_000;
  const sleep =
    options.sleep ??
    ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? (() => new Date());
  async function request(
    path: string,
    init: RequestInit,
    retryNotFound = false,
  ): Promise<unknown> {
    if (!options.apiKey) throw new ProviderError("FORTYGUARD", "CONFIGURATION");
    let response: Response;
    try {
      response = await transport(new URL(path, options.baseUrl), {
        ...init,
        headers: {
          "api-key": options.apiKey,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw new ProviderError(
        "FORTYGUARD",
        error instanceof DOMException && error.name === "TimeoutError"
          ? "TIMEOUT"
          : "UPSTREAM",
      );
    }
    if (response.status === 404 && retryNotFound) return null;
    if (!response.ok)
      throw new ProviderError(
        "FORTYGUARD",
        providerKindForStatus(response.status),
      );
    try {
      return await response.json();
    } catch {
      throw new ProviderError("FORTYGUARD", "INVALID_RESPONSE");
    }
  }
  return {
    async temperature(input) {
      const start = new Date(input.intervalStartUtc);
      const end = new Date(input.intervalEndUtc);
      if (
        !Number.isFinite(start.valueOf()) ||
        !Number.isFinite(end.valueOf()) ||
        end.valueOf() - start.valueOf() !== 3_600_000
      )
        throw new ProviderError("FORTYGUARD", "TEMPORAL_ALIGNMENT");
      if (
        start < new Date("2019-01-01T00:00:00Z") ||
        end.valueOf() > now().valueOf() + 12 * 3_600_000
      )
        throw new ProviderError("FORTYGUARD", "INVALID_REQUEST");
      let submitted: { date: string; time: string };
      try {
        submitted = localParts(start, input.timeZone);
      } catch (error) {
        if (error instanceof ProviderError) throw error;
        throw new ProviderError("FORTYGUARD", "TEMPORAL_ALIGNMENT");
      }
      const submission = SubmittedSchema.safeParse(
        await request("/v1/heatmap", {
          method: "POST",
          body: JSON.stringify({
            polygon_aoi: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {},
                  geometry: { type: "Polygon", coordinates: [input.polygon] },
                },
              ],
            },
            date_time: {
              start_date: submitted.date,
              start_time: submitted.time,
              filter_type: 1,
            },
            granularity: 60,
            analytic_type: "tcm",
          }),
        }),
      );
      if (!submission.success)
        throw new ProviderError("FORTYGUARD", "INVALID_RESPONSE");
      const activityId = submission.data.data.activity_id;
      for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
        if (attempt > 0) await sleep(pollIntervalMs);
        const statusResponse = await request(
          `/v1/status/${encodeURIComponent(activityId)}`,
          { method: "GET" },
          true,
        );
        if (statusResponse === null) continue;
        const parsed = StatusSchema.safeParse(statusResponse);
        if (!parsed.success || parsed.data.data.activity_id !== activityId)
          throw new ProviderError("FORTYGUARD", "INVALID_RESPONSE");
        const status = parsed.data.data.status.toLowerCase();
        if (status === "failed" || status === "error")
          throw new ProviderError("FORTYGUARD", "UPSTREAM");
        if (status !== "completed" && status !== "succeeded") continue;
        const features = parsed.data.data.result?.map_data.features;
        if (!features)
          throw new ProviderError("FORTYGUARD", "INVALID_RESPONSE");
        const matches = features.filter((feature) => {
          const [outer, ...holes] = feature.geometry.coordinates;
          return (
            contains(outer ?? [], input.samplePoint) &&
            !holes.some((hole) => contains(hole, input.samplePoint))
          );
        });
        if (matches.length !== 1)
          throw new ProviderError("FORTYGUARD", "MISSING_DATA");
        const match = matches[0];
        const properties = match?.properties;
        if (
          !properties ||
          properties.min_temperature > properties.average_temperature ||
          properties.average_temperature > properties.max_temperature
        )
          throw new ProviderError("FORTYGUARD", "INVALID_RESPONSE");
        return {
          activityId,
          tileId: String(properties.tile_id),
          averageTemperatureC: properties.average_temperature,
          minTemperatureC: properties.min_temperature,
          maxTemperatureC: properties.max_temperature,
          submittedStartDate: submitted.date,
          submittedStartTime: submitted.time,
          submittedTimeZone: input.timeZone,
          alignedIntervalStart: start.toISOString(),
          alignedIntervalEnd: end.toISOString(),
          tileGeometry: match.geometry,
        };
      }
      throw new ProviderError("FORTYGUARD", "TIMEOUT");
    },
  };
}
