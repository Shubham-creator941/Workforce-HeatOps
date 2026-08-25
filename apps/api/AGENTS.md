# Node API instructions

Node is the control plane: public HTTP, MySQL/Prisma persistence, providers, caching, orchestration, supervisor decisions, and future AI-agent orchestration live here.

Node must never calculate WBGT, calculate RAL/REL, invent PPE adjustments, interpret safety rules, or mathematically optimize schedules. Call the Python decision engine for deterministic decisions. Validate input and output boundaries, preserve correlation IDs, expose real dependency state, keep secrets server-side, and avoid sensitive logging.
