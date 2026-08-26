# P1 — Implement validated NIOSH work/rest curves

## Scientific gap

NIOSH Publication 2016-106 provides the standard continuous-work RAL and REL equations and separately presents curves for 60, 45, 30, and 15 minutes of work per hour in Figures 8-1 and 8-2. The publication does not provide explicit equations for every curve.

The standard RAL/REL equations alone must not be represented as providing all four curves. Applying those equations to a synthesized hourly TWA metabolic rate is not an accepted substitute for the authoritative work/rest curves.

## Required future work

Before automating 45/15, 30/30, or 15/45, derive numerical thresholds defensibly from the authoritative figures or another validated authoritative representation. Document the extraction method, uncertainty, applicability conditions, recovery assumptions, independent reference calculations, boundary semantics, and scientific review. Version the ruleset if behavior changes.

Until that work is complete, P0-03 evaluates only continuous-work RAL/REL limits and sends exceedances to detailed occupational work/rest review.
