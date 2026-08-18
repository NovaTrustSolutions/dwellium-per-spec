# Plan 045: UI improvements — implementation plan for review 044

> **Executor instructions**: five independent clusters (A–E), each on its own branch, disjoint files — safe to run in parallel by 5 agents. Every step names the file:line to touch and a `Verify` that must be run and pasted before marking done. Two items are **Ilya decision gates** (§C4 renames, §E1 mobile strategy) — do the non-gated part, leave the gated part TODO with a note. Frontend repo `~/Downloads/Dwellium -Per Spec`, app in `qualia-shell/`. Build with `npx react-router build`; gate = `npx tsc -b && npx vitest run && NETLIFY=1 npx react-router build`; no push/merge without Ilya's go.
>
> **Drift check (run first, per cluster)**: `git log --oneline -3 -- <files listed in your cluster>` and re-read the anchors — line numbers below are from `main` @ `34686ce` (2026-08-16).

## Status

- **Source review**: [`044-ui-review-2026-08-16.md`](044-ui-review-2026-08-16.md) (9 items + smaller notes)
- **Priority / effort**: A–B are P1 and S (~½ day together); C is P1 S–M; D is P2 S; E is P2 (S if desktop-only declared, M if responsive)
- **Two corrections to 044 made while anchoring** (kept honest here):
  1. 044 §3 "sticky tooltips" — there is **no custom tooltip**; the sidebar uses native `title=` (`Sidebar.tsx:917, 943, 830`). The frozen tooltips in the screenshots were Chromium's native title tooltip under a resting Playwright pointer — not a user-facing bug. What *is* a bug in the same code path: `handleWidgetClick` (`Sidebar.tsx:442-451`) **closes** an already-open widget when its sidebar item is clicked (`else closeWindow(existing.id)`) — the user expects "bring it to front". §A3 below replaces 044 §3 with that.
  2. 044 §6 "8 unlabeled icon buttons" — every composer icon button already carries `title` + `aria-label` (`ARAConsole.tsx:2537-2657`) **except** the upload button (`shared/FileUploadButton.tsx:197`, title only). §D1 shrinks accordingly.
- **New finding while anchoring** (fold into §A2): `src/data/hierarchy.ts:23` lists Inbox Zero under Property Management with `component: 'inbox-zero'`, but the registry id is `inbox` (`widgetRegistry.ts` ~L116) and the sidebar PINNED list uses `'inbox'` — the group entry likely opens nothing / a phantom. Verify + fix in the same edit.

---

## Cluster A — Sidebar truth & IA  (branch `ui/045-a-sidebar`; files: `Sidebar.tsx`, `Sidebar.css`, `lib/backendStatus.ts`, `Shell/BackendConnectionBanner.tsx`, `data/hierarchy.ts`, `Shell/defaultStack.ts`)

### A1. One connectivity truth (044 §1) — S

- `src/components/Sidebar/Sidebar.tsx:995-1006` — footer renders a **hardcoded** `<span className="sidebar__status-dot" />` + literal `System Online`. Replace with a `useSyncExternalStore(backendStatusStore.subscribe, backendStatusStore.getSnapshot, backendStatusStore.getServerSnapshot)` read (`src/lib/backendStatusStore.ts:83-96`, states `'online' | 'offline' | 'checking'`) and map: `online → "Live"`, `checking → "Reconnecting…"`, `offline → "Offline · last sync <relative lastCheckedAt>"`.
- `src/components/Sidebar/Sidebar.css:940-967` — `.sidebar__status-dot` is unconditionally `var(--success)` with a pulse; add `--offline { background: var(--danger); animation: none }` and `--checking { background: var(--warning) }` variants.
- Copy: `src/lib/backendStatus.ts:30-31` `BACKEND_DOWN_MESSAGE` currently *"…isn't reachable. Start the backend (or set VITE_API_URL) to load live data."* → *"Live data is paused — you're working from your last sync."*; keep the dev hint only when `import.meta.env.DEV`. Banner title `BackendConnectionBanner.tsx:46` *"Backend connection failed"* → *"Not connected to Dwellium"*; prompt L52 stays.
- **Why this shape**: both surfaces read the one store, so they cannot disagree; no new component.
- **Test**: extend the existing banner/status test (grep `backendStatusStore` in `src/test/`) — render Sidebar with store `markOffline()`, assert text `Offline`; `markOnline()` → `Live`.
- **Verify**: `npx vitest run src/test -t "status"`; manual: stop backend → footer and banner show the same state word.

