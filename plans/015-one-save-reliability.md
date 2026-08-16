# Plan 015: One Save — retry dropped write-throughs and isolate bootstrap failures

> **Executor instructions**: Follow step by step; run each verification. This touches the
> persistence spine (59 wrapped stores) — the tests in the Test plan are mandatory. Obey
> STOP conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/lib/oneSaveStore.ts qualia-shell/src/lib/oneSaveClient.ts`
> If either changed, re-read and compare the excerpts; on mismatch STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additive — failure handling around an already-fire-and-forget path)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

"One Save" is the durable per-account sync spine (theme, saved layouts, wiki, integration
secrets, ~59 wrapped stores). Two reliability gaps:

1. **Dropped writes (no retry).** `scheduleWriteThrough` runs `void oneSaveClient.put(...)`
   fire-and-forget with no `.catch` and no success check; `oneSaveClient.call()` returns
   `null` on *any* failure and never throws. So a debounced write that fails during a
   transient backend outage is silently lost — only re-attempted if the same value is
   `set()` again. A value edited once and left is never re-synced; on device switch /
   `hydrate()`, the user silently loses it, with no banner.
2. **Bootstrap aborts on one failure.** `bootstrap` runs `for (const e of registry) await
   e.hydrate()` (then `migrate`) sequentially; if any one store's hydrate/migrate rejects
   (e.g. a deserialize/persist callback throwing on a corrupt remote payload), every store
   registered *after* it is skipped and silently falls back to stale/empty local state.

## Current state

- `qualia-shell/src/lib/oneSaveStore.ts:89-106` (`scheduleWriteThrough`):
  ```ts
  timer = setTimeout(() => {
      timer = null;
      if (ownerId() !== scheduledOwnerId) return;
      void oneSaveClient.put({ id: scheduledObjectId, type: objectType, ownerId: scheduledOwnerId, payload: value });
  }, debounceMs);
  ```
  No result check, no retry.
- `qualia-shell/src/lib/oneSaveClient.ts:64-85` (`call`): returns `null` on `!res.ok`, offline, or parse error; `:82-84` `catch { return null; }`. Never throws. `put` is built on `call`.
- `oneSaveStore.ts:177-183` (`bootstrap`):
  ```ts
  async bootstrap(userId) {
      currentUserId = userId;
      for (const e of registry) e.setOwner(userId);
      if (!ONE_SAVE_ENABLED || !userId) return;
      for (const e of registry) await e.hydrate();
      for (const e of registry) await e.migrate();
  }
  ```
- A status surface already exists for offline banners: `backendStatusStore` (used at `UserContext.tsx:316` via `markOffline(...)`). Reuse it to surface persistent sync failure rather than inventing UI.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run oneSaveStore` | pass (incl. new cases) |
| Full gate (Mac) | `bash Scripts/gate.sh` | GREEN |

## Scope

**In scope**:
- `qualia-shell/src/lib/oneSaveStore.ts` (retry in `scheduleWriteThrough`; isolate `bootstrap`)
- `qualia-shell/src/lib/oneSaveClient.ts` (let `put` signal success/failure distinctly)
- `qualia-shell/src/test/oneSaveStore.test.ts` (extend)

**Out of scope**:
- The 59 consumer stores — they call `set()` unchanged; the wrapper handles reliability.
- The backend `/api/objects` route (separate repo).
- Changing the debounce interval or the account-switch guard (keep `ownerId() !== scheduledOwnerId` behavior).

## Git workflow

- Branch: `advisor/015-one-save-reliability`
- Commit(s): `fix(onesave): retry dropped write-throughs + isolate bootstrap per store`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Make `put` report success

In `oneSaveClient.ts`, ensure `put` returns a value the caller can test for failure — e.g. have it return the saved object or `null` (it likely already does via `call`), and confirm `null` distinctly means "not persisted". Do not make it throw (the no-throw-into-React contract at `:61-62` is intentional). Document the contract in a comment: "`put` resolves to the object on success, `null` on failure."

**Verify**: `grep -n "put" qualia-shell/src/lib/oneSaveClient.ts` — `put` returns `DwelliumObject|null` (or equivalent) and the JSDoc states null = failure.

### Step 2: Retry dropped write-throughs with bounded backoff

