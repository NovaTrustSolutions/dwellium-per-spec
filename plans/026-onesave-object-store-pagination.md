# Plan 026: Paginate + de-block the One Save object store (listObjects + writes)

> **Executor instructions**: Follow step by step; run every verification command before
> advancing. Honor STOP conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `cd /Users/ilyaklipinitser/dwellium-backend && git diff --stat 6695bd4..HEAD -- ai-dashboard369-file-manager/src/stores/objectStore.ts ai-dashboard369-file-manager/src/routes/objectRoutes.ts`
> If in-scope files changed, compare against "Current state" before proceeding.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (changes a hot persistence path; ownership + response shape must be
  preserved). Depends on plan 024's tests to verify safely.
- **Depends on**: 024 (backend test harness — needed to verify ownership isn't broken)
- **Category**: perf
- **Planned at**: commit `6695bd4` (backend), 2026-07-02

## Why this matters

`listObjects()` in the One Save object store reads and `JSON.parse`s **every** object file
in the directory on each list request, then sorts — synchronous, O(N) filesystem + parse
work that blocks the Node event loop. `/api/objects?type=…` returns the whole array with
no pagination. Writes use `fs.writeFileSync` with pretty-printed JSON on a keystroke-debounced
path. As any account's object count grows (workspaces, artifacts, knowledge-graph nodes all
persist here), list latency and event-loop stalls grow linearly and affect all concurrent
users. This plan adds `limit`/`offset` to the list path and moves writes off the synchronous
critical path, without changing ownership rules or the object response shape.

## Current state

Backend: `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`.

- `src/stores/objectStore.ts` — the object store.
  - `listObjects(...)` (around line 108–125): `fs.readdirSync(dir)`, then per file
    `JSON.parse(fs.readFileSync(...))`, filters out `deletedAt != null`, sorts, returns
    the full array.
  - `upsertObject(...)` (around line 84–106): `fs.writeFileSync(path, JSON.stringify(obj, null, 2))`.
  - Confirm exact line numbers and signatures with
    `grep -n "export function \(list\|upsert\|get\|delete\)Object" src/stores/objectStore.ts`.
- `src/routes/objectRoutes.ts` — the HTTP layer.
  - The list route (around line 28) reads `req.query.type` + `owner` (from `req.user.id`)
    and returns `listObjects(...)` directly.
  - GET/PUT/DELETE enforce `obj.ownerId === req.user.id`. **Preserve this.**
- The frontend client that consumes these:
  `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec/qualia-shell/src/lib/oneSaveClient.ts`
  — `list(type, ownerId)` calls `GET /api/objects?type=…&owner=…` and returns `data ?? []`.
  It currently sends no pagination params; it must keep working unchanged (backward compat:
  no params ⇒ a sensible default page, and the response stays an array of objects).

Conventions: TypeScript, `npx tsc --noEmit`. Response envelope is `{ success, data }`
elsewhere but this list route returns the array as `data`. Ownership is derived from the
authenticated session, never the query string.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd ai-dashboard369-file-manager && npx tsc --noEmit` | exit 0 |
| Tests | `npm test -- objects` | pass (after plan 024) |

## Scope

**In scope:**
- `ai-dashboard369-file-manager/src/stores/objectStore.ts`
- `ai-dashboard369-file-manager/src/routes/objectRoutes.ts`
- `ai-dashboard369-file-manager/tests/integration/objects.test.ts` (extend — created in 024)

**Out of scope:**
- The frontend `oneSaveClient.ts` — it must keep working with NO changes (backward-compat
  default page). Touch it only if a follow-up explicitly opts into pagination; not here.
- Ownership logic — do not alter the `obj.ownerId === req.user.id` checks.
- The object payload/response shape — clients parse `{ id, type, ownerId, schema,
  createdAt, updatedAt, deletedAt, payload }`. Keep it.

## Git workflow

- Branch: `advisor/026-onesave-pagination`.
- Conventional commits (`perf(onesave): …`).
- Do NOT push or deploy without Ilya's go.

## Steps

### Step 1: Add optional pagination to `listObjects`

Change the signature to accept an options bag with `limit` and `offset`
(e.g. `listObjects(type, ownerId, opts?: { limit?: number; offset?: number })`). Default
`limit` to a bounded value (e.g. 100) and `offset` to 0 when omitted, so existing callers
that pass nothing get the first page — NOT the whole set. Keep the filter
(`deletedAt == null`) and sort, but apply `slice(offset, offset + limit)` after sorting.
Do NOT change the element shape.

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Plumb pagination through the route (bounded)

In `objectRoutes.ts` list route, parse `limit`/`offset` from the query, clamp `limit` to a
max (e.g. `Math.min(500, ...)`), default when absent, and pass them to `listObjects`. Owner
still comes from `req.user.id`. Response stays the array as before.

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Reduce write cost

In `upsertObject`, drop the pretty-print: `JSON.stringify(obj)` instead of
`JSON.stringify(obj, null, 2)` (smaller payloads, faster serialize). If low-risk, switch the
write to `fs.promises.writeFile` and make `upsertObject` `async` (and `await` it at the one
route call site) — BUT only if the call sites are few and the change stays within scope; if
`upsertObject` is called synchronously from many places, keep it sync and just drop the
pretty-print, and record the async follow-up in Maintenance notes. Never let a write error
be swallowed silently — preserve existing error handling.

**Verify**: `grep -n "null, 2" src/stores/objectStore.ts` → no matches in `upsertObject`. `npx tsc --noEmit` → 0.

### Step 4: Extend the objects integration suite

In `tests/integration/objects.test.ts` (from plan 024) add: creating N objects then
listing with `limit`/`offset` returns the correct page and count; the default (no params)
returns a bounded page, not all N; ownership still holds for every paged result (user B
never sees user A's page). Assert the response element shape is unchanged.

**Verify**: `npm test -- objects` → all pass.

## Test plan

- Extend `objects.test.ts`: pagination correctness (page boundaries, default bound),
  ownership-under-pagination, unchanged element shape.
- If plan 024 is not yet landed, STOP — this plan depends on that harness to verify
  ownership safely.

## Done criteria

- [ ] `listObjects` accepts `limit`/`offset`, defaults to a bounded first page
- [ ] The list route clamps `limit` and derives owner from the session only
- [ ] `grep -n "null, 2" src/stores/objectStore.ts` → no matches in `upsertObject`
- [ ] `npm test -- objects` passes incl. new pagination + ownership cases
- [ ] Frontend `oneSaveClient.ts` unchanged and still receives an array
- [ ] `npx tsc --noEmit` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Plan 024's harness/tests are not present — STOP (cannot verify ownership safely).
- `upsertObject` is called from many synchronous sites and cannot be made async within
  scope — do the pretty-print drop only and record the async follow-up; do not refactor
  callers.
- Changing the default page bound would break `oneSaveClient.list()` expectations (it
  assumes it receives the full working set for a type) — if any store relies on getting
  *all* objects of a type in one call, STOP and report which; a client-side paging change
  would then be required and is out of scope here.

## Maintenance notes

- If a client later needs the full set, add explicit `?limit=` paging on the client rather
  than removing the server default.
- The real long-term fix is an index (per-type/owner) or moving off one-file-per-object;
  this plan is the bounded, low-risk interim. Note that follow-up here.
- Reviewer should confirm ownership is still session-derived and the response element shape
  is byte-identical.
