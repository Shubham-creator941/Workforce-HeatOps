"""FastAPI entrypoint exposing only foundation health metadata."""

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.config import settings
from app.routes.thermal import router as thermal_router
from app.thermal.liljegren import IMPLEMENTATION_VERSION, SCIENTIFIC_REFERENCE


class HealthResponse(BaseModel):
    """Health response consumed by the Node control plane."""

    service: Literal["workforce-heatops-decision-engine"]
    status: Literal["ok"]


class VersionResponse(BaseModel):
    """Honest implementation-version response."""

    serviceVersion: str  # noqa: N815 - public contract uses camelCase
    thermalModel: "ThermalModelVersion"  # noqa: N815
    ruleset: Literal["not-implemented"]
    optimizer: Literal["not-implemented"]


class ThermalModelVersion(BaseModel):
    """Implemented thermal model metadata."""

    name: Literal["liljegren"]
    implementationVersion: str  # noqa: N815
    reference: str


app = FastAPI(title="Workforce HeatOps Decision Engine", version=settings.service_version)
app.include_router(thermal_router)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return liveness without claiming scientific readiness."""
    return HealthResponse(service="workforce-heatops-decision-engine", status="ok")


@app.get("/version", response_model=VersionResponse)
async def version() -> VersionResponse:
    """Report implemented thermal and explicitly deferred capabilities."""
    return VersionResponse(
        serviceVersion=settings.service_version,
        thermalModel=ThermalModelVersion(
            name="liljegren",
            implementationVersion=IMPLEMENTATION_VERSION,
            reference=SCIENTIFIC_REFERENCE,
        ),
        ruleset="not-implemented",
        optimizer="not-implemented",
    )
