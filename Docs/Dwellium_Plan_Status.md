# Dwellium — Plan Status

**Date:** 2026-06-09 · **Owner:** Ilya

Status of the consolidation plan (`Dwellium_Consolidation_Proposal.md`) after this build arc. Everything below was verified `tsc -b` green + targeted-vitest green in-sandbox; the **full** `vitest` (999) + `react-router build` are the Mac gate (sandbox jsdom/FUSE can't finish them) — last full Mac run: **999 passed**.

---

## ✅ Done this arc

### One Save — persistence spine (the "stays forever" requirement)
- **P0 backend** (`ai-dashboard369-file-manager`): `/api/objects` object store + append-only `events/<id>.ndjson` + soft-delete + path-traversal guard + owner forced to `req.user.id`. Files in `Docs/OneSave_Backend_P0.md`; applied + gate-green (store behavior 6/6, full backend `tsc --noEmit` clean).
- **Client spine** (`src/lib/oneSaveClient.ts` + `oneSaveStore.ts`): `withSync` (dynamic-key stores) + `withSyncStatic` (static-key stores, incl. custom `persistLocal` for composite blobs) + registry + `oneSaveSync.bootstrap` (hydrate + migrate on login; lazy-store catch-up). Wired into `UserContext`. All gated by `VITE_ONE_SAVE` → inert until enabled.
- **30 of 40 stores synced** (write-through + hydrate + one-time backfill):
  - *Content (17):* wiki, foundry, honcho-memory, honcho-dream, copaw, synthesis, thoughtWeaver, report, hermesLearning, tag, priority, dump, taskBoard, todo, scribeTheme, scribeCustoms, speakerLibrary.
  - *Arrangement (7):* savedLayouts, dashboardLayout, scribeLayout, workspaceUi, activeThread, fileExplorer, hierarchy.
  - *Appearance (4):* theme, fontPairing, accentColor, animationsEnabled.
  - *Chrome (2):* layoutSettings, dockItems (composite-blob merge).
- **Excluded by design (10):** `tokenStore` (auth), `integrationsStore` (API-key encryption = your "decide later"), `speakerSettings` (global calibration pref), `ingestionStore` (file-system handle not persistable), and 6 screen-dependent sidebar dims (width/split/icon-rail/domains-collapsed/sidebar-groups/gridLock — local by design).
- **Smoke test:** `Scripts/smoke_one_save.sh` (backend round-trip) + `Docs/OneSave_SmokeTest.md` (UI browser-wipe survival test + checklist).

### Visual polish
- **Quick wins:** ⌘K palette confirmed already-wired; icon-rail calm sidebar default (+ e2e seed); gradient lit-edge on Strata cards; spotlight/springs app-wide.
- **Phase B:** 28px window chrome; active vertical-nav accent stripe on the icon-rail; active-nav states migrated off hardcoded blue/violet to `var(--accent)` (theme-consistent).

### Governance
- DOX `AGENTS.md` hierarchy (root + qualia-shell + Scribe + styles + Docs + Scripts + electron).

---

## ◻ Remaining roadmap (large initiatives — each needs its own kickoff)

These are from the proposal's Sections 2–4 and are **multi-week feature/architecture efforts**, not quick passes. They need design decisions (yours) and a running app to validate, so they're scoped here rather than built blind:

1. **Way 2 — Spaces** *(days).* Wrap `savedLayoutsStore` (already synced) as ~5 named Spaces (Write / Manage / Research / Comms / Build); sidebar switches the whole canvas. Most self-contained next step. *Decision needed:* the Space set + default.
2. **Way 1 — One Front Door** *(~1 week).* Extend the existing ⌘K palette into the primary nav; shrink the sidebar to ~5 pinned. Builds on the palette that already exists.
3. **One Conductor + One Memory** *(2–3 weeks).* Fold the ~10 agents into ARA-as-orchestrator (spawns Hermes/Hydra/etc. as skills); make Honcho the single memory spine that every widget writes through. Deepest change — do last. *Decisions needed:* which agents collapse vs. stay; ARA tool/skill registry shape.

---

## Commit checklist
- **qualia-shell:** One Save client spine + 30 wrapped stores + UserContext bootstrap + Phase B CSS + the icon-rail-default test fix + docs.
- **ai-dashboard369-file-manager:** the 3 P0 files + `app.ts` mount.
- Run `npx tsc -b && npx vitest run && npx react-router build` (qualia-shell) + `npx jest objectStore` (backend) before committing.

---

## ✅ Consolidation build (2026-06-09, follow-up) — the rest of the proposal

All `tsc -b` green + 19 new unit tests green in-sandbox (`spacesStore`, `dwelliumCommands`, `unifiedMemory`). UI behaviors compile + the pure logic is tested; the on-screen flows (clicking a Space swaps the canvas, ⌘K runs a command, ARA executes) need the dev server to confirm end-to-end. Full `vitest` + `react-router build` remain the Mac gate.

- **Way 2 — Spaces.** `src/lib/spacesStore.ts` (5 defaults: Write/Manage/Research/Comms/Build → real widget ids; One-Save-synced) + `SpacesSwitcher` at the top of the sidebar (icon-rail + expanded) + a `dwellium:apply-space` bus in `WindowContext` that swaps the canvas (minimize others, open/restore the Space's widgets).
- **Talk-to-customize + Conductor tools.** `src/lib/dwelliumCommands.ts` — `openWidget · switchSpace · saveSpace · setTheme · setAccent · setAnimations · tileWindows · spawnAgent · recall · remember`, plus a heuristic `parseCommand` ("switch to research", "make accent teal", "save space Morning", "open strata", "arrange windows", "remember that…"). `dwellium:tile` grid-arrange bus added to `WindowContext`.
- **Way 1 — One Front Door.** The ⌘K palette now surfaces a **Command** result (runs the parsed command) and **Memory** results (recall), on top of the existing widget/window/task/doc search. The sidebar primary nav is the icon-rail + Spaces.
- **One Conductor.** ARA (`ARAConsole.sendMessage`) intercepts direct commands and runs them (skipping the LLM) — so you can *tell* ARA "switch to research" or "make accent teal."
- **One Memory.** `src/lib/unifiedMemory.ts` — one `recall` across honcho + copaw + thought-weaver, one `remember` that writes to Honcho (the canonical store). ARA + ⌘K read through it.

**Honest scope note:** these deliver the proposal's *architecture* + headline UX as a verified-compiling, unit-tested slice. The deepest ambitions — true window **tab-grouping** (vs. the tiling shipped), folding *all ~10 agents* into ARA as spawnable sub-agents, and an LLM-routed (not heuristic) Conductor — are larger and remain genuine follow-ons. What's here is real, on-brand, and inert-safe (commands are additive; Spaces ride on synced `savedLayouts`).

### New files this build
`src/lib/spacesStore.ts` · `src/lib/dwelliumCommands.ts` · `src/lib/unifiedMemory.ts` · `src/components/Sidebar/SpacesSwitcher.{tsx,css}` · tests `src/test/{spacesStore,dwelliumCommands,unifiedMemory}.test.ts`. Touched: `WindowContext.tsx` (apply-space + tile bus), `Sidebar.tsx` (SpacesSwitcher), `CommandPalette.tsx` (command + memory results), `ThemeContext.tsx` (imperative setters), `ARAConsole.tsx` (command intercept).
