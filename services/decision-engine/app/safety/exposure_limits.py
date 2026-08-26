"""NIOSH RAL and REL equations."""

from math import log10


def ral_wbgt_c(metabolic_watts: float) -> float:
    return 59.9 - 14.1 * log10(metabolic_watts)


def rel_wbgt_c(metabolic_watts: float) -> float:
    return 56.7 - 11.5 * log10(metabolic_watts)
