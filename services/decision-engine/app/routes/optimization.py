"""Internal batch optimization. Each valid plan gets its own solver instance."""

from fastapi import APIRouter

from app.contracts.optimization import OptimizationBatchRequest, OptimizationBatchResponse
from app.optimizer.engine import ScheduleOptimizer, failure

router = APIRouter(prefix="/internal/v1/optimization", tags=["internal-optimization"])


@router.post("/batch", response_model=OptimizationBatchResponse)
def optimize_batch(request: OptimizationBatchRequest) -> OptimizationBatchResponse:
    results = []
    for plan in request.plans:
        try:
            results.append(ScheduleOptimizer().solve(plan))
        except Exception:  # Isolate solver failures; never emit a partial unvalidated schedule.
            results.append(failure(plan, "SOLVER_ERROR"))
    return OptimizationBatchResponse(results=results)
