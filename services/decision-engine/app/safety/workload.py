"""Confirmed workload screening-rate lookup."""

from app.rules.niosh_2016_mvp_v1 import WORKLOAD_WATTS


def metabolic_rate(category: str) -> float | None:
    return WORKLOAD_WATTS.get(category)
