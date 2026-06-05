# Backend routes the widgets call but your :3000 backend 404s

**Source:** runtime audit by the cleanup loop (every widget logged 4–7 `/api/* 404`s on open,
driven headless against your REAL Express backend on `localhost:3000`).
**Envelope:** all routes return `{ "success": true, "data": ... }` (errors: `{ "success": false, "error": "..." }`).
Auth: `Authorization: Bearer <token>` (the frontend sends it via `authFetch`/`getAuthHeaders`).

Legend: 🔴 hard failure (feature dead-ends without it) · 🟡 graceful (widget falls back, but data is empty)

---

## 🔴 HIGH PRIORITY — these dead-end a feature

### 1. `GET /api/file-explorer/tree`  → Workspace + File Explorer
- **Returns:** the folder tree. `data: FileEntry[]` where
  `FileEntry = { path, name, tier?: 'domain'|'project'|'thread'|'file', children?: FileEntry[], size?, modified? }`.
- **Used by:** Workspace derives Domaine→Project→Thread from this; File Explorer renders it directly.
- **Spec already written:** `Docs/backend-file-explorer-routes.ts` (full shape + the mkdir/touch/read/rename/move/delete siblings).
- **Impact:** without it Workspace shows "Failed to load domaines — HTTP 404". (Loop added a local-sample fallback so it's not dead, but real data needs this.)

### 2. `GET /api/workspace/domaines`  → Workspace
- **Returns:** `data: Domaine[]` = `{ id, name, color?, projectCount? }`. Plus the metadata siblings.
- **Spec already written:** `Docs/backend-workspace-routes.ts` (`GET /domaines`, `PUT /domaine`, `GET /thread-meta`, `PUT /thread-meta`).

---

## 🟡 MEDIUM — widget renders but its panels are empty until these exist

### 3. `GET /api/honcho/memories?<params>`  → Honcho widget (Memory tab)
- **Returns:** `data: Memory[]` = `{ id, content, type:'fact'|'preference'|'decision'|'observation'|'insight', importance:0..1, createdAt }`.
- **Companions the panel also calls:**
  - `POST /api/honcho/memories` — body `{ content, type, importance }` → `data: Memory` (the created row).
  - `GET /api/honcho/memories/map` → `data: { nodes, edges }` (the Graph tab).
  - `GET /api/honcho/stats` → `data: { total, byType }`.
- **Impact:** loop added local-first `honchoMemoryStore` so Add Memory works offline; the backend route makes it shared/persistent server-side.

### 4. `GET /api/hermes/status`  → Honcho/Stella Hermes tab
- **Returns:** `data: { ollamaOnline: boolean }` (+ optionally model name).
- **Companion:** `GET /api/hermes/tools` → `data: HermesTool[]` = `{ name, description }`.
- **Impact:** drives the "Hermes Online/Offline" banner. Currently 404 → always "Offline" (which the UI shows honestly).

### 5. `POST /api/hermes/delegate`  → Hermes runner (Stella `/hermes` + Honcho delegate)
- **Body:** `{ prompt, tools?, context? }`. **Returns (streaming or JSON):** `data: { steps: HermesStep[], result }`.
  `HermesStep = { tool, input, output, ok }`.
- **Impact:** the actual agent run. Loop made the run reachable offline (records to the learning store + renders a graceful failure) so the 👍/👎 loop works; a live run needs this + the Ollama/python agent up.

### 6. `POST /api/ingest/convert`  → Scribe ingestion (non-html files)
- **Body:** `{ path | bytes, filename }`. **Returns:** `data: { markdown, name }`.
- **Companion:** `GET /api/ingest/converted` → `data: ConvertedFile[]`.
- **Spec already written:** `Docs/backend-ingest-routes.ts`.
- **Impact:** browser converts html/txt/md itself; pdf/docx are marked `queued-backend` until this exists.

---

## ✅ Routes that ALREADY WORK on your backend (confirmed live by the loop)
- `POST /api/thought-weaver/capture` — returns `{ filed_to, confidence, classification }`. **Working** (verified: "buy milk tomorrow" → `admin` 95%).
- Inbox Zero data routes — **working** (real invoices/notices render).
- `POST /api/stella/chat` — returns 405 offline = correct gated state (needs the Stella python agent up, not a missing route).

---

## Dashboard-specific (why the Astra panels show $0 / "No … yet")
The PM-exec dashboard panels (`dashboardData.ts`) fetch from the Strata API (`strataApi` →
`/api/dwellium/*` proxy). The panels render but are empty because those backend data
endpoints return empty/aren't populated. To light them up, the backend needs to serve real
rows for: compliance items + due dates, work orders, legal matters, lease expirations,
financial snapshot (NOI/delinquencies), vendor/insurance, incidents/risk. (The UI is wired
+ responsive — it just has nothing to show yet.)

---

## How to use this
1. The 🔴 two routes unblock Workspace immediately — and 4 of the 6 already have full
   contract files in `Docs/backend-*-routes.ts` (copy the shapes from there).
2. The 🟡 routes populate Honcho/Hermes/ingestion when ready.
3. The dashboard needs data in the Strata endpoints, not new routes.
