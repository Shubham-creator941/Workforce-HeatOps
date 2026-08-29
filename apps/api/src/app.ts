import cors from "cors";
import express from "express";
import helmet from "helmet";
import pino from "pino";
import { pinoHttp } from "pino-http";
import type { Config } from "./config.js";
import type { DatabaseHealth } from "./db/prisma.js";
import type { DecisionEngineHealth } from "./decision-engine/client.js";
import { correlationId } from "./middleware/correlation-id.js";
import { errorHandler } from "./middleware/errors.js";
import { healthRouter } from "./routes/health.js";
import { planningRouter } from "./routes/planning.js";
import type { PlanningService } from "./planning/service.js";
import type { PlanningExplainer } from "./planning/explanation.js";

export function createApp(
  config: Pick<Config, "CORS_ORIGIN" | "LOG_LEVEL"> & Partial<Config>,
  database: DatabaseHealth,
  decisionEngine: DecisionEngineHealth,
  planning?: PlanningService,
  explainer?: PlanningExplainer,
) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN, credentials: false }));
  app.use(express.json({ limit: "1mb" }));
  app.use(correlationId);
  app.use(pinoHttp({ logger: pino({ level: config.LOG_LEVEL }) }));
  app.use("/api/v1/health", healthRouter(database, decisionEngine));
  if (planning)
    app.use("/api/v1/planning-runs", planningRouter(planning, explainer));
  app.use((_request, response) =>
    response
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "Route not found." } }),
  );
  app.use(errorHandler);
  return app;
}
