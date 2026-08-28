import { describe, expect, it } from "vitest";
import {
  AcclimatizationStateSchema,
  PlanningRunStatusSchema,
  PPECategorySchema,
  WorkloadCategorySchema,
} from "./index.js";

describe("shared contracts", () => {
  it("parses canonical values and rejects duplicates with different spellings", () => {
    expect(WorkloadCategorySchema.parse("VERY_HEAVY")).toBe("VERY_HEAVY");
    expect(PlanningRunStatusSchema.parse("INFEASIBLE")).toBe("INFEASIBLE");
    expect(WorkloadCategorySchema.safeParse("very-heavy").success).toBe(false);
    expect(WorkloadCategorySchema.parse("REST")).toBe("REST");
    expect(PPECategorySchema.parse("DOUBLE_LAYER_CLOTH")).toBe(
      "DOUBLE_LAYER_CLOTH",
    );
    expect(AcclimatizationStateSchema.parse("NEW_WORKER_RAMP")).toBe(
      "NEW_WORKER_RAMP",
    );
  });
});
