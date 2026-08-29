# Provider adapters

Provider adapters are wired only through Node planning orchestration.

- `fortyguard.ts` submits 60 m `tcm` heatmaps, performs bounded status polling, and maps the verified containing tile's average temperature to hyperlocal air temperature.
- `open-meteo.ts` fetches exact-hour relative humidity, surface pressure, and preceding-hour shortwave radiation. It intentionally does not request or adapt wind.

See `docs/decisions/0006-provider-input-normalization.md` for temporal, provenance, and fail-closed rules. Never log provider credentials or add fallback weather values.
