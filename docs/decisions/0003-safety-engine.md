# ADR 0003: deterministic NIOSH occupational heat-safety engine

## Context

P0-02 produces Estimated Outdoor WBGT. P0-03 must turn that value and supervisor-confirmed operational context into an auditable occupational constraint without providers, persistence, AI, or scheduling.

## Authoritative sources

NIOSH Publication 2016-106 is primary. OSHA Heat Hazard Recognition supplies public screening workload and clothing values. Current NIOSH acclimatization guidance supplies exposure ramps.

## Decision

Use immutable `NIOSH_2016_MVP_V1`. NIOSH RAL/REL base-10 equations are authoritative for the automated continuous-work decision; rounded OSHA continuous-work values are cross-checks only. Unsupported PPE, unclassified workload, and unknown acclimatization fail to manual review.

The multi-day acclimatization exposure fraction remains separate from the continuous-work thermal decision and never changes the supervisor-supplied state. Safety produces hard machine-readable constraints; it is not an optimization objective.

NIOSH Figures 8-1 and 8-2 separately show 60-, 45-, 30-, and 15-minute work-per-hour curves, but the publication does not give explicit equations for all curves. Applying continuous RAL/REL equations to a synthesized TWA metabolic rate is not accepted as an equivalent implementation. P0-03 automates only 60/0. Exceedance requires detailed occupational work/rest review and does not emit a break schedule or `RESCHEDULE_REQUIRED`.

## Consequences

The current safety engine automatically evaluates continuous-work RAL/REL limits. When that threshold is exceeded, detailed occupational work/rest review is required rather than synthesizing an unsupported break schedule. Work/rest minutes are null during manual review, not an inferred break prescription. Even a cooler supplied recovery environment cannot change this decision boundary.

Results are deterministic, offline, explainable, and independently testable. They expose the continuous limit and margin for future consumers without inventing optimizer-ready break capacity. Behavioral rule changes require source verification, review, tests, and a new ruleset version.

## Limitations and future work

Rates are typical screening values based on an approximately 70 kg worker, not personal measurements. The result is NIOSH/OSHA guidance-aligned decision support, not certification, medical risk, or a guarantee. Future revisions may encode the separate work/rest curves only after defensible numerical derivation and validation against an authoritative representation.
