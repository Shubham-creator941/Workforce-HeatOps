# Decision-engine instructions

This service is deterministic.

It must not call external APIs, access a database, call an LLM, fetch network data, or persist application state. Do not invent scientific constants or use hidden fallbacks. Future safety constants belong in `app/rules/` and must be source-controlled.

Every safety-rule change must identify its authoritative source, update the ruleset version when behavior changes, add or update deterministic tests, and preserve reproducibility. Missing safety-critical information is never safe. Safety is a hard constraint; infeasibility is a valid result.
