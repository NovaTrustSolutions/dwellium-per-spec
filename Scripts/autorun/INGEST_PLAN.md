# INGEST_PLAN.md — Scribe Ingestion + Honcho + Statute arc (BLOCK A) + TW/Stella/Hermes (BLOCK B)

**Branch:** `feat/scribe-ingestion-honcho` (off `feat/pm-exec-dashboard` @ `69bc37d`).
**Author:** autonomous driver. **Cycle 1 (this doc) is docs-only.**

This plan is the audit output for Cycle 1. It records the data flow, the
extraction approach, the statute-improvement list, SSR-safety notes, and the
~18-cycle sequence. Forks are logged to `INGEST_DECISIONS.md`.

---

## 0. Ground truth verified (file:line)

| Concern | Location | Notes |
|---|---|---|
| HTML→MD converter (REUSE) | `qualia-shell/src/components/Scribe/htmlToMarkdown.ts` | No-dep, DOMParser-based, browser-only. `htmlToMarkdown(html): string`. |
| Drop handler (REUSE) | `qualia-shell/src/components/Scribe/dropHandler.ts` | Branches by MIME; html/url/text → md. Image upload via `/api/scribe/images`. |
| Store factory (REUSE) | `qualia-shell/src/utils/createLocalStorageStore.ts` | Dynamic-key object signature `{key:()=>string, deserializer, defaultValue}` + `.reset()`. SSR-safe (no localStorage at module eval). |
| Per-user store reference | `qualia-shell/src/components/FileExplorer/fileExplorerStore.ts` | Canonical mirror: `userIdHolder.current` + `resolveKey()` + `normalize()`. |
| Honcho panel (PROMOTE) | `qualia-shell/src/components/HonchoHermesPanel/HonchoHermesPanel.tsx` | 563 L, **NOT registered**, standalone-capable. |
| Honcho dream store | `qualia-shell/src/components/StellaAgent/honchoDreamStore.ts` | Per-user `honcho:dreams:<uid>`; `appendDream/deleteDream/clearDreams/dreamStore`. |
| Stella honcho/hermes tabs | `StellaAgent.tsx:137,206-207` | Stella has its **OWN INLINE** honcho/hermes implementation (state at 308-341). It does **NOT** import HonchoHermesPanel — they are already independent. |
| Statute matching (IMPROVE) | `TranscriptionHub/TranscriptionHub.tsx:74-76,595-619` + `legalShieldClient.ts` (99 L) | `scanSegmentsViaLlm` → maps `code_ref/summary/suggested_action` → `statute/advice/matchedStatutes[{volumeId,similarity,excerpt}]`. `API_GEORGIA_CODE=/api/georgia-code`. |
| Widget registry | `qualia-shell/src/registry/widgetRegistry.ts` | `lazyWithReload(() => import(...))` per entry; keyed by component id. |
| Hierarchy dock | `qualia-shell/src/data/hierarchy.ts:25-36` | `{id, label, icon, component, pinned:true, group:'AI Tools'}`. |
| Cross-widget bus | `WindowContext.tsx:447` `dwellium:open-widget` | Open a widget + pass state. |
| Route-contract format | `Docs/backend-file-explorer-routes.ts` | Express Router, `authenticate`, `{success, data|error}` envelope, install header comment. |
| ThoughtWeaver (Block B) | `ThoughtWeaver/{ThoughtWeaver.tsx,thoughtWeaverStore.ts,todoStore.ts}` | Local-first captures + todos. |

---

## 1. Ingestion data flow

```
[USER GESTURE: "Choose source folder"]  → showDirectoryPicker()  → FileSystemDirectoryHandle (source)
[USER GESTURE: "Choose backup dest"]     → showDirectoryPicker()  → FileSystemDirectoryHandle (dest)
   persist refs + last-sync + converted-index → ingestionStore (per-user createLocalStorageStore)

[USER GESTURE: "Convert now"]
   for each file in source handle (recursive .entries()):
     ├─ .md / .markdown   → passthrough copy → write to dest
     ├─ .html / .htm      → htmlToMarkdown(text) → write <name>.md to dest
     ├─ .txt / .csv/etc.  → wrap/convert to md  → write <name>.md to dest
     └─ .pdf / .docx/...  → NOT browser-convertible → queue + label "needs backend conversion"
                            (the /api/ingest/convert contract covers these server-side)
   update converted-file index in ingestionStore
```

- **Client-side TODAY:** folder pick + html/txt/md conversion + write-back to dest.
- **Backend contract (out of scope to implement here):** always-on watcher +
  pdf/docx→md server conversion via `/api/ingest/*`. PDFGear is the server-side
  PDF-conversion reference (do NOT duplicate it in-browser).

## 2. Honcho-standalone extraction approach

**DECISION (logged D-1): SHARE, do not move.** Stella already has its own inline
honcho/hermes tab code — it does NOT consume `HonchoHermesPanel.tsx`. Therefore:
- Register a `honcho` widget in `widgetRegistry.ts` that lazy-loads
  `HonchoHermesPanel.tsx` directly.