### A2. Sidebar IA: dedupe, rename, header sizes (044 §5) — S (+ Ilya gate on names)

- Hoist `PINNED` (`Sidebar.tsx:896-903`) above the item filter and dedupe: `Sidebar.tsx:781` `permittedItems = dockItems.filter(item => can(...) && item.component !== 'control-panel' && !hiddenSet.has(item.component))` → add `&& !PINNED_COMPONENTS.has(item.component)`. Also import PINNED ids from `src/components/Shell/defaultStack.ts:26-32` (`DEFAULT_STARTUP_STACK` duplicates the same five ids with a "keep in sync" comment) — make **one** exported `PINNED_WIDGETS` in `defaultStack.ts` and consume it in both places.
- Fix the id mismatch: `src/data/hierarchy.ts:23` `component: 'inbox-zero'` → `'inbox'` (confirm against `widgetRegistry.ts` id first; if `inbox-zero` is a real registry id, leave and note).
- Header sizes: `Sidebar.css:1563-1570` `.sidebar__widget-group-label { font-size: var(--fs-xs, 11px) }` and `Sidebar.css:296-302` `.sidebar__pinned-label { font-size: 10px }` → both `12px`, letter-spacing `1.2px`; item labels (`.sidebar-widget` label rule — find in Sidebar.css) → `13px` minimum.
- **Ilya gate — renames** in `src/data/hierarchy.ts:20-21` (+ registry labels `widgetRegistry.ts:201-208`, `256-262`): `Universal Shell` → *?* (it hosts Strata maintenance adapters — "Work Orders"?), `Trello` → *"Boards"?*. Leave labels untouched until Ilya answers; everything else in A2 ships.
- **Test**: `src/test/` sidebar spec (grep `sidebar-widget--pinned`): assert `Strata` appears once in the rendered sidebar; e2e `e2e/helpers/auth.ts` locators still resolve (`.sidebar-widget--pinned` unchanged).
- **Verify**: render sidebar → `getAllByText('Strata').length === 1`; group "Property Management" no longer lists Strata / Task Board / Inbox Zero.

### A3. Sidebar click focuses, never closes (replaces 044 §3) — S

- `Sidebar.tsx:442-451` `handleWidgetClick`: `else closeWindow(existing.id)` → `else focusWindow(existing.id)` (bring to front; if minimized → `restoreWindow`, already handled). Keep close on the explicit `×` and middle-click (`Sidebar.tsx:830` title already says "Middle-click to close").
- Drop redundant `title={p.label}` on **labeled** pinned/group items when the sidebar is not icon-only (`Sidebar.tsx:917, 943`) — keep `title` in icon-only/collapsed mode where the label is hidden. (Not a bug fix; removes tooltip noise for sighted users; `aria-label` unaffected.)
- **Test**: unit test on the click handler: open window → click → `focusWindow` called, `closeWindow` not.
- **Verify**: open Strata, click "Strata" in sidebar → window stays and is frontmost.

---

## Cluster B — Desktop defaults  (branch `ui/045-b-desktop`; files: `context/LayoutContext.tsx`, `Shell/Desktop.tsx`, `Shell/defaultStack.ts` *(read-only here — A owns edits; coordinate if both touch)*, `Shell/honchoAutoOpen.ts`)

### B1. No auto-tiling by default (044 §2) — S

- `src/context/LayoutContext.tsx:29` `regionLayout: 'halves-h'` → `'none'` (keep `regionsEnabled: true` L28 so drag-to-region and Settings → Regions still work; `getRegionRects('none')` returns `[]` at `LayoutContext.tsx:61`, so the auto-assign loop in `Desktop.tsx:706-736` places nothing).
- Existing users keep their persisted layout (store key `dwellium-layout-settings`) — **no migration**; note in the Settings picker (`ControlPanel.tsx:457-472`) that "None" is now the default. If Ilya wants everyone reset, add a one-shot `dwellium-layout-settings:v2` bump — separate decision, not done here.
- **Test**: `src/test/appfolioParity/` layout store test (grep `layoutSettingsStore`) — assert `DEFAULT_SETTINGS.regionLayout === 'none'`; update any test asserting `'halves-h'`.
- **Verify**: fresh profile (clear storage) → open ARA then Strata → both visible, no empty region outline; Settings → Regions → "Halves" still tiles.

