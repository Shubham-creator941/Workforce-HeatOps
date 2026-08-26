"""Typed adapter around the preserved Liljegren WBGT 1.1 implementation."""

import math
from datetime import UTC

from app.contracts.thermal import (
    FailedThermalResult,
    ThermalComponents,
    ThermalDiagnostics,
    ThermalError,
    ThermalInput,
    ThermalItemResult,
    ValidThermalResult,
)
from app.thermal import _liljegren
from app.thermal.models import NativeThermalResult
from app.thermal.validation import validate_thermal_input

MODEL_NAME = "liljegren"
IMPLEMENTATION_VERSION = "1.0.0"
REFERENCE_CODE_VERSION = "WBGT 1.1"
SCIENTIFIC_REFERENCE = "Liljegren et al. 2008"
REFERENCE_MINIMUM_WIND_SPEED_MS = 0.13


class LiljegrenThermalEngine:
    """Deterministic, offline adapter for Estimated Outdoor WBGT."""

    def estimate(self, input_data: ThermalInput) -> ThermalItemResult:
        failure = validate_thermal_input(input_data)
        if failure is not None:
            return failure

        timestamp = input_data.timestamp.astimezone(UTC)
        values = _liljegren.estimate(
            timestamp.year,
            timestamp.month,
            timestamp.day,
            timestamp.hour,
            timestamp.minute,
            input_data.solar_averaging_period_minutes,
            input_data.latitude,
            input_data.longitude,
            input_data.solar_radiation_wm2,
            input_data.surface_pressure_hpa,
            input_data.air_temperature_c,
            input_data.relative_humidity_percent,
            input_data.wind_speed_ms,
            input_data.wind_measurement_height_m,
        )
        native = NativeThermalResult(*values)
        if native.status != 0 or not all(
            math.isfinite(value)
            for value in (
                native.globe_temperature_c,
                native.natural_wet_bulb_temperature_c,
                native.psychrometric_wet_bulb_temperature_c,
                native.estimated_wbgt_c,
            )
        ):
            return FailedThermalResult(
                snapshotId=input_data.snapshot_id,
                status="MODEL_NON_CONVERGENCE",
                error=ThermalError(
                    code="THERMAL_MODEL_NON_CONVERGENCE",
                    message="Liljegren WBGT 1.1 did not converge for this input.",
                ),
            )

        warnings: list[str] = []
        if input_data.wind_speed_ms < REFERENCE_MINIMUM_WIND_SPEED_MS:
            warnings.append(
                "WBGT 1.1 applied its documented 0.13 m/s minimum wind speed "
                "in convective heat-transfer calculations."
            )
        if not math.isclose(
            native.adjusted_solar_radiation_wm2,
            input_data.solar_radiation_wm2,
            rel_tol=0.0,
            abs_tol=1e-9,
        ):
            warnings.append(
                "WBGT 1.1 capped solar radiation to its top-of-atmosphere normalized-solar limit."
            )

        return ValidThermalResult(
            snapshotId=input_data.snapshot_id,
            status="VALID",
            estimatedWbgtC=native.estimated_wbgt_c,
            components=ThermalComponents(
                globeTemperatureC=native.globe_temperature_c,
                naturalWetBulbTemperatureC=native.natural_wet_bulb_temperature_c,
                psychrometricWetBulbTemperatureC=native.psychrometric_wet_bulb_temperature_c,
            ),
            modelDiagnostics=ThermalDiagnostics(
                effectiveWindSpeedMs=max(
                    input_data.wind_speed_ms, REFERENCE_MINIMUM_WIND_SPEED_MS
                ),
                adjustedSolarRadiationWm2=native.adjusted_solar_radiation_wm2,
                cosineSolarZenith=native.cosine_solar_zenith,
            ),
            warnings=warnings,
        )
