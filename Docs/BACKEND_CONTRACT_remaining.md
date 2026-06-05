# Backend / MCP contract — remaining parity items (§2.6, §7.1, §7.6)

These are the only wishlist items that can **not** live in the front-end app: they
require backend routes, a vector index, or a separate MCP server. The Dwellium
client already calls / is ready to call each contract below — this doc specifies
exactly what the backend (`ai-dashboard369-file-manager`) and the Dwellium MCP
server must implement so whoever owns those repos can close the gap.

Conventions: all routes are Express under `/api`, auth via the existing
`authenticate` middleware, filesystem persistence under
`DWELLIUM_DATA_ROOT/<area>/<userId>` (matching the current backend). JSON in/out,
`{ success: boolean, ... }` envelope.

---

## §2.6 — Document version increment (v1 → v2 → v3)

**Client already calls:** `POST /api/scribe/version` with `{ filepath }`
(see `qualia-shell/src/components/Scribe/scribeStore.ts::createVersion`). It expects
`{ success: true, newFilepath }` and opens `newFilepath`.

**Required behavior (the bug to fix):** the version number must **increment**, not
overwrite or reset.

```
POST /api/scribe/version   { filepath: "Acme/Reno/Report.md" }
→ 200 { success: true, newFilepath: "Acme/Reno/Report.v2.md" }
```

Algorithm:
1. Parse the version suffix from the basename: `Name(.vN)?.md`. If none → current is v1.
2. Compute `N+1`. New name = `Name.v{N+1}.md` in the same directory.
3. Copy the **current content** of `filepath` into the new file (snapshot).
4. Return `newFilepath`. Reports are versioned; brain dumps / notes stay append-only.

**Acceptance test:** versioning `Report.md` thrice yields `Report.v2.md`, `Report.v3.md`,
`Report.v4.md` (monotonic; never `v2,v2,v2` and never back to `v1`). Each new file's
content equals the source at snapshot time.

---

## §7.1 — Vector RAG (ingest / query / compile)

The client has the **ingestion + compile UI** (Foundry §7.4, Wiki §7.2) and a
keyword search (§2.5). What's missing is the semantic/vector layer in the backend.

Storage: a per-user vector store — `sqlite-vss` (file-based, travels with
`DWELLIUM_DATA_ROOT`, recommended for the standalone build) **or** pgvector if a
Postgres is present. Embeddings via the user's configured model (reuse the
per-user LLM bundle) or a local embedder.

```
POST /api/rag/ingest   { docId, text, tags?: string[], namespace?: string }
→ { success, chunks: number }            # chunk, embed, upsert

POST /api/rag/query    { query, k?=8, namespace? }
→ { success, hits: [{ docId, score, snippet, tags }] }

POST /api/rag/compile  { scope: "thread"|"project"|"domain", path }
→ { success, page: { overview, concepts[], openQuestions[], sources[] } }
   # server-side synthesis; same shape the Wiki widget already renders
```

**Namespace isolation:** namespace defaults to the Domain → exclude
Domain/Project/Thread structural names from the embedding/tag vocabulary (spec
§7.1) so structural labels don't create spurious cross-domain edges.

**Acceptance:** ingest N docs, `query` returns them ranked by cosine similarity;
`compile` returns a non-empty synthesis citing real source docIds.

---

## §7.6 — `rag_*` MCP tools

Expose §7.1 over the **Dwellium MCP server** so any Claude session (not just the
dashboard) can query the knowledge base. Each tool is a thin wrapper over the
routes above.

| MCP tool | Args | Maps to |
|---|---|---|
| `rag_ingest` | `{ docId, text, tags?, namespace? }` | `POST /api/rag/ingest` |
| `rag_query` | `{ query, k?, namespace? }` | `POST /api/rag/query` |
| `rag_compile` | `{ scope, path }` | `POST /api/rag/compile` |
| `rag_interview` | `{ topic }` | server prompts the user for gaps, then `rag_ingest` the answers |

Auth: the MCP server uses the same user token as the dashboard. Return the route
payloads verbatim.

**Acceptance:** from a separate Claude session, `rag_query` over a populated KB
returns the same hits the in-app §2.5 search + §7.1 query return.

---

## Not in this doc (also backend/third-party, lower priority)

- **§1.3 multiple email accounts** — backend account model + `/api/integrations` OAuth per account.
- **§1.7 Stirling-PDF** — bundle/connect a Stirling-PDF server; proxy its endpoints under `/api/pdf/*`.

## Already handled outside the backend

- **§4.1 iCloud / passport-drive sync** — done at the app layer: Settings → **Data Folder**
  points `DWELLIUM_DATA_ROOT` at an iCloud Drive / passport-drive folder (Electron
  `setDataRoot` + relaunch). The OS handles the actual sync; no backend watcher required.