### B2. First screen: two windows, not six (044 §9) — S

- Today first login opens **Honcho** (`Desktop.tsx:667-669` via `honchoAutoOpen.ts`) **plus** the 5-widget `DEFAULT_STARTUP_STACK` (`defaultStack.ts:26-32`, fired `Desktop.tsx:678-701`) → 6 windows into half-regions.
- Change `DEFAULT_STARTUP_STACK` → `['ara-console', 'strata-dashboard']` (Cluster A owns `defaultStack.ts` — if running in parallel, B posts the 2-line diff to A; else B edits). Remove the Honcho auto-open effect (`Desktop.tsx:667-669` + `honchoAutoOpen.ts` → delete file and its test if any) — Honcho stays one click away in AI Tools and via ⌘K.
- Keep the "N AI services need attention" toast (`SystemHealth/SystemHealthBanner.tsx:29-31`) but change copy to *"N connections need setup — open System Health"* (drop "before everything's operational").
- **Test**: `defaultStack` test (grep `shouldOpenDefaultStack`) — stack length 2; remove honcho auto-open test.
- **Verify**: fresh profile → exactly ARA + Strata open, ARA focused.

### B3. Tab strip / window chrome consolidation (044 smaller note) — S–M, optional

- The region tab strip is inline JSX in `Desktop.tsx:1289-1440` with inline colours (`#818cf8`, `#e2e8f0`, `#64748b` at ~L1421-1432) — move to a `.region-tabs` class in `Desktop.css` on tokens (`--accent`, `--text-primary`, `--text-tertiary`). Add `aria-label` to the traffic-light buttons (`Window/Window.tsx:318-334` — title only today).
- With B1 shipped the strip only appears once a user opts into regions, so this is polish, not P1.
- **Verify**: `grep -c "#818cf8" src/components/Shell/Desktop.tsx` → 0; axe run on an open window shows no `button-name` violations.

---

## Cluster C — Buttons on tokens  (branch `ui/045-c-buttons`; files: `styles/global.css` (new rules), the 8 worst widget CSS files, `StrataDashboard.tsx` chart colours)

### C1. Add the primitive that doesn't exist (044 §4) — S

- There is **no** `.btn-primary` anywhere; `animations.css:37-48` `.btn` is motion-only; Strata has its own `.s-btn*` (`StrataDashboard.css:784-845`), Tenant Portal `.tp-btn-primary`, Login `.login-primary-btn`. Add to `src/styles/global.css` (after imports):
  ```css
  .btn-primary   { background: var(--accent); color: var(--accent-text, #fff); border: 1px solid transparent; border-radius: var(--radius-md); padding: var(--sp-2) var(--sp-4); font: inherit; font-weight: var(--fw-semibold); }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: var(--bg-surface-elevated); color: var(--text-primary); border: 1px solid var(--border-default); /* same box */ }
  .btn-danger    { background: var(--danger); color: #fff; }
  .btn-ghost     { background: transparent; color: var(--text-secondary); border: 1px solid transparent; }
  ```
  (Tokens exist in `variables.css`: `--accent, --accent-hover, --accent-text, --bg-surface-elevated, --border-default, --danger, --radius-md, --sp-*, --fw-semibold`.)
- **Why**: one class set on tokens = fixed under all 18 themes at once.

### C2. Sweep the worst offenders — M (do in this order; each is its own commit)

| # | file | hex count | what to replace |
|---|---|---|---|
| 1 | `TaskBoard/TaskBoard.css` | 101 | primary/secondary buttons → `.btn-*`; surfaces → `--bg-*`; keep status swatches |
| 2 | `Shell/HalocronOS.css` | 85 | chrome colours → tokens (Holocron layout has its own look — keep its accent, but on `--accent` override, not hex) |
| 3 | `PersonaStudio/PersonaStudio.css` | 84 | same |
| 4 | `StellaAgent/StellaAgent.css` | 83 | same (WCAG bubble fix at `f83588c` must be preserved — re-run contrast) |
| 5 | `PDFGear/PDFGear.css` | 53 | |
| 6 | `OpenJarvis/OpenJarvis.css` | 47 | |
| 7 | `TranscriptionHub`, `MemoryGraphRAG`, `HonchoHermesPanel` .css | 46 each | |
| 8 | Scribe amber `+ New File` / `Import .docx`, Inbox Zero amber `Retry` — find in `Scribe*.css` / `InboxZero*.css` (grep `#f59e0b\|#fbbf24\|amber`) → `.btn-primary` / `.btn-secondary` | | |

