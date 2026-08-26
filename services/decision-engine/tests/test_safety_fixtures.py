"""Golden decisions independently specified in source-controlled fixtures."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.contracts.safety import SafetyEvaluationInput
from app.safety.engine import Niosh2016SafetyEngine

FIXTURE_ROOT = Path(__file__).parents[3] / "fixtures" / "safety"
FIXTURES = sorted(FIXTURE_ROOT.glob("*.json"))


@pytest.mark.parametrize("path", FIXTURES, ids=lambda path: path.stem)
def test_golden_fixture_decision(path: Path) -> None:
    fixture: dict[str, Any] = json.loads(path.read_text())
    result = Niosh2016SafetyEngine().evaluate(
        SafetyEvaluationInput.model_validate(fixture["input"])
    )
    expected = fixture["expected"]
    assert result.decision == expected["decision"]
    if "clothingAdjustmentC" in expected:
        assert result.clothing_adjustment_c == expected["clothingAdjustmentC"]
    if "effectiveWorkWbgtC" in expected:
        assert result.effective_work_wbgt_c == expected["effectiveWorkWbgtC"]
    if "maxHeatExposureFraction" in expected:
        assert result.acclimatization_constraint is not None
        assert (
            result.acclimatization_constraint.max_heat_exposure_fraction
            == expected["maxHeatExposureFraction"]
        )
    if "limitType" in expected:
        assert result.limit_type == expected["limitType"]
