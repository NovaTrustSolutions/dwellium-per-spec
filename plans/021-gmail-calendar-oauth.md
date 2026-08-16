# Plan 021: Wire the multi-account Inbox to REAL Gmail + Google Calendar via OAuth (DESIGN / SPIKE)

> **This is a DESIGN / SPIKE plan, not a build plan.** It documents the OAuth web
> flow, the exact files that would change, the cross-repo backend dependency, and a
> phased build sequence — but the overall work is **BLOCKED** on two operator
> prerequisites (Google OAuth client JSON + the backend OAuth patch applied to a
> SEPARATE repo). Do **not** start a blind build. Phase 0 is "unblock prerequisites";
> nothing downstream can be verified end-to-end until Phase 0 is done by the operator.
>
> **Executor note:** the frontend half is already shipped (UI + client + types +
> at-rest crypto for tokens). This plan's frontend deltas are SMALL and additive; the
> substance lives in the backend repo and in operator setup. Update this plan's row in
> `plans/README.md` when the status changes (the reviewer owns the README edit).
>
> **Drift check (run first, on the Mac):**
> `git diff --stat a619279..HEAD -- qualia-shell/src/lib/googleAccounts.ts qualia-shell/src/components/ControlPanel/GoogleAccountsSection.tsx qualia-shell/src/types/integrations.ts qualia-shell/src/utils/integrationsCrypto.ts qualia-shell/src/components/InboxZero/InboxZero.tsx`
> If any of these changed since `a619279`, re-read them and reconcile the file:line
> references below before acting; on a material mismatch, STOP and report.

## Status

