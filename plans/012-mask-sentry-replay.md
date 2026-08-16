# Plan 012: Mask Sentry Session Replay so it can't capture typed secrets

> **Executor instructions**: Follow step by step; run each verification. Note the
> rotation advisory. Obey STOP conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/services/sentry.ts`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

Sentry Session Replay is configured with `maskAllText: false` and `blockAllMedia: false`,
and `replaysOnErrorSampleRate: 1.0` (every error triggers a replay). The app renders API
keys into input fields (the Control Panel → API Keys panel, written on every keystroke)
and shows LLM/user content. So when `VITE_SENTRY_DSN` is set in production, an error-
triggered replay that fires while the keys panel is open — or while a key is being
pasted/typed — can capture those secret values verbatim and ship them to Sentry, a third-
party processor, alongside the user's email (`setSentryUser` sends `email`). `sendDefaultPii:
false` does not cover replay DOM capture. Flipping masking on is a one-block fix.

## Current state

- `qualia-shell/src/services/sentry.ts:33-36`:
  ```ts
  Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
  }),
  ```
- `sentry.ts:41-42`: `replaysSessionSampleRate: 0.1`, `replaysOnErrorSampleRate: 1.0`.
- `sentry.ts:44`: `sendDefaultPii: false` (good, but doesn't mask replay DOM).
- `sentry.ts:84-90` (`setSentryUser`): `Sentry.setUser({ id: user.id, email: user.email, username: user.role })` — sends `email`.
- Sentry is fully no-op when `VITE_SENTRY_DSN` is unset (`:23`), so dev is unaffected; this matters only when a DSN is configured in production.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run` | pass (no Sentry test today; ensure nothing breaks) |
| Grep guard | `grep -n "maskAllText\|maskAllInputs\|blockAllMedia" qualia-shell/src/services/sentry.ts` | shows the masked config |

## Scope

**In scope**: `qualia-shell/src/services/sentry.ts` (replay config + the `email` decision).

**Out of scope**:
- Adding Sentry to components. The masking default covers all surfaces; per-field `.sentry-mask` classes are optional and not required once `maskAllText`/`maskAllInputs` are on.
- Changing sampling rates (leave as-is).

## Git workflow

- Branch: `advisor/012-sentry-mask`
- Commit: `security(sentry): mask replay text + inputs, block media; drop email from user context`
- Do NOT push/PR without Ilya's go.

## Steps

### Step 1: Turn on masking

Change the `replayIntegration` config to:
```ts
Sentry.replayIntegration({
    maskAllText: true,
    maskAllInputs: true,
    blockAllMedia: true,
}),
```

**Verify**: `grep -n "maskAllText: true" qualia-shell/src/services/sentry.ts` present; no `maskAllText: false` remains.

### Step 2: Drop `email` from the Sentry user context

In `setSentryUser` (`:87`), send only non-PII identifiers: `Sentry.setUser({ id: user.id, username: user.role })` (remove `email`). `id` is a stable UUID; `role` is non-PII.

**Verify**: `grep -n "email" qualia-shell/src/services/sentry.ts` → no match in `setSentryUser`.

### Step 3: Typecheck + tests

**Verify (Mac)**: `npx tsc -b` exit 0; `npx vitest run` passes.

## Test plan

- Optional but recommended: add `qualia-shell/src/test/sentry.test.ts` that imports `setSentryUser` and asserts it does not forward `email` (e.g. mock `@sentry/react`'s `setUser` and assert the payload has no `email` key). Model after an existing `src/test/*.test.ts` that mocks a module with `vi.mock`.
- Verification: `npx vitest run sentry` → pass.

## Done criteria

- [ ] `replayIntegration` has `maskAllText: true`, `maskAllInputs: true`, `blockAllMedia: true`
- [ ] `setSentryUser` no longer sends `email`
- [ ] `npx tsc -b` + `npx vitest run` green
- [ ] Only `sentry.ts` (+ optional test) changed
- [ ] `plans/README.md` row updated

## STOP conditions

- `maskAllInputs` is not a valid option in the installed `@sentry/react` version (API drift) — STOP and report the version; use the documented equivalent rather than guessing.
- Removing `email` breaks a test that asserts it's sent — update that test to the new contract (don't re-add email).

## Maintenance notes

- **Rotation advisory (operator):** if a production DSN was already configured and replays may have captured API keys before this fix, treat any LLM/Supabase/Postgres key entered during that window as potentially exposed and rotate it. A masked replay cannot un-capture past sessions.
- Reviewer: confirm masking is on and `email` is gone; this is a privacy/security default, keep it.
