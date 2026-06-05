# MemoryGraphRAG — backend contract (hybrid acceleration)

**Owner:** backend repo (`ai-dashboard369-file-manager`)
**Client engine:** `qualia-shell/src/lib/memoryGraphRag/*`
**As of:** 2026-06-05

The MemoryGraphRAG engine runs **fully client-side** by default (local-first):
in-memory three-layer store, deterministic local embeddings, client-side
Personalized PageRank, and multi-agent extraction through the user's configured
LLM (`llmClient`) with an offline heuristic fallback. The two endpoints below
are **optional accelerators** for the hybrid runtime — the feature works without
them; wiring them upgrades quality/scale on large corpora. The client degrades
honestly (falls back to local) on any failure.

| Capability | Endpoint | Why backend | Client fallback (always present) |
|------------|----------|-------------|----------------------------------|
| Real embeddings | `POST /api/mgrag/embed` | True semantic vectors (vs. local n-gram hashing) for similarity bridging + retrieval | `LocalEmbeddingProvider` (char-ngram hashing, deterministic, offline) |
| Large-graph PageRank | `POST /api/mgrag/pagerank` | Heavy PPR over very large heterogeneous graphs at scale | client power-iteration PPR (`personalizedPageRank`) |

### `POST /api/mgrag/embed`
Request: `{ "texts": string[] }`
Response: `{ "vectors": number[][] }` (one L2-normalized vector per input text; fixed `dim`).
Client: `BackendEmbeddingProvider` (already implemented) posts here; on non-200 or
parse failure the engine catches and uses `LocalEmbeddingProvider`.

### `POST /api/mgrag/pagerank` (optional)
Request: `{ "nodes": string[], "edges": [{ "from": string, "to": string, "weight": number }], "reset": { [nodeId]: number }, "alpha": number }`
Response: `{ "scores": { [nodeId]: number } }`
Client: default is the in-browser PPR; only call this for corpora large enough
that client iteration is too slow.

### Notes
- Extraction + conflict resolution use the **per-user `llmClient`** (browser-direct),
  not the backend — no server LLM key needed.
- All three memory layers + bridges live in the browser; these endpoints are
  stateless math helpers, so they hold **no user data** beyond the request body.
- A future enhancement could persist the `MemorySnapshot` server-side for
  cross-device memory; today it is per-session in the widget (per-user
  localStorage persistence is the natural next step, mirroring the other stores).
