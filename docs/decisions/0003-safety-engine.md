# ADR 0003: deterministic NIOSH occupational heat-safety engine

## Context

P0-02 produces Estimated Outdoor WBGT. P0-03 must turn that value and supervisor-confirmed operational context into an auditable occupational constraint without providers, persistence, AI, or scheduling.

## Authoritative sources

NIOSH Publication 2016-106 is primary. OSHA Heat Hazard Recognition supplies public screening workload and clothing values. Current NIOSH acclimatization guidance supplies exposure ramps.

## Decision

Use immutable `NIOSH_2016_MVP_V1`. NIOSH RAL/REL base-10 equations are primary; rounded OSHA continuous-work values are cross-checks only. Evaluate one-hour metabolic and environmental TWA. Unsupported PPE, unclassified workload, and unknown acclimatization fail to manual review.

The multi-day acclimatization exposure fraction remains separate from hourly work/rest and never changes the supervisor-supplied state. Safety produces hard machine-readable constraints; it is not an optimization objective.

Workforce HeatOps MVP policies limit candidates to 60/0, 45/15, 30/30, and 15/45, choose the most productive passing candidate, allow an explicit conservative same-as-work recovery environment, and keep clothing unchanged during recovery. These policies are not attributed to NIOSH as mandated software representations.

## Consequences

Results are deterministic, offline, explainable, independently testable, and optimizer-ready. Behavioral rule changes require source verification, review, tests, and a new ruleset version.

## Limitations and future work

Rates are typical screening values based on an approximately 70 kg worker, not personal measurements. The result is NIOSH/OSHA guidance-aligned decision support, not certification, medical risk, or a guarantee. Future revisions may add validated workload classification, other clothing ensembles, recovery clothing changes, and additional authoritative candidate regimens.
