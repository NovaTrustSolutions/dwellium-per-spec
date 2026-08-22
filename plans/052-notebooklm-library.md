# Plan 052 — NotebookLM → ARA "Library" (contracts, housing law, requirements)

> Drafted 2026-08-22 for Ilya: "I want NotebookLM as part of the library ARA has access to — it contains contract requirements, housing laws, etc." Status: **PROPOSED — awaiting go + two decisions (§5).**

## 1 · Verified facts (this machine + repos, 2026-08-22)

- **Consumer NotebookLM has no public API.** (Re-confirmed; plan 022 and the NotebookLM widget header say the same.) The backend `notebooklmService.ts` targets **NotebookLM *Enterprise*** (`discoveryengine.googleapis.com`, scope `cloud-platform`, project/location settings) — a paid Google Cloud product Andy doesn't use → it cannot read notebooklm.google.com notebooks.
- **`nlm` CLI is installed** (`~/.local/bin/nlm`, package `notebooklm-mcp-cli` 0.3.19): `nlm login`, `nlm notebook list --json`, `nlm source list <notebook> --json`, `nlm source content <source_id> --json` (raw indexed text of PDFs/web pages/pasted text — no AI). Auth = Google cookies cached at `~/.notebooklm-mcp-cli/auth.json`, valid ~1 week; cache is from Feb 23 → **expired** (`notebook_list` → "RPC Error 16: Authentication expired"). Only a human at a Mac with Andy's Google session can refresh it (`nlm login`). It can never run on Cloud Run.
- **ARA already has a document RAG stack that nothing feeds:** `vectorStore.ts` (OpenAI `text-embedding-3-small` → SQLite `embeddings`, `searchDocuments`, `getDocumentContext`) exists, but `araChatEngine.ts` never calls it — ARA today injects ruVector (Dwellium entities) + Georgia Code (LanceDB) only. `embeddings.file_id → files(id)` (FK ON) and `files.path` is UNIQUE; `indexFile` is `INSERT OR REPLACE` (upsert-safe).
- ARA's reply already carries `contextSources[]` chips (`name · count`); type union lives in backend `araChatEngine.ts` L45 and frontend `ARAConsole.tsx` L100.

## 2 · Design (zero cost, no brittle server-side NotebookLM session)

**Mirror, don't proxy.** NotebookLM stays the authoring place; Dwellium keeps a *mirror of the notebook sources' text* in its own vector store and ARA retrieves from it with citations. Live "ask NotebookLM" from the server is rejected: cookie auth can't live on Cloud Run, breaks weekly, and plan 022 already called it brittle.

```
Mac (Andy/Ilya, has Google session)                      Cloud Run backend                     ARA
nlm source content <id> ──► tools/notebooklm/sync.sh ──► POST /api/library/sources ──► embeddings (file_id=library:…) ──► buildLibraryContext()
            ▲ weekly `nlm login`                          (upsert-only, role corporate)            ▲ searchDocuments(query) filtered to library:%
```

### Backend (`~/dwellium-backend`)
1. `routes/libraryRoutes.ts` mounted at `/api/library` (authenticate):
   - `POST /sources` (requireRole corporate) body `{ collection, sourceId, title, url?, text }` → `indexFile({ id: 'library:<collection>:<sourceId>', path: 'library://<collection>/<sourceId>', name: title, type:'library', syncSource:'notebooklm', summary: url })` then `deleteEmbeddingsByFile` + `chunkText` + `generateEmbedding` + `storeEmbedding` (same loop as `indexDocument`, text input instead of file). Returns `{chunks, chars}`. **Upsert only — never wipes other sources.**
   - `GET /sources` → list `files WHERE type='library'` with chunk counts, collection, updated_at.
   - `DELETE /sources/:id` (requireRole corporate) — UI-initiated only.
   - `GET /status` → `{ sources, collections, lastSyncedAt, embeddingsConfigured: !!OPENAI_API_KEY }`.
2. `araChatEngine.ts`: after Georgia Code → `buildLibraryContext(query)`: `searchDocuments(query, 6)` filtered `fileId.startsWith('library:')`, similarity ≥ 0.25, grouped by source title → inject `## Library — your documents (NotebookLM mirror)` with "cite as **[Title]**", push `contextSources { name:'Library', type:'library', itemCount }`. Extend the type union. ponytail: brute-force cosine over all embeddings is fine to ~10k chunks; upgrade path = LanceDB table like Georgia Code.
3. Jest: `tests/libraryRoutes.test.ts` (mock `generateEmbedding`), `tests/araLibraryContext.test.ts`.
4. Deploy: rides `./deploy/cloud-run.sh` (needs `OPENAI_API_KEY` secret — restored today, rev 00045+).

### Sync tooling (`~/Downloads/Dwellium -Per Spec/tools/notebooklm/`)
- `sync.sh` (bash + `jq`, runs on any Mac with `nlm login` done): for each notebook id in `notebooks.txt` → `nlm source list --json` → for each source `nlm source content --json` → `curl -X POST $DWELLIUM_API/api/library/sources` with a Dwellium bearer token (obtained via `/api/auth/login` once, stored in Keychain — never in the repo). Idempotent; prints a per-notebook summary; exits non-zero on auth expiry with "run `nlm login`".
- `README.md`: setup (nlm login, notebooks.txt, token), how to schedule weekly (`launchd` plist provided; the office always-on Mac from 047 phase 2 is the natural host), and the fallback: export the PDFs from NotebookLM → upload to Dwellium Files → `POST /api/files/index` (already exists) — same vector table, ARA sees them the same way.

### Frontend (`qualia-shell`)
- NotebookLM widget (`NotebookLMContext.tsx`) gains a **Library** section: synced collections + sources (title, chars, synced ago), "Last sync", and the three sync states (never / stale > 8 days / fresh) with the exact commands to run. No fake "Connect" button — the header already says NotebookLM has no API.
- `ARAConsole.tsx` ContextSource union += `'library'` (chip renders generically already).
- Guide §4 "Meet your AI team": one line — "ARA also reads your Library (NotebookLM mirror)".
- Tests: vitest for the Library section render states.

## 3 · What ARA will do afterwards
"What notice period does the Woodland Parc lease require for non-renewal?" → retrieves the contract chunk from the mirrored notebook → answers **with [Title] citations** and the Library chip shows `Library · 4`. Georgia Code statutes keep coming from the existing LanceDB index; the two sources compose.

## 4 · Effort / order
Backend (routes + ARA injection + tests) ~1.5 h · sync tooling ~45 min · frontend ~1 h · first real sync (needs Ilya's `nlm login`) ~10 min per notebook of ~100 sources (embedding rate-limited). Multi-agent: 3 worktree builders (backend patch · tooling · frontend) + critic, then I merge, deploy, and run the first sync with you.

## 5 · Decisions needed from Ilya
1. **Which notebooks** mirror into the Library (all of Andy's, or a named list)? I can list them the moment you run `nlm login` on this Mac.
2. **Who hosts the weekly sync** — the office always-on Mac (recommended; same machine as Immich) or your laptop on demand?
(Defaults if you just say "go": all notebooks; sync from your laptop on demand; I run the first sync with you.)

## 6 · Out of scope / rejected
- Live NotebookLM Q&A from the server (cookie session on Cloud Run) — brittle, weekly breakage, ToS-grey.
- NotebookLM Enterprise API — paid; the existing `notebooklmService.ts` stays for that future.
