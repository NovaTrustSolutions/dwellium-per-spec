# Settings reorder + multi-account Gmail/Calendar — 2026-06-10

Verified: `tsc -b` green + **61/61 targeted vitest** (7 new googleAccounts + 54
regression incl. integrationsCrypto, UserContext, providerSSR). Full Mac gate is
the same one-liner as before.

## 1. Scribe editor under Appearance ✓

Settings order is now **Appearance (theme) → Scribe editor → Layout**. The Scribe
editor (`ScribeSettings`) renders directly below the appearance theme.
`ControlPanel.tsx`.

## 2 + 3. Multi-account Gmail + Calendar

**Architecture (the secure shape):** OAuth tokens stay **server-side** — the
backend owns the connect/callback flow and stores one token set per account and
makes the Google API calls. The frontend manages the **list** of accounts and a
Connect/Disconnect UI.

**Frontend (built + tested, ships now):**
- `GoogleAccount` type + `google.accounts[]` in the integrations model.
- `src/lib/googleAccounts.ts` — client for `GET /api/google/accounts`,
  `POST /api/google/auth/start`, `DELETE`/`PATCH /api/google/accounts/:id`, and a
  consent-popup helper. **Degrades gracefully** when the backend routes aren't
  present (shows "apply the backend patch", never breaks).
- **Settings → Google Accounts** (`GoogleAccountsSection`): lists connected
  accounts with **Gmail / Calendar** badges, a **"+ Connect a Google account"**
  button (opens the OAuth popup), and per-account **Disconnect** + **Enable/Disable**.
  Connect as many accounts as you want.

**Backend (ready-to-apply patch — you apply it):**
`Docs/Google_MultiAccount_Backend.md` has the complete, paste-ready code:
- `src/services/googleAccountStore.ts` — per-user, per-account token store.
- `src/routes/googleAccountRoutes.ts` — `/auth/start`, `/auth/callback` (public,
  HMAC-signed state), `GET/DELETE/PATCH /accounts`.
- `src/app.ts` mount line.
- Google Cloud OAuth app setup + `.env` vars + how to wire fetch/send to read
  from every enabled account.

## What's done vs. what needs you

- ✅ Done now: the Settings reorder, the whole frontend multi-account UI + client,
  the data model, and the backend code (as a patch).
- 🔧 Needs you (can't be done from here): create a **Google Cloud OAuth app**
  (client ID/secret + redirect URI), apply the backend patch, set the `.env`,
  run the backend. Then "+ Connect a Google account" works end-to-end for as many
  Gmail/Calendar accounts as you connect.

Until the patch is applied, the Settings section shows an honest "needs the
backend OAuth patch" note rather than pretending to connect.

## Files

```
src/types/integrations.ts                         GoogleAccount + google.accounts[]
src/lib/googleAccounts.ts                         accounts client (graceful)
src/components/ControlPanel/GoogleAccountsSection.tsx   Settings UI
src/components/ControlPanel/ControlPanel.tsx      Scribe moved + section wired
src/test/googleAccounts.test.ts                   7 tests
Docs/Google_MultiAccount_Backend.md               backend patch + Google Cloud steps
```

## Mac gate (before push)

```
cd qualia-shell && npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && cd .. && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_PORT=3010 SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs
```
(Note `SMOKE_TEST_PORT=3010` so the smoke server doesn't collide with your backend on :3000.)
