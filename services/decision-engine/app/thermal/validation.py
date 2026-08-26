"""Explicit item-level scientific input validation."""

import math

from app.contracts.thermal import FailedThermalResult, ThermalInput


def _failure(
    item: ThermalInput, status: str, code: str, message: str
) -> FailedThermalResult:
    return FailedThermalResult.model_validate(
        {
            "snapshotId": item.snapshot_id,
            "status": status,
            "error": {"code": code, "message": message},
            "warnings": [],
        }
    )


def validate_thermal_input(item: ThermalInput) -> FailedThermalResult | None:
    """Return an item failure or None; never clamp or infer an input."""
    if not -90.0 <= item.latitude <= 90.0:
        return _failure(
            item, "INVALID_INPUT", "THERMAL_INPUT_INVALID", "Latitude must be between -90 and 90."
        )
    if not -180.0 <= item.longitude <= 180.0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Longitude must be between -180 and 180.",
        )
    if not 0.0 <= item.relative_humidity_percent <= 100.0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Relative humidity must be between 0 and 100 percent.",
        )
    if item.solar_radiation_wm2 < 0.0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Solar radiation must be non-negative W/m².",
        )
    if item.surface_pressure_hpa <= 0.0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Surface pressure must be positive hPa.",
        )
    if item.wind_speed_ms < 0.0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Wind speed must be non-negative m/s.",
        )
    if item.wind_measurement_height_m <= 0.0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Wind measurement height must be positive meters.",
        )
    if item.timestamp.tzinfo is None or item.timestamp.utcoffset() is None:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Timestamp must include a UTC offset.",
        )
    if item.air_temperature_c <= -273.15:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Air temperature must be above absolute zero.",
        )
    if item.solar_averaging_period_minutes <= 0:
        return _failure(
            item,
            "INVALID_INPUT",
            "THERMAL_INPUT_INVALID",
            "Solar averaging period must be a positive number of minutes.",
        )
    if item.timestamp.second != 0 or item.timestamp.microsecond != 0:
        return _failure(
            item,
            "UNSUPPORTED_INPUT",
            "THERMAL_INPUT_UNSUPPORTED",
            "WBGT 1.1 accepts minute-resolution timestamps; seconds must be zero.",
        )
    if not 1950 <= item.timestamp.year <= 2049:
        return _failure(
            item,
            "UNSUPPORTED_INPUT",
            "THERMAL_INPUT_UNSUPPORTED",
            "WBGT 1.1 solar position is supported only for years 1950 through 2049.",
        )
    if not math.isclose(item.wind_measurement_height_m, 2.0, rel_tol=0.0, abs_tol=1e-9):
        return _failure(
            item,
            "UNSUPPORTED_INPUT",
            "THERMAL_WIND_HEIGHT_UNSUPPORTED",
            "P0-02 supports wind measured at 2 m only; other heights require "
            "vertical temperature difference and site surface class.",
        )
    return None