In `scheduleWriteThrough`, capture the `put` result and retry on failure:
```ts
timer = setTimeout(async () => {
    timer = null;
    if (ownerId() !== scheduledOwnerId) return;
    for (let attempt = 0; attempt < 3; attempt++) {
        const ok = await oneSaveClient.put({ id: scheduledObjectId, type: objectType, ownerId: scheduledOwnerId, payload: value });
        if (ok) return;
        if (ownerId() !== scheduledOwnerId) return; // account switched mid-retry → drop
        await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
    }
    // all attempts failed: surface it, don't lose it silently
    backendStatusStore.markOffline?.('One Save write failed');
}, debounceMs);
```
Keep the account-switch guard inside the retry loop (never write into the next user's namespace). Import `backendStatusStore` (match its existing API — confirm the method name from `UserContext.tsx:316`).

**Verify**: `grep -n "attempt" qualia-shell/src/lib/oneSaveStore.ts` → retry loop present; the account-switch guard is still checked before each write.

### Step 3: Isolate bootstrap per store

Change `bootstrap` so one store's failure can't skip the rest:
```ts
await Promise.allSettled(registry.map(e => e.hydrate()));
await Promise.allSettled(registry.map(e => e.migrate()));
```
(`allSettled` both isolates failures and parallelizes the N round-trips, speeding login.) If ordering matters for any store, instead wrap each in `try/catch` inside the existing `for` loops — but `allSettled` is preferred unless a STOP condition surfaces an ordering dependency.

**Verify**: `grep -n "allSettled\|try {" qualia-shell/src/lib/oneSaveStore.ts` → bootstrap no longer has a bare `for ... await e.hydrate()` that can abort the loop.

### Step 4: Typecheck + tests + gate

**Verify (Mac)**: `npx tsc -b` exit 0; `npx vitest run oneSaveStore` passes; `bash Scripts/gate.sh` GREEN.

## Test plan

Extend `qualia-shell/src/test/oneSaveStore.test.ts` (model after its existing setup that toggles `ONE_SAVE_ENABLED` and mocks `oneSaveClient`):
- **Retry success**: mock `oneSaveClient.put` to fail once then succeed; `set()` a value; advance timers; assert `put` was called ≥2× and the value persisted (no banner).
- **Retry exhaustion**: mock `put` to always fail; assert it retried up to the cap and `backendStatusStore.markOffline` was called (value not silently dropped).
- **Account-switch during retry**: change owner mid-retry; assert no `put` targets the new owner's namespace.
- **Bootstrap isolation**: register two stores where the first's `hydrate` rejects; assert the second still hydrates (was skipped before).
- Verification: `npx vitest run oneSaveStore` → all pass, including the new cases.

## Done criteria

- [ ] `scheduleWriteThrough` retries failed writes with bounded backoff and surfaces persistent failure via `backendStatusStore` (no silent drop)
- [ ] `bootstrap` isolates per-store failures (`Promise.allSettled` or per-store try/catch) — one bad store no longer skips the rest
- [ ] Account-switch guard preserved inside the retry loop
- [ ] New tests cover retry-success, retry-exhaustion, account-switch, bootstrap-isolation; `npx vitest run oneSaveStore` green
- [ ] `npx tsc -b` exit 0 and `bash Scripts/gate.sh` GREEN
- [ ] Only the three in-scope files changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `backendStatusStore` has no suitable "mark offline / surface failure" method — STOP and report its actual API; don't invent a new global UI surface.
- A store in the registry depends on hydrate ORDER (switching to `allSettled` breaks it) — STOP, report which, and use per-store `try/catch` inside the sequential loops instead.
- Adding retry changes test timing such that existing oneSaveStore tests hang on fake timers — STOP; the repo has a documented `vi.useFakeTimers` + React 19 hazard (see `CLAUDE.md`); prefer `vi.advanceTimersByTimeAsync` or real timers with `waitFor`.

## Maintenance notes

- Future: a persistent "pending-sync" marker (re-flushed on next bootstrap) would make writes durable across a full reload during an outage — deferred here in favor of in-session retry + banner. Note it if you extend this.
- Reviewer: confirm the account-switch guard is inside the retry loop (a retry must never leak into another user's namespace), and that bootstrap failures are isolated.
