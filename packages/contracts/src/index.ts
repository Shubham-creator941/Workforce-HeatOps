import { z } from "zod";

export const WorkloadCategorySchema = z.enum([
  "REST",
  "LIGHT",
  "MODERATE",
  "HEAVY",
  "VERY_HEAVY",
  "UNCLASSIFIED",
]);
export type WorkloadCategory = z.infer<typeof WorkloadCategorySchema>;

export const PPECategorySchema = z.enum([
  "NORMAL_WORK_CLOTHING",
  "CLOTH_COVERALLS",
  "SMS_COVERALLS",
  "POLYOLEFIN_COVERALLS",
  "DOUBLE_LAYER_CLOTH",
  "VAPOR_BARRIER_LIMITED_USE",
  "UNSUPPORTED",
  "UNKNOWN",
]);
export type PPECategory = z.infer<typeof PPECategorySchema>;

export const AcclimatizationStateSchema = z.enum([
  "ACCLIMATIZED",
  "NEW_WORKER_RAMP",
  "RETURNING_WORKER_RAMP",
  "UNKNOWN",
]);
export type AcclimatizationState = z.infer<typeof AcclimatizationStateSchema>;

export const SafetyDecisionSchema = z.enum([
  "CONTINUOUS_WORK_ALLOWED",
  "WORK_REST_REQUIRED",
  "RESCHEDULE_REQUIRED",
  "MANUAL_REVIEW_REQUIRED",
  "INSUFFICIENT_DATA",
]);
export type SafetyDecision = z.infer<typeof SafetyDecisionSchema>;

export const SolverStatusSchema = z.enum([
  "OPTIMAL",
  "FEASIBLE",
  "INFEASIBLE",
  "FAILED",
]);
export type SolverStatus = z.infer<typeof SolverStatusSchema>;

export const PlanningRunStatusSchema = z.enum([
  "QUEUED",
  "FETCHING_FORTYGUARD",
  "FETCHING_METEOROLOGY",
  "ALIGNING_DATA",
  "CALCULATING_THERMAL",
  "EVALUATING_SAFETY",
  "OPTIMIZING",
  "GENERATING_EXPLANATION",
  "READY_FOR_REVIEW",
  "INFEASIBLE",
  "INSUFFICIENT_DATA",
  "FAILED",
]);
export type PlanningRunStatus = z.infer<typeof PlanningRunStatusSchema>;
