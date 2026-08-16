# Plan 013: Strengthen at-rest secret encryption (optional passphrase) + be honest about the current model

> **Executor instructions**: This plan has two phases. Phase 1 (S, safe) is required;
> Phase 2 (M, MED-risk) is gated by a STOP/decision. Never lose a user's keys — every
> step preserves backward-compatible decryption. Update this plan's row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat a619279..HEAD -- qualia-shell/src/utils/integrationsCrypto.ts qualia-shell/src/utils/integrationsStore.ts`

## Status

- **Priority**: P2
- **Effort**: S (Phase 1) / M (Phase 2)
- **Risk**: LOW (Phase 1) / MED (Phase 2 — key migration, lockout risk)
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a619279`, 2026-06-20

## Why this matters

`integrationsCrypto.ts` encrypts per-user secrets (LLM API keys, Supabase keys, Postgres
password/connection string, Google OAuth tokens) with AES-GCM, but the key is derived
**only** from public inputs: a hardcoded `APP_SALT` and the user id. The module's own
docstring is candid that this is obfuscation, not protection against anyone who has both
the bundle and the localStorage contents (the key re-derives from the same inputs). The
same `enc:v1:` ciphertext is also synced to the backend. So the protection is "above
casual devtools viewing" but not real at-rest encryption. The docstring already names the
intended upgrade: mix in a user passphrase that is never persisted. This plan (a) makes
the limitation explicit to users and recommends rotation, and (b) implements an
**optional** passphrase that strengthens the key when set — without forcing an unlock
prompt (so no lockout, no behavior change for users who don't opt in).

## Current state

- `qualia-shell/src/utils/integrationsCrypto.ts`:
  - `:32-33` `const PREFIX = 'enc:v1:'; const APP_SALT = 'dwellium-integrations-v1';`
  - `:73-95` `deriveKey(userId)` — base key material is `` `${id}:${APP_SALT}` `` (`:81`), PBKDF2 salt is `APP_SALT` (`:87`); both inputs are public; result cached per id (`:71`, `:93`).
  - `:107-120` `encryptString`, `:127-143` `decryptString` (legacy plaintext passes through; failure returns `''`).
  - `:151-178` `transformBundle` walks the secret fields; `:180-188` `encryptBundle`/`decryptBundle`.
  - Threat-model docstring `:10-17` already states the passphrase upgrade is the intended path.
- Consumers call `encryptBundle`/`decryptBundle` at the persistence boundary / on login (`integrationsStore.ts`).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck (Mac) | `cd qualia-shell && npx tsc -b` | exit 0 |
| Tests (Mac) | `cd qualia-shell && npx vitest run integrationsCrypto` | pass (incl. new round-trip tests) |

## Scope

**In scope**:
- `qualia-shell/src/utils/integrationsCrypto.ts` (key derivation, token versioning, backward-compatible decrypt)
- `qualia-shell/src/utils/integrationsCrypto.test.ts` (create — round-trip + migration tests)
- the API-keys UI component (Phase 1: one honest sentence) — find with `grep -rn "saveIntegrationsSecure\|API Keys" qualia-shell/src/components`
- (Phase 2 only) `integrationsStore.ts` + a passphrase-entry affordance

**Out of scope**:
- A FORCED unlock model (mandatory passphrase on every login) — explicitly out, to avoid lockout. The passphrase is opt-in.
- The backend half (how ciphertext is stored server-side) — separate repo.

## Git workflow

- Branch: `advisor/013-secret-encryption`
- Commits: phase-scoped; `security(secrets): document at-rest model + optional passphrase-derived key (enc:v2)`
- Do NOT push/PR without Ilya's go.

## Steps — Phase 1 (required, safe)

### Step 1: State the limitation in the API-keys UI

In the API-keys panel component, add one line near the key inputs: e.g. "Keys are stored obfuscated on this device and synced encrypted; treat this device as trusted." (Copy can be adjusted.) This sets correct expectations without changing crypto.

**Verify**: the string renders in the panel (grep your added text).

### Step 2: Add backward-compatible test coverage for the current crypto

Create `integrationsCrypto.test.ts`: round-trip `encryptString`/`decryptString` for each provider field via `encryptBundle`/`decryptBundle`; assert legacy plaintext passes through unchanged; assert a wrong-user decrypt returns `''` (not raw ciphertext). This pins current behavior before any change.

**Verify**: `npx vitest run integrationsCrypto` → pass.

## Steps — Phase 2 (gated: implement only after the STOP/decision below is resolved)

### Step 3: Add an optional passphrase to the KDF, versioned as `enc:v2:`

- Add an in-memory (never-persisted) `userPassphrase: string | null`, settable via a new `setEncryptionPassphrase(p)` export.
- In `deriveKey`, when a passphrase is set, fold it into the PBKDF2 **base key material** and use a per-user random salt stored alongside the ciphertext; emit `enc:v2:<salt>:<iv>:<ct>`. When no passphrase is set, behave exactly as today (`enc:v1:`), so nothing changes for non-opt-in users.
- `decryptString`: branch on the prefix — `enc:v2:` requires the passphrase (return `''` if absent/wrong, as today); `enc:v1:` decrypts with the legacy derivable key (so already-stored secrets keep working).
- On save, if a passphrase is set, write `enc:v2:`; this transparently migrates a user's secrets to the stronger form on their next save.

**Verify**: round-trip tests for v2 (with passphrase) and v1 (legacy) both pass; a v2 value fails to decrypt without the passphrase.

### Step 4: Minimal opt-in affordance

Add a Control Panel field "Set an encryption passphrase (optional)" that calls `setEncryptionPassphrase` for the session. Document that forgetting it makes v2-encrypted keys unrecoverable (they'd re-enter the keys).

**Verify (Mac)**: tsc + vitest green; manual: set a passphrase, save keys, reload + re-enter passphrase → keys decrypt; wrong passphrase → keys blank (re-enterable).

## Test plan

- `integrationsCrypto.test.ts`: v1 round-trip, legacy plaintext passthrough, wrong-user → `''` (Phase 1); v2 round-trip with passphrase, v2 without passphrase → `''`, v1 still decrypts after v2 introduced (Phase 2).
- Verification: `npx vitest run integrationsCrypto` → all pass.

## Done criteria

Phase 1:
- [ ] API-keys UI states the at-rest model honestly
- [ ] `integrationsCrypto.test.ts` pins current behavior; `npx vitest run integrationsCrypto` green
- [ ] `npx tsc -b` exit 0

Phase 2 (if undertaken):
- [ ] Optional passphrase folds into the KDF; `enc:v2:` emitted only when set; `enc:v1:` still decrypts
- [ ] Tests cover v1+v2 paths; no path ever returns raw ciphertext to a provider
- [ ] `plans/README.md` row updated

## STOP conditions

- **Decision gate before Phase 2:** confirm with the operator that an *optional* passphrase is wanted (vs. leaving it documented-as-obfuscation). Do NOT implement a forced/mandatory passphrase — that risks locking users out of their own keys.
- Any change that would make existing `enc:v1:` secrets undecryptable — STOP immediately; backward-compatible decryption is non-negotiable.

## Maintenance notes

- **Rotation advisory (operator):** the key protecting current `enc:v1:` secrets is derivable, and that ciphertext has been synced to the backend. Treat any LLM/Supabase/Postgres/Google secret already saved as recoverable by anyone with bundle+storage/backup access, and rotate the high-value ones.
- Reviewer: confirm no path returns raw ciphertext; confirm v1 values still decrypt after any v2 work; confirm the passphrase is never written to localStorage or the One Save backend.
