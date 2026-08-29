# ADR 0005: Node planning orchestration MVP

## Ownership and scope

Node accepts normalized environmental snapshots and confirmed operational inputs, owns persisted planning-run state, and calls Python thermal, safety, and optimization endpoints in order. There are no provider calls, synthetic provider defaults, LLM calls, or duplicated scientific/solver calculations. Python code and scientific rules are unchanged.

This is a synchronous internal-use MVP exposed through the Node API. It requires a running MySQL database with the new migration applied and the matching Python service. It is not a durable background job system. Do not expose these routes to untrusted clients before authentication, authorization, rate limits, and tenant isolation are implemented.

## API and input contract

- `POST /api/v1/planning-runs`: validate the request, persist a run, execute the pipeline, and return HTTP 201 with `{ data: PlanningRun, meta: { correlationId } }`. A created run can end in a failure or infeasibility state; HTTP 201 is not a safety approval.
- `GET /api/v1/planning-runs/:id`: return a validated persisted run, or HTTP 404.
- `GET /api/v1/planning-runs/:id/result`: return a supervisor-oriented projection joining each zone/slot snapshot with provider provenance, thermal output, task/crew safety evidence, and optimizer assignments or infeasibility reason. The projection copies validated evidence and does not recalculate science or optimization.
- Invalid request shapes/references return HTTP 400 before creating a run. Unavailable storage or failed compare-and-set writes return HTTP 503, never an unpersisted successful result.

The shared `PlanningRequestSchema` is the canonical request shape. Contract version is `1.0`. It contains ordered `timeSlots` (`id`, `endAt`), `slotDurationMinutes`, optimizer task/crew/zone inputs, and normalized `snapshots` (thermal inputs plus `slotId`). Tasks additionally carry `workloadCategory`. Crews additionally carry `ppeCategory`, explicit `acclimatization`, and `exposureBudgetRef` for the supplied `maxHeatExposureSlots` budget. The budget must already be confirmed for the planning horizon; Node does not convert acclimatization fractions into time or determine whether a proposed budget is appropriate.

Slots are contiguous, equally spaced interval ends. Each snapshot's timestamp and solar averaging period must match its slot. Missing snapshots for any task zone/slot yield `INSUFFICIENT_DATA`; no interpolation, nearest-snapshot lookup, or weather fetching occurs. The caller is responsible for observations being representative of the whole interval and for correct units, location, workload, PPE, and exposure-budget approval. Duplicate snapshot IDs or zone/slot pairs, unknown references, and mismatched alignment are rejected.

Bounds are 20 tasks, 10 crews, 30 zones, 24 slots, and 720 snapshots, also subject to the existing 1 MB request-body limit. Caller-supplied WBGT decisions, safety feasibility, and optimizer results are not accepted as planning inputs. Availability, dependencies, and preferences retain the optimizer's semantics; Node does not solve or relax them.

## Flow and statuses

`QUEUED -> ALIGNING_DATA -> CALCULATING_THERMAL -> EVALUATING_SAFETY -> OPTIMIZING -> READY_FOR_REVIEW`

Each transition is checked and persisted before the next service stage starts. Provider-backed requests use `FETCHING_FORTYGUARD` and `FETCHING_METEOROLOGY`; caller-normalized requests enter alignment directly. `GENERATING_EXPLANATION` remains unused. ADR 0006 defines provider normalization.

1. Thermal receives the normalized snapshots, contract/model identity, and planning-run ID. Node preserves the model metadata, components, diagnostics, and warnings. Missing/duplicate/mismatched response IDs fail the run. `INVALID_INPUT`/`UNSUPPORTED_INPUT` become `INSUFFICIENT_DATA`; `MODEL_NON_CONVERGENCE` becomes `FAILED`.
2. Safety receives the exact returned Estimated Outdoor WBGT for every task/eligible-crew/zone/slot combination, plus the supplied workload, PPE, and acclimatization. Requests are split at Python's 1000-evaluation limit. `SAME_AS_WORK` is sent only to satisfy the existing compatibility input; no break schedule is inferred. Identity and input echoes are verified. All valid safety responses and rule evidence are retained.
3. All safety decisions, including manual-review decisions, are forwarded unchanged to the optimizer. `INSUFFICIENT_DATA` stops before optimization. Missing responses never become safe entries. The Python optimizer excludes unsupported/manual-review combinations.
4. Python `OPTIMAL` or `FEASIBLE` becomes `READY_FOR_REVIEW`; `INFEASIBLE` remains `INFEASIBLE`; `FAILED` remains `FAILED`. Node checks result coverage, requested task/crew/zone/duration identities, slot bounds, and evidence references before returning assignments. Every returned reference must identify a continuous-work authorization for that occupied slot. This is cross-service provenance validation, not recomputation of constraints or scientific thresholds.

Unknown/malformed responses, version mismatch, non-2xx HTTP, timeout, connection errors, and malformed JSON yield `FAILED` with a stable error code. The typed client validates outbound and inbound payloads, forwards `x-correlation-id`, rejects redirects, and applies a 30-second timeout to each call. There are no automatic retries or fallback calculations. A failed/insufficient run never contains an automatically usable schedule. Valid earlier-stage diagnostics remain available.

## Persistence and failure recovery

The `PlanningRun` Prisma table stores the run ID, indexed-by-primary-key identity, current status, validated serialized payload, and database timestamps. The payload includes the original normalized request, status history, completed stage responses, final optimizer result, and error. LongText stores JSON without unsafe Prisma casts; the full payload is validated on both write and read. Updates compare the prior status so stale writes cannot silently advance a run. No production in-memory store or fake database fallback exists.

Apply `pnpm --filter @heatops/api prisma:migrate` before enabling the endpoint. Generate Prisma Client and build `@heatops/contracts` before API lint/typecheck/start; CI performs both prerequisites.

If the process crashes or storage fails, the row may remain at its last persisted nonterminal status. It is not treated as successful, and this MVP does not automatically resume it. Safety chunks are accumulated until the next transition; a crash can require a fresh run. Add durable jobs, recovery, idempotency, cancellation, retention, per-stage timestamps, and concurrency control in separate work. Separate plans do not coordinate competing crew assignments. No production readiness or safety guarantee is implied by `READY_FOR_REVIEW`.

## Tests and deployment checks

Focused tests exercise the three-stage payload flow, exact WBGT forwarding, retained diagnostics/evidence, correlation propagation, manual review, infeasibility, solver failure, missing/invalid responses, missing snapshots, batching, persistence failures, status compare-and-set, malformed API requests, and retrieval. Test transport fixtures are synthetic and live only in test code.

Run shared/API lint, typecheck, tests, builds, Prisma validation/generation, formatting, and Python regressions. A live MySQL migration and end-to-end deployment smoke test remain necessary wherever local MySQL or the native Python build toolchain is unavailable. Unit tests of the Prisma adapter do not establish that a migration has been applied.
