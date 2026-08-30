import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { PlanningPersistenceError } from "../planning/store.js";
import { ProviderError } from "../providers/errors.js";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  void _next;
  const validation = error instanceof ZodError;
  const persistence = error instanceof PlanningPersistenceError;
  const provider = error instanceof ProviderError;
  request.log?.error(
    { err: error, correlationId: request.correlationId },
    "request failed",
  );
  response.status(validation ? 400 : persistence || provider ? 503 : 500).json({
    error: {
      code: validation
        ? "VALIDATION_ERROR"
        : persistence
          ? "PLANNING_PERSISTENCE_UNAVAILABLE"
          : provider
            ? error.message
            : "INTERNAL_ERROR",
      message: validation
        ? "Request validation failed."
        : provider
          ? "FortyGuard preview could not complete. Check provider configuration and try again."
          : "An unexpected error occurred.",
    },
    meta: { correlationId: request.correlationId },
  });
};
