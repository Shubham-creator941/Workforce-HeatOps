# Contributing

Work from an issue and use `feat/<issue>-short-name`, `fix/<issue>-short-name`, or `test/<issue>-short-name` branches, for example `feat/42-thermal-engine`.

Do not develop directly on `main`. Keep each pull request small and limited to one concern. CI must pass before merge. Safety-critical work requires cross-review and an authoritative source, deterministic fixtures, and documented ruleset-version impact.

Use concise, meaningful commit messages. Before opening a pull request, run the relevant lint, typecheck, test, and build commands documented in the README. Update documentation with behavior or contract changes and never commit secrets.