- Rule of thumb for the sweep: **semantic** colour (status, severity, priority chips) may stay literal; **action** colour (any button/link/CTA) must be a token.
- Also `StrataDashboard.tsx:150-154` bar colours `#22c55e / #D6FE51 / #f59e0b` → `var(--success) / var(--accent) / var(--warning)`; and title gradient (`Strata Dashboard` lime) → `--gradient-hero-text`.
- **Test**: none unit-testable; run the existing Playwright screenshot baseline **locally** (`npx playwright test e2e/screenshot-baseline.spec.ts`) — expect diffs on the 8 Strata pages only where colours changed; re-capture baselines via the documented Linux workflow only after Ilya approves the new look.
- **Verify**: `for f in TaskBoard/TaskBoard.css Shell/HalocronOS.css PersonaStudio/PersonaStudio.css StellaAgent/StellaAgent.css; do echo "$f $(grep -cE '#[0-9a-fA-F]{6}\b' src/components/$f)"; done` — each ≤ 20; visual: Scribe / Inbox / Task Board / System Health primary buttons share one colour under themes *Cosmos* **and** *Latte*.

---

## Cluster D — ARA & Login  (branch `ui/045-d-ara-login`; files: `ARAConsole/ARAConsole.tsx`, `ARAConsole/AraIntroVideo.tsx`, `lib/araPrefsStore.ts`, `shared/FileUploadButton.tsx`, `Auth/LoginScreen.tsx`, `Auth/LoginScreen.css`, `context/UserContext.tsx` (4 lines))

### D1. ARA composer + intro (044 §6, corrected) — S

- Upload button a11y: `src/components/shared/FileUploadButton.tsx:197` add `aria-label={title}`.
- Voice gender toggle out of the composer: `ARAConsole.tsx:2607-2625` (`.ara-gender-toggle`, writes `localStorage['dwellium-ara-gender']` + `['dwellium-ara-voice']`) → move the same control into the voice-settings drawer opened by the sliders button (`ARAConsole.tsx:2598-2606`, `aria-expanded`), keep the storage keys.
- Intro once per user: `AraIntroVideo.tsx:22-30` reads `sessionStorage['dwellium-ara-intro-played']`; `UserContext.tsx:328, 369` (+2 more literal sites) clear it on login/logout so it replays every session. Add `introSeen: boolean` to `AraPrefs` (`lib/araPrefsStore.ts:14-24`, key `dwellium-ara-prefs`), set it when the intro ends or Skip is pressed, gate on it in `AraIntroVideo.tsx`; delete the four `sessionStorage.removeItem('dwellium-ara-intro-played')` lines in `UserContext.tsx`. Keep `ARA_SKIP_INTRO_KEY` (L17) as the manual override.
- **Test**: `araPrefsStore` test — `introSeen` default false, `set('introSeen', true)` persists; AraIntroVideo test (grep `AraIntroVideo` in `src/test/`) — does not render when `introSeen`.
- **Verify**: log out, log in → ARA opens on the composer, no video; DevTools: `JSON.parse(localStorage['dwellium-ara-prefs']).introSeen === true`.

### D2. Login in one form (044 §7) — S (ships with plan 014)

- `LoginScreen.tsx:29` `type Stage = 'gate' | 'select' | 'credential'` → drop `'select'`: after the gate, render the credential form (L201-253) with an **email** field instead of the account picker (L176-199 removed). Submit calls the existing backend `login(email, password)` (`UserContext.tsx:73`, impl L326-366, POST `/api/auth/login`); on `offline: true` fall back to the existing offline offer (L234-250) which uses `loginLocal`.
- Delete `LOCAL_ACCOUNTS[].password` reads from the client path (`localAccounts.ts:46-50`) **only together with plan 014** (server-side verification). If 014 isn't landing in the same wave, keep the client compare but still remove the picker — the email field replaces it.
- **Test**: `src/test/LoginScreen.test.tsx` — update flow: gate → credential (no select); "Resident? Sign in here" still present.
- **Verify**: gate → one form → Continue → desktop; 3 steps incl. splash (was 4).

