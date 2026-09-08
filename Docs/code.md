# docs/code.md — known issues, root causes, fixes (read BEFORE fixing anything)

Append-only log. Each entry: error → root cause → fix → prevention.

## 2026-08-22 — Calendar / Inbox Zero sub-widgets dead in production (hard-coded API base)

- **Error:** Strata → Calendar → Integrations tab never shows Google Calendar status/events in production; InboxZero Cold-email blocker / Reply tracker / NIF panels fail silently.
- **Root cause:** `CalendarModule.tsx`, `SentimentModule.tsx`, `InboxZero/{ColdEmailBlocker,ReplyTracker,NifIntelligence}.tsx` each declared `const API = 'http://localhost:3000'` instead of importing `API_BASE` from `src/config.ts` (same-origin on deployed hosts, localhost only in dev). Browser on argyleholocron.netlify.app → requests to localhost:3000 → connection refused (and mixed-content blocked).
- **Fix:** import `API_BASE` from `config` in all five (commit on `fix/050-cockpit-followups`).
- **Prevention:** `grep -rn "http://localhost:3000" qualia-shell/src --include='*.ts' --include='*.tsx' | grep -v test` must only hit `config.ts`. Never declare a per-widget API base.

## 2026-08-22 — Backend `GET /api/calendar/status` did not exist

- **Error:** CalendarModule fetches `/api/calendar/status` → 404 → card stuck on "not connected" even when Google is linked.
- **Root cause:** `calendarRoutes.ts` only had `/events`; `getCalendarConnectionStatus()` existed in `calendarService` but was never routed.
- **Fix:** backend `router.get('/status')` → `getCalendarConnectionStatus()` (+ `tests/calendarRoutes.test.ts`).

## 2026-08-22 — Cloud Run secrets wiped by partial deploys (`--set-secrets`)

- **Error:** After a deploy that exported only `BRIEF_RUN_SECRET`, Gmail/Calendar OAuth (and possibly OpenAI/Trello) stopped: `GOOGLE_OAUTH_CLIENT_SECRET is missing…` (503 from `/api/google/oauth/start`).
- **Root cause:** `deploy/cloud-run.sh` built `--set-secrets` only from secrets exported in the deploying shell, and gcloud documents `--set-secrets` as "All existing secrets will be removed first". The env-file merge preserved only literal vars (it skips `valueFrom` secret refs by design), so unlisted secret refs were dropped.
- **Confirmed 2026-08-22:** serving revision `00043-xdp` had only `BRIEF_RUN_SECRET`. Secret Manager holds exactly three secrets (`dwellium-brief-run-secret`, `dwellium-google-oauth-client-secret`, `dwellium-openai-api-key`) — the Trello secrets were NEVER created, so an `--update-secrets` naming them fails the whole revision ("Secret … was not found") and leaves dangling refs in the service spec (`Ready=False`).
- **Fix:** `--set-secrets` → `--update-secrets` in the script (adds/updates, keeps the rest). Restored live with: `gcloud run services update dwellium-backend --region us-central1 --remove-secrets TRELLO_API_KEY,TRELLO_TOKEN --update-secrets OPENAI_API_KEY=dwellium-openai-api-key:latest,GOOGLE_OAUTH_CLIENT_SECRET=dwellium-google-oauth-client-secret:latest` → revision `00045-8c6`. To add Trello later: export `TRELLO_API_KEY`/`TRELLO_TOKEN` in the deploying shell once (the script creates the secrets).
- **Prevention:** never use `--set-secrets` in deploy scripts; after every deploy, `gcloud run services describe dwellium-backend --region us-central1 --format='value(spec.template.spec.containers[0].env[].name)'` and confirm the secret names are still present.

## 2026-08-22 — Gmail fetcher hard-disabled in production

