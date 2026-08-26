"""Independent behavioral tests for the frozen safety ruleset."""

import math

import pytest
from pydantic import ValidationError

from app.contracts.safety import SafetyEvaluationInput
from app.safety.acclimatization import max_heat_exposure_fraction
from app.safety.engine import Niosh2016SafetyEngine
from app.safety.exposure_limits import ral_wbgt_c, rel_wbgt_c
from app.safety.workload import metabolic_twa

engine = Niosh2016SafetyEngine()


def item(**overrides: object) -> SafetyEvaluationInput:
    value: dict[str, object] = {
        "evaluationRef": "eval-1",
        "thermalEstimateId": "thermal-1",
        "estimatedWbgtC": 20.0,
        "workloadCategory": "HEAVY",
        "ppeCategory": "NORMAL_WORK_CLOTHING",
        "acclimatization": {"state": "ACCLIMATIZED"},
        "recoveryEnvironment": {"mode": "SAME_AS_WORK"},
    }
    value.update(overrides)
    return SafetyEvaluationInput.model_validate(value)


@pytest.mark.parametrize("watts", [180.0, 300.0, 415.0, 520.0])
def test_ral_equation_uses_log10(watts: float) -> None:
    assert ral_wbgt_c(watts) == pytest.approx(59.9 - 14.1 * math.log10(watts))


@pytest.mark.parametrize("watts", [180.0, 300.0, 415.0, 520.0])
def test_rel_equation_uses_log10(watts: float) -> None:
    assert rel_wbgt_c(watts) == pytest.approx(56.7 - 11.5 * math.log10(watts))


def test_heavy_45_15_metabolic_twa() -> None:
    assert metabolic_twa(415.0, 45) == pytest.approx((415 * 45 + 115 * 15) / 60)


@pytest.mark.parametrize("day,expected", [(1, 0.2), (2, 0.4), (3, 0.6), (4, 0.8), (5, 1), (7, 1)])
def test_new_worker_ramp(day: int, expected: float) -> None:
    assert max_heat_exposure_fraction("NEW_WORKER_RAMP", day) == expected


@pytest.mark.parametrize("day,expected", [(1, 0.5), (2, 0.6), (3, 0.8), (4, 1), (8, 1)])
def test_returning_worker_ramp(day: int, expected: float) -> None:
    assert max_heat_exposure_fraction("RETURNING_WORKER_RAMP", day) == expected


def test_continuous_work_selected_first() -> None:
    result = engine.evaluate(item())
    assert result.decision == "CONTINUOUS_WORK_ALLOWED"
    assert result.max_work_minutes_per_hour == 60


@pytest.mark.parametrize("wbgt,work", [(27.0, 45), (28.5, 30), (30.0, 15)])
def test_most_productive_passing_candidate(wbgt: float, work: int) -> None:
    result = engine.evaluate(item(estimatedWbgtC=wbgt))
    assert result.selected_pattern is not None
    assert result.selected_pattern.work_minutes_per_hour == work


def test_no_supported_pattern() -> None:
    result = engine.evaluate(item(estimatedWbgtC=50.0))
    assert result.decision == "RESCHEDULE_REQUIRED"
    assert result.max_work_minutes_per_hour == 0


@pytest.mark.parametrize(
    "field,value,code",
    [
        ("ppeCategory", "UNKNOWN", "PPE_CATEGORY_UNSUPPORTED"),
        ("ppeCategory", "UNSUPPORTED", "PPE_CATEGORY_UNSUPPORTED"),
        ("workloadCategory", "UNCLASSIFIED", "WORKLOAD_UNCLASSIFIED"),
    ],
)
def test_manual_review(field: str, value: str, code: str) -> None:
    result = engine.evaluate(item(**{field: value}))
    assert result.decision == "MANUAL_REVIEW_REQUIRED"
    assert result.reason is not None and result.reason.code == code


def test_unknown_acclimatization_requires_review() -> None:
    result = engine.evaluate(item(acclimatization={"state": "UNKNOWN"}))
    assert result.decision == "MANUAL_REVIEW_REQUIRED"


