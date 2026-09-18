# 059 — Production 429 storm (Properties / Calendar / Inbox Zero "offline")

Observed 2026-09-18 ~05:50 UTC on argyleholocron.netlify.app, signed in as Andy.

## Root cause (verified)

1. Backend `globalApiRateLimiter` (`src/app.ts`) allows **300 requests / minute per `req.ip`**.
   On Cloud Run (`trust proxy` = 1) behind Netlify's `/api/*` proxy, `req.ip` is Netlify's
   egress address, not the browser's — so every browser session shares one bucket.
   Evidence: the same minute, a direct curl to Cloud Run reported `x-ratelimit-remaining: 296`
   while a curl through Netlify reported `299` (separate buckets); via Netlify `/api/health`
   answered 429 with the backend's own JSON body.
2. One page load fired ~60 `/api/*` calls in 8 s — mostly `PUT /api/objects/whiteboard_<uid>`
   (Excalidraw `onChange` on mount → `saveSceneDebounced`, 1.5 s) — and `oneSaveStore`'s
   write-through retries a 429 like any failure (3 attempts, 500/1000 ms, ignores `Retry-After`),
   tripling the load. Bucket exhausted → **every** `/api` call 429s until the window resets:
   `/api/auth/me`, `/api/objects?owner=…`, `/api/inbox/*`, `/api/dwellium/properties`, calendar.
   That is what the user saw as "API error 429 in Properties", "calendar not working", "Inbox Zero offline".
3. `GET /api/inbox/stream` → 404 is unrelated and harmless: no backend branch has that route;
   `readSse` fails and the 60 s poll covers it. Not fixed here.

## Fix A — frontend: never retry a 429 (`qualia-shell/src/lib/oneSaveStore.ts`)

In `scheduleWriteThrough`'s attempt loop, after a `null` from `oneSaveClient.put`, if
`syncRateLimitStore` reports `limited` (set by `oneSaveClient` on a 429), **break** out of the
loop immediately: park the replay in `failed` as today (reconnect/markOnline replays it) and
surface via the banner. No new state, no new timers. One test in `src/test/oneSaveStore.test.ts`:
put → 429-shaped failure → exactly ONE put call, replay parked.
(`oneSaveClient.put` returns `null` on 429 and flips `rateState.limited`; read that store,
do not change the client.)

## Fix B — backend: key the limiter by session, not by proxy IP (`src/app.ts`)

`globalApiRateLimiter` gets a `keyFn`: when `Authorization: Bearer <token>` is present, key on
`sha256(token).slice(0,16)`; otherwise fall back to `req.ip`. Same 300/min default. Add ONE test
next to the existing rate-limiter tests (find them: `grep -rn "RateLimit\|429" tests src --include=*.test.ts`):
two different tokens from the same IP get independent buckets. Keep `createInMemoryRateLimiter` unchanged.

## Not doing

- Raising the limit blindly (a per-user 300/min is fine once A stops the amplification).
- `TRUST_PROXY_HOPS=2` (would let a direct caller spoof its bucket).
- Reworking the whiteboard's mount-time saves (1.5 s debounce is reasonable; the storm was the retry × shared bucket).

## Verification

- Frontend: `cd qualia-shell && npx tsc -b && npx vitest run src/test/oneSaveStore.test.ts`, then the strict gate.
- Backend: its own test command (see backend `package.json` scripts) for the touched test file.
- Backend deploy is Ilya's (gcloud): `deploy/cloud-run.sh` from `backend/ship`. Agents never run gcloud.
- Live check after deploy: reload production, `read_network_requests` shows no 429 on load; Properties/Calendar/Inbox load.
