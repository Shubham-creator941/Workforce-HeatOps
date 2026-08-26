# Deterministic thermal engine

## Purpose

The engine converts already normalized meteorological observations into **Estimated Outdoor WBGT**. It provides environmental thermal physics only; it does not classify safety, apply PPE or workload adjustments, prescribe work/rest, or schedule crews.

## Scientific reference and implementation path

The scientific basis is James C. Liljegren et al., “Modeling the wet bulb globe temperature using standard meteorological measurements,” _Journal of Occupational and Environmental Hygiene_ 5(10), 2008, DOI `10.1080/15459620802310770`.

Production uses the preserved WBGT Version 1.1 C implementation from `mdljts/wbgt` commit `cd672a886880b67f3f27bdbf75038d8f7ff0bac2`. That file is Max Lieblich's C99/double-precision adaptation of the Argonne source and retains the required notices. Workforce HeatOps restores the adaptation's iteration cap to Argonne's original 50 iterations, marked inline; equations are unchanged. A small CPython binding calls it, and a typed Python adapter performs contract validation and serialization. No provider, network, database, or LLM code is reachable from this path.

## Inputs and units

| Input                         | Meaning                                                             | Unit            |
| ----------------------------- | ------------------------------------------------------------------- | --------------- |
| `airTemperatureC`             | dry-bulb air temperature                                            | °C              |
| `relativeHumidityPercent`     | relative humidity                                                   | %               |
| `solarRadiationWm2`           | actual downward global horizontal solar irradiance supplied by Node | W/m²            |
| `windSpeedMs`                 | measured wind speed                                                 | m/s             |
| `windMeasurementHeightM`      | measurement height; P0-02 supports exactly 2 m                      | m               |
| `surfacePressureHpa`          | surface/barometric pressure                                         | hPa             |
| `latitude`, `longitude`       | geographic coordinates                                              | decimal degrees |
| `timestamp`                   | observation interval end, timezone-aware and normalized to UTC      | ISO-8601        |
| `solarAveragingPeriodMinutes` | duration of the averaged meteorological inputs                      | minutes         |

Units are explicit and never inferred from magnitude. hPa is numerically equivalent to the millibar input used by WBGT 1.1.

## Wind-height behavior

The reference model's non-2 m pathway estimates wind at its 2 m reference height using Pasquill stability and EPA power-law exponents. Selecting stability requires a vertical temperature difference and an urban/rural surface flag. Because the P0-02 environmental contract lacks those quantities, any height other than 2 m returns `UNSUPPORTED_INPUT`. No arbitrary scaling or logarithmic profile is used.

Within heat-transfer correlations WBGT 1.1 applies its documented minimum wind speed of 0.13 m/s. Inputs are not mutated; when this lower bound applies, diagnostics report 0.13 m/s and the result includes a warning.

## Solar-radiation and time behavior

The engine consumes actual downward GHI and does not derive clouds or clear-sky attenuation. WBGT 1.1 calculates solar position and direct-beam fraction. It centers solar time at half the supplied averaging interval before the timestamp. The reference can cap irradiance to 0.85 of top-of-atmosphere normalized solar to account for sensor inconsistency; when it does, the adjusted value is exposed and warned rather than hidden.

Timestamps are converted to UTC before calling the model with a zero GMT offset. The reference accepts minute resolution and years 1950–2049; seconds or dates outside that range return `UNSUPPORTED_INPUT`. No machine-local timezone or current time is used.

## Physical components and composition

WBGT 1.1 iteratively calculates natural wet-bulb temperature from wick convection, evaporation, atmospheric/ground radiation, and solar loading. It separately iterates black-globe temperature from sphere convection and radiative balance. The psychrometric wet-bulb component runs the wick calculation without radiative heating.

The final outdoor composition is:

```text
Estimated Outdoor WBGT = 0.7 × natural wet bulb
                       + 0.2 × black globe
                       + 0.1 × dry-bulb air temperature
```

The test suite checks this composition as an invariant without independently approximating either component.

## Validation methodology and tolerance

Five valid golden cases cover hot/dry daytime, hot/humid daytime, low solar, nighttime, and low wind. Expected components were produced outside the production binding by independently compiling the preserved upstream C source with:

```text
clang -std=c99 -O2 -I src oracle.c src/wbgt.c -lm -o oracle
```

The standalone runner called `calc_wbgt` directly and printed double-precision component values. Each fixture records the exact upstream commit, input, output, and generation method. Production-to-oracle comparisons use an absolute `1e-10 °C` tolerance. This is implementation-equivalence tolerance, not the paper's measurement accuracy. Additional tests cover UTC equivalence, deterministic repetition, composition, validation, unsupported height, non-convergence, and mixed batch behavior. All tests run offline.

## Limitations

- This is an estimate from meteorology, not a measurement or instrument reading.
- Validated implementation equivalence does not eliminate uncertainty in source observations.
- P0-02 supports wind measured at 2 m only.
- WBGT 1.1 solar position is limited to 1950–2049 and minute-resolution time.
- Input irradiance must already be aligned to the timestamp and stated averaging interval.
- No occupational threshold, medical outcome, or safe/unsafe determination is produced.

## Pitch-safe terminology

Use “Estimated Outdoor WBGT” and “Liljegren-based physical model.” Do not use “official WBGT,” “measured WBGT,” “sensor WBGT,” or claim regulatory compliance.
