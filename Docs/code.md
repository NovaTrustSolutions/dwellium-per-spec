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
- **CI orchestration gotchas re-confirmed:** push webhooks arrive late and out of order; the workflow's `cancel-in-progress` concurrency then cancels a manual dispatch in favor of the delayed push run (harmless when it's the same SHA — watch the survivor). `qualia-shell/e2e/**` (incl. snapshots) is OUTSIDE the parity-gate paths filter: baseline merges never auto-fire a run — dispatch manually.
- **Env Drift Check (separate):** check3 scanned only index.html+manifest assets; the Google client-id moved two hops into the chunk graph → false FAIL since ~Aug 23. Fix: bounded transitive crawl in `Scripts/verify_deploy_env.mjs` (verified: prefix present, 262 chunks). 
