# Plan 039: Fluid OS — third interface layout (EverSwap/Lusion-style fluid navigation, full app parity)

> **Executor instructions**: Follow step by step; verify every step. On STOP
> conditions, stop and report. Commit in the worktree per the git workflow.
> SKIP updating `plans/README.md` — the reviewer maintains the index.
>
> **Repo**: FRONTEND `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at frontend `5fac7c8`, 2026-07-04). All verification on the Mac.
>
> **Drift check (run first)**:
> `git diff --stat 5fac7c8..HEAD -- qualia-shell/src/components/Shell/HalocronOS.tsx qualia-shell/src/lib/halocronOsStore.ts qualia-shell/src/components/Shell/Desktop.tsx`
> NOTE: `Desktop.tsx` and shell files MAY have drifted if plan 038's branch
> merged first — if the diff shows ONLY plan-038's logActivity additions,
> proceed; anything else → STOP.

## Status

- **Priority**: P2 (owner-requested)
- **Effort**: L (new layout component + motion system)
- **Risk**: MED (new overlay layout; mitigated: renders null unless enabled — Classic and Halocron untouched)
- **Depends on**: none hard (see drift note re 038)
- **Category**: direction
- **Planned at**: frontend `5fac7c8`, 2026-07-04

## Why this matters

Owner request (verbatim intent): "Create another OS, call it Fluid OS. Have it
be a version that is just like EverSwap built by Lusion. Make sure it has
access to everything that the other two OSs have access to — just a different
layout, a different way of navigating." Dwellium already has two interchangeable
layouts over the same features (Classic windowed desktop + Holocron OS launcher
shell). Fluid OS is the third: same apps, same windows, same gating — navigated
through fluid, physics-driven motion inspired by Lusion's EverSwap
(Awwwards-nominated for its liquid WebGL motion): full-bleed focus cards,
drag-to-swap with inertia, liquid morphing transitions. Inspiration = motion
LANGUAGE only; no assets, text, or code from the reference site.

## Current state (verified at `5fac7c8`)

- `qualia-shell/src/lib/halocronOsStore.ts` (110 lines) — THE TEMPLATE for the
  new store: `createLocalStorageStore` + `withSyncStatic(oneSaveStore)` wrapper,
  `HalocronOsState { enabled, open, compactChrome, focusCanvas, splitLayout }`,
  normalize(), key `'dwellium-halocron-os'`, SSR-safe getServerSnapshot.
- `qualia-shell/src/components/Shell/Desktop.tsx:1165-1175` — mount pattern:
  `<Suspense fallback={<AppSuspenseFallback variant="viewport" />}><HalocronOS /></Suspense>`
  followed by `<HalocronLauncher />` ("Both render null unless the OS layout is
  enabled, so Classic is untouched"). Fluid OS mounts the same way, adjacent.
- `qualia-shell/src/components/Shell/HalocronOS.tsx:245-260` — the catalog +
  gating pattern Fluid OS MUST reuse verbatim in spirit: iterate
  `WIDGET_REGISTRY`, skip `w.restrictedToEmails` entries not matching the
  signed-in email (raw `useContext(UserContext)`), group by category. This is
  what guarantees "access to everything the other two have" including the
  Audit Log's email gating.
- Opening apps: HalocronOS opens via the shared `openWindow(component, label,
  icon)` from `WindowContext` and collapses itself (`open=false`) to reveal the
  window; the launcher rune (`HalocronLauncher.tsx`, 21 lines) floats to
  reopen. Fluid OS follows the same contract (and thereby inherits plan-038
  activity history for free).
- Layout selection: `halocronOsStore.enabled` boolean picks Holocron vs
  Classic. Locate the toggle UI (`grep -rn "halocronOsStore" src/ | grep -v
  Shell/` — likely Control Panel / settings surface) — Fluid OS adds a third
  choice there.
- Registry icons: `src/components/Sidebar/iconMap.ts`; lazy pattern:
  `lazyWithReload` at top-level altitude (App/registry) — but layout shells are
  imported like HalocronOS (check how Desktop imports it — match it).
- Conventions: inline styles OR component css file (HalocronOS has its own
  patterns — check for `HalocronOS.css`); vitest+RTL; `.reset()` in beforeEach;
  fey.com design system (Hanken Grotesk, pure black, acid lime `#D6FE51`);
  WCAG AA contrast vs composited backgrounds; `prefers-reduced-motion` respect
  is REQUIRED for a motion-heavy surface.
