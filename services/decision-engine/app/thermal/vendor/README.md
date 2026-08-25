# Vendored WBGT reference implementation

`wbgt.c` is an unmodified copy from `mdljts/wbgt` commit `cd672a886880b67f3f27bdbf75038d8f7ff0bac2`. The C source is Max Lieblich's double-precision, C99 adaptation of James C. Liljegren's Argonne WBGT Version 1.1 and retains the full upstream notices. In `wbgt.h`, Workforce HeatOps restored the iteration cap from the adaptation's 500 to the original Argonne value of 50 and corrected prototype parameter names to match `wbgt.c`; both changes are marked inline.

`module.c` is Workforce HeatOps-owned CPython binding code. It does not change the scientific equations. See the repository `THIRD_PARTY_NOTICES.md` before modifying or redistributing these files.
