"""Deterministic, offline occupational heat-safety engine."""

from typing import Protocol, cast

from app.contracts.safety import (
    AcclimatizationConstraint,
    CandidateEvaluation,
    RuleEvidence,
    SafetyEvaluationInput,
    SafetyReason,
    SafetyResult,
)
from app.rules.models import RuleSource
from app.rules.niosh_2016_mvp_v1 import (
    CLOTHING,
    HOURLY_TWA,
    NEW_WORKER,
    NIOSH,
    REL,
    REST_METABOLIC_WATTS,
    RETURNING_WORKER,
    WORK_REST_CANDIDATES,
    WORKLOAD,
)
from app.safety.acclimatization import limit_type, max_heat_exposure_fraction
from app.safety.clothing import clothing_adjustment
from app.safety.exposure_limits import ral_wbgt_c, rel_wbgt_c
from app.safety.workload import metabolic_rate, metabolic_twa


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
        recovery = input_data.recovery_environment
        if recovery.mode.value == "EXPLICIT" and recovery.estimated_wbgt_c is None:
            return self._insufficient(base, rate, caf, selected_limit)

        effective_work = input_data.estimated_wbgt_c + caf
        if recovery.mode.value == "SAME_AS_WORK":
            effective_rest = effective_work
        else:
            effective_rest = cast(float, recovery.estimated_wbgt_c) + caf
        candidates: list[CandidateEvaluation] = []
        for work_minutes, rest_minutes in WORK_REST_CANDIDATES:
            m_twa = metabolic_twa(rate, work_minutes)
            wbgt_twa = (effective_work * work_minutes + effective_rest * rest_minutes) / 60.0
            threshold = rel_wbgt_c(m_twa) if selected_limit == "REL" else ral_wbgt_c(m_twa)
            margin = threshold - wbgt_twa
            candidates.append(
                CandidateEvaluation(
                    workMinutesPerHour=work_minutes,
                    restMinutesPerHour=rest_minutes,
                    metabolicTwaWatts=m_twa,
                    effectiveWbgtTwaC=wbgt_twa,
                    limitType=selected_limit,
                    applicableLimitWbgtC=threshold,
                    passes=margin >= 0.0,
                    marginC=margin,
                )
            )
        chosen = next((candidate for candidate in candidates if candidate.passes), None)
        decision = (
            "RESCHEDULE_REQUIRED"
            if chosen is None
            else (
                "CONTINUOUS_WORK_ALLOWED"
                if chosen.work_minutes_per_hour == 60
                else "WORK_REST_REQUIRED"
            )
        )
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
            _evidence(HOURLY_TWA),
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
            selectedPattern=chosen,
            maxWorkMinutesPerHour=chosen.work_minutes_per_hour if chosen else 0,
            requiredRestMinutesPerHour=chosen.rest_minutes_per_hour if chosen else None,
            acclimatizationConstraint=AcclimatizationConstraint(maxHeatExposureFraction=fraction),
            candidateEvaluations=candidates,
            ruleEvidence=evidence,
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
            selectedPattern=None,
            maxWorkMinutesPerHour=None,
            requiredRestMinutesPerHour=None,
            acclimatizationConstraint=None,
            candidateEvaluations=[],
            ruleEvidence=[],
            reason=SafetyReason(code=code, message=message),
        )

    def _insufficient(
        self, base: dict[str, object], rate: float, caf: float, selected_limit: str
    ) -> SafetyResult:
        return SafetyResult(
            **base,
            decision="INSUFFICIENT_DATA",
            clothingAdjustmentC=caf,
            effectiveWorkWbgtC=cast(float, base["estimatedWbgtC"]) + caf,
            workMetabolicRateWatts=rate,
            limitType=selected_limit,
            selectedPattern=None,
            maxWorkMinutesPerHour=None,
            requiredRestMinutesPerHour=None,
            acclimatizationConstraint=None,
            candidateEvaluations=[],
            ruleEvidence=[],
            reason=SafetyReason(
                code="RECOVERY_WBGT_REQUIRED",
                message="EXPLICIT recovery mode requires estimatedWbgtC.",
            ),
        )
