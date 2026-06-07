# Gmail (Inbox Zero) + Calendar — setup runbook

**Status:** The code is **done and type-checks clean**. What's left is a **one-time Google authorization** — your action, because it needs your Google sign-in (I can't enter your login or click the consent screen). After you authorize, the Settings cards + Inbox Zero work with real data.

You can run these steps yourself, or have Claude Code on the Mac do everything **except the actual sign-in**.

---

## What I already changed (verified)

**Backend** (`ai-dashboard369-file-manager`) — exposed the existing real Google services at the routes the Settings cards call:
- `POST /api/gmail/test` → live Gmail connection status (`src/routes/gmailSendRoute.ts`)
- `POST /api/gmail/fetch` → pulls unread Gmail now → routes into the inbox store Inbox Zero reads (`fetchUnreadBatch` → `processIncomingEmails`)
- `GET /api/calendar/events` + `POST /api/calendar/events` → real upcoming events / create event (`src/routes/calendarRoutes.ts`, mounted in `app.ts`)
- `GET /api/integrations/status` → combined Gmail + Calendar status (`src/routes/integrationRoutes.ts`)
- `.gitignore` now excludes `credentials/` + `.env` (so the OAuth secret + token never get committed)
- Verified: `npx tsc --noEmit` → exit 0, 0 errors.

**Frontend** (`qualia-shell/src/components/ControlPanel/ControlPanel.tsx`) — fixed the 5 Settings-card fetch calls to use the correct `/api/...` paths (they were missing the prefix, so they could never have worked). String-only change; full gate runs on the Mac.

---

## Your one-time authorization

### 1. Google Cloud (create the OAuth client + enable the APIs)
1. Open the project: <https://console.cloud.google.com/apis/credentials?project=aion-the-ethos> (or your own project).
2. **APIs & Services → Enabled APIs → + ENABLE APIS** → enable **Gmail API** and **Google Calendar API**.
3. **OAuth consent screen:** External; add the Google account you'll sync as a **Test user** (skips Google's verification).
4. **Credentials → + CREATE CREDENTIALS → OAuth client ID → Application type: Desktop app** → Create → **Download JSON**.
5. Save that file as: `ai-dashboard369-file-manager/credentials/oauth2-credentials.json`

### 2. Authorize (this is the sign-in — yours)
```bash
cd ~/dwellium-backend/ai-dashboard369-file-manager     # adjust to your path
npm install        # first time only
npm run oauth-setup
```
It opens your browser (callback server on `http://localhost:3939`). **Sign in with the Gmail account whose inbox you want in Inbox Zero**, and grant the 5 scopes (Gmail read/modify/labels + Calendar). It writes `credentials/oauth2-token.json` and prints `✅ Gmail connected as: <your-email>`.

> The synced inbox = whatever account you sign in with here. To sync your personal Gmail, sign in as `iklipinitser@gmail.com`.

### 3. Backend `.env` (in `ai-dashboard369-file-manager/.env`)
```
GMAIL_FETCHER_ENABLED=true
GMAIL_WATCH_EMAIL=iklipinitser@gmail.com     # set to the account you authorized (for the status display)
GMAIL_POLL_INTERVAL_MS=900000                 # optional — background auto-sync every 15 min
GOOGLE_CALENDAR_ID=primary                    # optional — defaults to your primary calendar
```
("Sync Gmail Now" works even without the fetcher enabled; `GMAIL_FETCHER_ENABLED=true` adds the background poll.)

### 4. Run both
```bash
# backend
cd ~/dwellium-backend/ai-dashboard369-file-manager && npm run dev          # :3000
# frontend (new tab)
cd ~/Downloads/"Dwellium -Per Spec"/qualia-shell && npm run dev            # :5173
```

---

## Validate
In the app → **Settings**:
- **Gmail card → Test Gmail** → should show *connected*. **Sync Gmail Now** → open **Inbox Zero** → real emails appear.
- **Calendar card → Refresh Events** → real upcoming events. Create one → it appears in Google Calendar.

Once both servers are running and you've signed in, **tell me and I'll drive your browser to screenshot the working Settings cards + Inbox Zero** as proof. (I can do the screenshots — just not the sign-in.)

---

## Notes
- **Never commit** `credentials/` or `.env` (now gitignored).
- Routes are unauthenticated to match the Settings card's plain `fetch` + the existing open inbox GET — fine for a single-user localhost backend. If you want them behind auth, switch the ControlPanel calls to `authFetch` and add `authenticate` to the four routes.
- Don't `git push` without a green gate + your go (repo rule). Backend: `npm run build && npm test`. Frontend: `bash "Scripts/gate-and-push.sh"`.