def test_missing_explicit_recovery_is_insufficient() -> None:
    result = engine.evaluate(item(recoveryEnvironment={"mode": "EXPLICIT"}))
    assert result.decision == "INSUFFICIENT_DATA"


def test_explicit_recovery_twa_and_same_clothing() -> None:
    result = engine.evaluate(
        item(
            estimatedWbgtC=30,
            ppeCategory="DOUBLE_LAYER_CLOTH",
            recoveryEnvironment={"mode": "EXPLICIT", "estimatedWbgtC": 20},
        )
    )
    candidate = result.candidate_evaluations[1]
    assert candidate.effective_wbgt_twa_c == pytest.approx((33 * 45 + 23 * 15) / 60)


def test_same_as_work_is_constant_across_patterns() -> None:
    result = engine.evaluate(item(estimatedWbgtC=24.25))
    assert {candidate.effective_wbgt_twa_c for candidate in result.candidate_evaluations} == {24.25}


def test_clothing_adjustments_are_exact() -> None:
    normal = engine.evaluate(item())
    double = engine.evaluate(item(ppeCategory="DOUBLE_LAYER_CLOTH"))
    vapor = engine.evaluate(item(ppeCategory="VAPOR_BARRIER_LIMITED_USE"))
    assert double.effective_work_wbgt_c - normal.effective_work_wbgt_c == 3.0
    assert vapor.effective_work_wbgt_c - normal.effective_work_wbgt_c == 11.0


def test_new_worker_day_seven_still_uses_ral() -> None:
    result = engine.evaluate(item(acclimatization={"state": "NEW_WORKER_RAMP", "day": 7}))
    assert result.limit_type == "RAL"
    assert result.acclimatization_constraint is not None
    assert result.acclimatization_constraint.max_heat_exposure_fraction == 1.0


def test_boundary_equality_passes() -> None:
    threshold = rel_wbgt_c(415.0)
    assert engine.evaluate(item(estimatedWbgtC=threshold)).candidate_evaluations[0].passes
    assert (
        engine.evaluate(item(estimatedWbgtC=threshold + 1e-9)).candidate_evaluations[0].passes
        is False
    )


def test_increasing_wbgt_never_increases_work() -> None:
    values = [
        engine.evaluate(item(estimatedWbgtC=x)).max_work_minutes_per_hour or 0
        for x in (20, 25, 27, 29, 35)
    ]
    assert values == sorted(values, reverse=True)


def test_increasing_clothing_adjustment_never_increases_work() -> None:
    categories = [
        "NORMAL_WORK_CLOTHING",
        "SMS_COVERALLS",
        "POLYOLEFIN_COVERALLS",
        "DOUBLE_LAYER_CLOTH",
        "VAPOR_BARRIER_LIMITED_USE",
    ]
    values = [
        engine.evaluate(item(estimatedWbgtC=25, ppeCategory=category)).max_work_minutes_per_hour
        or 0
        for category in categories
    ]
    assert values == sorted(values, reverse=True)


def test_ral_never_allows_more_work_than_rel() -> None:
    rel = engine.evaluate(item(estimatedWbgtC=27)).max_work_minutes_per_hour or 0
    ral = (
        engine.evaluate(
            item(
                estimatedWbgtC=27,
                acclimatization={"state": "NEW_WORKER_RAMP", "day": 7},
            )
        ).max_work_minutes_per_hour
        or 0
    )
    assert ral <= rel


@pytest.mark.parametrize(
    "watts,ral_rounded,rel_rounded",
    [(180, 28, 30), (300, 25, 28), (415, 23, 26), (520, 21, 25)],
)
def test_continuous_equations_cross_check_public_rounded_values(
    watts: float, ral_rounded: int, rel_rounded: int
) -> None:
    assert abs(ral_wbgt_c(watts) - ral_rounded) <= 1.0
    assert abs(rel_wbgt_c(watts) - rel_rounded) <= 1.0


def test_deterministic() -> None:
    request = item(estimatedWbgtC=27.2)
    assert engine.evaluate(request).model_dump() == engine.evaluate(request).model_dump()


def test_invalid_ramp_day_rejected() -> None:
    with pytest.raises(ValidationError):
        item(acclimatization={"state": "NEW_WORKER_RAMP", "day": 0})
