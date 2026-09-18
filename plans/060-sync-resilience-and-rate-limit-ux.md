# 060 — Sync resilience + rate-limit UX (follow-up to plan 059)

Context: plan 059 stopped the retry amplification (frontend PR #125) and un-shared the
backend bucket (backend `fix/059-limiter-key-by-session`, `b051c8a`, awaiting Ilya's deploy).
This plan covers the eight remaining items from the 2026-09-18 assessment. Each phase is
independently shippable; order is by user-visible value per line of code.

Repos: frontend `~/Downloads/Dwellium -Per Spec` (app in `qualia-shell/`), backend
`~/dwellium-backend/ai-dashboard369-file-manager` (deploy branch `backend/ship`).
Standing rules: agents never run gcloud/deploy; One Save writes are upserts; every phase ends
with the strict gate (frontend) or `npx tsc --noEmit -p . && npx jest --runInBand --forceExit <files>` (backend).

---

## Phase 1 — Honor `Retry-After`: pause ALL sync until the window opens (frontend)

**Problem.** After a 429 each store discovers the limit on its own; the pill says only
"Sync paused — retrying" and nothing tells the user when. The backend already sends
`Retry-After` (seconds) and `X-RateLimit-Reset` (epoch s) — `src/app.ts::createInMemoryRateLimiter`.

**Change.**
- `qualia-shell/src/lib/syncRateLimitStore.ts` (new leaf module from 059): extend the snapshot
  with `retryAt: number | null` (epoch ms). `markRateLimited(retryAfterSec?: number)` sets it
  (`Date.now() + sec*1000`, default 60 s when the header is missing).
- `qualia-shell/src/lib/oneSaveClient.ts` `call()`: on 429 read `res.headers.get('Retry-After')`
  and pass it. (`Retry-After` is exposed cross-origin only if the backend lists it — same-origin
  through the Netlify proxy, so it is readable; still guard for null.)
- `qualia-shell/src/lib/oneSaveStore.ts` `scheduleWriteThrough`: before firing the debounced
  timer, if `retryAt` is in the future, set the timer to `retryAt - now` instead of `debounceMs`
  (one timer, no new queue). Writes issued during the pause therefore coalesce into one flush.
- Gate: `retryAt` in the past ⇒ normal behaviour.

**Tests** (`src/test/oneSaveStore.test.ts`, fake timers already used there): a 429 with
`Retry-After: 30` ⇒ no put until 30 s pass; two sets during the pause ⇒ exactly one put after it.
`src/test/oneSaveClient.test.ts`: header parsed; missing header ⇒ 60 s default.

**Size.** ~30 lines. Skips: per-store pause (one global pause is what the bucket is).

---

## Phase 2 — One banner that says what is happening, with a countdown (frontend)

**Problem.** When the bucket trips, Properties shows "API error 429", Calendar goes blank,
Inbox Zero says "offline" — three different-looking failures for one cause.

**Change.**
- `qualia-shell/src/lib/backendStatusStore.ts`: add state `'rate-limited'` alongside
  `'online' | 'offline' | 'checking'`, with `retryAt`. `markRateLimited(retryAt)` is called from
  `oneSaveClient` (same place as Phase 1) AND from the shared fetch helper every widget uses
  (find it: `grep -rn "authFetch\b" qualia-shell/src/lib | head`) so a 429 from `/api/dwellium/*`
  or `/api/calendar/*` lands in the same store as a 429 from `/api/objects/*`.
- `qualia-shell/src/components/Shell/BackendConnectionBanner.tsx`: render
  "Too many requests — retrying in N s" with a 1 s countdown (`useEffect` + `setInterval`,
  cleared on unmount), and auto-clear at `retryAt`. Keep the existing offline wording/button.
- `SyncStatusPill.tsx`: reuse the same countdown text instead of "Sync paused — retrying".
- Widgets: replace the raw "API error 429" in Properties (`grep -rn "API error" qualia-shell/src/components/StrataDashboard`)
  with `classifyBackendFailure(status)` from `lib/googleAccounts.ts` — move that function to
  `lib/backendFailure.ts` (it is not Google-specific) and re-export from `googleAccounts.ts`.
  Calendar and Inbox Zero: when the store says `rate-limited`, show the widget's normal "loading"
  state, not "offline"; the banner carries the message.

**Tests.** `src/test/backendConnectionBanner.test.tsx` (exists? else create): rate-limited ⇒
countdown text; passes `retryAt` ⇒ banner gone. `src/test/googleAccounts.test.ts` keeps passing
via the re-export.

**Size.** ~120 lines across 5 files. Skips: per-widget retry buttons (banner auto-clears).

---

## Phase 3 — Whiteboard: no saves until the user actually changes something (frontend)

**Problem.** Excalidraw fires `onChange` several times while initializing (fonts, scene load);
`Whiteboard.tsx:275` → `saveSceneDebounced` → one multi-MB PUT of the whole board per idle
period, even when nothing changed. This was the single biggest load-time source.

**Change.** `qualia-shell/src/lib/whiteboardStore.ts::saveSceneDebounced`: compute a cheap
content key (`elements.length` + max `element.version` + `Object.keys(files).length` — Excalidraw
bumps `version` on every real edit) and skip when it equals the last persisted key for that
board. Store `lastPersistedKey` per board in the module (reset in `.reset()`). `flushPendingSave`
and the collab-leave path are unchanged (they call `persistScene` directly).

**Tests.** `src/test/whiteboardStore.test.ts`: same scene twice ⇒ one put; changed `version` ⇒
second put. Mutation-check the skip.

**Size.** ~15 lines. Skips: full scene hashing (version numbers are Excalidraw's own edit counter).

---

## Phase 4 — Batch One Save writes on load (frontend + backend)

**Problem.** A page load PUTs each object separately (session-restore, activity-log,
recentActivity, widgetMemory, morning-brief, whiteboard, …). The read side already bulk-loads
(`oneSaveClient.listAll`); the write side does not.

**Backend** (`src/routes/objectRoutes.ts`, currently `GET /`, `GET /:id`, `PUT /:id`, `DELETE /:id`):
add `PUT /api/objects/batch` accepting `{ objects: DwelliumObject[] }` (max 50), owner-checked
per object exactly like `PUT /:id` (reuse its validation function — extract it if inline),
upsert each, respond `{ saved: id[], failed: {id, error}[] }` with 207 when mixed. Never delete.
Test: `tests/objectRoutes.test.ts` (or the harness the existing object tests use): 3 objects ⇒
3 saved; one with another owner ⇒ listed in `failed`, the other two saved.

**Frontend** (`lib/oneSaveStore.ts`): replace the per-store debounced `put` with a module-level
flush queue: `scheduleWriteThrough` enqueues `{id, type, ownerId, payload}` (last write wins per
id) and arms ONE timer (`debounceMs`, min across stores is fine); the flush calls
`oneSaveClient.putBatch(queue)` once; per-id results feed the existing `pending`/`failed`/
`lastSavedAt` bookkeeping unchanged. Fallback: if `putBatch` returns 404 (old backend), send
individual `put`s once and remember "no batch" for the session. Account-switch guard stays:
entries whose `ownerId` no longer matches are dropped at flush.

**Tests.** `oneSaveStore.test.ts`: three stores set within the window ⇒ one batch call with
three objects; 404 fallback ⇒ three puts; account switch mid-window ⇒ the switched user's
entries are dropped. Existing retry/replay tests must still pass unchanged (they assert on
`put` — adapt only the call-count assertions to the batch, keep the semantics).

**Size.** ~60 backend + ~80 frontend lines. Ship backend first (frontend falls back cleanly).

---

## Phase 5 — Separate read and write buckets (backend)

**Problem.** A write storm should never block opening a property list.

**Change.** `src/app.ts`: two limiters from the same factory, mounted on `/api`:
`apiReadRateLimiter` (GET/HEAD, `API_READ_RATE_LIMIT_PER_MINUTE`, default 600) and
`apiWriteRateLimiter` (everything else, `API_WRITE_RATE_LIMIT_PER_MINUTE`, default 300), both
using `apiRateLimitKey` from 059 and the same `skip`. Implement by giving the factory's `skip`
a method check — no new factory.

**Tests.** `tests/apiRateLimit.test.ts` (unit, like 059's): exhausting the write bucket leaves a
GET answering non-429; and vice versa. Keep it a unit test of the two handlers with fake req/res
(env-at-import makes app-level tests fragile — 059's note).

**Size.** ~25 lines. Skips: per-route limits (only two classes of traffic exist).

---

## Phase 6 — Realistic limits with a burst allowance (backend)

**Problem.** 300/min with no burst is tight for a dashboard that opens five widgets at once; a
load spike of 60 requests in 2 s is normal, 600 sustained per minute is not.

**Change.** `createInMemoryRateLimiter` gains an optional `burst?: { windowMs, max }` — a second,
short bucket per key checked alongside the minute bucket (same Map, key suffix `:burst`).
Defaults for the read limiter: 600/min + 80 per 10 s; write: 300/min + 40 per 10 s. Env-tunable
(`*_BURST_PER_10S`). Headers keep reporting the minute bucket. Document the four env vars in the
backend README's env table.

**Tests.** Unit: 41 writes in 1 s ⇒ 41st is 429 even though the minute bucket has room;
after 10 s the burst bucket resets.

**Size.** ~30 lines. Skips: token-bucket smoothing (two fixed windows are enough and readable).

---

## Phase 7 — Real client IP for anonymous traffic (deploy config, Ilya)

**Problem.** With `trust proxy` = 1, anonymous traffic through Netlify is still keyed by
Netlify's egress address (059 fixed signed-in traffic only). Netlify sends the browser address
in `X-Forwarded-For`; Cloud Run appends its own hop.

**Change.** `deploy/cloud-run.sh` env block (line ~138): replace `TRUST_PROXY: "true"` with
`TRUST_PROXY_HOPS: "2"` (`app.ts` already reads it). Trade-off, documented next to it: a direct
caller to the Cloud Run URL can spoof one hop and pick its own IP bucket — acceptable because
every authenticated route is keyed by session (059) and login has its own 20/15 min limiter.

**Verify after deploy** (Ilya runs the deploy; agent verifies): two curls through Netlify from
two networks land in different buckets (`x-ratelimit-remaining` decrements independently).

**Size.** 1 line + comment. No code.

---

## Phase 8 — Inbox Zero: stop calling a route that does not exist (frontend, or backend)

**Problem.** `InboxZero.tsx:361` opens `GET /api/inbox/stream` via `readSse`; no backend branch
has the route, so every open logs a 404 and `readSse` reconnects with backoff — wasted requests
and a misleading "offline" look.

**Decision needed (default = A):**
- **A (small, frontend):** delete the `readSse` block; keep the 60 s poll (it already covers
  the real-time gap per the code comment). Remove the "GAP-01" comment. ~15 lines removed.
- **B (backend SSE, if real-time matters):** `src/routes/inboxRoutes.ts` `GET /stream` mounted
  BEFORE `/:id`, `text/event-stream`, a module-level `EventEmitter` that `inboxService` emits
  `inbox:new` / `inbox:status-change` on (find the create/status paths in `src/services/inboxService.ts`),
  15 s heartbeat, cleanup on `close`. Cloud Run keeps HTTP streams open up to the request timeout —
  set the client to reconnect on close (readSse already does). ~60 lines + test.

**Tests.** A: `src/test/inboxZero*.test.tsx` no longer expects the stream fetch. B: route test
that a created item produces an `inbox:new` event on an open stream.

---

## Order and estimates

| Phase | Where | Size | User-visible effect |
|---|---|---|---|
| 1 Retry-After pause | frontend | ~30 lines | Storm cannot restart itself |
| 2 One banner + countdown | frontend | ~120 lines | "Why is everything broken" answered on screen |
| 3 Whiteboard no-op saves | frontend | ~15 lines | Removes the biggest load-time writer |
| 8A Inbox stream removal | frontend | −15 lines | No 404 on every Inbox open |
| 5 Read/write buckets | backend | ~25 lines | Reads keep working during a write storm |
| 6 Burst allowance | backend | ~30 lines | Fewer false 429s on normal loads |
| 7 TRUST_PROXY_HOPS=2 | deploy | 1 line | Anonymous traffic keyed correctly |
| 4 Batch writes | backend + frontend | ~140 lines | 5–10× fewer requests on load |

Phases 1, 2, 3, 8A can go in one frontend PR (they touch disjoint files except `oneSaveClient`).
Phases 5, 6 in one backend PR. Phase 7 rides the next backend deploy. Phase 4 last, its own PR pair.

## Verification per PR

- Frontend: strict gate (`tsc -b`, vitest, both builds, PII, SSR smoke) + a production pass in
  Comet after deploy: reload with the whiteboard open → `read_network_requests` shows zero 429 and
  at most one whiteboard PUT; artificially trip the limit (rapid reloads) → banner shows a countdown
  and clears on its own; Properties/Calendar/Inbox load afterwards without a manual refresh.
- Backend: unit tests above + after Ilya's deploy, `curl -D -` through Netlify shows the two
  `x-ratelimit-*` header sets and `Retry-After` on a 429.
- Every PR adds its `docs/code.md` entry (error / root cause / fix / prevention).
