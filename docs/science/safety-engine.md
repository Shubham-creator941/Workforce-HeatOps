# Deterministic occupational heat-safety engine

## Scope and sources

`NIOSH_2016_MVP_V1` turns a valid **Estimated Outdoor WBGT** into reproducible NIOSH/OSHA guidance-aligned occupational heat-planning decision support. It is not a legal-compliance checker, medical assessment, prediction, or guarantee of safety.

The primary source is DHHS (NIOSH) Publication 2016-106, _Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments_ (2016). OSHA's public Heat Hazard Recognition material supplies screening workload rates and Clothing Adjustment Factors. Current NIOSH acclimatization guidance supplies the gradual-exposure fractions.

The frozen values were rechecked on 2026-08-26 against the official [NIOSH 2016 criteria publication](https://www.cdc.gov/niosh/docs/2016-106/default.html), [OSHA Heat Hazard Recognition](https://www.osha.gov/heat-exposure/hazards), and [NIOSH acclimatization guidance](https://www.cdc.gov/niosh/heat-stress/recommendations/acclimatization.html).

## Workload and clothing

Screening metabolic rates are rest 115 W, light 180 W, moderate 300 W, heavy 415 W, and very heavy 520 W. OSHA notes that typical rates assume approximately a 70 kg worker; they are not individual measurements. Workload is supplied upstream and supervisor-confirmed.

Clothing Adjustment Factors are 0 °C for normal work clothing and cloth coveralls, 0.5 °C for SMS coveralls, 1 °C for polyolefin coveralls, 3 °C for double-layer cloth, and 11 °C for limited-use vapor-barrier clothing. Unknown or unsupported ensembles require manual review and never default to zero. Effective WBGT is Estimated Outdoor WBGT plus the applicable factor.

## Validated continuous-work limits

The unacclimatized Recommended Alert Limit is `59.9 - 14.1 × log10(M)` and the acclimatized Recommended Exposure Limit is `56.7 - 11.5 × log10(M)`, in °C-WBGT for metabolic rate `M` in watts. Full precision is used.

P0-03 automatically evaluates only the continuous-work RAL/REL limit using the confirmed workload metabolic rate. Acclimatized inputs use REL; new- and returning-worker ramp inputs use RAL. Equality passes. Margin is the applicable continuous-work limit minus Effective WBGT; it is not a risk score.

## Work/rest scientific boundary

The current safety engine automatically evaluates continuous-work RAL/REL limits. When that threshold is exceeded, detailed occupational work/rest review is required rather than synthesizing an unsupported break schedule.

For supported inputs, each result exposes `estimatedWbgtC`, `clothingAdjustmentC`, `effectiveWorkWbgtC`, `workloadCategory`, `workMetabolicRateWatts`, `limitType`, `applicableContinuousWorkLimitWbgtC`, `marginC`, and `ruleEvidence`. The batch envelope supplies `rulesetVersion`. Equality is allowed with 60 work minutes and 0 rest minutes; exceedance returns null work/rest minutes and `reason.code = DETAILED_WORK_REST_ASSESSMENT_REQUIRED`. The reason is nested under `reason`, not a top-level `reasonCode` field.

NIOSH Publication 2016-106 gives the standard RAL/REL equations and separately presents 60-, 45-, 30-, and 15-minute work-per-hour curves in Figures 8-1 and 8-2. It does not provide explicit equations for all four curves. The standard equations alone must not be represented as reproducing those separate curves.

P0-03 therefore does not synthesize 45/15, 30/30, or 15/45 prescriptions using metabolic or environmental TWA. When Effective WBGT exceeds the continuous-work limit, it returns `MANUAL_REVIEW_REQUIRED` with `DETAILED_WORK_REST_ASSESSMENT_REQUIRED`. An appropriate work/rest regimen or other occupational control may exist, but it requires a detailed assessment outside this validated MVP boundary.

The recovery-environment object remains in contract version 1.0 for compatibility but does not affect the continuous-work calculation because a 60/0 decision has no recovery interval.

See [Implement validated NIOSH work/rest curves](p1-validated-work-rest-curves.md) for the independent scientific validation required before automated 45/30/15-minute decisions.

## Acclimatization

New-worker fractions are 0.20, 0.40, 0.60, 0.80, then 1.00. Returning-worker fractions are 0.50, 0.60, 0.80, then 1.00. This multi-day constraint is separate from hourly RAL/REL evaluation. A fraction of 1.00 never self-promotes a worker to acclimatized; state remains supervisor-confirmed. Fractions refer to usual hot-work exposure and are not converted to shift minutes.

## Manual review and limitations

Unclassified workload, unsupported or unknown PPE, unknown acclimatization, and continuous-limit exceedance produce `MANUAL_REVIEW_REQUIRED`. No values are clamped or inferred. The engine has no network, database, provider, LLM, thermal calculation, persistence, or optimizer access. AI is excluded because safety constants and comparisons must remain deterministic, reviewable, and reproducible.