- Gate: `SMOKE_TEST_PORT=3210 bash Scripts/gate.sh` (repo root).

## Approach (decided)

**New files**: `src/lib/fluidOsStore.ts` (sister of halocronOsStore; key
`'dwellium-fluid-os'`; state `{ enabled, open }` minimum), 
`src/components/Shell/FluidOS.tsx` + `FluidOS.css`, `src/components/Shell/FluidLauncher.tsx`
(sister of HalocronLauncher — a floating droplet button that reopens the shell).

**Mutual exclusivity**: enabling Fluid OS sets `halocronOsStore.enabled=false`
and vice versa — implemented in the TOGGLE UI handlers (not store coupling).
Classic = both disabled.

**The Fluid OS experience** (motion language, not a clone):
- Full-screen overlay, near-black liquid background: a single `<canvas>`
  running a lightweight metaball/curl-flow gradient field (2D canvas or tiny
  WebGL frag shader — NO new npm deps) that reacts to pointer velocity and
  swap momentum. Cap at 60fps rAF; PAUSE the loop entirely when `open=false`
  or the tab is hidden.
- Navigation = **swap streams**: one app category in focus at a time as a
  full-bleed band; horizontal drag/trackpad/wheel with inertial spring physics
  (implement a ~100-line rAF critically-damped spring util in the component —
  no framer-motion) flows between APPS within the category; vertical
  drag/arrow keys swaps CATEGORIES. The outgoing card "melts" toward the drag
  direction while the incoming one flows in (scale/skew/translate +
  border-radius morph + canvas turbulence kick — the EverSwap feel).
- Each app card: icon (iconMap), label, category chip, subtle live tilt toward
  pointer. Click/Enter → `openWindow(...)` + collapse (`open=false`), exactly
  like Halocron.
- Quick access: a search field (autofocus on `/` key) filtering ALL gated-visible
  widgets flat; Escape closes shell to reveal windows; the FluidLauncher
  droplet floats bottom-right to reopen.
- A11y + degradation: full keyboard nav (arrows + Enter + `/` + Escape),
  `aria-label`s on cards, and `prefers-reduced-motion: reduce` → springs snap,
  canvas renders a static gradient.
- Greeting header like Halocron's (time-of-day) + total-app count — parity of
  information, different skin.

## Commands you will need

| Purpose | Command (in `qualia-shell/`) | Expected |
|---|---|---|
| Typecheck | `npx tsc -b` | exit 0 |
| Focused tests | `npx vitest run src/test/fluidOs.test.tsx` | pass |
| Full suite | `npx vitest run` | all pass |
| Full gate | `cd .. && SMOKE_TEST_PORT=3210 bash Scripts/gate.sh` | GATE GREEN |

## Scope

