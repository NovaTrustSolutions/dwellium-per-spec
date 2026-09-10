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
- **Runner eviction (2026-08-28):** a run that dies mid-step with `##[error]The operation was canceled.` after ~5 min, with NO superseding run and no newer commit, is GitHub infrastructure eviction — not your code. Re-dispatch the same SHA (`gh workflow run … --ref main`); it went green unchanged.
- **CI orchestration gotchas re-confirmed:** push webhooks arrive late and out of order; the workflow's `cancel-in-progress` concurrency then cancels a manual dispatch in favor of the delayed push run (harmless when it's the same SHA — watch the survivor). `qualia-shell/e2e/**` (incl. snapshots) is OUTSIDE the parity-gate paths filter: baseline merges never auto-fire a run — dispatch manually.
- **Env Drift Check (separate):** check3 scanned only index.html+manifest assets; the Google client-id moved two hops into the chunk graph → false FAIL since ~Aug 23. Fix: bounded transitive crawl in `Scripts/verify_deploy_env.mjs` (verified: prefix present, 262 chunks). 

## 2026-09-07 — ARA window text could not be selected (Classic, Holocron OS, Cockpit)

- **Error:** dragging the mouse over any ARA message selects nothing in all three interface layouts.
- **Root cause:** `src/styles/global.css` sets `user-select: none` on `<body>` (desktop-OS feel). `user-select` is not inherited, but the used value of `auto` follows the parent, so every descendant is unselectable unless it sets `user-select: text` explicitly. ARAConsole.css never opted in; all three layouts render the same `.ara-console` tree under that body, so the symptom was layout-independent. Proven both ways with a Playwright drag in Chromium: opt-in removed → `getSelection().toString()` = `""`; opt-in present → `"Selectable text check"`.
- **Fix:** `.ara-console { -webkit-user-select: text; user-select: text; }` (`fix/ara-text-select`); the side-panel resize handle `.ara-side-divider` stays `none` so dragging it does not start a selection. Same pattern Antigravity.css already used.
- **Checks:** `src/test/araConsoleCss.test.ts` (stylesheet assertions: body still `none`, root opts in, divider stays `none`) and `e2e/ara-text-select.spec.ts` (real mouse drag in each layout; asserts computed `user-select` on the root and the browser selection text; writes `test-results/ara-select-<layout>.png` with the highlight).
- **E2E lessons for the three layouts:** seed `dwellium-halocron-os` / `dwellium-fluid-os` `{enabled:true, open:true}` in `addInitScript`; the Holocron cinematic is gated by `sessionStorage 'halocron-os-intro-played'` (NOT `'halocron-boot-played'`, that is HalocronBoot); open ARA through the layout's own control (Cockpit `.fos-nav__row` "Open ARA Console", Holocron `main` → AGENTS → "ARA", Classic sidebar) because the OS shells sit over the sidebar and intercept its clicks; the chat area smooth-scrolls after a send, so poll the text node's rect until it is stable and `scrollIntoViewIfNeeded()` first — in Holocron the newest body sits below the fold of the short chat area and a blind drag lands on the "Conversation Actions" panel (selection = `"YOU\n"`).
- **Prevention:** any widget that shows text the user may want to copy must opt in at its root (`user-select: text`) — the body rule silently disables selection for everything else. Playwright helper `loginAs` remains the only session path (Andy's real record, no password, no dev accounts).

## 2026-09-08 — Terminal widget tabs: Paperclip toolbar overflowing the pane, CrewAI "refused to connect"

- **Error 1:** in the Cockpit (and any narrow window) the Paperclip tab's header buttons (Launch ▸ / Change / Reload / Open ↗ / Setup) render outside the panel to the right.
- **Root cause 1:** `.pc-toolbar` (and the sibling `.cr-toolbar`, `.lf-toolbar`) is a single-line flex row — `display:flex` with no `flex-wrap`; five `white-space: nowrap` buttons plus the URL need ~450 px, the Cockpit centre pane gives less, and nothing clips, so the row spills past the container.
- **Fix 1:** `flex-wrap: wrap; row-gap: 6px` on all three toolbars (`PaperclipPanel.css`, `CrewAIPanel.css`, `LangFlowPanel.css`). Proof: `e2e/terminal-panels.spec.ts` opens the Terminal at a 1100 px viewport in Classic and Cockpit, switches to Paperclip and asserts every toolbar button's box lies inside `.pc-panel` and the widget.
- **Error 2:** CrewAI tab → "Show control plane" shows the browser page "app.crewai.com refused to connect".
- **Root cause 2:** `curl -sI https://app.crewai.com` → `x-frame-options: SAMEORIGIN` and `content-security-policy: frame-ancestors https://bolt.new https://lovable.dev https://replit.com https://riff.new https://v0.app`. The host cannot be framed by Dwellium; the panel's reach check (`fetch` with `mode: 'no-cors'`) still reports "up" because it never sees those headers.
- **Fix 2:** the frame-blocked host list moved from `FluidOS.tsx` to `src/lib/frameBlocked.ts` (re-exported from FluidOS for existing imports) with `app.crewai.com` added; `CrewAIPanel` renders an "doesn't allow embedding → Open ↗ / Change" card instead of the iframe for any host on the list. Same pattern as the AppFolio preview card (2026-08-22).
- **"Why is there a thin context error on ARA" (no code change):** `hasThinContext()` in `ARAConsole.tsx` flags an assistant reply when it carries fewer than 2 context sources or fewer than 3 items in total. Sources are attached by the backend (`araChatEngine.ts`: Inbox, Trello, ruVector, Properties, Workitems, Entities, Georgia Code, Library, System Health). On the live service today Gmail is not linked, Trello has no key, the ruVector index is empty, Georgia Code is empty and the Library has never synced (Status Check, Section Check row 40), so most answers arrive with 0–1 sources and the notice is telling the truth. Replies answered by the browser LLM while the backend is unreachable carry no sources at all and are flagged too; `swarm/sections-fix` (8bc9a7a, unmerged) limits the notice to backend replies and adds "Pin context". The notice disappears on its own once the sources exist: connect Google, set the Trello key, re-index ruVector, ingest Georgia Code.
- **Prevention:** toolbars inside widget tabs wrap by default (`flex-wrap: wrap`) — the Cockpit centre pane is the narrowest container the app has; any new embed target goes through `isKnownFrameBlocked()` first, verified with `curl -sI <url> | grep -i -E "x-frame-options|frame-ancestors"`.

## 2026-09-08 — Fact Check Log said "No LLM configured and backend offline" whenever both paths failed

- **Error:** Ilya: "fact check says no llm configured" — while an LLM provider was configured in Settings → API Keys.
- **Root cause:** `FactCheckLog.submitManualCheck` tried the user's LLM (`callLlm` throws on any failure — 401 bad key, model, CORS…), swallowed the error in an empty `catch`, then fell back to a plain `fetch` of `/api/transcribe/fact-check`; if that threw (network) OR its body was not JSON (a proxy 502/504 HTML page makes `res.json()` throw), the one placeholder text blamed a missing LLM. A 4xx JSON answer produced no entry at all. The fallback also sent no session token, so once the transcribe routes are gated (backend/ship) it would silently 401.
- **Fix (`fix/fact-check-honest-errors`):** `src/lib/factCheckFailure.ts` builds the entry text from what happened — no active provider / provider call failed with its message / provider returned nothing — plus the backend outcome (unreachable with the error, HTTP status with the server's error text, non-JSON body with status, or success=false). The fallback sends `Authorization: Bearer <session>`. Tests: `factCheckFailure.test.ts` (wording), `factCheckLogHonestErrors.test.tsx` (widget: network failure, 504 HTML, 401 with token header). Note: the explanation renders only after the entry is expanded (click the row).
- **Still to learn from Ilya's machine:** which of the three it was for him. The new wording answers that on the next check; the API Keys "Active provider" flip to "— None —" seen in the Section Check (popup visit) is a separate open question about the per-user vault in popup windows.
- **Prevention:** never collapse two independent failures into one fixed sentence; keep the error text; any `fetch` to `/api/*` that the backend authenticates carries the session token.

## 2026-09-09 — "Multi-account connect needs the backend OAuth routes. Apply the backend patch" shown while the routes were live

- **Error:** Settings → Google Accounts showed the "apply the backend patch" note during the Cloud Run outage and afterwards while the limiter answered 429.
- **Root cause:** `listGoogleAccounts()` in `src/lib/googleAccounts.ts` treated every non-OK status the same as a 404. The routes from `Docs/Google_MultiAccount_Backend.md` §3–5 (`GET /api/google/accounts`, `POST /api/google/auth/start`, `PATCH`/`DELETE /accounts/:id`) exist on main and backend/ship and answer 401 without a token on the live service, so the note was pointing at a fix that was already in place.
- **Fix:** `classifyBackendFailure(status)` → `missing-route` (404) / `unauthorized` (401, 403) / `rate-limited` (429) / `unavailable` (5xx) / `network`; the card renders `failureNote(reason)` and a Retry button for everything except a missing route. Tests: `src/test/googleAccounts.test.ts` (each status → reason + wording; only the 404 note mentions the patch).
- **The part of the doc that was NOT implemented — §6, reading mail from every connected account:** implemented on backend `feat/gmail-multi-account-fetch` → `backend/ship` (28b47ed): `getGoogleAuthForAccount()` builds an OAuth2 client per linked account (same refresh/`needs_reauth` handling as the picked-account path), `fetchUnreadBatchAllAccounts()` reads every enabled account that granted Gmail and tags each message `sourceAccount` (the field InboxZero already renders), one failing mailbox is skipped with a redacted log line instead of hiding the rest, and the fetcher loop, `/api/gmail/fetch`, the automation engine and task routes all use it. With no linked account the legacy single-account path runs unchanged. Test: `tests/gmailMultiAccountFetch.test.ts`.
- **Prevention:** a UI note that names a fix must be tied to the one status that proves it (404 for a missing route); other statuses get their own wording and a retry. Grep every caller when changing a fetch path (`fetchUnreadBatch` had four).
## 2026-09-10 — Cockpit: clicking an already-open widget left its tab in the background

- **Error:** in the Cockpit, clicking a widget that is already open (sidebar row, ⌘K result) does nothing visible; the tab stays where it was.
- **Root cause:** those click paths do not open a window when one exists — `Sidebar.handleWidgetClick` and the palette call `focusWindow(existing.id)` (or `restoreWindow`), which only bumps the desktop window's z-index. The Cockpit adopted windows into tabs only when a *new* window id appeared (`seenWindowIds`), so a focus on a known window raised something hidden behind the overlay and never touched the tab. Holocron OS is unaffected: its own `openWidget` re-activates an existing tab, and the Classic desktop raises the window itself.
- **Fix:** `FluidOS.tsx` also follows focus — `topWindowId(windows)` (highest non-minimized z-index) is tracked while the cockpit is open; when it changes, `openInCockpit(component)` activates that tab (adopting it first if needed). While the cockpit is closed the reference is kept current so opening the cockpit never switches tabs by itself. Tests: `fluidOs.test.tsx` "brings an already-open tab to the front when its desktop window is focused" + `topWindowId` unit.
- **Prevention:** any surface that "opens" a widget must handle the already-open case in every layout: Classic raises the window, Holocron re-activates its tab, Cockpit follows the top window. New layouts subscribe to the same two signals (new window id, top window id).

## 2026-09-10 — FluidVoice "Not detected" in the Tools hub / Dictation card

- **Not a Dwellium bug.** The card is a live probe of FluidVoice's opt-in Local API on `http://127.0.0.1:47733` (`src/lib/fluidVoiceLocalApi.ts`). On this Mac FluidVoice.app is installed and running, but nothing listens on 47733 (`lsof -iTCP:47733 -sTCP:LISTEN` → none; `curl 127.0.0.1:47733` → connection refused), so "Not detected" is the truthful state: the Local API toggle is off inside FluidVoice (FluidVoice → Settings → Local API). Once it is on, the card flips to "Running"; the vocabulary seed and the dictation hand-off use the same port. If Chrome still reports "Not detected" with the port open, the remaining suspect is Chrome's private-network-access rule for https pages calling loopback; the desktop app has no such rule.

## 2026-09-10 — Google reconnect after the OAuth client moved to the Internal org project

- Refresh tokens are bound to the client that issued them: after switching `GOOGLE_OAUTH_CLIENT_ID`/secret to the new Internal client (revision 00058, secret version 8), the stored andy@dwellium.com token failed with `invalid_grant — Token has been expired or revoked` until the account was connected once more. After the reconnect (01:37 UTC) `POST /api/gmail/fetch` returned `{fetched: 0, processed: 0, accounts: 1}` with no skipped mailbox and Status Check reported Gmail, Calendar and Drive online. Rule: any OAuth client change = every linked Google account must be reconnected once.
- The one-time deploy that wrote a placeholder as the secret (2026-09-08) also left secret versions 6 and 7 invalid; the service is pinned to version 8 rather than `latest` so a bad newer version cannot be picked up silently. Add versions only through the deploy script's prompt line.
