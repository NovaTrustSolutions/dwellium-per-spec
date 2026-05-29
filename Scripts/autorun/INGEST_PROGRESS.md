# INGEST_PROGRESS.md — Scribe Ingestion + Honcho + Statute arc

Branch: `feat/scribe-ingestion-honcho` (off `feat/pm-exec-dashboard` @ `69bc37d`).
Vitest baseline at branch base: **459 passed / 56 files**. Higher = added tests (note delta).
Gate (source cycles): `tsc -b` + `vitest run` + 2× `react-router build` + PII verify + SSR smoke (`SMOKE_TEST_PORT=3458`). 6/6 = commit.

---

## Cycle log

### Cycle 1 — AUDIT + PLAN (docs-only) ✅ DONE
- Read & verified ground truth: htmlToMarkdown, dropHandler, createLocalStorageStore (dynamic-key + `.reset()`), fileExplorerStore (canonical per-user mirror), honchoDreamStore, HonchoHermesPanel (563L, NOT registered), Stella honcho/hermes tabs (INLINE — does NOT import the panel), TranscriptionHub statute path (`scanSegmentsViaLlm` + `legalShieldClient.ts` 99L), widgetRegistry/hierarchy format, `dwellium:open-widget` bus, `Docs/backend-file-explorer-routes.ts` contract shape, ThoughtWeaver dir.
- Wrote `INGEST_PLAN.md` (data flow, share-not-move Honcho approach, statute list, SSR notes, 18-cycle sequence, risks) + `INGEST_DECISIONS.md` (D-1..D-4).
- Key finding: Stella has its OWN inline honcho/hermes code → Honcho standalone is **zero-Stella-touch** (register widget that lazy-loads HonchoHermesPanel). Lowest risk.
- Docs-only cycle → no gate; `git status` only.

### Cycle 2 — Ingestion storage layer (no UI) ✅ DONE — `b5b21b2`
- NEW `src/components/Scribe/ingestion/ingestionStore.ts` — per-user `createLocalStorageStore` (dynamic-key `scribe-ingestion:<userId>`, sister to fileExplorerStore). State: `sourceFolderName` + `backupFolderName` + `lastSyncAt` + `converted[]` (ConvertedFileEntry: sourceName/destName/status/bytes/convertedAt/note). Helpers: `saveIngestion` / `setConvertedIndex(entries, syncedAt)` / `recordConverted` / `clearConvertedIndex` / `clearIngestion`. Metadata-only persistence per **D-2** — live `FileSystemDirectoryHandle` held in module-memory `ingestionHandles{source,backup}` (NOT serialized; re-pick on reload). Caller passes the clock (`syncedAt`) → deterministic tests, no fake timers.
- NEW `src/components/Scribe/ingestion/ingestionApi.ts` — typed `/api/ingest` client (registerWatch/fetchIngestStatus/convertOnBackend/fetchBackendConverted) mirroring fileExplorerApi (`API_BASE` + `getAuthHeaders` + `{success,data}` envelope, single `call<T>`). Covers ONLY what the browser can't (always-on watcher + pdf/docx server conversion); the Cycle-5 client-side path doesn't use it.
- NEW `src/test/ingestionStore.test.ts` — 15 tests: SSR-safety (getServerSnapshot), per-user isolation (Andy≠Lisa), normalize/coerce malformed data, index mutation helpers, handle-ref reset, mocked-fetch api client (incl. "Backend route not implemented" 404 → typed throw). `.reset()` in beforeEach per v2.72.1.
- SSR-safe: zero module-eval localStorage/window/fetch. Smoke-test PASS confirms.
- **GATE 6/6 GREEN:** tsc ✓ | vitest **474/57** (baseline 459/56 → +15 tests / +1 file) ✓ | react-router build ✓ | seeds=false build ✓ | PII clean (51 files) ✓ | SSR smoke PASS (0 console errors / 0 warnings / 0 page errors).
- **Next: Cycle 3 — Backend ingest route CONTRACT (`Docs/backend-ingest-routes.ts`, docs-only).**