- Add a pinned `dock-honcho` entry in `hierarchy.ts` (group `AI Tools`).
- **Touch StellaAgent.tsx = ZERO.** Stella's tabs keep working unchanged. This is
  the lowest-risk path and fully respects "Stella is protected."
- The Markdown arrange/filter view (Cycle 7) + abilities surface (Cycle 8) are
  added **inside HonchoHermesPanel** (or a thin sibling), so both the widget and
  any future Stella reuse get them.

## 3. Statute-matching improvement list (Cycle 9)

1. **Dedup `matchedStatutes`** by `volumeId` (currently 1:1 from `code_ref`; multi-hit can dup).
2. **Surface `similarity` + `excerpt`** in the UI (today only `statute`/`advice` shown at L2275-2278).
3. **Graceful no-LLM state** — when no per-user LLM configured, show a clear "configure LLM" affordance instead of silent empty.
4. **Graceful failed-fetch state** — `/api/georgia-code/legal-scan` + LLM failure → labeled error, not blank.
5. **Clearer matched-statutes display** — ranked list (by similarity desc), excerpt snippet, statute code chip.
6. Keep `legalShieldClient.ts` as the single fetch/LLM path — extend, don't fork.

## 4. SSR-safety notes (folder picker — CRITICAL)

- `showDirectoryPicker`, `FileSystemDirectoryHandle`, `window`, `localStorage` are **browser-only**.
- **NEVER** call them at module top-level or in `useState(() => ...)` initializers (throws on server render → smoke test catches it).
- Gate ALL FS-API calls behind `onClick` handlers / `useEffect`.
- Persist handles + prefs via `createLocalStorageStore` (dynamic per-user key, mirror `fileExplorerStore`).
- Note: `FileSystemDirectoryHandle` is **not JSON-serializable** and not persistable to localStorage across reloads in all browsers. Store *metadata* (name, last-sync, converted-index) in the store; keep the live handle in module/component memory (re-pick on reload). Log this as D-2.
- Feature-detect: `typeof window !== 'undefined' && 'showDirectoryPicker' in window`. Show honest-unavailable banner when absent (Firefox/Safari lack it).

## 5. Cycle sequence (18 cycles; gate-green + committed each)

**BLOCK A — ingestion + Honcho + statute**
1. ✅ AUDIT + PLAN (this doc) — docs-only.
2. Ingestion storage layer: `ingestionStore.ts` + `ingestionApi.ts` + unit tests. FULL gate.
3. Backend ingest route CONTRACT: `Docs/backend-ingest-routes.ts`. Docs-only.
4. Folder-picker UI in Scribe (FS API, event-gated, SSR-safe) + test. FULL gate.
5. Client-side convert + backup write (html/txt/md; queue pdf/docx) + tests. FULL gate.
6. Honcho standalone widget: register `honcho` + `dock-honcho`; render HonchoHermesPanel; widget test. FULL gate.
7. Honcho markdown arrange/filter view (size/date/name + text filter; drill-down via bus) + tests. FULL gate.
8. Honcho "always-on by default" (pinned/open) + abilities surface; doc multi-screen as Electron-only. FULL gate.
9. TranscriptionHub statute improvements (dedup, similarity/excerpt UI, graceful states) + tests. FULL gate.
10. a11y + polish across new surfaces (WCAG AA labels, keyboard nav, loading/empty/error). FULL gate.
11. BLOCK A sub-closure: `INGEST_CLOSURE.md`. Docs-only. (No ALL_DONE.)

**BLOCK B — TW ↔ ARA ↔ Honcho + Stella tools + Hermes**
12. TW reports + insights store (local): `reportStore.ts` + `insights.ts` (injectable LLM) + tests. FULL gate.
13. TW reports/insights UI + on-open catch-up + "generate now" (real clock) + tests. FULL gate.
14. Scheduler CONTRACT docs (`Docs/backend-schedule-routes.ts` or electron notes). Docs-only.
15. TW ↔ ARA ↔ Honcho integration (bus + shared stores, injectable deps) + tests. FULL gate.
16. Hermes self-improvement store (`hermesLearningStore.ts`: run history + tool-success) + tests. FULL gate.
17. Wire Hermes learning into runs + Stella→Hermes spawn + tests. FULL gate.
18. Stella tool-library expansion + a11y/polish + ARC CLOSURE (`ARC_CLOSURE.md`) + fresh full gate + `ALL_DONE`.

## 6. Risks / open questions (reversible defaults logged in DECISIONS)

- R-1: `FileSystemDirectoryHandle` persistence across reload is browser-inconsistent → store metadata only, re-pick on reload (D-2).
- R-2: FS Access API absent in Firefox/Safari → honest-unavailable banner (D-3).
- R-3: Honcho widget body needs HonchoHermesPanel to render outside Stella context → verify it has no hard Stella-context dependency at Cycle 6; if it does, wrap with a minimal provider/shim (log then).
- R-4: vitest baseline at branch base = **459 passed / 56 files**. Higher = good (note delta).
