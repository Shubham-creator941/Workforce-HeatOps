// Starts the real API composition with local-only configuration. The Golden
// Demo route uses checked-in evidence and does not touch these dependencies.
process.env.NODE_ENV = "test";
process.env.API_PORT = "3100";
process.env.CORS_ORIGIN = "http://127.0.0.1:4173";
process.env.DATABASE_URL =
  "mysql://heatops:heatops_local@127.0.0.1:3306/workforce_heatops_e2e";
process.env.DECISION_ENGINE_BASE_URL = "http://127.0.0.1:3199";
process.env.FORTYGUARD_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.LOG_LEVEL = "silent";

await import("../../api/src/server.js");
