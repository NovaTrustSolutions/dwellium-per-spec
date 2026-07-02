# Backend patch — make "Connect Google account" stop 401ing (Task A)

Companion to `SPEC_google_and_models.md` **Task A** and `plans/021-gmail-calendar-oauth.md`.

**Repo:** `ai-dashboard369-file-manager` (the Cloud Run / desktop backend sibling).
This doc is read-only — apply it yourself; backend commits need your explicit go.

> The **frontend half is already shipped** in this repo (gate-green):
> `qualia-shell/src/lib/googleOAuthConnect.ts` + the rewired
> `GoogleConnectCard` in `qualia-shell/src/components/ControlPanel/LlmIntegrationsSection.tsx`.
> The in-repo desktop copy of the route
> (`electron/staging/backend/src/routes/googleOAuthRoutes.ts`) already has the
> `mode=json` change below applied as the reference. The **deployed Cloud Run
> backend** needs the same two changes for the live app to complete the flow.

---

## The bug (verified in the deployed app, 2026-06-30)

Clicking **Control Panel → Google (Gmail + Calendar) → Connect Google account**
did `window.open('/api/google/oauth/start')` — a **top-level browser navigation
to a PROTECTED endpoint**. A navigation can't carry the app's `Authorization`
header, so the OAuth-start guard returned:

```
HTTP 401  {"error":"Authentication required"}
```

Replaying the same GET **with** the app's Bearer token still 401'd — so there
are **two** factors:

1. **Navigation vs. fetch** (frontend) — fixed here: the Connect button now
   makes an **authenticated `fetch`** and opens only the returned public consent
   URL. ✅ shipped in this repo.
2. **The route must honor the app credential and return a URL** (backend) — the
   two changes below.

## Change 1 — `/api/google/oauth/start` returns `{ url }` for JSON requests

A cross-origin **302 is unreadable** from `fetch()`, so the start route must
return the consent URL as JSON when the app asks for it. Keep the 302 for a
plain browser navigation (backward compat).

```ts
// src/routes/googleOAuthRoutes.ts  (GET /oauth/start, after building `url`)
const url = client.generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: SCOPES });

const wantsJson = req.query.mode === 'json' || (req.get('accept') || '').includes('application/json');
if (wantsJson) {
  res.json({ success: true, data: { url } });   // the app opens this URL in a popup
  return;
}
res.redirect(url);                               // direct browser nav still works
```

The frontend calls `GET /api/google/oauth/start?mode=json` with
`Authorization: Bearer <token>` + `Accept: application/json` and reads
`data.url` (it also tolerates a bare `{ url }`).

## Change 2 — the app's Bearer token must be honored on `/api/google/oauth/*`

The deployed 401 (even **with** the token) means the OAuth-start route sits
behind an auth guard that does **not** accept the app's session token — while the
app's other working `/api/*` calls authenticate fine. Mount the `oauth/status`
and `oauth/start` routes behind the **same `authenticate` middleware** the
working `/api/*` calls use, so the `dwellium-auth-token` Bearer is accepted.

**Keep `/api/google/oauth/callback` PUBLIC** — Google redirects there and cannot
send a Bearer; it's already safe (it only exchanges the `code` it receives).
Ensure any global audit/auth middleware does not block the callback.

```ts
// src/app.ts (illustrative — match your existing auth wiring)
app.use('/api/google/oauth/status', authenticate);
app.use('/api/google/oauth/start',  authenticate);
// /api/google/oauth/callback stays public
```

> If `/oauth/status` is currently public, note the frontend now sends the Bearer
> on it too (harmless if ignored); making it authenticated is optional but keeps
> the status consistent with a globally-guarded `/api/google/*`.

## Change 3 — Google Cloud console (operator; can't be done from code)

Register the deployed callback as an **Authorized redirect URI** on the OAuth
client, byte-identical to what the backend builds:

```
https://<deployed-backend-origin>/api/google/oauth/callback
```

For Netlify (`argyleholocron.netlify.app`), `/api/*` proxies to the Cloud Run
backend (`netlify.toml` → `NETLIFY_API_PROXY_TARGET`), so the redirect URI must
match the **backend's own public origin** (what `${req.protocol}://${req.get('host')}`
resolves to on Cloud Run), not the Netlify origin — confirm which origin the
`readClient()` redirect computes and register exactly that. Google rejects any
mismatch with `redirect_uri_mismatch`.

## Verify (operator, on the Mac / against the deployed backend)

```bash
# 1) start now returns JSON with a url (was 302 / 401):
curl -i "https://<backend-origin>/api/google/oauth/start?mode=json" \
  -H "Authorization: Bearer <dwellium-auth-token>" -H "Accept: application/json"
# → HTTP 200  {"success":true,"data":{"url":"https://accounts.google.com/o/oauth2/v2/auth?..."}}

# 2) status is reachable with the token:
curl -i "https://<backend-origin>/api/google/oauth/status" \
  -H "Authorization: Bearer <dwellium-auth-token>"
# → HTTP 200  {"success":true,"data":{"configured":true,"connected":false}}
```

Then in the app: Control Panel → Google → **Connect Google…** → consent popup →
approve → popup closes → status flips to **Connected**. Per the repo rule
(green gate ≠ working), do not report the integration live until the two `curl`
checks above return non-401 **and** a real connect flips the status.

## Not done here / out of scope

- Editing the sibling backend repo (needs your go) — this doc is the ready patch.
- Creating / configuring the Google OAuth client + consent screen — operator action.
- The multi-account `/api/google/auth/*` flow (`Docs/Google_MultiAccount_Backend.md`)
  is a separate, still-unapplied feature; this Task-A fix targets the existing
  single-account `/api/google/oauth/*` flow that lights up the automation engine.
