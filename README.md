# Workforce HeatOps

> Heat-aware workforce planning for outdoor construction.

## Problem

Outdoor construction supervisors must preserve productive work while thermal conditions change across time and location. Existing weather views do not directly answer how task, crew, PPE, and timing constraints affect a feasible work plan.

## Product vision

Workforce HeatOps transforms normalized meteorological inputs into deterministic Estimated Outdoor WBGT. Occupational constraints and heat-aware scheduling remain **planned**.

## Architecture

```text
React + TypeScript web
        |
Node.js + Express control plane -- MySQL 8.4
        |
Python + FastAPI deterministic decision plane
```

Node owns public APIs, persistence, external providers, orchestration, and future agent coordination. Python owns future deterministic science, safety, and optimization. The browser calls only Node. See [the architecture record](docs/decisions/0001-system-boundaries.md).

## Repository structure

- `apps/web` — minimal React shell and API-status view
- `apps/api` — Node control plane, Prisma, and dependency-aware health API
- `services/decision-engine` — deterministic Python service scaffold
- `packages/contracts` — canonical TypeScript/Zod enums and public semantics
- `fixtures` — homes for future deterministic test evidence
- `docs` — architecture, scientific boundaries, decisions, and demo notes

## Tech stack

Node 24, pnpm, TypeScript, React 19, Vite, Express, Prisma, MySQL 8.4, Python 3.12, uv, FastAPI, Pydantic, Vitest, Testing Library, pytest, Ruff, and mypy.

## Getting started

Prerequisites: Node 24, pnpm 11, Python 3.12, [uv](https://docs.astral.sh/uv/), Docker with Compose, and available ports 5173, 3000, 8000, and 3306.

```bash
cp .env.example .env
set -a
source .env
set +a
pnpm install --frozen-lockfile
docker compose up -d
pnpm --filter @heatops/api prisma:generate
pnpm --filter @heatops/api prisma:migrate
cd services/decision-engine
uv sync --frozen
```

## Environment variables

`.env.example` documents local-only defaults and placeholders. `DATABASE_URL`, `DECISION_ENGINE_BASE_URL`, `CORS_ORIGIN`, and service ports drive the current scaffold. Provider and OpenAI variables are reserved for planned work and are unused. Never commit `.env` or real credentials.

## Running the web app

From the repository root: `pnpm --filter @heatops/web dev`. Vite proxies `/api` to Node at `http://localhost:3000`.

## Running the API

From the repository root after exporting variables from `.env` with the commands above: `pnpm --filter @heatops/api dev`. The health endpoint is `GET http://localhost:3000/api/v1/health` and returns HTTP 503 when MySQL or Python is unavailable rather than pretending dependencies are healthy.

## Running the decision engine

From `services/decision-engine`: `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`. It exposes `GET /health`, `GET /version`, and the internal batch endpoint below. `/version` reports Liljegren thermal estimation as implemented while safety and optimization remain `not-implemented`.

### Estimate an offline thermal batch

```bash
curl -X POST http://127.0.0.1:8000/internal/v1/thermal/batch \
  -H 'content-type: application/json' \
  -d '{
    "contractVersion":"1.0",
    "planningRunId":"run_example",
    "model":"LILJEGREN",
    "items":[{
      "snapshotId":"env_001","zoneId":"zone_roof",
      "timestamp":"2026-08-27T20:00:00Z",
      "latitude":33.4486,"longitude":-112.0738,
      "airTemperatureC":39.2,"relativeHumidityPercent":31.0,
      "solarRadiationWm2":845.0,
      "windSpeedMs":3.2,"windMeasurementHeightM":2.0,
      "surfacePressureHpa":964.5,"solarAveragingPeriodMinutes":60
    }]
  }'
```

The response includes `estimatedWbgtC`, globe, natural wet-bulb and psychrometric wet-bulb components, reference-model diagnostics, warnings, and item-level status. Non-2 m wind inputs are explicitly unsupported until the environmental contract supplies the additional authoritative stability inputs required by WBGT 1.1.

## Running tests

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build

cd services/decision-engine
uv run ruff check .
uv run mypy app
uv run pytest
```

## Architecture boundaries

Frontend -> Node -> Python is mandatory. Python cannot access MySQL, providers, the network, or an LLM. Node cannot reproduce deterministic calculations. The frontend cannot calculate safety or expose service secrets.

## Safety and scientific boundaries

Safety is a hard constraint and `INFEASIBLE` is a valid result. Missing safety-critical information never defaults to safe. AI cannot calculate or override WBGT, occupational limits, PPE adjustments, recovery, or schedule safety. Use “Estimated Outdoor WBGT” and “NIOSH/OSHA guidance-aligned decision support”; never claim an official measurement, compliance, or medical diagnosis.

## Development workflow

Open a bounded issue, branch using the convention in `CONTRIBUTING.md`, implement with tests, run relevant checks, and open a small pull request. Safety-critical work requires authoritative sourcing, deterministic fixtures, and cross-review.

## Roadmap

- P0-01: engineering foundation — implemented
- P0-02: deterministic Python thermal-engine contract and validated Liljegren pathway — implemented
- P0-03: deterministic occupational safety rules — planned
- CP-SAT optimization, providers, planning orchestration, UI, and AI explanation — planned

## Team

- Shubham
- Priya