- **Error:** Inbox Zero never receives Gmail mail on Cloud Run.
- **Root cause:** deploy script wrote `GMAIL_FETCHER_ENABLED: "false"` unconditionally.
- **Fix:** `GMAIL_FETCHER_ENABLED: "${GMAIL_FETCHER_ENABLED:-false}"` — deploy with `GMAIL_FETCHER_ENABLED=true` once andy@dwellium.com is linked in Control Panel → Google Accounts (account_oauth strategy). Testing-mode OAuth (Ilya's decision, plan 032) → refresh tokens expire ~7 days → reconnect when the card says "needs re-auth".

## 2026-08-22 — AppFolio (and Google/Microsoft/GitHub…) blank in the Cockpit preview iframe

- **Error:** URL loads but the preview pane stays blank.
- **Root cause:** `curl -sI https://www.appfolio.com/` → `content-security-policy: frame-ancestors 'self' *.appfolio.com …`. The site forbids being framed by other origins; no proxy/header trick fixes this legitimately.
- **Fix:** `isKnownFrameBlocked()` in `FluidOS.tsx` shows an honest "doesn't allow embedding → Open ↗" card. For AppFolio DATA inside Dwellium the path is their API (Plus/Max plan + credentials from AppFolio support), not an iframe.

## 2026-08-22 — Cockpit nav rows kicked the user back to the classic desktop

- **Root cause:** plan 049 `openInDesktop` = `openWindow` + `fluidOsStore.setOpen(false)`.
- **Fix:** widgets open as center-pane tabs (`openInCockpit`); desktop windows opened while the cockpit is up (⌘K) are adopted as tabs; "Open on desktop ↗" is the explicit exit. ⌘K pill hidden while the cockpit is open (it overlapped the header at z 4900 > 4000).

## 2026-08-22 — `git apply` of a backend patch silently applied NOTHING (exit 0)

- **Error:** `git apply plans/052-backend.patch` run from `~/dwellium-backend/ai-dashboard369-file-manager` returned success, but `git status` showed no changes and jest still reported the old counts.
- **Root cause:** the backend git root is `~/dwellium-backend` (the app lives in the `ai-dashboard369-file-manager/` sub-folder). Agent patches carry paths rooted at the app folder (`a/src/...`). When `git apply` runs inside a subdirectory it interprets paths relative to the repo root and **silently ignores paths outside the current directory** → nothing applied, exit 0.
- **Fix:** apply from the repo root with the prefix: `cd ~/dwellium-backend && git apply --check --directory=ai-dashboard369-file-manager/ <patch> && git apply --directory=ai-dashboard369-file-manager/ <patch>`; then commit/add with `ai-dashboard369-file-manager/...` paths. Always confirm with `git status --short | grep -v '^??'` that files are actually modified, and re-run the gate (tsc + jest) expecting the NEW counts.
- **Prevention:** this is now the patch convention for backend worktree agents (they cannot run git in the backend checkout): patches are `git diff` with paths rooted at the app folder; the operator applies with `--directory=`.

## 2026-08-26 — Six days of red CI, four stacked causes (first green gate since Aug 20: run 32992380365)

- **Nobody looked at CI.** Local gates (tsc/vitest/build) were green for every push since Aug 20 while the AppFolio Parity Gate failed 10× in a row. Rule: after every push, `gh run list` — a local gate is not the repo's gate.
- **Cause 1 — FirstRunCard overlay (046-F):** floats over the desktop and intercepted the axe-baseline spec's clicks → every run died as a click timeout. Fix: `e2e/helpers/auth.ts` seeds `sessionStorage['dwellium:first-run:dismissed']='1'` + ARA prefs `introSeen`.
- **Cause 2 — masked by 1:** `nested-interactive` (serious) ×18 — the sidebar row `<button>` contained a `role="button"` remove span. Fix: row is a `<div>` with SIBLING `.sidebar-widget__main` + remove `<button>`s (Sidebar.tsx + .css). Drag/drop and visuals unchanged.
- **Cause 3 — stale screenshot baselines:** plan-053 + the sidebar restructure legitimately changed all 8 module screenshots (ratio 0.04–0.05 vs 0.03 gate). Fix: dispatch `Capture Linux Playwright Baselines` (workflow_dispatch), then merge the pushed `baseline-capture/main-<run>` branch (its PR-creation step still fails on permissions — expected).
- **Cause 4 — WebCrypto settle races:** `whiteboardCollab.test.tsx` asserted after a single `setTimeout(0)` hop; Node's `crypto.subtle` completes off-thread, so CI (and full-suite load) lost the race that fast local solo runs won. Fix: poll with `waitFor(...)` after every encrypt/decrypt; negative assertions get a real ~50 ms settle window.
- **Auto-starting overlays break e2e (2026-08-30):** a NEW full-viewport overlay that auto-shows for a fresh user (walkthrough dimmer; earlier: FirstRunCard) intercepts Playwright clicks → axe-baseline/nav specs fail in CI while vitest+build are green. Fix: seed its 'done'/'dismissed' key in `e2e/helpers/auth.ts::loginAs` (alongside `default-stack`, `first-run:dismissed`). Rule: any new auto-start overlay ships with its e2e-seed suppression in the SAME change.
- **Stale local service survives a restart (3rd occurrence, 2026-08-31):** `kill` on the listener + immediate relaunch races; the old pid keeps the port, the new one dies on EADDRINUSE and the rig silently serves OLD code (symptom: some routes 404 while siblings answer). Rule: after any local restart, assert `lsof -iTCP:<port> -sTCP:LISTEN -t | wc -l` == 1, that pid's start time is NOW, and `grep -c EADDRINUSE <log>` == 0 — before trusting a single probe.
- **Shared git stash across worktrees (2026-09-05):** two swarm agents in separate worktrees both used `git stash push/pop`; the stash is ONE stack per repo, so a pop delivered the other agent's uncommitted file. Rule: swarm/worktree agents never use `git stash`; compare with `git show HEAD:<path>`; commit early; stage by exact path. Also: Strata `AccountingModule.tsx` still carries hardcoded `MOCK_*` ledgers/accounts (fabricated names and figures) — tracked as the next fake-data item.
- **Runner eviction (2026-08-28):** a run that dies mid-step with `##[error]The operation was canceled.` after ~5 min, with NO superseding run and no newer commit, is GitHub infrastructure eviction — not your code. Re-dispatch the same SHA (`gh workflow run … --ref main`); it went green unchanged.
- **CI orchestration gotchas re-confirmed:** push webhooks arrive late and out of order; the workflow's `cancel-in-progress` concurrency then cancels a manual dispatch in favor of the delayed push run (harmless when it's the same SHA — watch the survivor). `qualia-shell/e2e/**` (incl. snapshots) is OUTSIDE the parity-gate paths filter: baseline merges never auto-fire a run — dispatch manually.
- **Env Drift Check (separate):** check3 scanned only index.html+manifest assets; the Google client-id moved two hops into the chunk graph → false FAIL since ~Aug 23. Fix: bounded transitive crawl in `Scripts/verify_deploy_env.mjs` (verified: prefix present, 262 chunks). 

