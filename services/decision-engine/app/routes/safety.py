"""Internal deterministic occupational heat-safety API."""

import logging
from collections import Counter
from time import perf_counter

from fastapi import APIRouter

from app.contracts.safety import SafetyBatchRequest, SafetyBatchResponse
from app.rules.niosh_2016_mvp_v1 import RULESET_VERSION
from app.safety.engine import Niosh2016SafetyEngine, SafetyEngine

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/internal/v1/safety", tags=["internal-safety"])
engine: SafetyEngine = Niosh2016SafetyEngine()


@router.post("/batch", response_model=SafetyBatchResponse)
async def evaluate_batch(request: SafetyBatchRequest) -> SafetyBatchResponse:
    started = perf_counter()
    results = [engine.evaluate(item) for item in request.evaluations]
    logger.info(
        "safety batch completed",
        extra={
            "ruleset_version": RULESET_VERSION,
            "evaluation_count": len(results),
            "decision_counts": dict(Counter(item.decision for item in results)),
            "duration_ms": round((perf_counter() - started) * 1000.0, 3),
        },
    )
    return SafetyBatchResponse(results=results)
