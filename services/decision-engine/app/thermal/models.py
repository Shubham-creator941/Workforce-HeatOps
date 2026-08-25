"""Internal typed thermal model values."""

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class NativeThermalResult:
    status: int
    globe_temperature_c: float
    natural_wet_bulb_temperature_c: float
    psychrometric_wet_bulb_temperature_c: float
    estimated_wbgt_c: float
    effective_wind_speed_ms: float
    adjusted_solar_radiation_wm2: float
    cosine_solar_zenith: float
