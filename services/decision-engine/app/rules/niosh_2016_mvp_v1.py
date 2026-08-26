"""Frozen NIOSH/OSHA guidance-aligned MVP rules."""

from types import MappingProxyType

from app.rules.models import RuleSource

RULESET_VERSION = "NIOSH_2016_MVP_V1"
REST_METABOLIC_WATTS = 115.0
WORKLOAD_WATTS = MappingProxyType(
    {
        "REST": 115.0,
        "LIGHT": 180.0,
        "MODERATE": 300.0,
        "HEAVY": 415.0,
        "VERY_HEAVY": 520.0,
    }
)
CLOTHING_ADJUSTMENT_C = MappingProxyType(
    {
        "NORMAL_WORK_CLOTHING": 0.0,
        "CLOTH_COVERALLS": 0.0,
        "SMS_COVERALLS": 0.5,
        "POLYOLEFIN_COVERALLS": 1.0,
        "DOUBLE_LAYER_CLOTH": 3.0,
        "VAPOR_BARRIER_LIMITED_USE": 11.0,
    }
)
WORK_REST_CANDIDATES = ((60, 0), (45, 15), (30, 30), (15, 45))

NIOSH = RuleSource(
    "NIOSH_2016_RAL_EQUATION",
    "Criteria for a Recommended Standard: Occupational Exposure to Heat and Hot Environments",
    "NIOSH",
    2016,
    "DHHS (NIOSH) 2016-106",
)
REL = RuleSource("NIOSH_2016_REL_EQUATION", NIOSH.source_title, "NIOSH", 2016, NIOSH.publication_id)
WORKLOAD = RuleSource(
    "OSHA_NIOSH_WORKLOAD_METABOLIC_RATES", "Heat Hazard Recognition", "OSHA", 2026
)
CLOTHING = RuleSource(
    "OSHA_NIOSH_CLOTHING_ADJUSTMENT_FACTORS", "Heat Hazard Recognition", "OSHA", 2026
)
HOURLY_TWA = RuleSource("NIOSH_HOURLY_TWA", NIOSH.source_title, "NIOSH", 2016, NIOSH.publication_id)
NEW_WORKER = RuleSource(
    "NIOSH_ACCLIMATIZATION_NEW_WORKER", "Heat Stress: Acclimatization", "NIOSH", 2026
)
RETURNING_WORKER = RuleSource(
    "NIOSH_ACCLIMATIZATION_RETURNING_WORKER", "Heat Stress: Acclimatization", "NIOSH", 2026
)
