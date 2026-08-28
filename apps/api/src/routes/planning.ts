import { Router } from "express";
import { z } from "zod";
import { PlanningRunSchema } from "@heatops/contracts";
import type { PlanningService } from "../planning/service.js";

export function planningRouter(service: PlanningService): Router {
  const router = Router();
  router.post("/", async (request, response) => {
    const run = PlanningRunSchema.parse(
      await service.run(request.body, request.correlationId),
    );
    response
      .status(201)
      .json({ data: run, meta: { correlationId: request.correlationId } });
  });
  router.get("/:id", async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    const run = await service.get(id);
    if (!run) {
      response.status(404).json({
        error: {
          code: "PLANNING_RUN_NOT_FOUND",
          message: "Planning run not found.",
        },
        meta: { correlationId: request.correlationId },
      });
      return;
    }
    response.json({
      data: PlanningRunSchema.parse(run),
      meta: { correlationId: request.correlationId },
    });
  });
  return router;
}
