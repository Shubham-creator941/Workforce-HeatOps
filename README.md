# Workforce HeatOps

> Heat-aware workforce planning for outdoor construction.

## Problem

Outdoor construction supervisors must preserve productive work while thermal conditions change across time and location. Existing weather views do not directly answer how task, crew, PPE, and timing constraints affect a feasible work plan.

## Product vision

Workforce HeatOps will transform validated environmental inputs into Estimated Outdoor WBGT, deterministic occupational constraints, and a proposed heat-aware schedule for supervisor review. These capabilities are **planned**; P0-01 supplies only the engineering foundation.

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

From `services/decision-engine`: `uv run uvicorn app.main:app --host 127.0.0.1 --port 8000`. It exposes `GET /health` and `GET /version`; the version endpoint explicitly reports scientific and optimizer capabilities as `not-implemented`.

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

- P0-01: engineering foundation — current
- P0-02: deterministic Python thermal-engine contract and validated Liljegren pathway — planned
- Versioned occupational rules, CP-SAT optimization, providers, planning orchestration, UI, and AI explanation — planned

## Team

- Shubham
- Priya