## 2026-09-05 — UserContext dead-session tests failed only with `VITE_ONE_SAVE=true` (swarm C bulk hydrate)

- **Error:** `src/test/UserContext.test.tsx` → "a confirmed-dead session WITH a stored identity stays mounted and flags sessionExpired" and "logging in from an expired session clears sessionExpired" failed (`sessionExpired` stayed `false`) with Ilya's gitignored `.env` (`VITE_ONE_SAVE=true`); passed with the flag off and in CI (no `.env`).
- **Root cause:** the tests queued responses by call ORDER (`mockResolvedValueOnce` ×2: `/api/auth/me` 401, `/api/auth/refresh` 401). `oneSaveSync.bootstrap()` fires on mount from `UserContext.tsx` (`user?.id` effect); swarm C's bulk `GET /api/objects?owner=&limit=500` is issued immediately, so it consumed the refresh's 401 and the refresh got `undefined` from the exhausted `vi.fn()` → treated as a network error → session not "confirmed dead". Proof: `(globalThis.fetch as any).mock.calls` = `/api/auth/me, /api/objects?owner=u1&limit=500, /api/auth/refresh, /api/objects/…, /api/objects/…`. On main the per-store hydrates land after the refresh by microtask luck.
- **Fix:** test-only — `deadSessionFetch` routes by URL (`/api/auth/me` + `/api/auth/refresh` → 401, `/api/objects*` → 404 = "no remote object", anything else throws `Unmocked:`), same shape as the existing logout test's mock. App code unchanged (a 401 on the sync call is deduped by the existing `markAuthRejected` path). Reverted the `whenSettled()` experiment in `oneSaveStore.ts` — timing hacks did not fix an ordering bug.
- **Prevention:** any test that mounts `UserProvider` with a stored identity must mock fetch BY URL, never by order — One Save, integrations and session-health all fetch on mount. Run the auth suite both ways before calling a branch green: `VITE_ONE_SAVE=true npx vitest run src/test/UserContext.test.tsx` and `VITE_ONE_SAVE=false …` (CI has no `.env`, Ilya's machine does).

## 2026-09-07 — Inbox Zero "stopped working" / Google link "gone" — the whole chain

- **Symptom:** Inbox Zero shows "All caught up" with nothing to triage; Status Check says Gmail "No credentials configured", Calendar/Drive "OAuth2 not configured" even after linking Google several times (Section Check 2026-09-04 rows 4, 6, 40, 57).
- **Root causes (four, stacked):** (1) `statusRoutes` and the Gmail client read legacy files / `GMAIL_WATCH_EMAIL` instead of the linked-account store, so a linked account that differs from the env email reads as "not configured" — fixed in backend `3e0b3c0` (`pickLinkedAccount()`, `listEnabledGoogleAccounts()`). (2) `deploy/cloud-run.sh` wrote `GMAIL_FETCHER_ENABLED: "${GMAIL_FETCHER_ENABLED:-false}"` unconditionally, so every deploy without that var exported turned the fetcher off again — fixed on `backend/ship` (written only when exported; the script's preserve-unknowns merge keeps the live value otherwise). (3) Google OAuth app is in Testing publishing status (plan 032 decision): refresh tokens expire after ~7 days, so every link dies within a week — only fixable in the Google Cloud console (OAuth consent screen → In production). (4) Data durability: the script mounts bucket `<project>-dwellium-runtime` at `/var/dwellium` and the SQLite DB lives on that gcsfuse mount (no byte-range locks; the persistence doc explains why that is unsafe); the snapshot/restore branch is merged on `backend/ship` (`27af194`, gated on `DWELLIUM_SNAPSHOT_DIR`, no behaviour change until set) — activation needs the live preflight in `docs/persistent-data-cloud-run.md` because the snapshot path must sit outside the existing mount.
- **Could not verify live:** `/api/status` needs a session (401 without one) and `gcloud` token refresh fails non-interactively ("Reauthentication failed") — the live fetcher flag, volume mount and Gmail state are unverified until Ilya runs `gcloud auth login`.
- **Fix sequence (owner):** `gcloud auth login` → deploy `backend/ship` with `GMAIL_FETCHER_ENABLED=true` exported (plus the OAuth vars the script expects) → Control Panel → Google Accounts → connect once → OAuth consent screen to "In production" so the link stops expiring weekly.
- **Prevention:** after every deploy run `gcloud run services describe dwellium-backend --region us-central1 --format='value(spec.template.spec.containers[0].env[].name)'` and confirm `GMAIL_FETCHER_ENABLED` and the three secret names are still present; never add an unconditional line with a default to the env-file heredoc — optional vars are written only when exported.

### 2026-09-08 addendum — Inbox Zero, live evidence (gcloud signed in)

- `gcloud run services describe dwellium-backend`: revision 00053-smm, `GMAIL_FETCHER_ENABLED = true`, `GMAIL_WATCH_EMAIL` unset (backend default andy@dwellium.com), bucket `dwellium-runtime` mounted at `/var/dwellium` (so the data dir persists across deploys; SQLite-on-gcsfuse caveat stands), secrets present: OPENAI_API_KEY, GOOGLE_OAUTH_CLIENT_SECRET, BRIEF_RUN_SECRET, LIBRARY_SYNC_SECRET; `TOKEN_ENCRYPTION_KEY` set.
- `gcloud run services logs read`: `[GoogleAuth] Using account-scoped OAuth2 authentication for andy@dwellium.com` → the link exists; then `[Gmail Fetcher] Fetch cycle failed: GaxiosError: invalid_grant — Token has been expired or revoked.` So the fetcher runs, finds the linked account, and Google refuses the refresh token. That is cause (3): the OAuth app is in Testing status, refresh tokens die after ~7 days. Causes (1) and (2) are not what is failing today.
- **Immediate unblock (no deploy):** Control Panel → Google Accounts → connect again (new refresh token), then publish the OAuth consent screen so it stops expiring. The backend/ship deploy still matters for Status Check accuracy, the security fixes and the Strata routes.
- **New finding:** the fetcher logs the whole GaxiosError, which includes the token request body — the refresh token itself lands in Cloud Logging. Log only `error` / `error_description` (fix on backend/ship).
