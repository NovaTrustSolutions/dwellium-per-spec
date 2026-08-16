# Plan 041: Make the avatar harness fully backendless (browser-direct Anam + vault key + local profiles)

> **Executor instructions**: Follow step by step; verify every step. On STOP
> conditions, stop and report. Commit in the worktree per the git workflow.
> SKIP updating `plans/README.md` — the reviewer maintains the index.
>
> **Repo**: FRONTEND only. `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`.
> **Base branch**: `advisor/040-avatar-harness-fe` @ `5efd17c` — this plan REWORKS
> that unmerged branch; branch your worktree FROM IT, not from main.
> Planned 2026-07-04.
>
> **Drift check (run first, in worktree)**: confirm `git log --oneline -1` shows
> your branch is on top of `5efd17c` and `git diff --stat main..5efd17c` shows the
> 10 plan-040 frontend files.

## Status

- **Priority**: P1 (owner directive: "create it without an API backend")
- **Effort**: M (rework of an existing approved branch)
- **Risk**: LOW-MED (frontend-only; the trust model matches the app's existing browser-direct LLM pattern)
- **Depends on**: plan-040 FE branch (exists, unmerged). Plan-040 BACKEND branch becomes OPTIONAL/UNUSED — do not touch it.
- **Category**: direction
- **Planned at**: FE branch `5efd17c`, 2026-07-04

## Why this matters

Owner directive: the avatar harness must work **without an API backend**. The
plan-040 build routes everything through Cloud Run (`/api/avatar/*`). This plan
cuts the server out: the browser talks to `api.anam.ai` directly using the
USER'S OWN Anam API key stored in the existing per-user integrations vault —
the exact trust model the app already uses for browser-direct Anthropic/OpenAI
calls (`llmClient.ts`, keys per-login in the encrypted vault, One Save synced).
**CORS verified empirically 2026-07-04**: `OPTIONS https://api.anam.ai/v1/auth/session-token`
and `/v1/avatars` both return `access-control-allow-origin: *` with
`Authorization` in allowed headers — browser-direct is supported.

## Current state

- Branch `advisor/040-avatar-harness-fe` @ `5efd17c` (worktree may still exist
  at `.advisor-worktrees/040-fe` — reuse it): `AvatarHarness.tsx`,
  `AnamAdapter.ts`, `AvatarSetupPanel.tsx` (+css), `lib/avatarClient.ts`
  (currently calls `/api/avatar/*`), tests, ARAConsole + StellaAgent wiring.
  READ ALL OF THESE FIRST.
- Per-user integrations vault: `src/lib/integrationsStore.ts` (encrypted,
  private `integrationsOwnerIdHolder`, One Save synced) + UI cards in
  `src/components/ControlPanel/LlmIntegrationsSection.tsx` (5 LLM cards +
  Supabase + Postgres — follow one card's pattern EXACTLY for a new "Anam
  Avatar Engine" card). Read how `llmClient.ts` resolves a key from the vault.
- Per-user store discipline (if adding a profiles store): `createLocalStorageStore`
  Option β + holder in `perUserIdentity.ts` `ALL_HOLDERS` + One Save
  `SyncOptions` + `.reset()` (F-015 single-writer rules).
- Pinned Anam surface (from plan 040): `POST /v1/auth/session-token`
  `{ clientLabel, personaConfig }` w/ `Authorization: Bearer <key>`;
  `POST /v1/avatars` (JSON `{ imageBase64, mimeType, displayName? }`);
  `GET /v1/avatars`; `GET /v1/voices`; SDK `createClient(sessionToken)` etc.
- CSP note: `netlify.toml` CSP is REPORT-ONLY and its `connect-src` list does
  not include `https://api.anam.ai` — non-blocking today; add a one-line note
  to your report so the origin joins the allowlist when CSP is enforced
  (do NOT edit netlify.toml — out of scope).

## Approach (decided)

1. **Vault key**: add `anamApiKey` to the integrations bundle (mirror how
   another non-LLM card, e.g. Supabase, extends the bundle type + persistence)
   and an "Anam Avatar Engine" card in `LlmIntegrationsSection.tsx` (masked
   input, save/clear, short helper text linking anam.ai).
2. **`avatarClient.ts` rework**: all functions take the key from the vault
   (via the same accessor pattern `llmClient` uses) and call `api.anam.ai`
   directly: `getConfigured()` = vault key present (NO network);
   `createSessionToken(profile)`; `createAvatarFromImage(...)`;
   `listOptions()`. 10s timeouts; errors mapped to friendly messages; the key
   NEVER appears in errors, logs, or thrown messages.
3. **Profiles store**: new `src/lib/avatarProfilesStore.ts` — per-user
   dynamic-key store `Record<agentId, { avatarId, voiceId?, systemPrompt?,
   displayName? }>` with One Save (`objectType: 'avatar-profiles'`), holder in
   `perUserIdentity.ts` (038 discipline). SetupPanel reads/writes this instead
   of the backend.
4. **Harness**: unconfigured state now means "no Anam key in your vault" with
   a button that OPENS the Control Panel API-Keys section (find how other
   components open a widget — `openWindow('control-panel', …)`).
5. **Delete/neutralize** the `/api/avatar/*` fetch paths from the FE entirely
   (the plan-040 BACKEND branch simply never merges; do not reference it).
6. Tests updated accordingly: configured-detection from vault; profiles
   round-trip + per-user isolation; session-token request carries
   `Authorization: Bearer` from the vault key and TARGETS api.anam.ai (mock
   fetch; assert URL + header shape WITHOUT asserting the key value in
   cleartext beyond a test constant); consent gate unchanged; teardown
   unchanged.

## Commands

| Purpose | Command (in `qualia-shell/`) | Expected |
|---|---|---|
| Typecheck | `npx tsc -b` | 0 |
| Focused | `npx vitest run src/test/avatarHarness.test.tsx` | pass |
| Full | `npx vitest run` | green |
| Gate | repo root: `SMOKE_TEST_PORT=3210 bash Scripts/gate.sh` | GREEN |

## Scope

**IN**: the plan-040 FE files (rework), `src/lib/avatarProfilesStore.ts` (new),
`src/lib/integrationsStore.ts` (add one field, matching an existing field's
pattern), `LlmIntegrationsSection.tsx` (one new card), `perUserIdentity.ts`
(one holder), tests.
**OUT**: backend repo entirely; netlify.toml; `llmClient.ts` behavior;
any other integrations card.

## Git workflow

- Reuse/create worktree `.advisor-worktrees/040-fe` on branch
  `advisor/040-avatar-harness-fe` and commit ON TOP of `5efd17c` (this keeps
  one avatar branch; the rework supersedes in-place). Conventional commit:
  `refactor(avatar): backendless — browser-direct Anam via per-user vault key + local profiles`.
- Do NOT push.

## Steps

1. Vault field + card. Verify: `npx tsc -b` → 0.
2. `avatarProfilesStore.ts` + holder. Verify: tsc 0.
3. `avatarClient.ts` rework to browser-direct; remove `/api/avatar` usage
   (grep proves none remain). Verify: tsc 0; `grep -rn "/api/avatar" src/` → no matches.
4. Harness/SetupPanel updates (unconfigured → vault CTA; profiles from store).
   Verify: tsc 0.
5. Tests per Approach. Verify: focused → full vitest → gate GREEN.

## Done criteria

- [ ] tsc + full vitest + gate GREEN
- [ ] `grep -rn "/api/avatar" qualia-shell/src/` → zero matches
- [ ] `grep -rn "anamApiKey" qualia-shell/src/ | grep -i "console\.\|log("` → no key logging
- [ ] Per-user isolation test on profiles store passes
- [ ] Scope-clean diff vs `5efd17c`; committed
- [ ] Report: CSP note + any Anam-surface deviations discovered from the SDK types

## STOP conditions

- The integrations bundle/vault cannot be extended without touching encryption
  or migration logic beyond adding a field — report the shape.
- SDK/client flow turns out to REQUIRE a server-side element at v4.10.0
  (types show no browser session-token path) — report evidence.
- Full-suite failures outside touched files.

## Maintenance notes

- Trust model note for the reviewer: the user's own key in their own encrypted
  vault making browser-direct calls = the repo's established Anthropic pattern;
  key never leaves the browser except TO Anam over TLS.
- When CSP goes enforcing: add `https://api.anam.ai` (and Anam's WebRTC/signal
  origins the SDK uses — note them from the network tab during Ilya's live pass)
  to `connect-src`.
- The plan-040 backend branch (`advisor/040-avatar-harness-be`) stays unmerged;
  index will mark it OPTIONAL (a server-mediated mode if ever wanted).
