# Deterministic occupational heat-safety engine

## Scope and sources

`NIOSH_2016_MVP_V1` turns a valid **Estimated Outdoor WBGT** into reproducible NIOSH/OSHA guidance-aligned occupational heat-planning decision support. It is not a legal-compliance checker, medical assessment, prediction, or guarantee of safety.

The primary source is DHHS (NIOSH) Publication 2016-106, _Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments_ (2016). OSHA's public Heat Hazard Recognition material supplies screening workload rates and Clothing Adjustment Factors. Current NIOSH acclimatization guidance supplies the gradual-exposure fractions.

The frozen values were rechecked on 2026-08-26 against the official [NIOSH 2016 criteria publication](https://www.cdc.gov/niosh/docs/2016-106/default.html), [OSHA Heat Hazard Recognition](https://www.osha.gov/heat-exposure/hazards), and [NIOSH acclimatization guidance](https://www.cdc.gov/niosh/heat-stress/recommendations/acclimatization.html).

## Workload and clothing

Screening metabolic rates are rest 115 W, light 180 W, moderate 300 W, heavy 415 W, and very heavy 520 W. OSHA notes that typical rates assume approximately a 70 kg worker; they are not individual measurements. Workload is supplied upstream and supervisor-confirmed.

Clothing Adjustment Factors are 0 °C for normal work clothing and cloth coveralls, 0.5 °C for SMS coveralls, 1 °C for polyolefin coveralls, 3 °C for double-layer cloth, and 11 °C for limited-use vapor-barrier clothing. Unknown or unsupported ensembles require manual review and never default to zero. Effective WBGT is Estimated Outdoor WBGT plus the applicable factor.

## Limits and hourly TWA

The unacclimatized Recommended Alert Limit is `59.9 - 14.1 × log10(M)` and the acclimatized Recommended Exposure Limit is `56.7 - 11.5 × log10(M)`, in °C-WBGT for metabolic rate `M` in watts. Full precision is used.

Each candidate hour evaluates metabolic TWA `(Mwork × W + 115 × R) / 60` and Effective WBGT TWA `(WBGTwork × W + WBGTrecovery × R) / 60`. Acclimatized inputs use REL; new- and returning-worker ramp inputs use RAL. Equality passes. Margin is limit minus Effective WBGT TWA.

## Work/rest and recovery policies

The ordered candidate set `60/0`, `45/15`, `30/30`, `15/45`, and selection of the most productive passing candidate are Workforce HeatOps MVP engineering policies, not claims about a mandated NIOSH API. `SAME_AS_WORK` is an explicit conservative recovery assumption. `EXPLICIT` requires a supplied recovery Estimated Outdoor WBGT. The same clothing ensemble is assumed during work and recovery. Rest placement within the hour belongs to the future optimizer.

If no candidate passes, `RESCHEDULE_REQUIRED` means only that no supported automated candidate passed under supplied conditions. It does not rule out other occupational controls.

## Acclimatization

New-worker fractions are 0.20, 0.40, 0.60, 0.80, then 1.00. Returning-worker fractions are 0.50, 0.60, 0.80, then 1.00. This multi-day constraint is separate from hourly RAL/REL evaluation. A fraction of 1.00 never self-promotes a worker to acclimatized; state remains supervisor-confirmed. Fractions refer to usual hot-work exposure and are not converted to shift minutes.

## Manual review and limitations

Unclassified workload, unsupported or unknown PPE, and unknown acclimatization produce `MANUAL_REVIEW_REQUIRED`. Missing explicit recovery WBGT produces `INSUFFICIENT_DATA`. No values are clamped or inferred. The engine has no network, database, provider, LLM, thermal calculation, persistence, or optimizer access. AI is excluded because safety constants and comparisons must remain deterministic, reviewable, and reproducible.
