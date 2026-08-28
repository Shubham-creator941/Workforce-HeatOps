# Planning orchestration

`service.ts` runs the validated thermal -> safety -> optimizer pipeline. `store.ts` persists planning runs through Prisma with status compare-and-set updates. No production in-memory fallback, provider data, scientific calculation, or LLM behavior exists here. See [ADR 0005](../../../../docs/decisions/0005-node-planning-orchestration.md) for the input contract, statuses, and operational limitations.
