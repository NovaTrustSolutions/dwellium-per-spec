# Plan 022 — Auto-connect the Notebook panel (Open Notebook + NotebookLM)

> Planned 2026-06-21. Goal (per Ilya): the "Open Notebook portion" should **auto-connect**
> and **populate the available notebooks** so the user can use them as knowledge bases or
> open one to dig deeper. Decisions locked via AskUserQuestion:
> **Source = Both**, **Depth = list/open AND enable-as-ARA/Honcho-KB**, **Where = also live site**.
>
> Per repo policy: gate-green before commit; no push without Ilya's go; build with
> `npx react-router build` (NOT `vite build`); the Linux sandbox can't run vitest/builds —
> all real verification on the Mac.

## Verified facts (web, 2026-06-21)

- **Open Notebook REST API** (`http://localhost:5055`, confirmed from its API reference):
  - `GET /notebooks` — list (auto-populate). `GET /notebooks/{id}` — details.
  - `GET /sources?notebook_id=notebook:<id>` — sources (for source counts).
  - `POST /search` — full-text OR vector search (the KB query we inject into chat).
  - `POST /ask` — search + synthesize, **streams SSE** (optional "dig deeper" answer).
  - Auth: optional `Authorization: Bearer <OPEN_NOTEBOOK_PASSWORD>` (none in default dev).
  - **CORS: allows all origins in development** → browser → `localhost:5055` works with no proxy.
- **Open Notebook MCP** (`open-notebook-mcp`, uvx/stdio) just wraps that REST API. A browser
  SPA cannot speak stdio MCP, so Dwellium uses the **REST API directly**. (Same data the MCP sees.)
- **NotebookLM**: still NO public API. Auto-list is only possible via an unofficial MCP /
  browser-automation driven by a backend holding the user's Google session — brittle.
- **Live-site reality**: deployed HTTPS Netlify can't reach `http://localhost:5055`
  (mixed-content + localhost is the user's box). Live requires a backend proxy.

## Current state (what exists today)

- `OpenNotebookPanel.tsx` — embeds the Open Notebook web UI (`:8502`) in an iframe + an
  opaque `no-cors` reachability ping. **Never calls the REST API; cannot list notebooks.**
- `NotebookLMContext.tsx` — manual-only (paste notebook ID/URL). Already has a
  `bridgeAvailable` path that consumes `GET ${API_BASE}/api/v1/notebooklm/notebooks` if the
  backend provides it (404 today → falls back to localStorage). So the NotebookLM frontend is
  **already ready** for a backend bridge.

## Phases (sequenced by what's shippable vs gated)

### Phase 1 — Open Notebook auto-list + open-to-dig-deeper  (frontend only; SHIP NOW)
Reliable, no backend, **no overlap with the parked allowlist commit**, degrades cleanly on the
live site until Phase 3.
- NEW `src/lib/openNotebookClient.ts` — typed REST client. Base URL from the existing
  `dwellium-open-notebook-url` localStorage key; optional password from a new
  `dwellium-open-notebook-token` key. Methods: `listNotebooks()`, `listSources(notebookId)`,
  `search(notebookId, query, {limit})`. Fail-soft (return `{ok:false}` shapes, never throw to UI).
- REWORK `OpenNotebookPanel.tsx` — when the instance is reachable, fetch `GET /notebooks` and
  render a real notebook list (title, source count, updated-at) with per-row **Open** (opens that
  notebook deep-link in the embed/new tab). Keep the iframe as a "full app" sub-view + the
  existing launch/setup guide for the down/empty states. List fetch failure → existing iframe/empty.
- NEW test `src/test/openNotebookClient.test.ts` — mock fetch; assert list/search parse + auth header + fail-soft.
- Files touched: `src/lib/openNotebookClient.ts`, `OpenNotebookPanel.tsx`, `OpenNotebookPanel.css` (list styles), test. **Disjoint from the agent-skill allowlist files.**

### Phase 2 — Enable a notebook as an ARA/Honcho/Stella knowledge base  (BLOCKED on allowlist commit)
Touches the agent chat path = the SAME files as the uncommitted allowlist (ARAConsole / Stella /
Honcho). **Do AFTER the allowlist lands** so the two don't tangle.
- NEW per-user store (`createLocalStorageStore` dynamic-key) of enabled Open Notebook notebook IDs.
- On chat send, `openNotebookClient.search(enabledIds, message)` → inject top hits into context
  (delivers the "queried on every conversation, injected automatically" promise the NotebookLM
  widget already advertises, but actually wired for Open Notebook).
- Toggle UI in the Phase-1 notebook list ("Enable as KB").

### Phase 3 — Live-site reachability  (BACKEND-GATED — Ilya, like Gmail OAuth)
- Backend proxy `GET/POST /api/proxy/open-notebook/*` in sibling `ai-dashboard369-file-manager`
  forwarding to the user's configured Open Notebook URL (fixes HTTPS mixed-content + remote reach).
- Frontend already supports a configurable base → flips to the proxy when set. Deliver as a
  read-only patch file `Docs/open-notebook-proxy.patch` (I can't deploy/verify backend).

### Phase 4 — NotebookLM auto-list  (BACKEND-GATED + BRITTLE — recommend last)
- Backend runs the unofficial NotebookLM MCP / browser-automation with the user's Google session
  and serves `GET /api/v1/notebooklm/notebooks`. Frontend already consumes this (bridgeAvailable).
- Ship as a backend spec/patch outline; flag that it breaks whenever Google changes their UI.

## Verification
- Per phase: central `npx tsc -b` (sandbox) after the edit; full `Scripts/gate.sh` GREEN on the Mac before commit.
- Phase 1 live check (Mac): with a local Open Notebook running, open the panel → notebooks list;
  click Open → that notebook loads. With it down → launch/setup guide (unchanged).
- Backend phases verified by Ilya on the live stack (zero-trust: curl the proxy route).

## Risk / honesty
- Phase 1 is low-risk and reversible. Phase 2 changes the agent context path (test coverage added).
- Phases 3-4 cannot be fully shipped or verified from here — they need the sibling backend applied + deployed.
- NotebookLM (Phase 4) is best-effort by nature; no official API exists.
