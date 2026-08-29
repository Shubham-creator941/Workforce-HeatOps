import { createServer } from "node:http";
import { createApp } from "../../api/src/app.js";
import type { PlanningService } from "../../api/src/planning/service.js";

const unavailablePlanning: PlanningService = {
  async run() {
    throw new Error("Only the checked-in demo route is available in E2E.");
  },
  async get() {
    return null;
  },
};

const app = createApp(
  { CORS_ORIGIN: "http://127.0.0.1:4173", LOG_LEVEL: "silent" },
  { check: async () => "ok", disconnect: async () => {} },
  { check: async () => "ok" },
  unavailablePlanning,
);
createServer(app).listen(3100, "127.0.0.1");
