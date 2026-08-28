"""Deterministic, offline occupational heat-safety engine."""

from typing import Protocol, cast

from app.contracts.safety import (
    AcclimatizationConstraint,
    RuleEvidence,
    SafetyEvaluationInput,
    SafetyReason,
    SafetyResult,
)
from app.rules.models import RuleSource
from app.rules.niosh_2016_mvp_v1 import (
    CLOTHING,
    NEW_WORKER,
    NIOSH,
    REL,
    REST_METABOLIC_WATTS,
    RETURNING_WORKER,
    WORKLOAD,
)
from app.safety.acclimatization import limit_type, max_heat_exposure_fraction
from app.safety.clothing import clothing_adjustment
from app.safety.exposure_limits import ral_wbgt_c, rel_wbgt_c
from app.safety.workload import metabolic_rate


class SafetyEngine(Protocol):
    def evaluate(self, input_data: SafetyEvaluationInput) -> SafetyResult: ...


def _evidence(source: RuleSource) -> RuleEvidence:
    return RuleEvidence(
        ruleId=source.rule_id,
        sourceTitle=source.source_title,
        sourceOrganization=source.source_organization,
        sourceYear=source.source_year,
        publicationId=source.publication_id,
    )


class Niosh2016SafetyEngine:
    """Evaluate the frozen NIOSH_2016_MVP_V1 ruleset without I/O."""

    def evaluate(self, input_data: SafetyEvaluationInput) -> SafetyResult:
        workload = input_data.workload_category.value
        ppe = input_data.ppe_category.value
        state = input_data.acclimatization.state.value
        rate = metabolic_rate(workload)
        caf = clothing_adjustment(ppe)
        selected_limit = limit_type(state)
        base = dict(
            evaluationRef=input_data.evaluation_ref,
            thermalEstimateId=input_data.thermal_estimate_id,
            estimatedWbgtC=input_data.estimated_wbgt_c,
            workloadCategory=input_data.workload_category,
            restMetabolicRateWatts=REST_METABOLIC_WATTS,
        )
        if rate is None:
            return self._manual(
                base,
                "WORKLOAD_UNCLASSIFIED",
                "A supervisor must confirm a supported workload category.",
            )
        if caf is None:
            return self._manual(
                base,
                "PPE_CATEGORY_UNSUPPORTED",
                "The supplied clothing ensemble has no adjustment factor "
                "in the supported ruleset.",
                rate,
            )
        if selected_limit is None:
            return self._manual(
                base,
                "ACCLIMATIZATION_UNKNOWN",
                "A supervisor must confirm acclimatization state.",
                rate,
                caf,
            )
        effective_work = input_data.estimated_wbgt_c + caf
        threshold = rel_wbgt_c(rate) if selected_limit == "REL" else ral_wbgt_c(rate)
        margin = threshold - effective_work
        continuous_allowed = margin >= 0.0
        decision = "CONTINUOUS_WORK_ALLOWED" if continuous_allowed else "MANUAL_REVIEW_REQUIRED"
        fraction = max_heat_exposure_fraction(state, input_data.acclimatization.day)
        ramp_source = (
            NEW_WORKER
            if state == "NEW_WORKER_RAMP"
            else RETURNING_WORKER
            if state == "RETURNING_WORKER_RAMP"
            else None
        )
        evidence = [
            _evidence(REL if selected_limit == "REL" else NIOSH),
            _evidence(WORKLOAD),
            _evidence(CLOTHING),
        ]
        if ramp_source is not None:
            evidence.append(_evidence(ramp_source))
        return SafetyResult(
            **base,
            decision=decision,
            clothingAdjustmentC=caf,
            effectiveWorkWbgtC=effective_work,
            workMetabolicRateWatts=rate,
            limitType=selected_limit,
            applicableContinuousWorkLimitWbgtC=threshold,
            marginC=margin,
            maxWorkMinutesPerHour=60 if continuous_allowed else None,
            requiredRestMinutesPerHour=0 if continuous_allowed else None,
            acclimatizationConstraint=AcclimatizationConstraint(maxHeatExposureFraction=fraction),
            ruleEvidence=evidence,
            reason=None
            if continuous_allowed
            else SafetyReason(
                code="DETAILED_WORK_REST_ASSESSMENT_REQUIRED",
                message=(
                    "The continuous-work NIOSH RAL/REL limit is exceeded. P0-03 does not "
                    "automatically prescribe a work/rest regimen because the NIOSH 45/30/15 "
                    "work-rest curves have not yet been encoded and validated."
                ),
            ),
        )

    def _manual(
        self,
        base: dict[str, object],
        code: str,
        message: str,
        rate: float | None = None,
        caf: float | None = None,
    ) -> SafetyResult:
        return SafetyResult(
            **base,
            decision="MANUAL_REVIEW_REQUIRED",
            clothingAdjustmentC=caf,
            effectiveWorkWbgtC=None if caf is None else cast(float, base["estimatedWbgtC"]) + caf,
            workMetabolicRateWatts=rate,
            limitType=None,
            applicableContinuousWorkLimitWbgtC=None,
            marginC=None,
            maxWorkMinutesPerHour=None,
            requiredRestMinutesPerHour=None,
            acclimatizationConstraint=None,
            ruleEvidence=[],
            reason=SafetyReason(code=code, message=message),
        )
