import request from "supertest";
import { z } from "zod";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import type { Config } from "../config.js";
import type { DatabaseHealth } from "../db/prisma.js";
import type { DecisionEngineHealth } from "../decision-engine/client.js";

const config: Config = {
  NODE_ENV: "test",
  API_PORT: 3000,
  DATABASE_URL: "mysql://unused",
  DECISION_ENGINE_BASE_URL: "http://unused",
  CORS_ORIGIN: "http://localhost:5173",
  LOG_LEVEL: "silent",
};
const database: DatabaseHealth = {
  check: () => Promise.resolve("ok"),
  disconnect: () => Promise.resolve(),
};
const ResponseSchema = z.object({
  data: z.object({
    status: z.string(),
    dependencies: z.object({
      database: z.string(),
      decisionEngine: z.string(),
    }),
  }),
  meta: z.object({ correlationId: z.string() }),
});

describe("GET /api/v1/health", () => {
  it("reports healthy real dependency states", async () => {
    const engine: DecisionEngineHealth = { check: () => Promise.resolve("ok") };
    const response = await request(createApp(config, database, engine))
      .get("/api/v1/health")
      .expect(200);
    const body = ResponseSchema.parse(response.body);
    expect(body.data).toMatchObject({
      status: "ok",
      dependencies: { database: "ok", decisionEngine: "ok" },
    });
    expect(body.meta.correlationId).toEqual(expect.any(String));
  });
  it("reports Python unavailability without crashing", async () => {
    const engine: DecisionEngineHealth = {
      check: () => Promise.resolve("unavailable"),
    };
    const response = await request(createApp(config, database, engine))
      .get("/api/v1/health")
      .expect(503);
    expect(ResponseSchema.parse(response.body).data).toMatchObject({
      status: "degraded",
      dependencies: { decisionEngine: "unavailable" },
    });
  });
});
