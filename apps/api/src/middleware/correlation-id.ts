import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function correlationId(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const supplied = request.header("x-correlation-id");
  request.correlationId =
    supplied && supplied.length <= 128 ? supplied : randomUUID();
  response.setHeader("x-correlation-id", request.correlationId);
  next();
}
