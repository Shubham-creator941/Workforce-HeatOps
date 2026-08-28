# ADR 0004: deterministic slot-based schedule optimizer

## Decision and ownership

Implement the internal Python optimizer as OR-Tools CP-SAT, pinned to 9.15.6755, with optimizer version `CP_SAT_SLOTS_V1`. Node owns orchestration, persistence, external providers, and translating its time axis and confirmed safety results into this contract. Python performs no network, database, provider, LLM, persistence, or scientific recalculation in this path.

The model follows the integer constraint and precedence/resource concepts in the official [CP-SAT guide](https://developers.google.com/optimization/cp/cp_solver) and [job-shop guide](https://developers.google.com/optimization/scheduling/job_shop). These are engineering references, not additional occupational safety guidance. Thermal and safety scientific rules are unchanged.

## Smallest supported scope

A plan has a contiguous, ordered grid of equal-duration time slots. A task has a fixed zone, positive duration in slots, confirmed skills and eligible crews, explicit availability, and optional predecessors. It runs without interruption on exactly one crew. Crews and zones also have explicit availability; each zone has an explicit concurrent-task capacity. There is no travel time, setup time, task splitting, multi-crew task, cross-plan coordination, or automatic work/rest scheduling.

Tasks are required by default. Every required task must be scheduled, otherwise the model is `INFEASIBLE`. Optional tasks can be omitted and are listed explicitly in the response. A scheduled successor requires its predecessor to be scheduled and finished first, even if that predecessor is optional. Cyclic or unresolved dependencies are malformed input (HTTP 422), not a solver conclusion.

## Safety boundary

Only an explicit `CONTINUOUS_WORK_ALLOWED` entry for the exact task, crew, zone, and **each occupied slot** can create a candidate assignment. Missing entries and every other decision forbid assignment. Evidence references and the upstream ruleset version are returned for audit. Conflicting/duplicate entries are rejected, never resolved by order. The optimizer never computes WBGT, PPE adjustments, RAL/REL, exposure ramps, or break schedules.

Every crew must also supply an upstream `maxHeatExposureSlots` budget for this planning horizon. All occupied slots count against that budget conservatively. Node must provide a confirmed operational budget respecting the safety engine's separate acclimatization exposure constraint; a continuous-work result alone is insufficient. The optimizer does not derive shift minutes from a ramp fraction or assume a missing budget is unrestricted. Use one exposure-budget period per plan; do not use an aggregated multi-day budget to bypass daily limits.

Node must ensure the evaluation applies to the entire slot and matches current task workload, crew/PPE/acclimatization, location, and environmental snapshot. This internal contract trusts its upstream caller; references are provenance, not cryptographic verification. It is not a public endpoint or an authorization layer.

Safety, eligibility, skills, availability, crew exclusivity, zone capacity, precedence, mandatory completion, and exposure budgets are hard constraints. Preferences cannot relax any of them. A separate validator checks the returned assignment against these inputs before it is exposed. A validation failure returns no assignments.

## Auditable objective

First maximize `sum(durationSlots * productivityWeight)` over completed tasks. Required work is already mandatory; this selects additional optional work. Then minimize the sum of start-slot indices plus one point per nonpreferred crew assignment (only tasks with specified preferences incur this penalty). Earlier starts discourage avoidable delay; the MVP does not separately minimize every form of crew idle time.

The objective uses an integer dominance multiplier `tasks * (slots + 1) + 1`. It exceeds the maximum possible total secondary cost, so one unit of completed work always dominates delay and crew preferences. Safety never appears as a penalty. Responses report the three objective components independently.

## Determinism, bounds, and statuses

Tasks, crews, dependencies, and resource constraints are built in canonical order. CP-SAT uses one worker, seed 0, and a fixed budget of 5 deterministic-time units (not wall-clock seconds). Results contain no timestamps or timing metrics. Repeated inputs and reorderings of entity/evidence lists produce the same result in the pinned runtime; the chronological time-slot list must not be reordered. Cross-version/platform bitwise identity is not promised. Solver upgrades require regression review.

- `OPTIMAL`: a validated solution with proven objective optimality; optional work may still be omitted.
- `FEASIBLE`: a validated incumbent without proof of optimality.
- `INFEASIBLE`: CP-SAT proved the hard constraints cannot all be satisfied; no partial schedule is returned.
- `FAILED`: search ended without an incumbent/proof, invalid model, capacity bound, output validation failure, or internal solver exception. It is not evidence of infeasibility.

Bounds per plan: 100 tasks, 30 crews, 30 zones, 96 slots, 100,000 feasibility entries, and 20,000 legal assignment candidates. Slots are 1–60 minutes; durations are 1–96 slots; productivity weights are 1–1000. Batches contain at most 10 independent plans and are processed sequentially. A candidate cap returns `FAILED/MODEL_SIZE_LIMIT`, never a truncated model represented as optimal. Node must enforce request concurrency/timeouts; deterministic time does not guarantee a wall-clock latency SLA.

## Internal endpoint

`POST /internal/v1/optimization/batch` accepts `{ "contractVersion": "1.0", "plans": [...] }`. Pydantic rejects unknown fields, bad references, duplicate entity IDs, duplicate safety entries, invalid durations, and missing required input. A structurally invalid batch gets HTTP 422. Valid but infeasible/failed plans are isolated from other plans and return their own status in an HTTP 200 batch response.

Each plan includes `planningRef`, `safetyRulesetVersion`, `timeSlotIds`, `slotDurationMinutes`, `tasks`, `crews`, `zones`, and `safetyFeasibility`. Field schemas are available in internal OpenAPI. Assignments identify task/crew/zone, a zero-based start index, an exclusive end index, and the safety reference for each occupied slot. Each result also includes unscheduled task IDs, objective components, optimizer version, upstream ruleset version, and a reason code where applicable.

See the [minimal request fixture](../../fixtures/optimization/continuous_work_plan.json). Batch plans do not share resource state. Node must combine competing tasks into one plan rather than schedule the same crew independently in overlapping plans.

## Validation and deferred work

Tests cover feasible and infeasible plans, unsafe and missing per-slot evidence, skills, availability, crew/zone conflicts, exposure budgets, precedence, optional work, preferences, repeated solves, status mapping, independent output validation, and batch isolation. A 64-case exhaustive oracle cross-checks the work/delay objective on small instances.

Validated NIOSH detailed work/rest curves remain separate scientific work. This optimizer does not infer them. Public Node integration, persistence, provider fetching, multi-day constraints, travel/setup times, and production performance tuning require separate reviewed work.
