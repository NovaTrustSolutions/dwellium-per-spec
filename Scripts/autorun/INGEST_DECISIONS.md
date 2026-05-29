# INGEST_DECISIONS.md — fork log (reversible defaults)

Every decision fork in the Scribe-ingestion/Honcho/statute arc. Defaults are
reversible; recorded so a later cycle (or Ilya) can flip them.

| # | Cycle | Fork | Decision | Why / reversal |
|---|---|---|---|---|
| D-1 | 1 | Honcho standalone: share component vs. move code out of Stella | **SHARE.** Register a new `honcho` widget that lazy-loads `HonchoHermesPanel.tsx`; touch StellaAgent.tsx = ZERO. | Stella already has its own INLINE honcho/hermes tabs (doesn't consume HonchoHermesPanel), so there is nothing to extract from Stella. Lowest risk; keeps Stella tests green. Reversal: if we later want one source of truth, migrate Stella's inline tabs to import the panel (separate task). |
| D-2 | 1 | Persist `FileSystemDirectoryHandle` to localStorage? | **NO — store metadata only** (name, last-sync ts, converted-index). Keep the live handle in component/module memory; re-pick required after reload. | Handles are not reliably JSON-serializable/persistable across reloads in all browsers; IndexedDB persistence is a later enhancement. Reversal: add IndexedDB handle persistence + `queryPermission()` re-grant flow in a follow-up. |
| D-3 | 1 | FS Access API missing (Firefox/Safari) | **Honest-unavailable banner** (feature-detect `'showDirectoryPicker' in window`). | Matches the repo's existing "honest-unavailable" widget pattern; never throw. Reversal: add an `<input type=file webkitdirectory>` fallback path later. |
| D-4 | 1 | Where do the new ingestion files live? | `qualia-shell/src/components/Scribe/ingestion/` (new subdir). | Keeps ingestion code co-located with the Scribe converter it reuses, without bloating Scribe.tsx. |
| D-5 | 8 | "Always-on by default" semantics for Honcho — reopen every session vs. open once then respect user | **OPEN ONCE, then respect the user.** Pinned (Cycle 6) + a one-time auto-open on first ready Desktop, gated by localStorage flag `honcho:auto-open:v1`. Once the user has seen it (flag set), it never auto-reopens, so closing it sticks. | Most reversible/polite reading of "opens by default" — never fights a user who closed it. To make it reopen EVERY session, flip the predicate `shouldAutoOpenHoncho` to always-true (one line, documented in `honchoAutoOpen.ts`). Reversal: delete the localStorage flag to re-trigger the first-open, or remove the Desktop effect. |
| D-6 | 8 | "See multiple physical desktop screens" (the multi-screen ask) | **DEFERRED — requires Electron / OS-level access; NOT possible in the web app.** Documented as a deferred item; no web-app attempt. | Browsers cannot enumerate/capture other physical monitors or OS desktops (the Window Management API only exposes screen geometry for placing app windows, not reading other apps' contents). True multi-screen awareness needs the planned Electron build's main-process + native APIs (`screen` + `desktopCapturer`). Reversal: implement in Electron when that build exists. |

## Cycle 15 — TW ↔ ARA ↔ Honcho integration

- **D15-1 (TW → ARA bus reuse).** TW sends context to ARA by firing the EXISTING
  `scribe:send-to-ara` CustomEvent that ARAConsole already listens for (ARAConsole.tsx:1057,
  via `composeAraPrompt`). NO new event, NO ARA code change → fully decoupled. Reversible
  (delete the dispatch). Mirrors how the Scribe SelectionToolbar already feeds ARA.
- **D15-2 (TW → Honcho = LOCAL dreamStore, not backend).** "Save to Honcho memory" appends a
  `DreamEntry`-shaped record to the LOCAL per-user `honchoDreamStore` (`appendDream`), NOT the
  backend `/api/honcho/memories` route. Rationale: arc rule "KEEP DATA LOCAL + shared per-user
  stores"; the dream store is Honcho's only local store and renders in the standalone Honcho
  widget's Dreams tab (Cycle 8). Backend memory sync stays optional/out-of-scope. Reversible.
- **D15-3 ("ARA can pull TW context").** Satisfied by (a) the user-driven push (per-insight
  "→ ARA" buttons) + (b) an exported pure `buildTwContextDigest(captures, insights)` helper that
  produces a compact markdown digest ARA/Honcho can consume. Auto-pull wiring INTO ARAConsole
  (ARA reading the TW store unprompted) is DEFERRED — it would couple ARA to TW's store and
  expand ARA's render path; the digest helper makes that a one-liner later if wanted.
- **D15-4 (linkage module shape).** New `thoughtWeaverLinkage.ts` mirrors the established
  `araLinkage.ts` / `stellaLinkage.ts` / `workspaceScribe.ts` injectable-deps pattern exactly:
  pure compose functions + side-effects injected as `deps` (default = real bus/store) so the
  whole module unit-tests with no DOM listener, no live ARA, no real localStorage.
