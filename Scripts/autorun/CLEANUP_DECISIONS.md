## Cycle 10 fork — viewport @media vs container queries (2026-05-31)
**Decision:** container queries on `.a-content` (`container-type: inline-size`), NOT more
viewport `@media`. **Why:** Astra is a resizable shell window; viewport queries can't see
window resizes on a wide monitor (proven: 152px overflow at viewport 1440 / window 680).
Matches the documented Strata `.s-module` container-query convention. Kept a slim viewport
fallback for non-supporting contexts. Breakpoints 1080px→2col, 820px→1col.
