"""Internal deterministic decision APIs and health metadata."""

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.config import settings
from app.routes.optimization import router as optimization_router
from app.routes.safety import router as safety_router
from app.routes.thermal import router as thermal_router
from app.rules.niosh_2016_mvp_v1 import RULESET_VERSION
from app.thermal.liljegren import IMPLEMENTATION_VERSION, SCIENTIFIC_REFERENCE


class HealthResponse(BaseModel):
    """Health response consumed by the Node control plane."""

    service: Literal["workforce-heatops-decision-engine"]
    status: Literal["ok"]


class VersionResponse(BaseModel):
    """Honest implementation-version response."""

    serviceVersion: str  # noqa: N815 - public contract uses camelCase
    thermalModel: "ThermalModelVersion"  # noqa: N815
    ruleset: "RulesetVersion"
    optimizer: Literal["CP_SAT_SLOTS_V1"]


class ThermalModelVersion(BaseModel):
    """Implemented thermal model metadata."""

    name: Literal["liljegren"]
    implementationVersion: str  # noqa: N815
    reference: str


class RulesetVersion(BaseModel):
    name: Literal["NIOSH_2016_MVP_V1"]
    status: Literal["implemented"]


app = FastAPI(title="Workforce HeatOps Decision Engine", version=settings.service_version)
app.include_router(thermal_router)
app.include_router(safety_router)
app.include_router(optimization_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return liveness without claiming scientific readiness."""
    return HealthResponse(service="workforce-heatops-decision-engine", status="ok")


@app.get("/version", response_model=VersionResponse)
async def version() -> VersionResponse:
    """Report the implemented decision-engine versions."""
    return VersionResponse(
        serviceVersion=settings.service_version,
        thermalModel=ThermalModelVersion(
            name="liljegren",
            implementationVersion=IMPLEMENTATION_VERSION,
            reference=SCIENTIFIC_REFERENCE,
        ),
        ruleset=RulesetVersion(name=RULESET_VERSION, status="implemented"),
        optimizer="CP_SAT_SLOTS_V1",
    )