**In scope:**
- CREATE: `src/lib/fluidOsStore.ts`, `src/components/Shell/FluidOS.tsx`, `src/components/Shell/FluidOS.css`, `src/components/Shell/FluidLauncher.tsx`, `src/test/fluidOs.test.tsx`
- EDIT: `src/components/Shell/Desktop.tsx` (mount block only, adjacent to HalocronOS), the layout-toggle UI file you locate (add the third option + exclusivity), `src/lib/perUserIdentity.ts` ONLY IF you make the store per-user (NOT required — Halocron's is static; match it and skip perUserIdentity).

**Out of scope:** HalocronOS.tsx / halocronOsStore.ts behavior changes (read them, don't edit — EXCEPT if the toggle UI lives inside HalocronOS.tsx settings, in which case edit ONLY the toggle block); WindowContext; widgetRegistry entries; any new npm dependency; copying any asset/shader/text from everswap or lusion.co.

## Git workflow

- Worktree: `git worktree add ".advisor-worktrees/039" -b advisor/039-fluid-os main` (quote paths); `npm ci` in its `qualia-shell/`.
- Conventional commits: `feat(fluid-os): third interface layout — fluid swap navigation shell`. Do NOT push.

## Steps

1. **Store** (`fluidOsStore.ts`): mirror halocronOsStore exactly (normalize,
   withSyncStatic `objectType: 'fluid-os'`, `.reset()`).
   Verify: `npx tsc -b` → 0.
2. **Shell component** (`FluidOS.tsx` + css): catalog with gating (copy the
   :245-260 pattern), swap-stream navigation + spring physics + canvas field +
   a11y/reduced-motion per Approach; renders `null` when `!enabled || !open`
   except the canvas teardown. `FluidLauncher.tsx`: renders null unless
   `enabled && !open`; droplet button reopens.
   Verify: `npx tsc -b` → 0.
3. **Mount** in `Desktop.tsx` beside HalocronOS (same Suspense pattern; comment
   mirrors the existing one).
   Verify: `npx tsc -b` → 0; full vitest green.
4. **Layout toggle**: add "Fluid OS" as a third layout option where Holocron
   is toggled; enabling either disables the other.
   Verify: `npx tsc -b` → 0.
5. **Tests** (`fluidOs.test.tsx`, model on any existing HalocronOS/shell test):
   (a) store normalize + reset + defaults; (b) renders null when disabled;
   (c) when enabled+open: all non-restricted registry widgets appear and a
   `restrictedToEmails` widget is HIDDEN for a non-matching email but SHOWN
   for the matching one (use `audit-log` — this pins the parity requirement);
   (d) activating a card calls `openWindow` with the widget id and sets
   `open=false`; (e) `/` focuses search, filtering narrows cards; (f) Escape
   closes; launcher appears.
   Verify: focused suite passes → full `npx vitest run` → full gate GREEN.
6. **Visual QA** (headless Chromium via the repo's Playwright, like plan 037's
   review): serve the built app or run vite dev, enable Fluid OS via
   localStorage seed, screenshot the shell (idle + mid-swap if scriptable) to
   `/tmp/fluid-os-qa/*.png`; list paths. If headless canvas perf is
   unrepresentative, note it — the owner does the live pass.

## Done criteria

- [ ] tsc, focused + full vitest, gate — all green (Mac)
- [ ] Parity test (5c) proves gated visibility identical to Halocron's rules
- [ ] `git diff --name-only main..HEAD` ⊆ scope list
- [ ] Screenshots saved + listed
- [ ] Reduced-motion behavior implemented (grep `prefers-reduced-motion` in FluidOS.css or tsx)
- [ ] Committed; report lists motion constants + any judgment calls

## STOP conditions

- The layout-toggle site can't be located confidently — report candidates.
- Mount or store work requires editing HalocronOS behavior beyond the toggle block.
- Canvas rAF loop shows any test-environment instability (unstubbed rAF loops breaking vitest) — stub in tests, and if that fails twice, report.
- Any full-suite failure outside touched files.

## Maintenance notes

- Fluid OS reads the registry live — new widgets appear automatically; restricted widgets follow `restrictedToEmails` with zero extra work.
- Reviewer: scrutinize canvas lifecycle (no leaked rAF/listeners after close — the repo has a history of unmount-teardown findings) and the exclusivity toggles.
- Owner does the final motion-feel pass (aesthetic bar = "feels like EverSwap, not a carousel").
