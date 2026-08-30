import { Router } from "express";
import type { DatabaseHealth } from "../db/prisma.js";
import type { DecisionEngineHealth } from "../decision-engine/client.js";

export function healthRouter(
  database: DatabaseHealth,
  decisionEngine: DecisionEngineHealth,
): Router {
  const router = Router();
  router.get("/live", (request, response) => {
    response.json({
      data: { service: "workforce-heatops-api", status: "ok" },
      meta: { correlationId: request.correlationId },
    });
  });
  router.get("/", async (request, response, next) => {
    try {
      const [databaseState, decisionEngineState] = await Promise.all([
        database.check(),
        decisionEngine.check(),
      ]);
      const healthy = databaseState === "ok" && decisionEngineState === "ok";
      response.status(healthy ? 200 : 503).json({
        data: {
          service: "workforce-heatops-api",
          status: healthy ? "ok" : "degraded",
          version: "0.1.0",
          dependencies: {
            database: databaseState,
            decisionEngine: decisionEngineState,
          },
        },
        meta: { correlationId: request.correlationId },
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
