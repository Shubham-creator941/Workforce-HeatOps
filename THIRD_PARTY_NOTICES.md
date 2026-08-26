# Third-party notices

## Liljegren WBGT Version 1.1 / `mdljts/wbgt`

- Component: preserved double-precision C derivative of WBGT Version 1.1
- Files: `services/decision-engine/app/thermal/vendor/wbgt.c` and `wbgt.h`
- Original author/organization: James C. Liljegren, UChicago Argonne, LLC / Department of Energy
- C99/double-precision adaptation: Max Lieblich, University of Washington
- Upstream: `https://github.com/mdljts/wbgt`, commit `cd672a886880b67f3f27bdbf75038d8f7ff0bac2`
- Original scientific reference: Liljegren et al. (2008), DOI `10.1080/15459620802310770`
- Terms: the Argonne open-source license reproduced in full at the top of `wbgt.c`; Max Lieblich's MIT notice is retained in both vendored files
- Local modifications in `wbgt.h`: restore `MAX_ITER` from 500 to the original Argonne WBGT 1.1 value of 50, and reorder the `calc_wbgt` prototype's first parameter names to match the implementation (`year, month, day, hour`). Both changes are marked inline. No equations or physical constants were otherwise changed.
- Workforce HeatOps modification: a separate MIT-licensed CPython binding in `vendor/module.c`

Required acknowledgment:

> This product includes software produced by UChicago Argonne, LLC under Contract No. DE-AC02-06CH11357 with the Department of Energy.

Neither UChicago Argonne, the Department of Energy, nor contributors endorse Workforce HeatOps. The upstream disclaimer and redistribution conditions remain applicable to the vendored source and binaries containing it.

`pywbgt` was not copied, vendored, or added as a dependency.
