"""Internal thermal estimation API."""

import logging
from time import perf_counter

from fastapi import APIRouter

from app.contracts.thermal import ThermalBatchRequest, ThermalBatchResponse
from app.thermal.engine import ThermalEngine
from app.thermal.liljegren import IMPLEMENTATION_VERSION, LiljegrenThermalEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/v1/thermal", tags=["internal-thermal"])
engine: ThermalEngine = LiljegrenThermalEngine()


@router.post("/batch", response_model=ThermalBatchResponse)
async def estimate_batch(request: ThermalBatchRequest) -> ThermalBatchResponse:
    """Estimate ordered snapshots; isolate scientific failures per item."""
    started = perf_counter()
    results = [engine.estimate(item) for item in request.items]
    success_count = sum(result.status == "VALID" for result in results)
    logger.info(
        "thermal batch completed",
        extra={
            "planning_run_id": request.planning_run_id,
            "item_count": len(results),
            "model_version": IMPLEMENTATION_VERSION,
            "success_count": success_count,
            "failure_count": len(results) - success_count,
            "duration_ms": round((perf_counter() - started) * 1000.0, 3),
        },
    )
    return ThermalBatchResponse(results=results)
