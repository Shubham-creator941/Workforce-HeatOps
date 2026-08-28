# System architecture

Workforce HeatOps separates user interaction, operational control, and deterministic decisions.

```text
React web -> Node/Express control plane -> Python/FastAPI decision plane
                    |
                  MySQL
```

The browser calls only Node. Node owns public APIs, provider access, normalization orchestration, persistence, caching, supervisor decisions, and future AI-agent coordination. Python receives validated, normalized inputs and will eventually own thermal calculation, occupational rules, constraint compilation, optimization, and schedule validation. Python has no network-provider, database, or LLM access.

Python implements offline Liljegren thermal estimation, continuous-work occupational safety evaluation, and bounded CP-SAT slot scheduling. The optimizer consumes explicit upstream safety decisions and exposure budgets; it does not call either scientific engine. See [ADR 0004](../decisions/0004-slot-schedule-optimizer.md). Public planning orchestration remains in Node's future scope.
