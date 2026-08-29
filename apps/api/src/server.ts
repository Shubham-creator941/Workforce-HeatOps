import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabaseHealth } from "./db/prisma.js";
import { createDecisionEngineHealth } from "./decision-engine/client.js";
import { PrismaClient } from "@prisma/client";
import { createPlanningDecisionEngine } from "./decision-engine/planning-client.js";
import { createPlanningService } from "./planning/service.js";
import { createPrismaPlanningRunStore } from "./planning/store.js";
import { createFortyGuardClient } from "./providers/fortyguard.js";
import { createOpenMeteoClient } from "./providers/open-meteo.js";

const config = loadConfig();
const prisma = new PrismaClient();
const database = createDatabaseHealth(prisma);
const server = createServer(
  createApp(
    config,
    database,
    createDecisionEngineHealth(config.DECISION_ENGINE_BASE_URL),
    createPlanningService(
      createPrismaPlanningRunStore(prisma),
      createPlanningDecisionEngine(config.DECISION_ENGINE_BASE_URL),
      {
        fortyGuard: createFortyGuardClient({
          ...(config.FORTYGUARD_API_KEY
            ? { apiKey: config.FORTYGUARD_API_KEY }
            : {}),
          baseUrl: config.FORTYGUARD_BASE_URL,
          timeoutMs: config.PROVIDER_TIMEOUT_MS,
          pollAttempts: config.FORTYGUARD_POLL_ATTEMPTS,
          pollIntervalMs: config.FORTYGUARD_POLL_INTERVAL_MS,
        }),
        meteorology: createOpenMeteoClient({
          baseUrl: config.OPEN_METEO_BASE_URL,
          timeoutMs: config.PROVIDER_TIMEOUT_MS,
        }),
      },
    ),
  ),
);

server.listen(config.API_PORT, () =>
  console.info({ port: config.API_PORT }, "Workforce HeatOps API listening"),
);

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info({ signal }, "Shutting down");
  server.close((error) => {
    void database.disconnect().finally(() => {
      process.exitCode = error ? 1 : 0;
    });
  });
  setTimeout(() => {
    process.exitCode = 1;
    server.closeAllConnections();
  }, 10_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
