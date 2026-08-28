"""Clothing Adjustment Factor lookup."""

from app.rules.niosh_2016_mvp_v1 import CLOTHING_ADJUSTMENT_C


def clothing_adjustment(category: str) -> float | None:
    return CLOTHING_ADJUSTMENT_C.get(category)
