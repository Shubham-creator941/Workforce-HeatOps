"""FastAPI entrypoint exposing only foundation health metadata."""

from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel

from app.config import settings


class HealthResponse(BaseModel):
    """Health response consumed by the Node control plane."""

    service: Literal["workforce-heatops-decision-engine"]
    status: Literal["ok"]


class VersionResponse(BaseModel):
    """Honest implementation-version response."""

    serviceVersion: str  # noqa: N815 - public contract uses camelCase
    thermalModel: Literal["not-implemented"]  # noqa: N815
    ruleset: Literal["not-implemented"]
    optimizer: Literal["not-implemented"]


app = FastAPI(title="Workforce HeatOps Decision Engine", version=settings.service_version)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    """Return liveness without claiming scientific readiness."""
    return HealthResponse(service="workforce-heatops-decision-engine", status="ok")


@app.get("/version", response_model=VersionResponse)
async def version() -> VersionResponse:
    """Report explicitly unimplemented deterministic capabilities."""
    return VersionResponse(
        serviceVersion=settings.service_version,
        thermalModel="not-implemented",
        ruleset="not-implemented",
        optimizer="not-implemented",
    )
