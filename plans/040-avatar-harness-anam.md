# Plan 040: Interactive avatar harness (Anam-powered) — photo-to-live-avatar for ARA, Stella, and any agent

> **Executor instructions**: Follow step by step; verify every step. On STOP
> conditions, stop and report. Commit in the worktree per the git workflow.
> SKIP updating `plans/README.md` — the reviewer maintains the index.
>
> **Repos**: FRONTEND `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at `5fac7c8`) AND BACKEND
> `/Users/ilyaklipinitser/dwellium-backend/ai-dashboard369-file-manager`
> (planned at `8651525`), 2026-07-04. Verification on the Mac.
>
> **Drift checks (run first)**:
> Frontend: `git diff --stat 5fac7c8..HEAD -- qualia-shell/src/components/ARAConsole/ qualia-shell/src/components/StellaAgent/ qualia-shell/src/lib/perUserIdentity.ts`
> (plan-038's branch may have touched StellaAgent + perUserIdentity — if the diff is ONLY 038's logActivity/holder additions, proceed).
> Backend: `git diff --stat 8651525..HEAD -- src/routes/araRoutes.ts`

## Status

- **Priority**: P1 (owner-requested)
- **Effort**: L (cross-repo; new harness + upload flow + 2 agent integrations)
- **Risk**: MED (streaming/WebRTC surface; mitigated: additive, feature renders only when configured)
- **Depends on**: none hard
- **Category**: direction
- **Planned at**: frontend `5fac7c8` / backend `8651525`, 2026-07-04

## Why this matters

Owner request (verbatim intent): a harness for interactive avatars "for Aura
[ARA], for Stella, and any other AI" — like anam.ai: "put in an image, and that
image will become the live avatar… look like a human and sound like a human,"
with low latency. The repo already has the pieces scattered: `@anam-ai/js-sdk`
4.10.0 in package.json, an Anam usage inside `ARAConsole.tsx`, a backend route
returning 503 `'ANAM_API_KEY not configured on server'` at `araRoutes.ts:350`,
and `VITE_ANAM_API_KEY` in local `.env`. This plan consolidates them into ONE
provider-agnostic harness any agent can mount, adds the photo→avatar creation
flow, and wires ARA + Stella.

## Current state (verified anchors — READ these files first)

- Frontend `qualia-shell/src/components/ARAConsole/ARAConsole.tsx` — the only
  current `@anam-ai/js-sdk` consumer. Read its Anam session/stream code before
  designing; the harness must absorb (not duplicate) this pattern, and
  ARAConsole becomes a harness consumer.
- Backend `src/routes/araRoutes.ts:340-360` — existing Anam-related route
  (503s without `ANAM_API_KEY`). Read it; the new `avatarRoutes.ts` supersedes
  it or delegates (do not leave two divergent token paths — if ARAConsole uses
  this route, migrate it and keep a thin back-compat shim or update the caller).
- Backend conventions: express routers in `src/routes/`, `authenticate`
  middleware from `src/services/authMiddleware`, prepared-statement SQLite
  stores in `src/stores/`, jest integration harness at `tests/integration/`.
- Frontend conventions: per-user stores = `createLocalStorageStore` Option β +
  holder in `perUserIdentity.ts` `ALL_HOLDERS` (single-writer — violating this
  recreates React #185 / FUCKUPS F-015) + One Save `SyncOptions` wrapper +
  `.reset()`; raw `useContext(UserContext)`; vitest+RTL.
- Anam docs (fetch before coding — the SDK moved fast; PIN what v4.10.0
  supports): https://docs.anam.ai/sdk-reference/basic-usage ,
  https://anam.ai/docs/llms-full.txt (full API reference incl. create-avatar),
  https://anam.ai/docs/javascript-sdk/examples/custom-llm . Core flow:
  server → `POST https://api.anam.ai/v1/auth/session-token` with API key +
  persona config (name, avatarId, voiceId, llmId, systemPrompt) → client
  `createClient(sessionToken)` → `streamToVideoElement(...)`. Custom avatar
  from a single image via the create-avatar API. Latency: Anam's hosted
  full-stack mode (their STT→LLM→TTS pipeline) is the low-latency default the
  owner wants; their built-in fast LLM is fine (the owner referenced "a quick
  model like 4.0").

## Approach (decided)

**Backend — new `src/routes/avatarRoutes.ts`** (mount under `/api/avatar`, all
`authenticate`-gated):
- `GET /api/avatar/health` → `{ configured: boolean }` (ANAM_API_KEY present).
- `POST /api/avatar/session-token` body `{ agentId }` → loads that agent's
  saved profile (below) → requests an Anam session token with personaConfig →
  returns `{ sessionToken }`. NEVER returns or logs the API key.
- `POST /api/avatar/create-from-image` (multipart or base64 JSON ≤8MB) →
  proxies to Anam's create-avatar API → returns `{ avatarId, ... }`.
- `GET /api/avatar/options` → proxied lists of available stock avatars +
  voices (for the picker).
- `GET/PUT /api/avatar/profiles/:agentId` → per-USER per-AGENT profile
  persistence in a new SQLite store `src/stores/avatarProfileStore.ts`
  (`user_id, agent_id, avatar_id, voice_id, system_prompt, display_name,
  updated_at`; prepared statements; FK to users). Profiles are per-login —
  matching the app's per-account model.
- All Anam calls: 10s timeout, errors surfaced as `{ error }` JSON with NO
  upstream secrets/keys echoed.

**Frontend:**
- `src/lib/avatarClient.ts` — thin typed client for the routes above.
- `src/components/AvatarHarness/AvatarHarness.tsx` + css — THE reusable
  component: props `{ agentId, systemPromptDefault?, size? }`. States:
  unconfigured (setup CTA) → connecting → live (video element via
  `client.streamToVideoElement`, mic on/off, interrupt/stop, end session) →
  error (honest message; 503 → "Avatar engine not configured on the backend").
  Session lifecycle MUST tear down on unmount (stop streams, close client) —
  this repo has a history of unmount-leak findings.
- `src/components/AvatarHarness/AvatarSetupPanel.tsx` — per-agent setup:
  upload a photo (file input + preview) → REQUIRED consent checkbox ("I have
  the right to use this person's likeness") → create → shows resulting
  avatarId; voice picker from `/options`; system-prompt textarea; Save →
  `PUT /profiles/:agentId`.
- Agent wiring:
  - ARAConsole: replace its bespoke Anam block with `<AvatarHarness agentId="ara" …/>`
    (keep its existing UI placement; behavior parity or better).
  - StellaAgent: add an avatar toggle (header button) that mounts
    `<AvatarHarness agentId="stella" systemPromptDefault={Stella's persona} />`
    above the chat. Do NOT restructure Stella's chat logic.
- The harness is generic: any future agent = one `<AvatarHarness agentId="x" />`.
  Document this in the component header.

**Out of provider-agnosticism scope**: define a minimal
`AvatarProviderAdapter` interface inside the harness (connect/disconnect/
mute/talk) with `AnamAdapter` as the only implementation — the seam exists,
no second provider now.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| FE typecheck/tests | `cd qualia-shell && npx tsc -b && npx vitest run` | green |
| FE gate | `SMOKE_TEST_PORT=3210 bash Scripts/gate.sh` (repo root) | GREEN |
| BE typecheck/tests | `cd <backend> && npx tsc --noEmit && npm test -- --forceExit` | green |

## Scope

**Frontend IN**: `src/components/AvatarHarness/*` (new), `src/lib/avatarClient.ts` (new), `ARAConsole.tsx` (Anam block swap only), `StellaAgent.tsx` (toggle + mount only), `src/test/avatarHarness.test.tsx` (new).
**Backend IN**: `src/routes/avatarRoutes.ts` (new), `src/stores/avatarProfileStore.ts` (new), app router mount (locate where routes register, e.g. `src/app.ts`), `araRoutes.ts` (ONLY the Anam block migration/shim), `src/services/dwelliumSchema.ts` (one new table), `tests/integration/avatarRoutes.test.ts` (new; mock the Anam HTTP boundary).
**OUT**: any real Anam network call in tests; committing any API key or image; other agents beyond ARA+Stella; voice cloning flows; the LLM key vault.

## Git workflow

- Frontend worktree: `.advisor-worktrees/040-fe`, branch `advisor/040-avatar-harness-fe`, off main.
- Backend worktree: `~/dwellium-backend/worktrees/advisor-040-be`, branch `advisor/040-avatar-harness-be`, off main (package root nests at `ai-dashboard369-file-manager/`).
- Conventional commits. Do NOT push. If backend `npm test` fails on unrelated `.env`-missing suites, the pre-authorized fix is copying `.env` from the main checkout (file copy only, never read).

## Steps

1. **Docs pin (backend-agnostic)**: fetch the three Anam doc URLs; record in
   your report the EXACT endpoints/fields used (session-token payload shape,
   create-avatar endpoint + content type, options endpoints) and confirm
   `@anam-ai/js-sdk@4.10.0`'s client API names (createClient/streamToVideoElement
   or current equivalents from the SDK's own .d.ts in node_modules — TRUST THE
   INSTALLED TYPES over docs when they disagree).
2. **Backend**: schema table + store + routes + mount + araRoutes migration.
   Verify: `npx tsc --noEmit` → 0.
3. **Backend tests** (`avatarRoutes.test.ts`; mock global fetch for Anam):
   session-token 503 when env unset / 200 + token passthrough when set (env
   stubbed in test); create-from-image validates size + consent field and
   proxies; profiles GET/PUT round-trip per user (user A's profile invisible
   to user B); NO api key in any response body (assert).
   Verify: `npm test -- --forceExit` → green incl. new suite.
4. **Frontend harness + setup panel + client** per Approach, with unmount
   teardown and reduced surface when `/health` says unconfigured.
   Verify: `npx tsc -b` → 0.
5. **Agent wiring** (ARAConsole swap + Stella toggle).
   Verify: `npx tsc -b` → 0; full vitest green.
6. **Frontend tests** (`avatarHarness.test.tsx`, mock avatarClient):
   unconfigured state renders setup CTA; configured → connect flow invoked
   with agentId; unmount calls disconnect (spy); setup panel blocks create
   without the consent checkbox; Stella toggle mounts harness with
   agentId='stella'.
   Verify: focused + full vitest → green → FE gate GREEN.

## Done criteria

- [ ] Both repos: tsc + full tests green; FE gate GREEN
- [ ] Scope-clean diffs in both worktrees (`git diff --name-only main..HEAD`)
- [ ] `grep -rn "ANAM_API_KEY" <backend>/src/routes/avatarRoutes.ts` shows env read only — never echoed in a response/log
- [ ] Consent checkbox gates avatar creation (test-pinned)
- [ ] Harness unmount teardown test passes
- [ ] Committed on both branches; report lists: pinned Anam endpoints/SDK calls, operator steps (set `ANAM_API_KEY` on Cloud Run — it will SURVIVE future deploys thanks to plan 035's preserve pass — and add it to `Docs/ops/DEPLOY_ENV_BASELINE.md`), any deviations

## STOP conditions

- Installed SDK 4.10.0's API surface doesn't match the docs' current flow and node_modules types don't resolve the ambiguity — report the actual .d.ts surface.
- ARAConsole's existing Anam block is entangled with meeting/RTMS logic such that a swap risks breaking it — report the structure, wire Stella only, leave ARA as follow-up.
- Anam's create-avatar API turns out to be plan/tier-gated in a way the code can detect (e.g. 402/403 from a test call is NOT detectable without a real key — do NOT make real calls; just note the possibility in the report).
- Any full-suite failure outside touched files.

## Maintenance notes

- New env var `ANAM_API_KEY` (backend) — baseline doc + Cloud Run (operator).
- Reviewer: scrutinize teardown, key-leak grep, per-user profile isolation test.
- Follow-ups deferred: second provider adapter; voice cloning; avatar for Hydra/other agents (one-liner each once this lands); piping avatar into AraMeeting call streams.
