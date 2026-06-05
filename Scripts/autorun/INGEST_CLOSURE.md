# INGEST_CLOSURE.md — BLOCK A sub-closure (Scribe ingestion + Honcho standalone + statute matching)

**Branch.** `feat/scribe-ingestion-honcho` (built on the `feat/pm-exec-dashboard` arc base).
**Scope of this closure.** Block A only (Cycles 1–10 + this docs-only Cycle 11). Block B
(Cycles 12–18 — ThoughtWeaver reports/insights, TW↔ARA↔Honcho, Hermes self-improvement,
Stella tool library) CONTINUES the same branch. **`ALL_DONE` is NOT touched here.**
**Date.** 2026-05-29.
**Gate at HEAD-post-Cycle-10 (`9ac84d7`):** 6/6 GREEN — tsc ✓ | vitest **541/64** | react-router
build ✓ | seeds=false build ✓ | PII clean (51 files) ✓ | SSR smoke PASS (port 3458).

---

## 1. Block A commit SHAs (Cycles 1–10)

| Cycle | Deliverable | Feature SHA | Log SHA |
|------:|-------------|-------------|---------|
| 1 | AUDIT + PLAN (`INGEST_PLAN.md`) — data flow, extraction approach, statute list, SSR notes, sequence | — | `1d50a0d` |
| 2 | Ingestion storage layer — `ingestionStore.ts` + `ingestionApi.ts` + tests | `b5b21b2` | `ddfb89b` |
| 3 | Backend ingest route CONTRACT — `Docs/backend-ingest-routes.ts` (docs-only) | `1447719` | — |
| 4 | Folder-picker UI — `IngestionPanel` (File System Access API, SSR-safe) + test | `894a532` | `945ce47` |
| 5 | Client-side convert + backup write (html/txt→md, .md passthrough, backend-queue) + tests | `b3cc796` | `7b19d5e` |
| 6 | Honcho standalone widget — register + pinned dock entry + widget test | `b892c00` | `c1d372a` |
| 7 | Honcho Markdown arrange/filter view — `markdownArrange.ts` (pure) + Files tab + tests | `57a4919` | `b8ea3b9` |
| 8 | Honcho always-on-by-default + Dreams abilities surface + multi-screen deferral | `3efc5c8` | (in `3efc5c8`) |
| 9 | TranscriptionHub statute-matching improvements — `statuteMatch.ts` (pure) + UI + 22 tests | `0166c73` | `4832003` |
| 10 | a11y polish — live regions + accessible names across ingestion + Honcho surfaces | `9ac84d7` | `83d4aad` |

Vitest trajectory across Block A: base **459/56** → **541/64** (+82 tests / +8 files).

---

## 2. What ships CLIENT-SIDE today vs. deferred to `/api/ingest/*`

### Ships in the web app today (no backend required)
- **Folder picker** — `IngestionPanel` lets the user choose a SOURCE folder and a BACKUP
  DESTINATION folder via the File System Access API (`showDirectoryPicker`), event-handler-gated
  (SSR-safe). Picked-folder metadata (name, last-sync ts, converted-file index) persisted per-user
  via `createLocalStorageStore` (dynamic key, mirrors `fileExplorerStore`). Live handles kept in
  module memory (D-2: re-pick required after reload).
- **On-demand "Convert now"** — enumerates the source folder, converts BROWSER-CONVERTIBLE files
  (`.html`/`.htm`/`.txt` → Markdown via the existing `htmlToMarkdown.ts`; `.md` passthrough) and
  writes them into the backup destination. Updates the converted-file index.
- **Honcho Markdown arrange/filter view** — sort (name/size/date) + direction toggle + text filter
  over the converted `.md` index; drill-down opens a file in Scribe via `dwellium:open-widget`.
- **Honest-unavailable banner** (D-3) on browsers without the FS Access API (Firefox/Safari).

### Deferred to the backend watcher (`Docs/backend-ingest-routes.ts` contract; sibling repo / Electron)
- **Always-on background watcher** — browsers cannot run a true filesystem watcher. The contract
  defines `POST /ingest/watch`, `GET /ingest/status`, `POST /ingest/convert`, `GET /ingest/converted`.
