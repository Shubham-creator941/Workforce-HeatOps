# ADR 0002 companion: Thermal input contract refinement

## Context

The Phase 6 draft omitted wind measurement height and solar averaging duration. WBGT 1.1 consumes both. Hiding them would make solar time ambiguous and could incorrectly equate provider wind measured near 10 m with the model's 2 m reference environment.

## Decision

Contract version 1.0 explicitly requires `windMeasurementHeightM` and `solarAveragingPeriodMinutes`. Meteorological timestamps are interval-end timestamps; WBGT 1.1 evaluates solar position at the interval center. Node must supply actual downward global horizontal irradiance in W/m² and must not substitute clear-sky GHI.

P0-02 supports wind measured at 2 m. WBGT 1.1 can transform other heights only by using a vertical temperature difference and urban/rural surface class to choose atmospheric stability. The current normalized input does not contain those authoritative observations, so other heights return `UNSUPPORTED_INPUT`.

## Consequences

Provider normalization must retain source wind height and radiation averaging metadata. Existing draft callers must add both fields. The thermal engine never silently assumes units, wind height, or averaging duration.

## Scientific TODO

**SCIENTIFIC TODO:** Decide whether the environmental-fusion contract can supply authoritative vertical temperature difference and surface classification or must source verified 2 m wind.

**Evidence required:** Provider field semantics and the applicability of the EPA stability pathway embedded in WBGT 1.1 to each supported site/provider configuration.

**Affected future issue:** Environmental provider normalization and fusion; not P0-02 thermal physics.
