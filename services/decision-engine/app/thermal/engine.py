"""Replaceable deterministic thermal-engine protocol."""

from typing import Protocol

from app.contracts.thermal import ThermalInput, ThermalItemResult


class ThermalEngine(Protocol):
    """Pure input-to-result thermal estimation boundary."""

    def estimate(self, input_data: ThermalInput) -> ThermalItemResult:
        """Estimate one environmental snapshot without I/O or state mutation."""
        ...
