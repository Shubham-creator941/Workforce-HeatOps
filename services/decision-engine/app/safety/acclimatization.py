"""Acclimatization limit selection and separate exposure ramp."""


def limit_type(state: str) -> str | None:
    if state == "ACCLIMATIZED":
        return "REL"
    if state in {"NEW_WORKER_RAMP", "RETURNING_WORKER_RAMP"}:
        return "RAL"
    return None


def max_heat_exposure_fraction(state: str, day: int | None) -> float | None:
    if state == "ACCLIMATIZED":
        return 1.0
    if state == "NEW_WORKER_RAMP" and day is not None:
        return (0.2, 0.4, 0.6, 0.8)[min(day, 4) - 1] if day < 5 else 1.0
    if state == "RETURNING_WORKER_RAMP" and day is not None:
        return (0.5, 0.6, 0.8)[min(day, 3) - 1] if day < 4 else 1.0
    return None
