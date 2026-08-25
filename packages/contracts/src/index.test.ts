import { describe, expect, it } from "vitest";
import { PlanningRunStatusSchema, WorkloadCategorySchema } from "./index.js";

describe("shared contracts", () => {
  it("parses canonical values and rejects duplicates with different spellings", () => {
    expect(WorkloadCategorySchema.parse("VERY_HEAVY")).toBe("VERY_HEAVY");
    expect(PlanningRunStatusSchema.parse("INFEASIBLE")).toBe("INFEASIBLE");
    expect(WorkloadCategorySchema.safeParse("very-heavy").success).toBe(false);
  });
});
