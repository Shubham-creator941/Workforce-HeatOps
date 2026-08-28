import type { z } from "zod";
import {
  ThermalBatchRequestSchema,
  ThermalBatchResponseSchema,
  SafetyBatchRequestSchema,
  SafetyBatchResponseSchema,
  OptimizationBatchRequestSchema,
  OptimizationBatchResponseSchema,
  type ThermalBatchRequest,
  type ThermalBatchResponse,
  type SafetyBatchRequest,
  type SafetyBatchResponse,
  type OptimizationBatchRequest,
  type OptimizationBatchResponse,
} from "@heatops/contracts";

export class DecisionEngineError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export interface PlanningDecisionEngine {
  thermal(
    input: ThermalBatchRequest,
    correlationId: string,
  ): Promise<ThermalBatchResponse>;
  safety(
    input: SafetyBatchRequest,
    correlationId: string,
  ): Promise<SafetyBatchResponse>;
  optimize(
    input: OptimizationBatchRequest,
    correlationId: string,
  ): Promise<OptimizationBatchResponse>;
}
export function createPlanningDecisionEngine(
  baseUrl: string,
  timeoutMs = 30_000,
  transport: typeof fetch = fetch,
): PlanningDecisionEngine {
  async function post<Input, Output>(
    path: string,
    input: Input,
    correlationId: string,
    requestSchema: z.ZodType<Input>,
    responseSchema: z.ZodType<Output>,
  ): Promise<Output> {
    const payload = requestSchema.parse(input);
    try {
      const response = await transport(new URL(path, baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-correlation-id": correlationId,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "error",
      });
      if (!response.ok)
        throw new DecisionEngineError("DECISION_ENGINE_HTTP_ERROR");
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new DecisionEngineError("DECISION_ENGINE_INVALID_RESPONSE");
      return parsed.data;
    } catch (error) {
      if (error instanceof DecisionEngineError) throw error;
      if (error instanceof SyntaxError)
        throw new DecisionEngineError("DECISION_ENGINE_INVALID_RESPONSE");
      throw new DecisionEngineError("DECISION_ENGINE_UNAVAILABLE");
    }
  }
  return {
    thermal: (input, correlationId) =>
      post(
        "/internal/v1/thermal/batch",
        input,
        correlationId,
        ThermalBatchRequestSchema,
        ThermalBatchResponseSchema,
      ),
    safety: (input, correlationId) =>
      post(
        "/internal/v1/safety/batch",
        input,
        correlationId,
        SafetyBatchRequestSchema,
        SafetyBatchResponseSchema,
      ),
    optimize: (input, correlationId) =>
      post(
        "/internal/v1/optimization/batch",
        input,
        correlationId,
        OptimizationBatchRequestSchema,
        OptimizationBatchResponseSchema,
      ),
  };
}
