import { z } from "zod";

const DecisionHealthSchema = z.object({
  service: z.literal("workforce-heatops-decision-engine"),
  status: z.literal("ok"),
});
export type DependencyState = "ok" | "unavailable";
export interface DecisionEngineHealth {
  check(): Promise<DependencyState>;
}

export function createDecisionEngineHealth(
  baseUrl: string,
  timeoutMs = 1_500,
): DecisionEngineHealth {
  return {
    async check() {
      try {
        const response = await fetch(new URL("/health", baseUrl), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) return "unavailable";
        return DecisionHealthSchema.safeParse(await response.json()).success
          ? "ok"
          : "unavailable";
      } catch {
        return "unavailable";
      }
    },
  };
}
