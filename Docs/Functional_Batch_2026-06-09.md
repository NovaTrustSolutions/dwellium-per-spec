# Dwellium — Functional batch, 2026-06-09 (session 2)

Four asks, all built + verified in-sandbox (`tsc -b` green + **102/102 targeted
vitest** across 11 files). Live drag / launch / rendering is your Mac+browser
check — the full gate (1018 vitest + `react-router build` ×2 + PII + SSR smoke)
runs on the Mac.

---

## 1. Tab tear-off into pop-out windows (was broken)

**Root cause:** the desktop's `onDragOver` always `preventDefault()`s, so every
release "accepts" the drop and `dropEffect` is never `'none'` — the old tear-off
condition could never fire.

**Fix:** coordinate-based detection in the tab's `onDragEnd`. If a tab is
released anywhere **outside a region's 30px tab strip**, it detaches into its own
free-floating window at the drop point (real browser-tab behavior). Releases
inside a tab strip are still treated as reorder/move. Safari-safe (falls back to
the last drag coordinate when `dragend` reports 0,0).
`src/components/Shell/Desktop.tsx`.

## 2. Add / remove widgets

- **Remove:** an × on each sidebar widget (on hover) **hides it from the sidebar
  AND closes its open windows**.
- **Add:** a "+ Add widget" button opens a **gallery** of every widget; hidden
  ones are dimmed with **+ Add** (un-hide + open), shown ones have **Remove**.
- Hidden set is persisted + One Save-synced (`hiddenWidgetsStore`, global key
  like the existing `sidebarGroupsStore`).
`src/lib/hiddenWidgetsStore.ts` (new) · `Sidebar.tsx` · `Sidebar.css`.

## 3. Launch buttons (LangFlow / Paperclip / Open Notebook / backend)

A **Launch ▸** button now appears in the LangFlow, Paperclip, and Open Notebook
panels, and **Launch** buttons in System Health. They open the Terminal and run
the service's start command:

| Service | Command |
|---|---|
| LangFlow | `uv tool install langflow && langflow run` |
| Paperclip | `npx paperclipai onboard --yes` |
| Open Notebook | `docker run -d -p 8502:8502 -p 5055:5055 lfnovo/open_notebook:v1-latest` |

**Backend launch is adaptive** (your pick):
- **Electron** → restarts the bundled backend via a new `dwellium:restartBackend`
  IPC (kills + re-spawns the sidecar; no full app relaunch).
- **Dev/web** → the in-app Terminal can't boot the very backend it talks through,
  so the button **copies the start command + drops it into the Terminal** for you
  to run in your own shell. Honest about the chicken-and-egg.

`src/lib/terminalLaunch.ts` + `serviceLaunch.ts` (new) · `Terminal.tsx` ·
`SystemHealth.tsx` · the 3 panels · `electron/main.cjs` + `preload.cjs`.

## 4. Universal Shell — fully functional

The 4 columns now hold **real content** (was empty placeholders):

- **Filing Cabinet** → quick-open your files (File Explorer, Documents, PDF, Tag,
  Templates, File Manager).
- **Scratch Pad** → a quick note, auto-saved as you type.
- **Canvas** → what's open right now (click to focus/restore) + a launcher.
- **Orchestrator** → talk to the Conductor: type "put strata on the left and
  scribe on the right" and it runs (same engine as ⌘K / ARA).

`src/components/UniversalShell/adapters/WorkspaceHomeColumns.tsx` (new) +
`FilingOverviewAdapter.tsx` + `UniversalShell.css`. The Strata/Astra domain
containers still show their own columns when picked from the switcher.

---

## Verification (sandbox)

```
tsc -b ............................................. PASS (whole project)
vitest (11 files) ................................. 102/102
  new:  serviceLaunch 5 · hiddenWidgetsStore 5 · dwelliumCommands 18 ·
        integrationsCrypto 9 · spacesStore 4
  reg:  Terminal 9 · systemHealth 10 · localShell 8 ·
        providerSSRSafety 14 · desktopGrid 2 · UserContext 18
```

## Mac gate (before any push)

```
cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```

## Live checks for you (can't be unit-tested)

- **Tear-off:** drag a tab off a region onto empty canvas → it should pop into
  its own window. Drag between two tabs → still reorders.
- **Launch:** in dev with the backend up, LangFlow/Paperclip "Launch ▸" should
  run in the Terminal; "Launch backend" should copy + pre-fill the start command.
- **Add/remove:** × on a sidebar widget hides + closes it; "+ Add widget" gallery
  re-adds it.
- **Universal Shell:** open it — all 4 columns should be live (note saves,
  Orchestrator runs commands).
- The Electron `restartBackend` IPC only takes effect after an Electron rebuild.
