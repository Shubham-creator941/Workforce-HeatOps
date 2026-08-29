# ADR 0006: Provider input normalization

## Decision

Node supports provider-backed environmental input before invoking Python:

`QUEUED -> FETCHING_FORTYGUARD -> FETCHING_METEOROLOGY -> ALIGNING_DATA -> CALCULATING_THERMAL -> EVALUATING_SAFETY -> OPTIMIZING`

Caller-normalized input remains available and enters `ALIGNING_DATA` directly. Both modes produce the existing strict thermal contract. Python thermal, safety, and optimizer code is unchanged.

## FortyGuard mapping and time

Node submits `POST /v1/heatmap` with `analytic_type: tcm`, 60 m granularity, a closed zone polygon, and a single-hour local start. It polls `GET /v1/status/{activity_id}` with configured per-request timeouts and bounded attempts/intervals. A temporarily unavailable status response can be retried within that bound. `FORTYGUARD_API_KEY` is never included in errors, evidence, URLs, or logs.

Node validates the completed GeoJSON FeatureCollection and requires exactly one tile containing the declared zone sample point. Only `properties.average_temperature` becomes `airTemperatureC`. It preserves `tile_id`, `min_temperature`, and `max_temperature` as provenance; min/max are not WBGT.

The completed payload has no verified timestamp or timezone. Evidence records the submitted local date/time, caller-declared IANA timezone, aligned UTC interval, activity ID, and `responseTimestampSemantics: NOT_PROVIDED`. Invalid timezone, non-hour interval, request outside the documented 2019/current/12-hour-forecast window, mismatched activity ID, ambiguous tile, or malformed response fails closed.

FortyGuard is only an air-temperature source here. It does not provide WBGT to the engine. Provider wet-bulb is neither requested nor used as Liljegren natural wet-bulb temperature. Clear-sky irradiance is not requested or used as actual radiation.

## Meteorology and verified wind

Open-Meteo is queried in GMT for the exact slot end, requesting only `relative_humidity_2m`, `surface_pressure`, and `shortwave_radiation`. Radiation is persisted as a preceding-hour mean, so provider mode requires 60-minute slots. Missing, null, misaligned, out-of-range, or incorrectly unit-labelled values fail closed. Open-Meteo wet-bulb, apparent temperature, wind, and clear-sky radiation are not requested.

Open-Meteo's standard wind is at 10 m, while the validated thermal contract requires 2 m. Node does not convert, scale, or relabel it. Provider requests must include an exact 2 m observation for every task-zone/slot, including its timestamp and source reference. Missing or misaligned 2 m wind is rejected before provider calls. A production source and trust policy for these observations remains an integration requirement.

## Failures and evidence

Provider configuration, authorization, rate-limit, timeout, failed activity, transport, and server errors produce `FAILED`. Invalid/missing values and temporal-alignment failures produce `INSUFFICIENT_DATA`. No provider failure invokes Python or creates a schedule.

Successful runs persist normalized thermal snapshots plus per-snapshot provider evidence. Tests use mocked transports and a checked-in verified response fixture; CI makes no provider calls.
