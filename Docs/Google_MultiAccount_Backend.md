# Backend patch — Multi-account Gmail + Calendar (OAuth)

Ready-to-apply backend changes for connecting **multiple** Google accounts in-app
(each grants Gmail + Calendar). The frontend (Settings → "Google Accounts") is
already built and calls these routes; it degrades gracefully until this patch is
applied.

**Repo:** `ai-dashboard369-file-manager` (the backend sibling). This doc is
read-only — apply it yourself, since backend commits need your explicit go.

Architecture: OAuth tokens stay **server-side**. The frontend only lists
accounts and starts/stops connections; the backend stores one token set per
connected account and makes the Google API calls.

---

## 1. Google Cloud OAuth app (one-time)

1. <https://console.cloud.google.com/> → create/select a project.
2. **APIs & Services → Enabled APIs** → enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen** → External (or Internal for Workspace) → add scopes:
   `…/auth/gmail.readonly`, `…/auth/gmail.send`, `…/auth/calendar`,
   `…/auth/userinfo.email`. Add yourself as a test user.
4. **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorized redirect URI:** `http://localhost:3000/api/google/auth/callback`
     (match your backend's public origin; for the Electron sidecar use its port).
   - Copy the **Client ID** and **Client secret**.

## 2. `.env` additions (backend)

```
GOOGLE_CLIENT_ID=<your web client id>
GOOGLE_CLIENT_SECRET=<your web client secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/auth/callback
GOOGLE_STATE_SECRET=<any long random string>
# Where the popup returns to after connecting (the app origin):
APP_PUBLIC_URL=http://localhost:5174
```

`googleapis` is already a dependency (used by `src/services/googleAuth.ts`).

---

## 3. New file — `src/services/googleAccountStore.ts`

Per-user, per-account token store (file-based, mirrors the existing
`credentials/` convention). Never returns tokens to the client.

```ts
import { google } from 'googleapis';
import * as fs from 'fs';
import * as path from 'path';

const STORE_PATH = path.resolve(process.env.GOOGLE_ACCOUNTS_PATH || './credentials/google-accounts.json');

export type GoogleScope = 'gmail' | 'calendar';

export interface StoredGoogleAccount {
  id: string;            // `${userId}:${email}`
  userId: string;
  email: string;
  scopes: GoogleScope[];
  enabled: boolean;
  connectedAt: number;
  tokens: Record<string, unknown>; // access_token, refresh_token, expiry_date…
}

type Store = Record<string, StoredGoogleAccount>;

function read(): Store {
  try { return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8')); } catch { return {}; }
}
function write(s: Store): void {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(s, null, 2));
}

export function listForUser(userId: string): Omit<StoredGoogleAccount, 'tokens' | 'userId'>[] {
  return Object.values(read())
    .filter(a => a.userId === userId)
    .map(({ tokens: _t, userId: _u, ...rest }) => rest);
}

export function upsert(a: StoredGoogleAccount): void {
  const s = read(); s[a.id] = a; write(s);
}

export function remove(userId: string, id: string): boolean {
  const s = read();
  if (s[id] && s[id].userId === userId) { delete s[id]; write(s); return true; }
  return false;
}

export function setEnabled(userId: string, id: string, enabled: boolean): boolean {
  const s = read();
  if (s[id] && s[id].userId === userId) { s[id].enabled = enabled; write(s); return true; }
  return false;
}

/** OAuth2 client preloaded with a stored account's tokens (for gmail/calendar calls). */
export function clientForAccount(id: string) {
  const a = read()[id];
  if (!a) throw new Error(`Unknown Google account ${id}`);
  const c = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
  c.setCredentials(a.tokens);
  c.on('tokens', (t) => { const s = read(); if (s[id]) { s[id].tokens = { ...s[id].tokens, ...t }; write(s); } });
  return c;
}

export const SCOPE_URLS: Record<GoogleScope, string[]> = {
  gmail: ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.send'],
  calendar: ['https://www.googleapis.com/auth/calendar'],
};
```

## 4. New file — `src/routes/googleAccountRoutes.ts`

```ts
import { Router, Request, Response } from 'express';
import * as crypto from 'crypto';
import { google } from 'googleapis';
import { authenticate } from '../services/authMiddleware';
import * as accounts from '../services/googleAccountStore';

const router = Router();
const STATE_SECRET = process.env.GOOGLE_STATE_SECRET || 'dev-state-secret';

function sign(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', STATE_SECRET).update(body).digest('base64url');
  return `${body}.${mac}`;
}
function verify(state: string): any | null {
  const [body, mac] = String(state).split('.');
  if (!body || !mac) return null;
  const expected = crypto.createHmac('sha256', STATE_SECRET).update(body).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
}
function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

// List the signed-in user's connected accounts (no tokens).
router.get('/accounts', authenticate, (req: Request, res: Response) => {
  res.json({ success: true, data: { accounts: accounts.listForUser(req.user!.id) } });
});

// Start a connect: returns the Google consent URL (state carries the user).
router.post('/auth/start', authenticate, (req: Request, res: Response) => {
  const scopes = (Array.isArray(req.body?.scopes) ? req.body.scopes : ['gmail', 'calendar'])
    .filter((s: string) => s === 'gmail' || s === 'calendar') as accounts.GoogleScope[];
  const scopeUrls = ['https://www.googleapis.com/auth/userinfo.email', ...scopes.flatMap(s => accounts.SCOPE_URLS[s])];
  const state = sign({ userId: req.user!.id, scopes, nonce: crypto.randomUUID(), ts: Date.now() });
  const url = oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: scopeUrls, state });
  res.json({ success: true, data: { url } });
});

// OAuth callback — PUBLIC (Google redirects here; identity comes from signed state).
router.get('/auth/callback', async (req: Request, res: Response) => {
  const data = verify(String(req.query.state || ''));
  const code = String(req.query.code || '');
  if (!data || !code) { res.status(400).send('Invalid OAuth state'); return; }
  try {
    const client = oauthClient();
    const { tokens } = await client.getToken(code);
    client.setCredentials(tokens);
    const me = await google.oauth2({ version: 'v2', auth: client }).userinfo.get();
    const email = me.data.email || 'unknown';
    const id = `${data.userId}:${email}`;
    accounts.upsert({ id, userId: data.userId, email, scopes: data.scopes, enabled: true, connectedAt: Date.now(), tokens });
    res.set('Content-Type', 'text/html').send('<script>window.close()</script>Connected — you can close this window.');
  } catch (e: any) {
    res.status(500).send(`OAuth failed: ${e?.message || e}`);
  }
});

router.delete('/accounts/:id', authenticate, (req: Request, res: Response) => {
  const ok = accounts.remove(req.user!.id, req.params.id);
  res.status(ok ? 200 : 404).json({ success: ok, data: { removed: ok } });
});

router.patch('/accounts/:id', authenticate, (req: Request, res: Response) => {
  const ok = accounts.setEnabled(req.user!.id, req.params.id, req.body?.enabled !== false);
  res.status(ok ? 200 : 404).json({ success: ok, data: { updated: ok } });
});

export default router;
```

## 5. Mount in `src/app.ts`

Add with the other route imports + mounts (near `/api/gmail`, line ~363):

```ts
import googleAccountRoutes from './routes/googleAccountRoutes';
// …
app.use('/api/google', createAuditMiddleware('/api/google'), googleAccountRoutes);
```

> The `/auth/callback` route is intentionally public (Google can't send a Bearer
> token); it's authenticated by the HMAC-signed `state`. Make sure your audit
> middleware / global auth doesn't block it.

## 6. Aggregate the inbox across accounts (concrete)

Make `/api/gmail/fetch` pull unread mail from **every enabled Gmail account** and
tag each email with its source. Three small touches; the frontend already shows
a per-email source badge from `item.sourceAccount`.

**(a) `src/services/gmailService.ts` — add the field + a per-account fetch.**

```ts
export interface EmailMessage {
  // …existing fields…
  sourceAccount?: string;   // the connected Gmail account this email came from
}

import { clientForAccount } from './googleAccountStore';

// Same logic as fetchUnreadBatch, but authed as a SPECIFIC connected account,
// and every returned message is tagged with that account's email. Factor the
// list+get parsing out of fetchUnreadBatch into a helper that takes a gmail
// client, then reuse it here.
export async function fetchUnreadBatchForAccount(
  accountId: string, accountEmail: string, maxResults = 20,
): Promise<EmailMessage[]> {
  const gmail = google.gmail({ version: 'v1', auth: clientForAccount(accountId) });
  const messages = await listAndParse(gmail, maxResults); // ← your existing parsing
  return messages.map(m => ({ ...m, sourceAccount: accountEmail }));
}
```

**(b) `src/routes/gmailSendRoute.ts` — aggregate in `/fetch` (now authenticated).**

```ts
import { listForUser } from '../services/googleAccountStore';
import { fetchUnreadBatch, fetchUnreadBatchForAccount } from '../services/gmailService';

router.post('/fetch', authenticate, async (req: Request, res: Response) => {
  try {
    const maxResults = Number(req.body?.maxResults) || 20;
    const accounts = listForUser(req.user!.id).filter(a => a.enabled && a.scopes.includes('gmail'));

    let emails;
    if (accounts.length > 0) {
      const batches = await Promise.all(
        accounts.map(a => fetchUnreadBatchForAccount(a.id, a.email, maxResults).catch(() => [])),
      );
      emails = batches.flat();                       // aggregate across mailboxes
    } else {
      emails = await fetchUnreadBatch(maxResults);   // legacy single-account fallback
    }

    const items = await processIncomingEmails(emails);
    res.json({ success: true, data: { fetched: emails.length, processed: items.length, accounts: accounts.length } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**(c) `src/stores/inboxStore.ts` — carry the tag onto the stored item.**

In `processIncomingEmails`, set `sourceAccount` when building each `InboxItem`,
add it to your backend `InboxItem` type, and persist it. `GET /api/inbox` already
passes items through, so the field reaches the client:

```ts
const item: InboxItem = {
  // …existing fields…
  sourceAccount: email.sourceAccount,   // ← add
};
```

**Calendar** aggregation is the same shape: iterate enabled accounts with
`scopes.includes('calendar')` and `clientForAccount(acc.id)` where you read
events, tagging each event with `acc.email`.

> The legacy single-account path keeps working when no accounts are connected, so
> nothing breaks before you connect a second mailbox.

---

## 7. Apply + test

```
cd ai-dashboard369-file-manager
# add the two new files + the app.ts mount above, set the .env vars
npx tsc --noEmit          # type-check
npm run dev               # or your start script (backend on :3000)
```

In the app: **Settings → Google Accounts → "+ Connect a Google account"** → the
Google consent popup opens → approve → the popup closes and the account appears
with Gmail + Calendar badges. Connect a second account the same way; toggle/
disconnect per account.

## 8. Notes

- Tokens live only in `credentials/google-accounts.json` (server-side, git-ignored).
  The frontend never receives them.
- For production, move the store to your DB and encrypt at rest; the file store
  is fine for the local/desktop build.
- Scope changes require re-consent (`prompt: 'consent'` already forces it).
