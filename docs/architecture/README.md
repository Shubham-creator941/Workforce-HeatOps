# System architecture

Workforce HeatOps separates user interaction, operational control, and deterministic decisions.

```text
React web -> Node/Express control plane -> Python/FastAPI decision plane
                    |
                  MySQL
```

The browser calls only Node. Node owns public APIs, provider access, normalization orchestration, persistence, caching, supervisor decisions, and future AI-agent coordination. Python receives validated, normalized inputs and will eventually own thermal calculation, occupational rules, constraint compilation, optimization, and schedule validation. Python has no network-provider, database, or LLM access.

P0-02 adds a deterministic, offline Liljegren thermal engine behind Python's internal API. Occupational safety and scheduling behavior remain planned.
