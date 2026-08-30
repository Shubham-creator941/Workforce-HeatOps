import { Router } from "express";
import {
  FortyGuardPreviewRequestSchema,
  FortyGuardPreviewResultSchema,
} from "@heatops/contracts";
import type { FortyGuardClient } from "../providers/fortyguard.js";

export function providerPreviewRouter(fortyGuard: FortyGuardClient): Router {
  const router = Router();
  router.post("/fortyguard", async (request, response, next) => {
    try {
      const input = FortyGuardPreviewRequestSchema.parse(request.body);
      const preview = await fortyGuard.preview(input);
      response.status(201).json({
        data: FortyGuardPreviewResultSchema.parse({
          provider: "FORTYGUARD_TEMPERATURE_API_V1",
          previewType: "LIVE_FORTYGUARD_THERMAL_PREVIEW",
          granularityM: 60,
          ...preview,
        }),
        meta: { correlationId: request.correlationId },
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
