"""Independent tests for the continuous-work-only safety boundary."""

import math

import pytest
from pydantic import ValidationError

from app.contracts.safety import SafetyEvaluationInput
from app.safety.acclimatization import max_heat_exposure_fraction
from app.safety.engine import Niosh2016SafetyEngine
from app.safety.exposure_limits import ral_wbgt_c, rel_wbgt_c

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


@pytest.mark.parametrize(
    "category,watts", [("LIGHT", 180), ("MODERATE", 300), ("HEAVY", 415), ("VERY_HEAVY", 520)]
)
def test_continuous_work_categories(category: str, watts: float) -> None:
    threshold = rel_wbgt_c(watts)
    result = engine.evaluate(item(workloadCategory=category, estimatedWbgtC=threshold))
    assert result.decision == "CONTINUOUS_WORK_ALLOWED"
    assert result.max_work_minutes_per_hour == 60
    assert result.required_rest_minutes_per_hour == 0
    assert result.applicable_continuous_work_limit_wbgt_c == threshold


def test_boundary_below_and_equality_pass_above_requires_review() -> None:
    threshold = rel_wbgt_c(415.0)
    for wbgt in (threshold - 1e-9, threshold):
        assert engine.evaluate(item(estimatedWbgtC=wbgt)).decision == "CONTINUOUS_WORK_ALLOWED"
    result = engine.evaluate(item(estimatedWbgtC=threshold + 1e-9))
    assert result.decision == "MANUAL_REVIEW_REQUIRED"
    assert result.reason is not None
    assert result.reason.code == "DETAILED_WORK_REST_ASSESSMENT_REQUIRED"
    assert result.margin_c is not None and result.margin_c < 0


def test_exceedance_never_synthesizes_work_rest_pattern() -> None:
    result = engine.evaluate(item(estimatedWbgtC=30.0))
    assert result.decision == "MANUAL_REVIEW_REQUIRED"
    assert result.max_work_minutes_per_hour is None
    assert result.required_rest_minutes_per_hour is None
    dumped = result.model_dump(by_alias=True)
    assert "selectedPattern" not in dumped
    assert "candidateEvaluations" not in dumped


@pytest.mark.parametrize(
    "ppe,caf",
    [
        ("NORMAL_WORK_CLOTHING", 0.0),
        ("SMS_COVERALLS", 0.5),
        ("POLYOLEFIN_COVERALLS", 1.0),
        ("DOUBLE_LAYER_CLOTH", 3.0),
        ("VAPOR_BARRIER_LIMITED_USE", 11.0),
    ],
)
def test_clothing_adjustments(ppe: str, caf: float) -> None:
    result = engine.evaluate(item(estimatedWbgtC=10.0, ppeCategory=ppe))
    assert result.clothing_adjustment_c == caf
    assert result.effective_work_wbgt_c == 10.0 + caf


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


@pytest.mark.parametrize("day,expected", [(1, .2), (2, .4), (3, .6), (4, .8), (5, 1), (7, 1)])
def test_new_worker_ramp(day: int, expected: float) -> None:
    assert max_heat_exposure_fraction("NEW_WORKER_RAMP", day) == expected


@pytest.mark.parametrize("day,expected", [(1, .5), (2, .6), (3, .8), (4, 1), (8, 1)])
def test_returning_worker_ramp(day: int, expected: float) -> None:
    assert max_heat_exposure_fraction("RETURNING_WORKER_RAMP", day) == expected


def test_new_worker_day_seven_still_uses_ral() -> None:
    result = engine.evaluate(item(acclimatization={"state": "NEW_WORKER_RAMP", "day": 7}))
    assert result.limit_type == "RAL"
    assert result.acclimatization_constraint is not None
    assert result.acclimatization_constraint.max_heat_exposure_fraction == 1.0


def test_rule_evidence_is_returned() -> None:
    result = engine.evaluate(item())
    assert {entry.rule_id for entry in result.rule_evidence} >= {
        "NIOSH_2016_REL_EQUATION",
        "OSHA_NIOSH_WORKLOAD_METABOLIC_RATES",
        "OSHA_NIOSH_CLOTHING_ADJUSTMENT_FACTORS",
    }


def test_deterministic() -> None:
    request = item(estimatedWbgtC=27.2)
    assert engine.evaluate(request).model_dump() == engine.evaluate(request).model_dump()


def test_invalid_ramp_day_rejected() -> None:
    with pytest.raises(ValidationError):
        item(acclimatization={"state": "NEW_WORKER_RAMP", "day": 0})
