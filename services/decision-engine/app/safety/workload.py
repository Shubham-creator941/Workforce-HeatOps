"""Workload lookup and hourly metabolic TWA."""

from app.rules.niosh_2016_mvp_v1 import REST_METABOLIC_WATTS, WORKLOAD_WATTS


def metabolic_rate(category: str) -> float | None:
    return WORKLOAD_WATTS.get(category)


def metabolic_twa(work_watts: float, work_minutes: int) -> float:
    rest_minutes = 60 - work_minutes
    return (work_watts * work_minutes + REST_METABOLIC_WATTS * rest_minutes) / 60.0
