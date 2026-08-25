"""Scientific equivalence and invariant tests for the Liljegren adapter."""

import json
import math
from pathlib import Path
from typing import TypedDict, cast

import pytest
from pydantic import ValidationError

from app.contracts.thermal import FailedThermalResult, ThermalInput, ValidThermalResult
from app.thermal.liljegren import LiljegrenThermalEngine

FIXTURE_DIRECTORY = Path(__file__).parents[3] / "fixtures" / "thermal"
REFERENCE_TOLERANCE_C = 1e-10


class ExpectedValues(TypedDict):
    globeTemperatureC: float
    naturalWetBulbTemperatureC: float
    psychrometricWetBulbTemperatureC: float
    estimatedWbgtC: float


class GoldenFixture(TypedDict):
    input: dict[str, object]
    expected: ExpectedValues


def load_golden(name: str) -> GoldenFixture:
    return cast(
        GoldenFixture,
        json.loads((FIXTURE_DIRECTORY / name).read_text(encoding="utf-8")),
    )


def thermal_input(values: dict[str, object]) -> ThermalInput:
    return ThermalInput.model_validate(values)


@pytest.mark.parametrize(
    "fixture_name",
    [
        "reference_daytime_hot.json",
        "reference_daytime_humid.json",
        "reference_low_solar.json",
        "reference_nighttime.json",
        "reference_low_wind.json",
    ],
)
def test_matches_standalone_reference_oracle(fixture_name: str) -> None:
    fixture = load_golden(fixture_name)
    result = LiljegrenThermalEngine().estimate(thermal_input(fixture["input"]))
    assert isinstance(result, ValidThermalResult)
    expected = fixture["expected"]
    assert result.estimated_wbgt_c == pytest.approx(
        expected["estimatedWbgtC"], abs=REFERENCE_TOLERANCE_C
    )
    assert result.components.globe_temperature_c == pytest.approx(
        expected["globeTemperatureC"], abs=REFERENCE_TOLERANCE_C
    )
    assert result.components.natural_wet_bulb_temperature_c == pytest.approx(
        expected["naturalWetBulbTemperatureC"], abs=REFERENCE_TOLERANCE_C
    )
    assert result.components.psychrometric_wet_bulb_temperature_c == pytest.approx(
        expected["psychrometricWetBulbTemperatureC"], abs=REFERENCE_TOLERANCE_C
    )


def test_outdoor_wbgt_composition_invariant() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    item = thermal_input(fixture["input"])
    result = LiljegrenThermalEngine().estimate(item)
    assert isinstance(result, ValidThermalResult)
    composed = (
        0.1 * item.air_temperature_c
        + 0.2 * result.components.globe_temperature_c
        + 0.7 * result.components.natural_wet_bulb_temperature_c
    )
    assert result.estimated_wbgt_c == pytest.approx(composed, abs=1e-12)


def test_timezone_equivalent_instants_are_identical() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    first = fixture["input"] | {"timestamp": "2026-08-27T13:00:00-07:00"}
    second = fixture["input"] | {"timestamp": "2026-08-27T20:00:00Z"}
    engine = LiljegrenThermalEngine()
    assert engine.estimate(thermal_input(first)) == engine.estimate(thermal_input(second))


def test_repeated_calculation_is_deterministic() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    item = thermal_input(fixture["input"])
    engine = LiljegrenThermalEngine()
    assert [engine.estimate(item) for _ in range(20)] == [engine.estimate(item)] * 20


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("latitude", 91.0),
        ("longitude", -181.0),
        ("relativeHumidityPercent", 101.0),
        ("surfacePressureHpa", 0.0),
        ("solarRadiationWm2", -1.0),
        ("windSpeedMs", -0.1),
        ("windMeasurementHeightM", 0.0),
    ],
)
def test_invalid_scientific_input_is_explicit(field: str, value: float) -> None:
    fixture = load_golden("reference_daytime_hot.json")
    result = LiljegrenThermalEngine().estimate(
        thermal_input(fixture["input"] | {field: value})
    )
    assert isinstance(result, FailedThermalResult)
    assert result.status == "INVALID_INPUT"
    assert result.error.code == "THERMAL_INPUT_INVALID"


@pytest.mark.parametrize("value", [math.nan, math.inf, -math.inf])
def test_non_finite_values_are_rejected_structurally(value: float) -> None:
    fixture = load_golden("reference_daytime_hot.json")
    with pytest.raises(ValidationError):
        thermal_input(fixture["input"] | {"airTemperatureC": value})


def test_naive_timestamp_is_an_item_failure() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    result = LiljegrenThermalEngine().estimate(
        thermal_input(fixture["input"] | {"timestamp": "2026-08-27T20:00:00"})
    )
    assert isinstance(result, FailedThermalResult)
    assert result.status == "INVALID_INPUT"


def test_non_two_meter_wind_is_explicitly_unsupported() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    result = LiljegrenThermalEngine().estimate(
        thermal_input(fixture["input"] | {"windMeasurementHeightM": 10.0})
    )
    assert isinstance(result, FailedThermalResult)
    assert result.status == "UNSUPPORTED_INPUT"
    assert result.error.code == "THERMAL_WIND_HEIGHT_UNSUPPORTED"


def test_reference_minimum_wind_is_exposed() -> None:
    fixture = load_golden("reference_low_wind.json")
    result = LiljegrenThermalEngine().estimate(thermal_input(fixture["input"]))
    assert isinstance(result, ValidThermalResult)
    assert result.model_diagnostics.effective_wind_speed_ms == 0.13
    assert result.warnings


def test_reference_solar_cap_is_exposed() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    result = LiljegrenThermalEngine().estimate(
        thermal_input(fixture["input"] | {"solarRadiationWm2": 2000.0})
    )
    assert isinstance(result, ValidThermalResult)
    assert result.model_diagnostics.adjusted_solar_radiation_wm2 < 2000.0
    assert result.warnings


def test_model_non_convergence_is_not_replaced_by_a_fallback() -> None:
    fixture = load_golden("reference_daytime_hot.json")
    result = LiljegrenThermalEngine().estimate(
        thermal_input(fixture["input"] | {"surfacePressureHpa": 1.0})
    )
    assert isinstance(result, FailedThermalResult)
    assert result.status == "MODEL_NON_CONVERGENCE"
    assert result.error.code == "THERMAL_MODEL_NON_CONVERGENCE"


def test_outputs_are_finite_for_reference_cases() -> None:
    for fixture_name in (
        "reference_daytime_hot.json",
        "reference_daytime_humid.json",
        "reference_nighttime.json",
    ):
        result = LiljegrenThermalEngine().estimate(
            thermal_input(load_golden(fixture_name)["input"])
        )
        assert isinstance(result, ValidThermalResult)
        assert math.isfinite(result.estimated_wbgt_c)