---

## Cluster E — Narrow viewports  (branch `ui/045-e-responsive`; files: `Sidebar.css`, `Sidebar.tsx` (width store default), `Shell/BackendConnectionBanner.css`, `AssistantLauncher/AssistantLauncher.css`, `Workspace/ThreadSwitcher.tsx`)

### E1. **Ilya gate first**: (a) responsive rail, or (b) desktop-only interstitial

Facts: `Sidebar.css:6-18` has no width (inline `DEFAULT_WIDTH = 240`, `Sidebar.tsx:38`); **zero** `@media` width rules in `Sidebar.css`, `BackendConnectionBanner.css`, `Shell/Desktop.css`; the FAB is `AssistantLauncher.tsx:244-254` `.al-fab`; the "No active thread" pill is fully inline-styled at `Workspace/ThreadSwitcher.tsx:57-79`.

- **(a) Responsive (M)**: `@media (max-width: 768px)` → sidebar collapses to the existing icon-only mode (`qualia_sidebar_icon_only`, `Sidebar.tsx:377-383` reads a width store — set width 56 and `iconOnly` when narrow); banner `.backend-banner { flex-wrap: wrap }` + `.backend-banner__body { min-width: 0 }`; move ThreadSwitcher styles to a class and hide it when the launcher is open; `.al-fab` bottom offset above the pill.
- **(b) Desktop-only (S)**: in `AdminShell.tsx` (mount point of the banner, L161) render a full-screen "Dwellium works best on a laptop or desktop — residents: open the Tenant Portal" panel when `matchMedia('(max-width: 640px)')` and the route isn't the tenant portal.
- **Verify (a)**: 390×844 → sidebar ≤ 56 px, banner ≤ 2 lines, FAB and pill don't overlap. **(b)**: 390×844 → interstitial; ≥ 768 → normal.

---

## Cluster F (smaller notes, fold into whichever cluster owns the file)

- **Occupancy chart** (`StrataDashboard.tsx:158-191`, CSS `.s-chart-container` `StrataDashboard.css:338-341` fixed `height: 280px`): `ResponsiveContainer minWidth={0} minHeight={0}` + `<YAxis width={140} tick={{ fontSize: 11 }} tickFormatter={truncate(18)}>` + `<LabelList dataKey="pct" position="right" />`; silences the 24× `width(0)/height(0)` warnings when region-collapsed. → Cluster C (same file as bar colours).
- **Persona subtitle italic** (`ARAConsole.css:570-574` `.ara-hint-lens`, `366-370` `.ara-detail-lens`): drop `font-style: italic`, use `--text-secondary`. → Cluster D.
- **Window traffic-light `aria-label`s** (`Window/Window.tsx:318-334`). → Cluster B3.

---

## Sequencing & dispatch

- **Wave 1 (parallel, 5 agents)**: A, B, C, D, E(a or b once gated). Disjoint files except `defaultStack.ts` (A owns; B sends the 2-line diff) — merge order after approval: **A → B → D → C → E** (C last because it touches many CSS files and screenshot baselines).
- **Wave 2**: re-capture Linux screenshot baselines via `gh workflow run "Capture Linux Playwright Baselines …"` (documented in CLAUDE.md) once C is merged and Ilya has eyeballed the new buttons under 2 themes.
- **Gate per branch**: `npx tsc -b && npx vitest run && NETLIFY=1 npx react-router build` green + the cluster's `Verify` lines pasted in the PR/commit body. No push without Ilya's go.

## STOP conditions

- A2 renames and E1 strategy: **do not guess** — leave TODO with the two options if Ilya hasn't answered.
- B1: do **not** migrate existing users' `regionLayout` without a separate go (it's their saved layout).
- D2: do **not** blank client passwords unless plan 014's server verification ships in the same wave (lockout risk — 014 §STOP).
- C2: if a colour replacement changes contrast on the Stella bubble or Strata cards, re-run the WCAG check the repo already documents (composited background) before committing.

## Decision gates for Ilya (answer inline and I'll dispatch)

1. **A2 renames**: `Universal Shell` → ? · `Trello` → ? (or keep).
2. **E1**: (a) responsive rail (M) or (b) desktop-only interstitial (S)?
3. **B1**: new-users-only default (recommended) or reset everyone's region layout too?
