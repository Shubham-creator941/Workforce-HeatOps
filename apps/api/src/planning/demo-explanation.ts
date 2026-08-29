import {
  PlanningExplanationSchema,
  type PlanningExplanation,
} from "@heatops/contracts";

// Checked-in AI narrative for the checked-in persisted-result fixture.
// It makes no model or provider call and cites only deterministic evidence IDs.
export const supervisorDemoExplanation: PlanningExplanation =
  PlanningExplanationSchema.parse({
    planningRunId: "5ab9302d-c2be-48e1-876f-752c591e6331",
    kind: "AI_EXPLANATION",
    sourceMode: "CHECKED_IN_DEMO_FIXTURE",
    model: "golden-demo-explanation-v1",
    generatedAt: "2026-08-28T18:00:00Z",
    disclaimer:
      "AI explanation of persisted deterministic results. It does not calculate or change thermal, safety, or optimization decisions.",
    summary:
      "The deterministic optimizer assigned the wall task to the masonry crew in Zone East for hour 1. The cited safety evaluation allows continuous work for this exact task, crew, zone, and time combination, and the optimizer returned OPTIMAL.",
    assignmentExplanations: [
      {
        taskId: "task-wall",
        crewId: "crew-masons",
        explanation:
          "The persisted optimizer output assigns the masonry crew to Zone East in hour 1. Estimated Outdoor WBGT was 27.125°C, and the deterministic safety engine returned Continuous Work Allowed with a 3.638°C margin for the cited evaluation.",
        deterministicEvidenceRefs: [
          "snapshot-zone-east-hour-1",
          "safety-task-wall-crew-masons-hour-1",
        ],
      },
    ],
    unscheduledExplanations: [],
    evidence: {
      estimatedOutdoorWbgtC: [27.125],
      safetyDecisions: ["CONTINUOUS_WORK_ALLOWED"],
      optimizerStatus: "OPTIMAL",
      constraintsReferenced: [
        "hard safety feasibility",
        "optimizer status",
        "time-slot assignment",
        "crew assignment",
      ],
    },
  });
