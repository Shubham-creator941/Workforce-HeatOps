import { z } from "zod";

const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  DECISION_ENGINE_BASE_URL: z.string().url().default("http://localhost:8000"),
  FORTYGUARD_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  FORTYGUARD_BASE_URL: z.string().url().default("https://api.fortyguard.com"),
  OPEN_METEO_BASE_URL: z.string().url().default("https://api.open-meteo.com"),
  OPENAI_API_KEY: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  ),
  OPENAI_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
  OPENAI_EXPLANATION_MODEL: z.string().min(1).default("gpt-5-mini"),
  PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(100)
    .max(60_000)
    .default(10_000),
  FORTYGUARD_POLL_ATTEMPTS: z.coerce.number().int().min(1).max(120).default(12),
  FORTYGUARD_POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(0)
    .max(60_000)
    .default(5_000),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

type LoadedConfig = z.infer<typeof ConfigSchema>;
type ProviderConfigKey =
  | "FORTYGUARD_API_KEY"
  | "FORTYGUARD_BASE_URL"
  | "OPEN_METEO_BASE_URL"
  | "OPENAI_API_KEY"
  | "OPENAI_BASE_URL"
  | "OPENAI_EXPLANATION_MODEL"
  | "PROVIDER_TIMEOUT_MS"
  | "FORTYGUARD_POLL_ATTEMPTS"
  | "FORTYGUARD_POLL_INTERVAL_MS";
export type Config = Omit<LoadedConfig, ProviderConfigKey> &
  Partial<Pick<LoadedConfig, ProviderConfigKey>>;

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): LoadedConfig {
  return ConfigSchema.parse(environment);
}
