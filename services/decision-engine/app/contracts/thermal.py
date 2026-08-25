"""Versioned API contracts for deterministic thermal estimation."""

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class ThermalInput(BaseModel):
    """Normalized meteorology for one environmental snapshot.

    Scientific range and semantic validation occurs per item in the engine so a
    bad item does not invalidate otherwise usable batch neighbors.
    """

    model_config = ConfigDict(allow_inf_nan=False)

    snapshot_id: str = Field(alias="snapshotId", min_length=1)
    zone_id: str = Field(alias="zoneId", min_length=1)
    timestamp: datetime
    latitude: float
    longitude: float
    air_temperature_c: float = Field(alias="airTemperatureC")
    relative_humidity_percent: float = Field(alias="relativeHumidityPercent")
    solar_radiation_wm2: float = Field(alias="solarRadiationWm2")
    wind_speed_ms: float = Field(alias="windSpeedMs")
    wind_measurement_height_m: float = Field(alias="windMeasurementHeightM")
    surface_pressure_hpa: float = Field(alias="surfacePressureHpa")
    solar_averaging_period_minutes: int = Field(alias="solarAveragingPeriodMinutes")


class ThermalBatchRequest(BaseModel):
    """Version 1.0 batch request."""

    contract_version: Literal["1.0"] = Field(alias="contractVersion")
    planning_run_id: str = Field(alias="planningRunId", min_length=1)
    model: Literal["LILJEGREN"]
    items: list[ThermalInput] = Field(min_length=1, max_length=1000)


class ThermalComponents(BaseModel):
    globe_temperature_c: float = Field(alias="globeTemperatureC")
    natural_wet_bulb_temperature_c: float = Field(alias="naturalWetBulbTemperatureC")
    psychrometric_wet_bulb_temperature_c: float = Field(
        alias="psychrometricWetBulbTemperatureC"
    )


class ThermalDiagnostics(BaseModel):
    effective_wind_speed_ms: float = Field(alias="effectiveWindSpeedMs")
    adjusted_solar_radiation_wm2: float = Field(alias="adjustedSolarRadiationWm2")
    cosine_solar_zenith: float = Field(alias="cosineSolarZenith")


class ThermalError(BaseModel):
    code: str
    message: str


class ValidThermalResult(BaseModel):
    snapshot_id: str = Field(alias="snapshotId")
    status: Literal["VALID"]
    estimated_wbgt_c: float = Field(alias="estimatedWbgtC")
    components: ThermalComponents
    model_diagnostics: ThermalDiagnostics = Field(alias="modelDiagnostics")
    warnings: list[str]


class FailedThermalResult(BaseModel):
    snapshot_id: str = Field(alias="snapshotId")
    status: Literal["INVALID_INPUT", "MODEL_NON_CONVERGENCE", "UNSUPPORTED_INPUT"]
    error: ThermalError
    warnings: list[str] = Field(default_factory=list)


ThermalItemResult = Annotated[
    ValidThermalResult | FailedThermalResult,
    Field(discriminator="status"),
]


class ThermalModelMetadata(BaseModel):
    name: Literal["liljegren"] = "liljegren"
    implementation_version: Literal["1.0.0"] = Field("1.0.0", alias="implementationVersion")
    reference: Literal["Liljegren et al. 2008"] = "Liljegren et al. 2008"
    reference_code_version: Literal["WBGT 1.1"] = Field("WBGT 1.1", alias="referenceCodeVersion")


class ThermalBatchResponse(BaseModel):
    contract_version: Literal["1.0"] = Field("1.0", alias="contractVersion")
    model: ThermalModelMetadata = Field(default_factory=ThermalModelMetadata)
    results: list[ThermalItemResult]
