import { describe, expect, it, vi } from "vitest";
import { supervisorDemoResult } from "./demo-result.js";
import {
  ExplanationUnavailableError,
  createOpenAiPlanningExplainer,
} from "./explanation.js";

const responseFor = (narrative: unknown) =>
  Response.json({
    output: [
      {
        content: [{ type: "output_text", text: JSON.stringify(narrative) }],
      },
    ],
  });

describe("planning explanation boundary", () => {
  it("rejects use when AI is not configured", async () => {
    const explainer = createOpenAiPlanningExplainer({
      model: "test-model",
      baseUrl: "https://example.test/v1",
    });
    await expect(
      explainer.explain(supervisorDemoResult),
    ).rejects.toBeInstanceOf(ExplanationUnavailableError);
  });

  it("accepts narrative only when it cites persisted result IDs", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseFor({
        summary: "The stored assignment follows the hard constraints.",
        assignmentExplanations: [
          {
            taskId: "task-wall",
            crewId: "crew-masons",
            explanation: "The persisted result assigns this crew.",
            deterministicEvidenceRefs: ["safety-task-wall-crew-masons-hour-1"],
          },
        ],
        unscheduledExplanations: [],
        constraintsReferenced: ["hard safety feasibility"],
      }),
    );
    const result = await createOpenAiPlanningExplainer({
      apiKey: "test-key",
      model: "test-model",
      baseUrl: "https://example.test/v1",
      fetchImpl,
    }).explain(supervisorDemoResult);
    expect(result.kind).toBe("AI_EXPLANATION");
    expect(result.evidence.estimatedOutdoorWbgtC).toEqual([27.125]);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("rejects hallucinated assignment and evidence references", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      responseFor({
        summary: "Unsupported claim.",
        assignmentExplanations: [
          {
            taskId: "invented-task",
            crewId: "crew-masons",
            explanation: "Invented.",
            deterministicEvidenceRefs: ["invented-evidence"],
          },
        ],
        unscheduledExplanations: [],
        constraintsReferenced: [],
      }),
    );
    await expect(
      createOpenAiPlanningExplainer({
        apiKey: "test-key",
        model: "test-model",
        baseUrl: "https://example.test/v1",
        fetchImpl,
      }).explain(supervisorDemoResult),
    ).rejects.toBeInstanceOf(ExplanationUnavailableError);
  });
});
