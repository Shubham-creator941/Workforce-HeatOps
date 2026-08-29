import { Router } from "express";
import { z } from "zod";
import { PlanningRunSchema } from "@heatops/contracts";
import type { PlanningService } from "../planning/service.js";
import { toSupervisorPlanningResult } from "../planning/supervisor-result.js";
import { supervisorDemoResult } from "../planning/demo-result.js";
import { supervisorDemoExplanation } from "../planning/demo-explanation.js";
import {
  ExplanationUnavailableError,
  type PlanningExplainer,
} from "../planning/explanation.js";

export function planningRouter(
  service: PlanningService,
  explainer?: PlanningExplainer,
): Router {
  const router = Router();
  router.post("/demo", (request, response) => {
    z.object({ scenarioId: z.literal("phoenix-golden-v1") })
      .strict()
      .parse(request.body);
    response.status(201).json({
      data: supervisorDemoResult,
      meta: {
        correlationId: request.correlationId,
        evidenceMode: "CHECKED_IN_DEMO_FIXTURE",
      },
    });
  });
  router.post("/demo/explanation", (request, response) => {
    z.object({ planningRunId: z.literal(supervisorDemoResult.planningRunId) })
      .strict()
      .parse(request.body);
    response.json({
      data: supervisorDemoExplanation,
      meta: {
        correlationId: request.correlationId,
        explanationMode: "CHECKED_IN_DEMO_FIXTURE",
      },
    });
  });
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
  router.get("/:id/result", async (request, response) => {
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
      data: toSupervisorPlanningResult(PlanningRunSchema.parse(run)),
      meta: { correlationId: request.correlationId },
    });
  });
  router.post("/:id/explanation", async (request, response) => {
    const id = z.uuid().parse(request.params.id);
    z.object({})
      .strict()
      .parse(request.body ?? {});
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
    if (!explainer) {
      response.status(503).json({
        error: {
          code: "AI_EXPLANATION_UNAVAILABLE",
          message: "AI explanation is not configured.",
        },
        meta: { correlationId: request.correlationId },
      });
      return;
    }
    try {
      const result = toSupervisorPlanningResult(PlanningRunSchema.parse(run));
      response.json({
        data: await explainer.explain(result),
        meta: { correlationId: request.correlationId },
      });
    } catch (error) {
      if (error instanceof ExplanationUnavailableError) {
        response.status(503).json({
          error: {
            code: "AI_EXPLANATION_UNAVAILABLE",
            message: error.message,
          },
          meta: { correlationId: request.correlationId },
        });
        return;
      }
      throw error;
    }
  });
  return router;
}