- **Overall**: 🔴 **BLOCKED** — gated on (a) a Google OAuth client (Client ID + secret / client JSON) and (b) the backend OAuth routes being applied to the sibling repo `ai-dashboard369-file-manager` with `.env` set. Neither can be produced from this repo or from an agent session (the consent screen needs the operator's Google sign-in).
- **Priority**: P2 (feature; high user value, but gated by external prerequisites)
- **Effort**: S (frontend deltas) / **cross-repo: M** (backend patch already drafted) / **operator: S–M** (Google Cloud + `.env`, one-time)
- **Risk**: LOW in this repo (frontend degrades gracefully today; deltas are additive). The real risk surface (token storage, scopes, consent) lives in the backend repo and Google Cloud, out of this repo's scope.
- **Depends on**: Plan 015 (One Save reliability) is adjacent but not a hard dependency — Google **account tokens live server-side**, not in One Save (see "Where tokens live" below). Plan 013/014 (secret encryption / committed creds) are related security context only.
- **Category**: feature / integration (design + spike)
- **Planned at**: design pass over the repo, 2026-06-21 (current `main` per CLAUDE.md HEAD `04566cc` arc).

## Why this matters

Dwellium already has a complete **multi-account Inbox** experience built and shipped —
the Settings "Google Accounts" panel, the accounts client, the data model, the per-email
source badge in InboxZero, and at-rest encryption for Google OAuth tokens — but it is
wired to backend routes that **do not exist in the running backend yet**. Today the panel
honestly shows an "apply the backend patch" note and the Inbox shows seeded / single-
account fallback data. The gap between "looks done" and "works with your real mail" is
exactly two external prerequisites and a few small frontend touches. This plan makes that
gap explicit and sequences the unblock so nobody attempts a blind build (the repo's
green-gate ≠ working rule applies sharply here: none of the OAuth path can be unit-tested
to "working" without the live backend + a real Google client).

## Where tokens live (architecture, decided)

The secure shape is **already chosen and partly implemented**, and this plan does not
change it:

- **OAuth tokens stay SERVER-SIDE.** The backend owns the authorization-code exchange and
  the refresh-token lifecycle, stores one token set per connected account, and makes the
  Gmail / Calendar API calls. The browser never receives `access_token` / `refresh_token`.
  This is stated in the type model and the client docstrings:
  - `qualia-shell/src/types/integrations.ts:67-85` — `GoogleAccount` doc: *"OAuth tokens
    live server-side (the backend makes the Google API calls and stores per-account
    tokens); the frontend keeps only this lightweight record for display + per-account
    preferences."* The list is synced from `GET /api/google/accounts`.
  - `qualia-shell/src/lib/googleAccounts.ts:1-15` — *"OAuth tokens never touch the browser:
    the backend owns the connect/callback flow and stores per-account tokens."*
- **The encrypted integrations bundle has legacy single-account token SLOTS** that predate
  the multi-account model and are **not** populated by the current multi-account flow:
  - `qualia-shell/src/types/integrations.ts:48-65` — `GoogleGmailConfig` /
    `GoogleCalendarConfig` carry optional `accessToken` / `refreshToken` / `expiresAt`,
    with the comment *"populated after backend redirect flow completes … full OAuth wiring
    TBD."*
  - `qualia-shell/src/utils/integrationsCrypto.ts:173-176` — `transformBundle` already
    encrypts `google.gmail.accessToken`, `google.gmail.refreshToken`,
    `google.calendar.accessToken`, `google.calendar.refreshToken` at rest (`enc:v1:`), and
    `bundleHasPlaintextSecret` / `bundleHasCiphertext` cover them (`:203-204`, `:226-229`).
  - **Design decision for this plan (Open Question OQ-1):** keep tokens server-side
    (multi-account model) and treat the single-account bundle slots as **legacy / unused**.
    The crypto stays (harmless; protects them if ever written), but the connect flow should
    NOT start writing live tokens into the browser bundle — that would re-introduce the
    in-browser-token threat the multi-account design deliberately avoided.

## Current state (what's already built here — cite file:line)

Frontend is **done and graceful**; the blocker is entirely external.

- **Accounts client** — `qualia-shell/src/lib/googleAccounts.ts`:
  - `listGoogleAccounts()` → `GET /api/google/accounts` (`:60-79`); returns
    `{ available:false }` + "apply the backend patch" on 404 (`:67`).
  - `startGoogleAuth(scopes)` → `POST /api/google/auth/start` → `{ url }` (`:93-108`); the
    backend builds the consent URL with a signed `state` so **no token rides in the URL**.
  - `disconnectGoogleAccount(id)` → `DELETE /api/google/accounts/:id` (`:110-121`).
  - `setGoogleAccountEnabled(id, enabled)` → `PATCH /api/google/accounts/:id` (`:123-135`).
  - `openAuthPopup(url)` — centered popup, resolves on close (`:138-149`).
  - Auth header: `Authorization: Bearer <token>` + `X-Qualia-API: v2` (`:22-29`), token from
    `getAuthToken()` (`UserContext`).
- **Settings UI (the current stub/CTA — "scaffolded to the credential blocker")** —
  `qualia-shell/src/components/ControlPanel/GoogleAccountsSection.tsx`:
  - Lists accounts with Gmail / Calendar badges, Disconnect, Enable/Disable (`:149-174`).
  - **"+ Connect a Google account"** opens a popup on the user gesture, then routes it to
    Google consent if the backend is ready, or to a one-time **setup guide** HTML
    (`connectSetupHtml`, `:32-48`) if `startGoogleAuth` returns `available:false` (`:76-96`).
  - **The blocker banner** when routes are absent: `available === false` →
    *"Multi-account connect needs the backend OAuth routes. Apply the backend patch
    (`Docs/Google_MultiAccount_Backend.md`) and set up a Google Cloud OAuth app."*
    (`:138-147`). This is the visible "scaffolded to the credential blocker" state.
  - Mounted in Settings at `qualia-shell/src/components/ControlPanel/ControlPanel.tsx:596`
    (`<GoogleAccountsSection />`), imported `:14`.
- **Legacy single-account "Sync Gmail Now" CTA** — `ControlPanel.tsx:128-134` (`fetchGmailNow`
  → `POST ${API_BASE}/api/gmail/fetch`) and `:624-625` ("Sync Gmail Now" button); Gmail test
  at `:116` (`POST /api/gmail/test`). These are the older single-account path described in
  `Docs/archive/CLAUDE_CODE_GMAIL_CALENDAR_HANDOFF.md`.
- **Data model** — `qualia-shell/src/types/integrations.ts`: `GoogleAccount` (`:75-85`),
  `google.accounts?: GoogleAccount[]` on the bundle (`:171-176`), legacy
  `GoogleGmailConfig`/`GoogleCalendarConfig` (`:48-65`), `tests.gmail`/`tests.calendar`
  (`:203-204`).
- **Token-at-rest crypto** — `qualia-shell/src/utils/integrationsCrypto.ts:173-176` (already
  walks the four Google token fields). Persistence boundary:
  `qualia-shell/src/utils/integrationsStore.ts` (`saveIntegrationsSecure`, `unlockIntegrations`).
- **Inbox surface (where real mail lands)** — `qualia-shell/src/components/InboxZero/InboxZero.tsx:1035-1043`
  renders the `✉ <sourceAccount>` per-email mailbox badge; `InboxZeroTypes.ts:36`
  (`sourceAccount?: string`); query passes items straight through
  (`InboxZero/useInboxQueries.ts`). The compact widget is `InboxWidget/InboxWidget.tsx`
  (reads `/api/inbox`, `:79`; renders `item.body` in a sandboxed iframe with `sanitizeHtml`,
  `:366-391`). **No frontend change is needed for source-tagged mail to appear** once the
  backend aggregates across accounts and sets `sourceAccount`.
- **Google Identity Services loader** — `qualia-shell/src/services/googleIdentity.ts`
  (`getGoogleClientId()` reads `VITE_GOOGLE_CLIENT_ID`, `:6-8`; loads the GIS script). This
  powers **login** sign-in (`Auth/GoogleSignInButton.tsx`), which is a SEPARATE flow from
  Gmail/Calendar OAuth — see "Two distinct Google flows" below. `VITE_GOOGLE_CLIENT_ID` is
  the *login* client id; the *Gmail/Calendar* client id/secret live in the **backend** env.

## Two distinct Google flows (do not conflate)

1. **Login / identity** — Google Identity Services (ID token) → backend-verified Dwellium
   session. Frontend: `Auth/GoogleSignInButton.tsx` + `services/googleIdentity.ts` + env
   `VITE_GOOGLE_CLIENT_ID`. **Already working** per CLAUDE.md ("production account login is
   Google Identity Services → backend-verified Dwellium session"). This plan does NOT change it.
2. **Gmail + Calendar data access** — OAuth 2.0 **authorization-code** flow with offline
   access (refresh tokens), tokens stored **server-side**, scoped to Gmail + Calendar.
   Frontend: `lib/googleAccounts.ts` + `GoogleAccountsSection.tsx`. Backend:
   `Docs/Google_MultiAccount_Backend.md` (a patch for the sibling repo). **This is the
   blocked work.**

These can share one Google Cloud project but are different OAuth clients/credentials and
different redirect URIs (login uses GIS; data access uses a Web-application client with a
backend redirect URI).

## The OAuth web flow (authorization-code + refresh), as designed

End-to-end shape (matches `Docs/Google_MultiAccount_Backend.md` §3–§6):

1. User clicks **"+ Connect a Google account"** in Settings (`GoogleAccountsSection.tsx`,
   user gesture → popup opened immediately so it isn't popup-blocked).
2. Frontend `POST /api/google/auth/start { scopes:['gmail','calendar'] }` (Bearer-authed).
   Backend builds the consent URL via `google.auth.OAuth2(...).generateAuthUrl({ access_type:
   'offline', prompt: 'consent', scope:[…userinfo.email, gmail.readonly, gmail.send,
   calendar], state })` where `state` is **HMAC-signed** and carries `{ userId, scopes,
   nonce, ts }` (so identity survives the public callback without a Bearer token). Returns
   `{ url }`.
3. Popup navigates to Google consent. User signs in + grants scopes.
4. Google redirects to the backend's **public** callback `GET /api/google/auth/callback?code&state`.
   Backend verifies the HMAC `state`, exchanges `code` → tokens (`getToken`), reads the
   account email (`oauth2.userinfo.get`), and **stores the token set server-side** keyed
   `${userId}:${email}` (file store `credentials/google-accounts.json` for local/desktop;
   DB + at-rest encryption for production). Responds with `<script>window.close()</script>`.
5. Popup closes → frontend re-lists `GET /api/google/accounts` (no tokens, just
   `{ id, email, scopes, enabled, connectedAt }`) → the account row appears with Gmail +
   Calendar badges.
6. **Refresh:** the backend's per-account OAuth2 client refreshes the access token using the
   stored refresh token (the `googleapis` client emits `tokens` events; the store persists
   the rotated tokens). The browser is never involved.
7. **Inbox aggregation:** `POST /api/gmail/fetch` (now authenticated) loops every **enabled**
   Gmail account, fetches unread per account in parallel, tags each message with its
   `sourceAccount`, flattens, and runs the existing `processIncomingEmails` → inbox store.
   `GET /api/inbox` already passes `sourceAccount` through → the InboxZero badge lights up.
   Calendar aggregation mirrors this for enabled calendar accounts.

## Exact files that would change

**This repo (`qualia-shell/`) — minimal, additive, only after Phase 0):**

| File | Change | Phase |
|---|---|---|
| `qualia-shell/src/components/ControlPanel/GoogleAccountsSection.tsx` | (optional polish) post-connect success toast + auto-trigger a first `/api/gmail/fetch` after a successful connect; refine the `connectSetupHtml` redirect URI to match the **applied** backend (`/api/google/auth/callback`, see OQ-3) | P2 |
| `qualia-shell/src/components/InboxZero/InboxZero.tsx` | (optional, deferred) a per-account **filter chip row** ("All · andy@… · lisa@…") — noted as optional follow-up in `Docs/Inbox_MultiAccount_2026-06-10.md` | P3 |
| `qualia-shell/.env` / Netlify env | confirm `VITE_GOOGLE_CLIENT_ID` (LOGIN client) is set; `API_BASE` points at the backend that has the patch (deploy config, not source) | P0/P1 |
| `qualia-shell/src/test/googleAccounts.test.ts` | extend (already 7 tests) if any client behavior changes; e.g. assert connect→re-list happy path against a mocked `{ url }` then `available:true` | P1/P2 |

> The accounts **client** (`lib/googleAccounts.ts`), the **types**
> (`types/integrations.ts`), and the **token crypto** (`integrationsCrypto.ts`) need **no
> change** — they were built to this contract. If a code review concludes they're already
> correct against the applied backend, the frontend delta for this plan can be **zero
> source files** (config + verification only).

**Sibling backend repo (`ai-dashboard369-file-manager`) — OUT OF THIS REPO'S SCOPE,
already drafted as a paste-ready patch in `Docs/Google_MultiAccount_Backend.md`:**

- `src/services/googleAccountStore.ts` (new) — per-user, per-account token store; never
  returns tokens to the client; `clientForAccount(id)` rehydrates an OAuth2 client + persists
  rotated tokens (§3).
- `src/routes/googleAccountRoutes.ts` (new) — `POST /auth/start`, **public** `GET /auth/callback`
  (HMAC `state`), `GET`/`DELETE`/`PATCH /accounts` (§4).
- `src/app.ts` — mount `app.use('/api/google', createAuditMiddleware('/api/google'), googleAccountRoutes)`
  and ensure the audit/global-auth middleware does NOT block the public `/auth/callback` (§5).
- `src/services/gmailService.ts` — `EmailMessage.sourceAccount` + `fetchUnreadBatchForAccount(...)` (§6a).
- `src/routes/gmailSendRoute.ts` — make `/fetch` authenticated + aggregate across enabled
  accounts with a single-account fallback (§6b).
- `src/stores/inboxStore.ts` — carry `sourceAccount` onto each stored `InboxItem` (§6c).
- Calendar route — mirror the aggregation for enabled calendar accounts (§6 note).
- `.env` — `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`,
  `GOOGLE_STATE_SECRET`, `APP_PUBLIC_URL` (§2). `credentials/` + `.env` gitignored.

## Scope

**In scope (this repo):**
- This design/spike document.
- (P2, optional) the small UX polish in `GoogleAccountsSection.tsx` and the optional InboxZero
  filter chips — only after Phase 0 unblocks and a live backend exists to verify against.
- Deploy/config confirmation (`VITE_GOOGLE_CLIENT_ID`, `API_BASE`) — config, not source.

**Out of scope:**
- The backend implementation itself (separate repo `ai-dashboard369-file-manager`) — it is a
  **cross-repo dependency**, drafted in `Docs/Google_MultiAccount_Backend.md`, applied by the
  operator with their explicit go (backend commits need Ilya's go per repo rule).
- Creating the Google Cloud OAuth client / consent screen / scopes — **operator action**
  (needs Google sign-in; cannot be done from an agent session).
- Changing the **login** Google flow (`GoogleSignInButton.tsx` / `googleIdentity.ts`).
- Writing live OAuth tokens into the **browser** integrations bundle (rejected by design;
  see OQ-1) — the bundle's token slots stay legacy/unused.
- The secret-encryption upgrade (Plan 013) and committed-credential removal (Plan 014) —
  related but separate.

## Commands you will need (Mac — the Linux sandbox can't build/test this app)

| Purpose | Command | Expected |
|---|---|---|
| Drift check | `git diff --stat a619279..HEAD -- qualia-shell/src/lib/googleAccounts.ts qualia-shell/src/components/ControlPanel/GoogleAccountsSection.tsx` | empty (or reconcile) |
| Typecheck | `cd qualia-shell && npx tsc -b` | exit 0 |
| Accounts tests | `cd qualia-shell && npx vitest run googleAccounts` | pass |
| Inbox tests | `cd qualia-shell && npx vitest run InboxZero` | pass (incl. source-badge test) |
| Full gate | `bash Scripts/gate.sh` | GREEN |
| Backend route live-check (operator, after patch) | `curl -i -X POST http://localhost:3000/api/google/auth/start -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"scopes":["gmail","calendar"]}'` | `200` + `{ data: { url } }` (NOT 404) |
| Accounts list live-check (operator) | `curl -i http://localhost:3000/api/google/accounts -H 'Authorization: Bearer <token>'` | `200` + `{ data: { accounts: [...] } }` |

> **Zero-trust verification (operator):** per the user's deployment rule, do NOT claim the
> integration is "live" because a tool returned success — run the two `curl` checks above
> and confirm a non-404 status before trusting the Settings panel, then connect one real
> account and confirm a tagged email appears in InboxZero.

## Phased build sequence

### Phase 0 — UNBLOCK PREREQUISITES (operator; the gate for everything below)

Nothing here is code in this repo; it is the two blockers. Until BOTH are done, Phases 1–3
cannot be verified end-to-end and MUST NOT be reported as working.

1. **Google Cloud OAuth client (Gmail + Calendar).** In Google Cloud Console: enable the
   **Gmail API** + **Google Calendar API**; configure the OAuth consent screen (External or
   Internal/Workspace) with scopes `gmail.readonly`, `gmail.send`, `calendar`,
   `userinfo.email`; add yourself as a test user; create an **OAuth client ID → Web
   application** with the redirect URI matching the backend's public origin
   (`<backend-origin>/api/google/auth/callback`); copy the **Client ID + Client secret**
   (the "Google OAuth client JSON"). (`Docs/Google_MultiAccount_Backend.md §1`.)
2. **Apply the backend patch** to `ai-dashboard369-file-manager` (the two new files + the
   `app.ts` mount + the `/fetch` aggregation), set the `.env` vars (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_STATE_SECRET`, `APP_PUBLIC_URL`),
   `npx tsc --noEmit` clean, and run the backend on its port. Backend commit needs the
   operator's go (repo rule). (`Docs/Google_MultiAccount_Backend.md §2–§7`.)
3. **Confirm `VITE_GOOGLE_CLIENT_ID`** is set for the frontend (login flow) and that the
   frontend's `API_BASE` points at the patched backend.

**Phase 0 exit criteria (operator-verified):** the two `curl` live-checks above return
non-404 (`/api/google/accounts` 200, `/api/google/auth/start` 200 with a `url`). Only then
does the Settings panel stop showing the "apply the backend patch" banner.

### Phase 1 — Verify the existing frontend against the live backend (this repo; no source change expected)

- Open Settings → **Google Accounts**: the blocker banner is gone (`available === true`).
- Click **"+ Connect a Google account"** → Google consent popup → approve → popup closes →
  the account row appears with Gmail + Calendar badges.
- Connect a SECOND account; toggle Enable/Disable; Disconnect — confirm each round-trips
  (`PATCH`/`DELETE`) and re-lists.
- **"Sync Gmail Now"** (or the backend poll) → open **InboxZero** → real emails appear, each
  with its `✉ <account>` source badge (`InboxZero.tsx:1035-1043`).
- **Verify (Mac):** `npx tsc -b` exit 0; `npx vitest run googleAccounts InboxZero` pass;
  `bash Scripts/gate.sh` GREEN. If everything works with no source edit, this plan's
  frontend delta is **zero source files** — record that in the README row.

### Phase 2 — Optional UX polish (this repo; only if Phase 1 surfaces a rough edge)

- Post-connect success toast in `GoogleAccountsSection.tsx`; auto-trigger one
  `/api/gmail/fetch` after a successful connect so the first mail shows without a manual
  "Sync" click.
- Align `connectSetupHtml`'s sample redirect URI with the **applied** backend path
  (`/api/google/auth/callback`) to avoid operator confusion (see OQ-3).
- Extend `googleAccounts.test.ts` for the connect→re-list happy path (mocked `{ url }`).
- **Verify:** tsc + `npx vitest run googleAccounts` green; gate GREEN; only
  `GoogleAccountsSection.tsx` (+ its test) changed.

### Phase 3 — Optional inbox scoping (this repo; deferred)

- Per-account **filter chip row** in InboxZero ("All · andy@… · lisa@…") to scope the view to
  one mailbox (the additive follow-up named in `Docs/Inbox_MultiAccount_2026-06-10.md`).
- **Verify:** tsc + `npx vitest run InboxZero` green (add a chip-filter test); gate GREEN.

## Open questions (for the operator / reviewer)

- **OQ-1 (token location).** Confirm tokens stay **server-side** (multi-account model) and
  the browser bundle's legacy `google.gmail/calendar.*Token` slots remain unused. (Plan
  assumes yes; writing live tokens to the browser would re-open the threat the design avoided.)
- **OQ-2 (single vs multi-account path).** Two backend Gmail paths exist in the docs: the
  older single-account runbook (`Docs/archive/CLAUDE_CODE_GMAIL_CALENDAR_HANDOFF.md`:
  `oauth-setup` script + `credentials/oauth2-token.json`, **unauthenticated** routes) and the
  newer multi-account patch (`Docs/Google_MultiAccount_Backend.md`: per-account store,
  **authenticated** `/fetch`). Which is the target? This plan assumes the **multi-account**
  patch is canonical; if the single-account path is already live, the multi-account `/fetch`
  must subsume it (the patch keeps a single-account fallback).
- **OQ-3 (redirect URI consistency).** The patch uses `…/api/google/auth/callback`
  (`Docs/Google_MultiAccount_Backend.md §1/§2`) while the in-app setup guide shows
  `…/api/auth/google/callback` (`GoogleAccountsSection.tsx:43`). Pick ONE and make the Google
  Cloud client, the backend `GOOGLE_REDIRECT_URI`, and the setup-guide copy all match
  exactly (Google rejects redirect-URI mismatches).
- **OQ-4 (scopes).** Confirm the scope set: `gmail.readonly` + `gmail.send` + `calendar` +
  `userinfo.email`. Note that **archive** flow used `gmail.modify`/labels for archive/delete;
  if InboxZero's Archive/Delete must mutate Gmail (`InboxWidget.tsx` handles `data.gmailError`,
  `:138`/`:157`), `gmail.modify` is required — decide before consent (scope changes force
  re-consent).
- **OQ-5 (production vs local token store).** The patch's file store
  (`credentials/google-accounts.json`) is fine for local/desktop; production should move it to
  a DB + at-rest encryption (`Docs/Google_MultiAccount_Backend.md §8`). Which environment is
  the target for the first cutover?
- **OQ-6 (consent-screen verification).** External consent screen with non-`userinfo` scopes
  triggers Google's app-verification for non-test users. For personal/test use, the operator
  is added as a test user (no verification); broader rollout needs Google verification —
  confirm the intended audience.
- **OQ-7 (deploy origin).** On Netlify (deploys from `main`), the backend is a separate
  origin — confirm `API_BASE` and CORS allow the `Authorization` + `X-Qualia-API` headers
  (CLAUDE.md notes a misleading 503 when CORS doesn't allow `X-Qualia-API`).

## STOP / blocker conditions

- 🔴 **HARD BLOCKER — do not build past Phase 0.** If the Google OAuth client doesn't exist
  OR the backend patch isn't applied (`/api/google/accounts` returns **404**), STOP. There is
  nothing to verify; the Settings panel correctly shows the "apply the backend patch" banner.
  Report that Phase 0 is incomplete; do NOT edit frontend source speculatively.
- **Cross-repo edit attempt.** If the work seems to require editing
  `ai-dashboard369-file-manager`, STOP — that is a separate repo with its own go-ahead gate;
  this plan only references the patch (`Docs/Google_MultiAccount_Backend.md`), it does not
  apply it.
- **Token-to-browser temptation.** If a step would write `access_token`/`refresh_token` into
  the in-browser bundle, STOP and revisit OQ-1 — that contradicts the server-side-token design.
- **Redirect-URI mismatch.** If consent fails with `redirect_uri_mismatch`, STOP and resolve
  OQ-3 (the Google Cloud client, backend env, and setup-guide copy must be byte-identical).
- **Claiming "live" without proof.** Do NOT report the integration working until the two
  `curl` live-checks return non-404 AND a real connected account produces a `sourceAccount`-
  tagged email in InboxZero (green gate ≠ working — see `CLAUDE.md` / repo memory).

## Maintenance notes

- The frontend was deliberately built to **degrade gracefully** (`available:false` →
  honest banner). Preserve that: any future change must keep the no-backend path showing the
  setup note rather than throwing.
- The accounts client uses the standard `{ success, data }` envelope and Bearer + `X-Qualia-API`
  headers (`googleAccounts.ts:22-37`) — match this if adding routes/calls.
- The legacy single-account "Sync Gmail Now" + `GoogleGmailConfig`/`GoogleCalendarConfig`
  slots predate multi-account; once multi-account is live, consider deprecating the legacy
  CTA to avoid two competing paths (OQ-2).
- Reviewer: confirm (a) no source change writes tokens to the browser; (b) the redirect URI
  is consistent across Google Cloud + backend env + setup-guide copy; (c) the scope set
  matches what InboxZero's Archive/Delete actually need (OQ-4); (d) this plan's README row
  reflects whether Phase 1 needed zero source files.
- Cross-references: backend contract `Docs/Google_MultiAccount_Backend.md`; inbox aggregation
  notes `Docs/Inbox_MultiAccount_2026-06-10.md`; settings/UI notes
  `Docs/Settings_Google_2026-06-10.md`; legacy single-account runbook
  `Docs/archive/CLAUDE_CODE_GMAIL_CALENDAR_HANDOFF.md`; remaining backend wishlist
  `Docs/BACKEND_CONTRACT_remaining.md` (§1.3 multiple email accounts).
