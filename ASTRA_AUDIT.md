# Astra Dashboard Audit — "do the autorun's astra commits actually work?"

**Auditor:** Claude (Opus), 2026-05-30. Same method as `WHY_GREEN_IS_NOT_WORKING.md`: read the real code, run the real tests, cite file/line — no claims from memory.

## Bottom line

**Mostly yes — and, unlike ThoughtWeaver, it was done honestly.** The astra work wires real data through the app's established client, surfaces failures *visibly* instead of swallowing them, labels its sample data, and the responsive/a11y polish is real. The one thing you need to know: like the whole app, astra only shows **real numbers when the Dwellium backend is running** — with no backend it degrades to honest "Couldn't load data" / empty / "Sample" states, not silent dead panels.

This is the opposite of the ThoughtWeaver failure, so I'm not "fixing" astra — there's nothing hollow to fix.

## Commits audited

| Commit | Claim | Verdict |
|--------|-------|---------|
| `8440403` Cycle 3 | "wire AstraDashboard's 7 panels to real data + loader hook" | **Real** (backend-dependent, honest) |
| `d84c407` Cycle 10 | "dashboard reflows on window width via container queries" | **Verified in CSS** |
| `e302b84` Cycle 11 | "unify focus-ring offset (1px); a11y/states runtime-verified" | **Verified in CSS** |

## 1. Cycle 3 — "wired to real data" → REAL

- **Real reads through the app's real client.** `dashboardData.ts` imports `strataGet` from `StrataDashboard/strataApi` — the *same* client the working AppFolio-parity modules use — and reads real endpoints: `fetchHeatmap` → `/properties` + `/units` + `/workitems`; `fetchWatchdog` → `/workitems`; `fetchFinancialCards` → `/forecast`; plus compliance/litigation/leases/vendors/finance. Each does real normalization (occupancy %, open-maintenance counts, due-date sort), not empty arrays. The file header says exactly this: panels "historically rendered from empty mock arrays" and were rewired to live endpoints.
- **Failures are surfaced, not swallowed.** `useDashboardData.ts` keeps `{ data, loading, error, reload }` and does `.catch(e => setError(...))`. `AstraDashboard.tsx`'s `PanelStatus` renders a visible `role="alert"` **"Couldn't load data — {error}"**, plus labeled empty states ("No properties to show", "No high-priority items", …). This is the exact opposite of ThoughtWeaver's silent `catch {}`.
- **Sample data is labeled, not faked.** HR has no backend endpoint, so `fetchHrSnapshot()` returns `{ mock: true, … }` and the UI shows a **"Sample" badge** (title: "Sample data — not yet wired to a live source"). Honest.
- **Right base URL.** `strataGet` uses backend mode `/api/dwellium` (same-origin proxy) — *not* the hard-coded `http://localhost:3000` that broke ThoughtWeaver.
- **The logic is actually tested.** `src/test/appfolioParity/dashboardData.test.ts` (490 lines, **37 tests, all passing** — I ran it in isolation) drives the fetchers with an injected fake `get` and asserts occupancy math, watchdog filtering/sort order, empty-seed tolerance (`[]`), and the HR `mock:true` shape — no backend required. A test that can actually fail.

## 2. Cycles 10 & 11 — polish → VERIFIED in CSS

- **Cycle 10 reflow:** `AstraDashboard.css` has `container-type: inline-size; container-name: astra-content` and `@container astra-content (max-width: 1080px)` + `(max-width: 820px)` rules. It genuinely reflows by container width (correct modern approach), not just viewport media queries.
- **Cycle 11 focus rings:** consistent `:focus-visible { outline: 2px solid var(--a-accent); outline-offset: 1px }` across the drill, compliance, litigation, and ops rows — the "unified 1px offset" is real and consistent.
- On "a11y/states **runtime-verified**": I can't confirm the loop actually ran it in a browser, but the CSS is present and correct, so the *substance* of the claim holds. (The repo's CI also runs an axe a11y baseline.)

## 3. The caveats that matter (honest gaps, not lies)

- **Backend dependence:** astra shows real figures only with the Dwellium backend up. No backend → visible error/empty/Sample states. So "does it work?" = yes, correctly and honestly; "will I see live data without the backend?" = no (same as the entire app).
- **Labeled placeholders (acknowledged in code comments, not hidden):** heatmap `delinquency` is hard-set to `0` pending wiring; watchdog "property" shows the `propertyId` until the name-join lands (commented "Cycle 6"); HR is the sample org. These are honest TODOs, not green-washed lies.
- **One real coverage gap:** the *data layer* is unit-tested (37 tests), but the full-panel **render** (loading/error/empty/Sample states inside the actual component) is covered only by the production build + my code read — there's no render test asserting the error state shows. If you want, I'll add one (the ThoughtWeaver-style "render it with the backend failing and assert it degrades honestly") so a future regression to silent-blank would fail CI.

## Evidence (commands run this session)

- `git log --oneline | grep astra` → the 3 commits above.
- Read `dashboardData.ts` (strataGet wiring, `mock:true` HR, fetchers), `useDashboardData.ts` (error-surfacing hook), `AstraDashboard.tsx` (`PanelStatus` error/empty/Sample), `strataApi.ts` (`/api/dwellium`), `AstraDashboard.css` (container queries + focus-visible).
- `npx vitest run src/test/appfolioParity/dashboardData.test.ts` → **37 passed, exit 0.**

## Verdict vs ThoughtWeaver

ThoughtWeaver: silent `catch`, `needs_review/0` dead-end, `localhost:3000` default → looked alive, did nothing. **Astra: visible errors, labeled samples, `/api/dwellium`, tested composition → behaves honestly whether or not the backend is up.** Different quality of work entirely. The astra loop's output here is trustworthy; the cosmetic cycles are real; the only "it won't show data" cause is the absent backend, which it reports plainly.
