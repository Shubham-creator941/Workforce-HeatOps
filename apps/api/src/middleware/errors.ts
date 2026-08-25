import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  _next,
) => {
  void _next;
  const validation = error instanceof ZodError;
  request.log.error(
    { err: error, correlationId: request.correlationId },
    "request failed",
  );
  response.status(validation ? 400 : 500).json({
    error: {
      code: validation ? "VALIDATION_ERROR" : "INTERNAL_ERROR",
      message: validation
        ? "Request validation failed."
        : "An unexpected error occurred.",
    },
    meta: { correlationId: request.correlationId },
  });
};
