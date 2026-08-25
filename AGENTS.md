# Workforce HeatOps repository instructions

Workforce HeatOps converts hyperlocal heat intelligence into task-level construction workforce scheduling decisions.

## Architecture and ownership

The mandatory request path is `Frontend -> Node -> Python decision engine`.

- Node is the control plane. It owns public APIs, persistence, external providers, caching, planning orchestration, supervisor decisions, and future agent orchestration.
- Python is the deterministic decision plane. It owns thermal science, occupational safety, constraint compilation, optimization, and schedule validation. It must not access MySQL, external providers, an LLM, or persistent application state.
- The frontend is presentation and user interaction only. It must not calculate or independently classify safety and must never call Python or MySQL directly.

## Safety and scientific invariants

Safety is a hard constraint. `INFEASIBLE` is a valid analytical result. Missing safety-critical information never defaults to safe.

Never let AI/LLM code calculate WBGT or safety thresholds, modify limits, override recovery requirements, invent PPE or metabolic values, mark a schedule safe, or turn an infeasible schedule into a safe one. Never encode safety constraints as soft objective weights or introduce hidden fallback safety values. Do not implement medical-risk, heatstroke-probability, or core-temperature predictions.

Use “Estimated Outdoor WBGT,” never “Official WBGT.” Use “NIOSH/OSHA guidance-aligned decision support,” never “OSHA compliant.” This product is occupational decision support, not medical diagnosis.

## Engineering principles

- Make small, bounded changes and preserve ownership boundaries.
- Use strict typing and validate every API boundary.
- Test business behavior and failure paths.
- Avoid unnecessary dependencies and abstractions.
- Make no architectural changes without an explicit task.
- Never commit secrets or log sensitive configuration.
- Run relevant lint, type, test, and build checks before finishing.
- Update documentation whenever behavior or contracts change.
