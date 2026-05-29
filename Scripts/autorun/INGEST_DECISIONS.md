# INGEST_DECISIONS.md — fork log (reversible defaults)

Every decision fork in the Scribe-ingestion/Honcho/statute arc. Defaults are
reversible; recorded so a later cycle (or Ilya) can flip them.

| # | Cycle | Fork | Decision | Why / reversal |
|---|---|---|---|---|
| D-1 | 1 | Honcho standalone: share component vs. move code out of Stella | **SHARE.** Register a new `honcho` widget that lazy-loads `HonchoHermesPanel.tsx`; touch StellaAgent.tsx = ZERO. | Stella already has its own INLINE honcho/hermes tabs (doesn't consume HonchoHermesPanel), so there is nothing to extract from Stella. Lowest risk; keeps Stella tests green. Reversal: if we later want one source of truth, migrate Stella's inline tabs to import the panel (separate task). |
| D-2 | 1 | Persist `FileSystemDirectoryHandle` to localStorage? | **NO — store metadata only** (name, last-sync ts, converted-index). Keep the live handle in component/module memory; re-pick required after reload. | Handles are not reliably JSON-serializable/persistable across reloads in all browsers; IndexedDB persistence is a later enhancement. Reversal: add IndexedDB handle persistence + `queryPermission()` re-grant flow in a follow-up. |
| D-3 | 1 | FS Access API missing (Firefox/Safari) | **Honest-unavailable banner** (feature-detect `'showDirectoryPicker' in window`). | Matches the repo's existing "honest-unavailable" widget pattern; never throw. Reversal: add an `<input type=file webkitdirectory>` fallback path later. |
| D-4 | 1 | Where do the new ingestion files live? | `qualia-shell/src/components/Scribe/ingestion/` (new subdir). | Keeps ingestion code co-located with the Scribe converter it reuses, without bloating Scribe.tsx. |
