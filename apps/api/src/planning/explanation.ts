import {
  PlanningExplanationSchema,
  type PlanningExplanation,
  type SupervisorPlanningResult,
} from "@heatops/contracts";
import { z } from "zod";

const NarrativeSchema = z
  .object({
    summary: z.string().min(1).max(2000),
    assignmentExplanations: z.array(
      z.object({
        taskId: z.string().min(1),
        crewId: z.string().min(1),
        explanation: z.string().min(1).max(2000),
        deterministicEvidenceRefs: z.array(z.string().min(1)).min(1),
      }),
    ),
    unscheduledExplanations: z.array(
      z.object({
        taskId: z.string().min(1),
        explanation: z.string().min(1).max(2000),
        deterministicEvidenceRefs: z.array(z.string().min(1)),
      }),
    ),
    constraintsReferenced: z.array(z.string().min(1)),
  })
  .strict();

export interface PlanningExplainer {
  explain(result: SupervisorPlanningResult): Promise<PlanningExplanation>;
}

export class ExplanationUnavailableError extends Error {}

function responseText(value: unknown): string {
  const parsed = z
    .object({
      output: z.array(
        z
          .object({
            content: z.array(
              z
                .object({ type: z.string(), text: z.string().optional() })
                .passthrough(),
            ),
          })
          .passthrough(),
      ),
    })
    .passthrough()
    .parse(value);
  const text = parsed.output
    .flatMap((item) => item.content)
    .find((item) => item.type === "output_text")?.text;
  if (!text)
    throw new ExplanationUnavailableError("AI response contained no text.");
  return text;
}

export function createOpenAiPlanningExplainer(options: {
  apiKey?: string;
  model: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): PlanningExplainer {
  return {
    async explain(result) {
      if (!options.apiKey)
        throw new ExplanationUnavailableError(
          "AI explanation is not configured.",
        );
      const response = await (options.fetchImpl ?? fetch)(
        `${options.baseUrl.replace(/\/$/, "")}/responses`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: options.model,
            instructions:
              'Explain only the supplied persisted deterministic HeatOps result. Never calculate or change WBGT, safety limits, safety decisions, or optimization. Do not claim compliance or safety. Return JSON with summary, assignmentExplanations, unscheduledExplanations, and constraintsReferenced. Every claim must cite IDs already present in the input. constraintsReferenced may contain only "hard safety feasibility", "optimizer status", "time-slot assignment", "crew assignment", or "unscheduled task output".',
            input: JSON.stringify(result),
            text: { format: { type: "json_object" } },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok)
        throw new ExplanationUnavailableError(
          `AI explanation provider returned HTTP ${response.status}.`,
        );
      const narrative = NarrativeSchema.parse(
        JSON.parse(responseText(await response.json())),
      );
      const assignments = result.schedule?.assignments ?? [];
      const validRefs = new Set([
        ...result.environment.map((item) => item.snapshot.snapshotId),
        ...result.safety.map((item) => item.context.evaluationRef),
        ...assignments.flatMap((item) => item.safetyEvaluationRefs),
      ]);
      const assignmentKeys = new Set(
        assignments.map((item) => `${item.taskId}\u0000${item.crewId}`),
      );
      const unscheduled = new Set(result.schedule?.unscheduledTaskIds ?? []);
      const allowedConstraints = new Set([
        "hard safety feasibility",
        "optimizer status",
        "time-slot assignment",
        "crew assignment",
        "unscheduled task output",
      ]);
      if (
        narrative.assignmentExplanations.some(
          (item) =>
            !assignmentKeys.has(`${item.taskId}\u0000${item.crewId}`) ||
            item.deterministicEvidenceRefs.some((ref) => !validRefs.has(ref)),
        ) ||
        narrative.unscheduledExplanations.some(
          (item) =>
            !unscheduled.has(item.taskId) ||
            item.deterministicEvidenceRefs.some((ref) => !validRefs.has(ref)),
        ) ||
        narrative.constraintsReferenced.some(
          (constraint) => !allowedConstraints.has(constraint),
        )
      )
        throw new ExplanationUnavailableError(
          "AI explanation referenced evidence outside the persisted result.",
        );
      return PlanningExplanationSchema.parse({
        planningRunId: result.planningRunId,
        kind: "AI_EXPLANATION",
        sourceMode: "LIVE_AI",
        model: options.model,
        generatedAt: new Date().toISOString(),
        disclaimer:
          "AI explanation of persisted deterministic results. It does not calculate or change thermal, safety, or optimization decisions.",
        summary: narrative.summary,
        assignmentExplanations: narrative.assignmentExplanations,
        unscheduledExplanations: narrative.unscheduledExplanations,
        evidence: {
          estimatedOutdoorWbgtC: result.environment.flatMap((item) =>
            item.thermal?.status === "VALID"
              ? [item.thermal.estimatedWbgtC]
              : [],
          ),
          safetyDecisions: result.safety.map((item) => item.result.decision),
          optimizerStatus: result.schedule?.solverStatus ?? null,
          constraintsReferenced: narrative.constraintsReferenced,
        },
      });
    },
  };
}
