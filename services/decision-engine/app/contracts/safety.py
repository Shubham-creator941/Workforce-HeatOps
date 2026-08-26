"""Versioned occupational heat-safety API contracts."""

from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WorkloadCategory(StrEnum):
    REST = "REST"
    LIGHT = "LIGHT"
    MODERATE = "MODERATE"
    HEAVY = "HEAVY"
    VERY_HEAVY = "VERY_HEAVY"
    UNCLASSIFIED = "UNCLASSIFIED"


class PPECategory(StrEnum):
    NORMAL_WORK_CLOTHING = "NORMAL_WORK_CLOTHING"
    CLOTH_COVERALLS = "CLOTH_COVERALLS"
    SMS_COVERALLS = "SMS_COVERALLS"
    POLYOLEFIN_COVERALLS = "POLYOLEFIN_COVERALLS"
    DOUBLE_LAYER_CLOTH = "DOUBLE_LAYER_CLOTH"
    VAPOR_BARRIER_LIMITED_USE = "VAPOR_BARRIER_LIMITED_USE"
    UNSUPPORTED = "UNSUPPORTED"
    UNKNOWN = "UNKNOWN"


class AcclimatizationState(StrEnum):
    ACCLIMATIZED = "ACCLIMATIZED"
    NEW_WORKER_RAMP = "NEW_WORKER_RAMP"
    RETURNING_WORKER_RAMP = "RETURNING_WORKER_RAMP"
    UNKNOWN = "UNKNOWN"


class RecoveryMode(StrEnum):
    SAME_AS_WORK = "SAME_AS_WORK"
    EXPLICIT = "EXPLICIT"


class AcclimatizationInput(BaseModel):
    state: AcclimatizationState
    day: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_day(self) -> "AcclimatizationInput":
        ramp = self.state in {
            AcclimatizationState.NEW_WORKER_RAMP,
            AcclimatizationState.RETURNING_WORKER_RAMP,
        }
        if ramp and self.day is None:
            raise ValueError("day is required for acclimatization ramp states")
        if not ramp and self.day is not None:
            raise ValueError("day is only valid for acclimatization ramp states")
        return self


class RecoveryEnvironmentInput(BaseModel):
    mode: RecoveryMode
    estimated_wbgt_c: float | None = Field(default=None, alias="estimatedWbgtC")

    model_config = ConfigDict(allow_inf_nan=False)


class SafetyEvaluationInput(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    evaluation_ref: str = Field(alias="evaluationRef", min_length=1)
    thermal_estimate_id: str = Field(alias="thermalEstimateId", min_length=1)
    estimated_wbgt_c: float = Field(alias="estimatedWbgtC")
    workload_category: WorkloadCategory = Field(alias="workloadCategory")
    ppe_category: PPECategory = Field(alias="ppeCategory")
    acclimatization: AcclimatizationInput
    recovery_environment: RecoveryEnvironmentInput = Field(alias="recoveryEnvironment")


class SafetyBatchRequest(BaseModel):
    contract_version: Literal["1.0"] = Field(alias="contractVersion")
    ruleset_version: Literal["NIOSH_2016_MVP_V1"] = Field(alias="rulesetVersion")
    evaluations: list[SafetyEvaluationInput] = Field(min_length=1, max_length=1000)


class RuleEvidence(BaseModel):
    rule_id: str = Field(alias="ruleId")
    source_title: str = Field(alias="sourceTitle")
    source_organization: str = Field(alias="sourceOrganization")
    source_year: int = Field(alias="sourceYear")
    publication_id: str | None = Field(default=None, alias="publicationId")


class CandidateEvaluation(BaseModel):
    work_minutes_per_hour: int = Field(alias="workMinutesPerHour")
    rest_minutes_per_hour: int = Field(alias="restMinutesPerHour")
    metabolic_twa_watts: float = Field(alias="metabolicTwaWatts")
    effective_wbgt_twa_c: float = Field(alias="effectiveWbgtTwaC")
    limit_type: Literal["RAL", "REL"] = Field(alias="limitType")
    applicable_limit_wbgt_c: float = Field(alias="applicableLimitWbgtC")
    passes: bool
    margin_c: float = Field(alias="marginC")


class AcclimatizationConstraint(BaseModel):
    max_heat_exposure_fraction: float = Field(alias="maxHeatExposureFraction")


class SafetyReason(BaseModel):
    code: str
    message: str


class SafetyResult(BaseModel):
    evaluation_ref: str = Field(alias="evaluationRef")
    thermal_estimate_id: str = Field(alias="thermalEstimateId")
    decision: Literal[
        "CONTINUOUS_WORK_ALLOWED",
        "WORK_REST_REQUIRED",
        "RESCHEDULE_REQUIRED",
        "MANUAL_REVIEW_REQUIRED",
        "INSUFFICIENT_DATA",
    ]
    estimated_wbgt_c: float = Field(alias="estimatedWbgtC")
    clothing_adjustment_c: float | None = Field(alias="clothingAdjustmentC")
    effective_work_wbgt_c: float | None = Field(alias="effectiveWorkWbgtC")
    workload_category: WorkloadCategory = Field(alias="workloadCategory")
    work_metabolic_rate_watts: float | None = Field(alias="workMetabolicRateWatts")
    rest_metabolic_rate_watts: float = Field(alias="restMetabolicRateWatts")
    limit_type: Literal["RAL", "REL"] | None = Field(alias="limitType")
    selected_pattern: CandidateEvaluation | None = Field(alias="selectedPattern")
    max_work_minutes_per_hour: int | None = Field(alias="maxWorkMinutesPerHour")
    required_rest_minutes_per_hour: int | None = Field(alias="requiredRestMinutesPerHour")
    acclimatization_constraint: AcclimatizationConstraint | None = Field(
        alias="acclimatizationConstraint"
    )
    candidate_evaluations: list[CandidateEvaluation] = Field(alias="candidateEvaluations")
    rule_evidence: list[RuleEvidence] = Field(alias="ruleEvidence")
    reason: SafetyReason | None = None


class SafetyBatchResponse(BaseModel):
    contract_version: Literal["1.0"] = Field("1.0", alias="contractVersion")
    ruleset_version: Literal["NIOSH_2016_MVP_V1"] = Field(
        "NIOSH_2016_MVP_V1", alias="rulesetVersion"
    )
    results: list[SafetyResult]