- **Non-HTML conversion** — `.pdf` / `.docx` / etc. are QUEUED + labeled "needs backend conversion"
  client-side; real conversion is a server-side concern (PDFGear is the in-repo PDF reference; the
  contract's `POST /ingest/convert` covers server-side file→md). NOT duplicated on this branch.

---

## 3. Honcho-standalone summary

- **Promoted** from a Stella tab into its own registered widget (D-1: SHARE, not move). Registered
  `honcho` in `widgetRegistry.ts` (AI Tools category, lazy-loads `HonchoHermesPanel.tsx`) + a pinned
  `dock-honcho` entry in `data/hierarchy.ts`. **Zero StellaAgent.tsx changes** — Stella keeps its own
  inline honcho/hermes tabs; the standalone widget mounts the SAME `HonchoHermesPanel` component.
- **Always-on by default** (D-5): pinned + a one-time auto-open on first ready Desktop, gated by the
  `honcho:auto-open:v1` localStorage flag (`honchoAutoOpen.ts` pure predicate + a client-only
  `Desktop.tsx` effect). Opens once, then respects the user (closing it sticks). Flip
  `shouldAutoOpenHoncho`→`true` for every-session reopen.
- **Tabs in the standalone widget:** memory/Hermes (existing) + NEW **📄 Files** (Markdown arrange)
  + NEW **🌙 Dreams** (per-user `honchoDreamStore` abilities — list / add / delete / clear-all).
- New pure, SSR-safe, unit-tested helpers: `markdownArrange.ts`, `honchoAutoOpen.ts`.

---

## 4. Statute-improvement summary (Cycle 9)

- NEW pure engine `src/components/TranscriptionHub/statuteMatch.ts` (SSR-safe; unit-testable without
  rendering the Hub): `normalizeStatute` (canonical `O.C.G.A. § <section>`), `extractStatuteRefs`
  (ALL coded sections from free text, deduped + order-preserved, handles `44-7-30(a)` sub-section
  parens), `buildMatchedStatutes` (primary @ sim 1, secondary summary-only @ 0.6, non-coded-authority
  verbatim fallback so citations are never dropped), `dedupMatchedStatutes` (by normalized volumeId,
  keep max sim, sort desc, excerpt backfill — robust against backend dupes), `formatSimilarity`,
  `primaryStatuteLabel` ("top + N").
- **Before:** LLM-adapt path produced exactly ONE matched statute per segment (similarity hard-coded
  to 1) even when several O.C.G.A. sections were named, and `matchedStatutes` (similarity/excerpt)
  was never surfaced in the UI (only the single statute string in a tooltip).
- **After:** multi-statute extraction + dedup; a matched-statute detail list (id + similarity% badge +
  excerpt) under the inline legal badge; a no-LLM hint gated on `hasActiveLlm(integrations.llm)`.
  Graceful no-LLM + failed-fetch states (Path A LLM → Path B backend → silent). 22 new tests.

---

## 5. Deferred items (carry-forward)

| # | Item | Status / where |
|---|------|----------------|
| 1 | Always-on filesystem watcher | Backend/Electron — contract at `Docs/backend-ingest-routes.ts` |
| 2 | Non-HTML conversion (pdf/docx→md) | Backend — `POST /ingest/convert`; client queues + labels |
| 3 | `FileSystemDirectoryHandle` persistence across reload | D-2 — IndexedDB + `queryPermission()` re-grant (follow-up) |
| 4 | FS Access API fallback for Firefox/Safari | D-3 — `<input type=file webkitdirectory>` path (follow-up) |
| 5 | Multi-physical-screen awareness | D-6 — Electron only (`screen` + `desktopCapturer`); NOT web-possible |
| 6 | Single source of truth for Honcho (Stella inline → import panel) | D-1 reversal — separate task |

---

## 6. Conventions honored

- **SSR safety:** every new module is free of top-level / `useState(()=>…)` browser-global access;
  `showDirectoryPicker` / handles gated behind onClick or effects; persistence via
  `createLocalStorageStore` dynamic-key + UserContext-direct reads (degrade to `_anonymous`, never
  throw). SSR smoke test PASSED at every cycle.
- **Reuse-before-build:** `htmlToMarkdown.ts` (converter), `workspaceScribe.ts` (`dwellium:open-widget`
  bus), `createLocalStorageStore` (persistence), `honchoDreamStore` (abilities) — no duplication.
- **Stella protected:** zero StellaAgent.tsx changes; SHARE not move (D-1).
- **No fake timers** (Phase-7 Finding (B) — real clock in all new tests).

---

## 7. NOT done here (Block B continues)

Cycles 12–18 remain on this branch: TW reports/insights store + UI + on-open catch-up, scheduler
contract, TW↔ARA↔Honcho integration, Hermes self-improvement store (run-memory few-shot + tool
success-weighting), Stella→Hermes spawn, Stella tool-library expansion, and the FULL arc closure
(`ARC_CLOSURE.md` + `touch ALL_DONE`). **Do not push; do not touch `ALL_DONE` until Block B closes.**
