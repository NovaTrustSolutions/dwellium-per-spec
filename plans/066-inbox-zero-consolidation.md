# 066 — Inbox Zero consolidation: honest widget, retired alias, durable backend

Context: the 2026-09-24 swarm audit
([`Docs/InboxZero_Capabilities_Report_2026-09-24.md`](../Docs/InboxZero_Capabilities_Report_2026-09-24.md))
found that the "Inbox Zero (deprecated)" registry entry is the same component as the live `inbox`
widget; 8 of its 13 tabs call routes that never existed; search, undo, snooze, bulk label and bulk
AI-classify on the live Triage tab do nothing; and the backend keeps inbox items in memory,
archives secondary-account mail with the default client, and leaves `/api/gmail/fetch|test`
unauthenticated. This plan supersedes the step order in `Docs/InboxZero_Plan_Review.md`
(2026-07-06); its decisions D6–D16 still stand and are referenced by number.

Repos: frontend `~/Downloads/Dwellium -Per Spec` (app in `qualia-shell/`), backend
`~/dwellium-backend/ai-dashboard369-file-manager` (deploy branch `backend/ship`).
Audited at frontend `c0814a3`, backend `9a1e935`. **Line numbers drift — re-grep every anchor
before editing.**

Standing rules (from CLAUDE.md, memory and prior plans):
- Read `Docs/code.md` before any fix; append an entry (error, root cause, fix, prevention) after.
- One Save / SQLite writes are **upserts**. No agent runs DELETE/TRUNCATE/DROP on any table holding
  user data, and no agent rewrites persisted layouts or mail. Retiring the alias is read-time
  mapping only (Phase 3).
- No seeded users, no sample data, no demo fallbacks in any environment.
- Agents never run gcloud/deploy, never push, never open a PR without Ilya's explicit go.
  `git add` explicit paths only (the worktree `node_modules` symlink is not ignored).
- Gates: frontend `bash Scripts/gate.sh` from repo root (tsc -b, vitest, two builds, PII scan, SSR
  smoke; `npx vite build` is a silent no-op). Backend
  `npx tsc --noEmit -p . && npx jest --runInBand --forceExit <files>`.
- The local backend serves whatever branch is checked out in its working dir, with auth off. After
  a backend merge: `git checkout main && git pull` there, then
  `launchctl kickstart -k gui/$(id -u)/com.dwellium.backend`. Probe `http://[::1]:3000`
  (`127.0.0.1:3000` also answers Dwellium today; `0.0.0.0:3000` on the LAN is the upstream
  inbox-zero container).

---

## Phase 0 — Ilya decisions (only Phases 4e, 5 and 7 wait on these)

| Gate | Question | Default if unanswered |
|---|---|---|
| G1 | Which features to revive (5a–5g), in what order? | 5a undo → 5b audit feed → 5c rules → 5d unsubscribe → 5e snooze → 5f AI draft; 5g reply tracking deferred |
| G2 | Inbox visibility: owner-only, or shared team inbox? | **Answered 2026-09-24: owner-only** — each user sees mail from the Google accounts they linked; god sees all; legacy env-mailbox mail (no owner) is god-only |
| G3 | Email body retention? | Keep everything; no pruning code is written |
| G4 | Move app-wide settings (AI keys, theme, RBAC) out of the Inbox Zero Settings tab into Control Panel? | Extract to its own file only (6c); no move |
| G5 | Upstream elie222/inbox-zero: is Dwellium sold/licensed, or used by 5+ business users? (LICENSE rider, lines 9-38) | **Answered 2026-09-24: under 5 business users, not sold/licensed** — the rider's exemption applies; Phase 7 option (c) (proxy the unmodified upstream API/MCP) may proceed after the read-only check. Re-ask if Dwellium is ever sold or reaches 5 business users. |
| G6 | Stop or rebind the idle `inbox-zero-services-web-1` container (`0.0.0.0:3000`)? | Left as is |

Phases 1–3 are direction-independent and can start now.

---

## Phase 1 — Backend security and live-bug quick wins (backend)

**Problem.** `app.use('/api/gmail', createAuditMiddleware('/api/gmail'), gmailSendRoute)`
(`src/app.ts:470`) has no `authenticate`; only `/send` adds it inline
(`src/routes/gmailSendRoute.ts:22`), so `POST /test` (`:76`) and `POST /fetch` (`:90`) are open in
production. `PUT /api/inbox/settings` writes arbitrary keys (`src/stores/inboxStore.ts:445-450`).
`/api/tasks/gmail-sync` fabricates 5 demo tasks on Gmail error in any non-production run
(`allowGmailDemoFallback` at `src/routes/taskRoutes.ts:31-35`; demo array `:85-98`). Search is ignored: `GET /api/inbox`
(`src/routes/inboxRoutes.ts:43-64`) never reads `req.query.search` and `getInboxItems`
(`inboxStore.ts:75-101`) has no search filter.

**Change.**
- 1a `app.ts:470` → `app.use('/api/gmail', createAuditMiddleware('/api/gmail'), authenticate, gmailSendRoute)` and drop the now-redundant inline `authenticate` on `/send`. Add `requirePermission('widget:inbox', 'widget:inbox-zero')` **per route on `/test` and `/fetch` only** (`gmailSendRoute.ts:76,90`). `/send` stays session-only: it is also used by work-order sign-off, ComplianceEngine and Astra (`AstraDashboard/ThreadChannels.tsx:85`, `AstraWorkspace.tsx:151`; grep `/api/gmail/send` for the rest), and those users must not need inbox access. First grep the frontend for every `/api/gmail/` caller and confirm each goes through `fetch('/api/…')` or `${API_BASE}/api/…`, both of which `installApiAuthFetch` authenticates.
- Not changed, on purpose: `GET /api/settings` (`settingsRoutes.ts:18`) is readable by any signed-in user, but keys come back masked `first4••••last4` (`settingsStore.ts:116-123,189-192`), and the Settings tab needs it for non-god users. Revisit with G4.
- 1b `updateInboxSettings`: ignore keys not in `DEFAULT_SETTINGS`; coerce values with `String(Number(v))` for numeric keys and `'true'|'false'` for booleans; return 400 from the route when nothing valid remains.
- 1c `allowGmailDemoFallback()` → `return process.env.DWELLIUM_GMAIL_SYNC_DEMO_FALLBACK === 'true'` (explicit opt-in only).
- 1d Search: `getInboxItems` gains `search?: string`; filter case-insensitively on `subject`, `sender` and `snippet` **before** pagination so `total` is correct. The route passes `req.query.search` (trimmed, max 200 chars).

**Tests** (`tests/` jest; copy the harness pattern from `tests/widget-backedAccessGate.test.ts`, which sets `AUTH_ENABLED=true`): unauthenticated `POST /api/gmail/fetch` → 401; a signed-in user holding no `widget:inbox*` permission gets 403 on `/fetch` but can still `POST /send`; `PUT /api/inbox/settings` with an unknown key → key not persisted; `taskRoutes` with the flag unset → no demo tasks; `GET /api/inbox?search=<subject fragment>` returns only matches, with correct `pagination.total`. Mutation-check the search test (remove the filter → test fails).

**Size.** ~60 lines + tests. **Verify:** backend gate on the touched test files; after merge + kickstart, `curl -s -o /dev/null -w '%{http_code}' -X POST 'http://[::1]:3000/api/gmail/fetch'` still 200 locally (auth off by design) and the jest 401 test is the proof for production.
**STOP** if any production caller of `/api/gmail/*` does not send a session (e.g. a cron) — list it and ask.

---

## Phase 2 — Make the widget honest (frontend)

**Problem.** Tabs `rules`, `nif`, `actions`, `analytics`, `cold-email`, `replies`, `tracker`, `audit`
call routes that do not exist (`InboxZero.tsx:684-697` tab list; mounts `:1604-1685`). The
Capabilities tab advertises features the code contradicts (`InboxZeroTypes.ts:168-285`). Triage
actions Undo (`:622-649`, `:2424-2444`), Snooze (`:1213-1229`), bulk Add Label (`:861-898`) and
bulk AI Classify (`:831-860`) hit missing routes; Undo shows a false success. Most mutations never
check `res.ok`.

**Change.**
- 2a Remove the 8 dead tabs from the tab list, the mounts, `IZ_TABS` (`InboxZero.tsx:94`) and `TabId` (`InboxZeroTypes.ts:14`). Persisted `activeTab` values that no longer exist already fall back to `'triage'` (`InboxZero.tsx:95`) — keep that.
- 2b Delete `AnalyticsDashboard.tsx`, `ColdEmailBlocker.tsx`, `NifIntelligence.tsx`, `OpenTracker.tsx`, `ReplyTracker.tsx`, `CapabilitiesTab.tsx`, `CAPABILITIES_DATA` + `CAPABILITIES_STORAGE_KEY` and both toggle copies (`InboxZero.tsx:162-195,1713-1737`). Keep `RulesManager.tsx`, `SmartActions.tsx`, `GlobalAuditTab.tsx` **unmounted**, each with a first-line `// ponytail: unmounted until plan 066 §5x wires its backend` — or delete them too if G1 drops their feature. Recover any deleted file with `git show c0814a3:qualia-shell/src/components/InboxZero/<File>.tsx`.
- 2c Remove the Undo header button, the undo toast and `undoStack`, the Snooze button, bulk Add Label and bulk AI Classify (5a/5e bring back real undo and snooze). Remove the Newsletters "Unsubscribe" button (5d brings it back).
- 2d Every remaining mutation (approve, archive, delete, retry, link, bulk-archive, mark-read) checks `res.ok` and the `success` field and shows the existing error toast on failure. No success toast without a 2xx.
- 2e Delete dead code: `components/InboxWidget/` (both files); `services/emailRouter.ts` and its reads in `components/UniversalShell/adapters/StrataMaintenanceAdapter.tsx:20-23,82-137` (first read what that adapter renders — **STOP** if the review-queue panel is visible to users; replace it with nothing, never with fake data); the unused hooks in `useInboxQueries.ts` (keep `useInboxItems` and the others InboxZero imports — grep each name); the dead `onLoad` resize/rewrite in the full viewer (`InboxZero.tsx:1550-1561`); the dead CSS (`InboxZero.css:2144-2199` "PREMIUM UI POLISH" plus selectors with no matching class — grep each before deleting). Fix the comments that mention them (`widgetRegistry.ts:293-298`, `emailBodySanitize.test.ts:5`, `installApiAuthFetch.ts:4`).
- 2f Move the `widget:inbox-zero` row out of the admin permission editor (`InboxZero.tsx:1946`) — keep `widget:inbox` only. Do **not** touch backend permission keys.

**Tests** (`src/test/InboxZero.test.tsx`): the rendered tab list equals `['triage','newsletters','stats','settings']`; a persisted `activeTab: 'rules'` renders Triage; archive with a mocked 500 shows the error toast and keeps the item; no element with the text "Undo". Update `registryWalker` / `defaultStack` / linkage tests only where they reference deleted files.

**Size.** ~−5,000 lines, ~+60. **Verify:** `bash Scripts/gate.sh`; `npx eslint src/components/InboxZero` error count ≤ the 43 today; in the preview, open Inbox Zero, and confirm 4 tabs, a working archive, and that a forced 500 shows an error (DevTools request blocking on `/api/inbox/*/archive`).
**STOP** if any deleted file is imported outside `components/InboxZero/` (grep the basename first).

---

## Phase 3 — Retire the `'inbox-zero'` registry alias (frontend)

**Problem.** `'inbox-zero'` (`widgetRegistry.ts:300-311`) exists so saved layouts keep opening. The
dock already prunes unknown components (`context/WindowContext.tsx:56-59`), but restored
windows/saved layouts look ids up directly: `WIDGET_REGISTRY[id]` at `Shell/Desktop.tsx:1043,1139`,
`PopupShell/PopupShell.tsx:15`, `Shell/FluidOS.tsx:138`, `Shell/HalocronOS.tsx:115,369`,
`Shell/HalocronWorkspaces.tsx:43`. Worse, the plan-055 session restore **drops** unknown ids:
`knownWidget()` in `src/lib/sessionRestoreStore.ts:305-309` returns false when
`WIDGET_REGISTRY[id]` is missing, and `restoreClassicWindows` (`:317-319`) / `restoreOsTabs`
(`:343-344`) filter on it. Deleting the entry without handling this makes a restored Inbox Zero
window vanish. `CommandPalette.tsx:1029` still opens `'inbox-zero'` on every ⌘K
inbox result, and `Sidebar/widgetSearch.ts:66-71,167` keys a profile to it.

**Module contract** (`src/registry/widgetRegistry.ts`):
```ts
/** Retired ids → live id. Read-time only: persisted layouts are never rewritten. */
export const LEGACY_WIDGET_IDS: Readonly<Record<string, string>> = { 'inbox-zero': 'inbox' };
export function resolveWidgetId(id: string): string; // LEGACY_WIDGET_IDS[id] ?? id
```

**Change.**
- 3a `CommandPalette.tsx:1029` → `openWindow('inbox', 'Inbox Zero', 'mail-open')`.
- 3b `widgetSearch.ts`: delete the `'inbox-zero'` profile (`:66-71`); remove it from the intent-boost `components` (`:167`).
- 3c In `sessionRestoreStore.ts`, map before gating: `restoreClassicWindows` sets `component: resolveWidgetId(p.component)` and filters on the resolved id; `restoreOsTabs` maps `tabs` (and `active`) through `resolveWidgetId` before `filter(knownWidget)`. Then wrap every other `WIDGET_REGISTRY[x]` lookup that can receive a persisted id with `resolveWidgetId(x)` (full list: `grep -rn "WIDGET_REGISTRY\[" src | grep -v test`), plus saved-layout loading (`savedLayoutsStore`) and `openWindow(`. Only then delete the `'inbox-zero'` entry and its comment block.
- 3d Keep `useWidgetMemory('inbox-zero', …)` (`InboxZero.tsx:89`) as is — it is a storage key; renaming it drops everyone's remembered tab. Add `// storage key, not a registry id — kept for existing widget memory`.
- 3e Leave `AssistantLauncher.tsx:23,36,65` and `stellaToolCatalog.ts:306` (their own keys, not registry ids) alone. Leave backend `widget:inbox-zero` permission handling alone (`inboxRoutes.ts:35` accepts either; custom permission rows may reference it).

**Tests:** `resolveWidgetId('inbox-zero') === 'inbox'`, `resolveWidgetId('tasks') === 'tasks'`; in `src/test/sessionRestore.test.tsx` (no inbox case today), a persisted classic window with `component: 'inbox-zero'` restores as `'inbox'` and a Halocron/Fluid tab slice `['inbox-zero']` restores as `['inbox']` — neither is dropped. Mutation-check: remove the mapping → both tests fail; `registryWalker` passes without the entry; the ARA/Stella/Inbox linkage tests that assert `'inbox-zero'` is excluded still pass (update them if they read the registry).

**Size.** ~40 lines. **Verify:** gate; in the preview, seed nothing — use ⌘K on an inbox result and confirm the window title/registry id is `inbox`.
**STOP** if a restore path reads a persisted id somewhere `resolveWidgetId` cannot reach (e.g. server-rendered). Keep the registry entry, add `hidden`/labs-only, and report.

---

## Phase 4 — Durable, account-correct inbox backend (backend)

**Problem.** Items live in `const inboxItems = new Map()` (`inboxStore.ts:14`), and the dedupe set
lives in `let processedIds = new Set()` (`gmailService.ts:272`), so both are lost on restart.
`archiveMessage/modifyLabels/markAsRead/setupWatch` use the default client (`gmailService.ts:199-262`).
Every poll does a full `is:unread` list (`:125-136`). There is no `rate_limited` state
(`googleOAuthAccountStore.ts:203`). The poll interval is captured once at import (`gmailService.ts:23,317`).
Two settings stores exist; `/api/inbox/settings` has no caller after Phase 2e. `GET /api/inbox`
ships full bodies while the UI's `GET /api/inbox/:id/body` does not exist (`InboxZero.tsx:1111,1193`).

**Module contracts.**
```ts
// inboxStore.ts — SQLite, same db handle and CREATE TABLE IF NOT EXISTS pattern as inbox_audit_log (inboxStore.ts:296-341)
// table inbox_items(id TEXT PRIMARY KEY, source_account TEXT, source_id TEXT, owner_user_id TEXT,
//                   status TEXT, signal_class TEXT, created_at TEXT, updated_at TEXT, data TEXT /* JSON InboxItem */)
export function upsertInboxItem(item: InboxItem): void;          // INSERT … ON CONFLICT(id) DO UPDATE
export function loadInboxItems(): number;                         // boot: fill the Map from SQLite, return count
// table gmail_processed(account TEXT, message_id TEXT, consumer TEXT, PRIMARY KEY(account, message_id, consumer))
// table gmail_sync_state(account TEXT PRIMARY KEY, history_id TEXT, last_full_sync_at TEXT)

// gmailService.ts
export async function archiveMessage(messageId: string, sourceAccount?: string): Promise<void>;
export async function modifyLabels(messageId: string, add: string[], remove: string[], sourceAccount?: string): Promise<void>;
export async function markAsRead(messageId: string, sourceAccount?: string): Promise<void>;
// sourceAccount is the mailbox email string (set at gmailService.ts:188). getGmailClientForAccount
// takes a LinkedGoogleAccount (gmailService.ts:36), so resolve first:
//   const acct = sourceAccount ? listGmailAccounts().find(a => a.email === sourceAccount) : undefined;
//   const gmail = acct ? await getGmailClientForAccount(acct) : await getGmailClient();
// sourceAccount set but no linked account matches → throw (do NOT fall back to the default mailbox).

// history cursor (D9) — exact call; history is a change log, not current state:
//   gmail.users.history.list({ userId: 'me', startHistoryId, historyTypes: ['messageAdded'], labelId: 'UNREAD' })
// then messages.get each id and skip any that no longer carry UNREAD (read/archived since).
// 404 / invalid startHistoryId → full `is:unread` list (today's path) and store the new historyId.

// googleOAuthAccountStore.ts
export type GoogleAccountStatus = 'ok' | 'needs_reauth' | 'rate_limited';
// plus rate_limited_until TEXT on the account row
```

**Change.**
- 4a Keep the Map as the read cache; write through `upsertInboxItem` on every create/status change; call `loadInboxItems()` at startup before `startFetcher`. No migration of existing data (none is persisted today). **Never** delete rows; `DELETE /api/inbox/:id` keeps today's semantics (status change + Gmail archive — confirm by reading `inboxRoutes.ts:198-240` before touching it).
- 4b Replace `processedIds` with `gmail_processed` keyed by `consumer` (`'inbox'` | `'tasks'`) so `/api/tasks/gmail-sync` stops consuming mail from Inbox Zero (report §2.2). Persist `history_id` per account; steady-state cycles use the history call exactly as in the contract above; on 404/expired cursor fall back to today's `is:unread` list and store the fresh `historyId` (D9).
- Residual risk to accept or tune (Ilya): since plan 061 the DB is on local disk with verified snapshots every `DWELLIUM_SNAPSHOT_INTERVAL_MIN` (default 10) and on SIGTERM (`services/dataSnapshot.ts:19`). An ungraceful container kill can lose up to one interval of inbox writes; dedupe then re-ingests still-unread mail, and approvals/archives in that window are lost.
- 4c Thread `item.sourceAccount` into every archive/label/read call in `inboxRoutes.ts` (`:174,217,337` and the read/bulk paths).
- 4d On Gmail 429 or 403 with a quota reason: set `rate_limited` with `rate_limited_until = now + min(2^n × 60 s, 1 h)`; skip that account until then; surface it next to `needs_reauth` in `statusRoutes.ts` (D10).
- 4e **(G2 = owner-only, 2026-09-24)** Owner scoping. As built: `InboxViewer { userId, seeAll }` from `inboxViewerFor(req.user)` (god → seeAll) is a required argument of every inboxStore read/mutation, so the compiler lists every caller; ARA's inbox context and system-health counts, `/api/gmail/fetch` and `/api/tasks/gmail-sync` are scoped the same way. Owner-only: set `owner_user_id` at ingest from the user who linked `sourceAccount`, filter every `inboxStore` read by `req.user` (god sees all), and scope `/api/gmail/fetch` to the caller's accounts. Shared: write the decision in a comment at `inboxRoutes.ts:35` and move `widget:inbox*` out of `ALWAYS_ON` (`permissionsService.ts:208-212`) so access is an explicit grant.
- 4f Read `process.env.GMAIL_POLL_INTERVAL_MS` inside each cycle: re-arm a `setTimeout` per cycle instead of a fixed `setInterval`.
- 4g Remove the `GET/PUT /api/inbox/settings` routes (no callers after 2e — grep both repos first). Leave the `inbox_settings` table in place (no DROP).
- 4h `GET /api/inbox` returns `snippet` but not `body`; add `GET /api/inbox/:id/body` → `{ success, data: { body, subject, sender, attachments } }` (two segments, so it does not collide with `/:id`, but register it with the other `/:id/*` routes for readability). List consumers that read `body`: InboxZero's two viewer buttons (`InboxZero.tsx:1111,1193`, already fall back), the triage card iframe (`InboxZero.tsx:1143` → use the fetched body or the snippet), and **CommandPalette**, which fetches `${INBOX_API}?limit=80` (`CommandPalette.tsx:706`) and scores ⌘K matches on `item.body` (`:272,318`). Switch CommandPalette's scoring to `subject`/`sender`/`snippet` and add a test for that scoring (none exists). ARA's daily glance only reads `/stats` (`lib/araDailyGlance.ts:79`), so it is unaffected. Grep the backend (`araChatEngine.ts` inbox tools) for list-body reads too; they call the store directly and keep full items.
- 4i Delete dead `seedDemoData`/`shouldSeedDemoData` (`app.ts:588-773`).

**Tests:** restart survival (upsert → reset module → `loadInboxItems()` returns the item); no duplicates after restart + fetch (D16a); archive of a secondary-account item calls the per-account client and not the default (mock both, D16b); history cursor happy path + expired-cursor fallback; 429 → `rate_limited` and the account is skipped next cycle; list response has no `body`; `/:id/body` returns it and 404s for unknown ids. Keep `tests/gmailMultiAccountFetch.test.ts` green.

**Size.** L (~400 lines + tests); split into two PRs: 4a–4d+4f (durability/accounts) and 4g–4i (API shape). **Verify:** backend gate; local: kickstart, `curl -s 'http://[::1]:3000/api/inbox?limit=1' | python3 -c 'import sys,json; d=json.load(sys.stdin)["data"]; print([k for k in (d[0] if d else {})])'` shows no `body` key; restart the backend and confirm `pagination.total` is unchanged.
**STOP** if production's `DWELLIUM_DATA_DIR` is not the local-disk path set by the plan-061 cutover (`Docs/code.md` 2026-09-19 entry; `SNAPSHOT_CUTOVER=1`, DB under `/var/dwellium-local/data`). SQLite never goes on gcsfuse. Check with Ilya — agents do not run gcloud.

---

## Phase 5 — Revive what earns its place, natively (order per G1; each step ships alone)

Each step = one backend route set + remount/repoint one frontend piece. Frontend calls go to
`INBOX_API` (`config/api.ts:14`), never `/api/v1`. Register literal paths before `router.get('/:id')`.

| Step | Backend (in `inboxRoutes.ts` unless noted) | Frontend | Size |
|---|---|---|---|
| 5a Undo / recover | `PUT /:id/status {status:'pending', reason}` → if archived, `modifyLabels(id, ['INBOX'], [], sourceAccount)`; audit row both ways (D11) | Restore one Undo toast after archive (session-only, no "persistent" claim); `res.ok` checked | S–M |
| 5b Global audit feed | `GET /audit/global?limit&offset` over `inbox_audit_log` (`inboxStore.ts:296-341`), newest first, with pagination | Remount `GlobalAuditTab` with `apiBase={INBOX_API}` (was `API_BASE`, `InboxZero.tsx:1607`); its Recover uses 5a | S |
| 5c Rules | `GET/POST /rules`, `PUT/DELETE /rules/:id` over `routingRulesEngine.getRules/addRule/updateRule/removeRule` (`agents/routingRules.ts:281-307`); validate regex before save (a bad rule must not crash `evaluate`) | Remount a slim `RulesManager`: CRUD only, pointed at `${INBOX_API}/rules`; delete the prompt-to-rule, knowledge-base and provider panels unless their backend exists | M |
| 5d Newsletter unsubscribe | Capture `List-Unsubscribe` and `List-Unsubscribe-Post` in the Gmail parse (`getHeader`, `gmailService.ts:90-91`, returns the raw value) onto the item. Parse `List-Unsubscribe` as a comma-separated list of `<…>` URIs (RFC 2369). `PATCH /newsletters/:sender/unsubscribe`: if `List-Unsubscribe-Post: List-Unsubscribe=One-Click` is present and an `https:` URI exists → server-side POST to that URI with form-urlencoded body exactly `List-Unsubscribe=One-Click` (RFC 8058; 10 s timeout, no redirects to non-https). Otherwise return `{ method:'url'\|'mailto'\|'none', target }` (first https, else first mailto) for the user to open. Set `unsubscribed` (`inboxStore.ts:244`). Never send email | Restore the button; show the result honestly ("Unsubscribed" / "Open link to finish" / "No unsubscribe link") | M |
| 5e Snooze | `POST /:id/snooze {until}` → status `snoozed` + `snoozed_until` (persisted, Phase 4); each fetch cycle resurfaces due items to `pending` | Snooze menu: 1h / 4h / 1d / 1w; `res.ok` checked | M |
| 5f AI draft reply | `POST /:id/draft` → the existing LLM router path (`/api/llm` backend leg) with the item body; returns `{ subject, body, confidence }`; **never sends** | Remount only SmartActions' draft panel + the tested handoff (`inboxLinkage.ts`) to Scribe/ARA/Stella; delete templates/batch/extract panels unless G1 adds them | M |
| 5g Reply tracking (only if G1) | New `reply_tracking` table; scan `SENT` threads for no reply after N days | Restore `ReplyTracker.tsx` from `c0814a3`, repoint to `${INBOX_API}/replies` | L |

Not planned: open-pixel tracking (privacy cost, not an upstream feature), NIF adaptive thresholds,
the six analytics dashboards, and the cold-email blocker. The blocker auto-archives, so it needs
D11/D12 (global kill switch default OFF, per-rule threshold, undo) designed first. Revisit after 5c.

**Tests per step:** backend supertest for each route (happy path, 404 unknown id, permission 403);
frontend test that the remounted tab calls the new path and renders the server's error on 500.
**Verify per step:** gates; local curl of the new GET routes on `[::1]:3000`; preview click-through.

### Phase 5 execution contract (2026-09-24; G1 unanswered → default 5a–5f, 5g deferred)

Branches: backend `feat/066-inbox-backend-p5` (stacked on p4), frontend `feat/066-inbox-zero-p5`.
Owner-only (G2) applies to every new route: resolve `inboxViewerFor(req.user)` first; an item the
viewer cannot see is a 404, never a leak. Pre-seeded (orchestrator, already in the tree): backend
`InboxStatus` gains `'snoozed'`; `InboxItem` gains `snoozedUntil?`, `listUnsubscribe?`,
`listUnsubscribePost?`, `unsubscribedAt?` (all ISO strings / raw header strings); `EmailMessage`
gains `listUnsubscribe?`, `listUnsubscribePost?`; frontend `TabId` gains `'rules' | 'audit'`.

Decisions taken here (defaults, flagged in the PR):
- **Rules are global config** (one rule set routes everyone's mail). Reads: any inbox user. Writes
  (POST/PUT/DELETE): `requireRole('god')`, so one user cannot re-route another user's mail.
- **Rules persist in SQLite**, not `./data/routing-rules.json` (that file is outside the plan-061
  snapshot, so production edits were lost on every deploy). Stored as ONE row in the existing
  `inbox_settings` table, key `routing_rules`, value = JSON array. Row absent → first boot imports
  `ROUTING_RULES_FILE` if it exists, else `DEFAULT_RULES`, then writes the row. Row present (even
  `[]`) → use it; deleting every rule never resurrects the defaults.
- **Undo is Gmail-first**: if re-adding the `INBOX` label fails, the status does NOT change and the
  route returns 502 (the UI shows the failure). No half-restored state.
- **Unsubscribe one-click POST** goes through a DNS-pinned `https.request` whose `lookup` rejects
  private/loopback/link-local/CGNAT/metadata addresses (`net.BlockList`), port 443 only, no
  redirects followed, 10 s timeout, no cookies/auth. The URI comes from an email header — it is
  attacker-controlled.
- **Draft** uses `OPENAI_API_KEY` + `openaiChatParams` (same leg as `/api/llm/route`); no key → 503
  with a plain message. Never sends. The handoff copies the draft to the clipboard, then opens the
  target widget (the bus carries no payload), and says so in the toast.

**Backend module contracts**
```ts
// src/stores/inboxStore.ts  (B1)
export function restoreItem(viewer: InboxViewer, id: string): InboxItem | undefined;   // any status → 'pending', clears snoozedUntil; upsert
export function snoozeItem(viewer: InboxViewer, id: string, until: Date): InboxItem | undefined; // status 'snoozed', snoozedUntil = until.toISOString(); upsert
export function resurfaceDueSnoozes(now?: Date): number;  // every 'snoozed' item with snoozedUntil <= now → 'pending'; upsert each; returns count
//   called at the top of getInboxItems, getInboxStats and getInboxItem (read paths always run; the Gmail fetcher may not)
export function getGlobalAuditLog(viewer: InboxViewer, opts: { limit: number; offset: number }):
    { entries: Array<{ id: string; inbox_item_id: string; action: string; actor: string | null; reason: string | null;
                        details: string; created_at: string; subject: string | null }>; total: number };
//   inbox_audit_log LEFT JOIN inbox_items; non-god sees only rows whose item.owner_user_id = viewer.userId;
//   ORDER BY created_at DESC, rowid DESC; subject = json_extract(i.data, '$.subject')
export function findUnsubscribeSource(viewer: InboxViewer, sender: string): InboxItem | undefined; // newest visible item from `sender` with listUnsubscribe set
export function markSenderUnsubscribed(viewer: InboxViewer, sender: string, at?: Date): number;     // sets unsubscribedAt on every visible item from sender; upsert; returns count
// getNewsletterSenders: unsubscribed = some visible item from that sender has unsubscribedAt
// getInboxStats: add `snoozed: number`; `pending` excludes snoozed (it already counts status === 'pending' only)
// processIncomingEmails: copy email.listUnsubscribe / listUnsubscribePost onto the item (both paths)
// logInboxAction action union adds: 'restore' | 'snooze' | 'unsubscribe' | 'draft' | 'rule_create' | 'rule_update' | 'rule_delete'
//   (rule_* rows use inboxItemId = the rule id)

// src/services/gmailService.ts  (B1, parse only)
//   listUnsubscribe: getHeader('List-Unsubscribe') || undefined; listUnsubscribePost: getHeader('List-Unsubscribe-Post') || undefined

// src/agents/routingRules.ts  (B2)
export type RuleInput = Omit<RoutingRule, 'id'>;
export function validateRule(input: unknown, partial: boolean): { ok: true; value: Partial<RuleInput> } | { ok: false; error: string };
//   name 1–100 chars; field ∈ subject|sender|body|any; pattern 1–500 chars AND `new RegExp(pattern, 'i')` compiles;
//   targetProjectId 1–100 chars; urgency ∈ high|medium|low; priority integer 0–1000; enabled boolean;
//   partial=false → all fields required; unknown keys ignored; `id` never accepted from input
// class RoutingRulesEngine: getRules(); addRule(input: RuleInput): RoutingRule (id = `rule-${uuid}`);
//   updateRule(id, updates: Partial<RuleInput>): RoutingRule | undefined; removeRule(id): boolean;
//   evaluate(): a rule whose pattern throws is SKIPPED (console.warn once per rule id), never crashes routing.
//   Persistence per the decision above (import { database } from '../services/database').

// src/services/listUnsubscribe.ts  (B2, new)
export function parseListUnsubscribe(header: string | undefined): { https: string[]; mailto: string[] };
//   RFC 2369: comma-separated <…> URIs; keep only https: and mailto: (drop http:, javascript:, anything else)
export function isOneClick(postHeader: string | undefined): boolean; // /^\s*List-Unsubscribe=One-Click\s*$/i
export async function oneClickUnsubscribe(url: string, deps?: { request?: typeof import('https').request }):
    Promise<{ ok: true; status: number } | { ok: false; error: string }>;
//   POST, body exactly 'List-Unsubscribe=One-Click', Content-Type application/x-www-form-urlencoded,
//   https only, port 443 only, DNS-pinned lookup rejecting non-public addresses, 10 s timeout,
//   3xx = failure (not followed), 2xx = ok.
export async function unsubscribe(item: Pick<InboxItem, 'listUnsubscribe' | 'listUnsubscribePost'>):
    Promise<{ method: 'one-click'; ok: true } | { method: 'url' | 'mailto'; target: string } | { method: 'none' }>;
//   one-click when isOneClick && an https URI exists AND the POST succeeds; otherwise first https → 'url',
//   else first mailto → 'mailto', else 'none'. Never sends email.

// src/services/inboxDraft.ts  (B2, new)
export async function draftReply(item: Pick<InboxItem, 'subject' | 'sender' | 'body' | 'snippet'>, instruction?: string):
    Promise<{ ok: true; draft: { subject: string; body: string; confidence: number } } | { ok: false; status: 502 | 503; error: string }>;
//   no OPENAI_API_KEY → 503 'AI drafting needs an OpenAI key on the server'; body → plain text (strip tags), max 8000 chars;
//   instruction max 500 chars; json response; confidence clamped 0–1; malformed output or HTTP error → 502; 30 s timeout.
```

**Backend routes** (`src/routes/inboxRoutes.ts`, B3; literal paths registered BEFORE `router.get('/:id')`)
| Route | Behavior |
|---|---|
| `GET /rules` | `{ success, data: RoutingRule[] }` |
| `POST /rules` (god) | `validateRule(body, false)` → 400 `{error}` or 201 `{data: rule}`; audit `rule_create` |
| `PUT /rules/:id` (god) | `validateRule(body, true)` → 400 / 404 / 200 `{data: rule}`; audit `rule_update` |
| `DELETE /rules/:id` (god) | 404 / 200; audit `rule_delete` |
| `GET /audit/global?limit&offset` | limit: positive int, default 50, max 200; offset ≥ 0; `{ success, data: entries, pagination: {total, limit, offset, hasMore} }` |
| `PATCH /newsletters/:sender/unsubscribe` | `:sender` is URL-encoded; no visible item from sender → 404; no header → `{ success, data: {method:'none'} }`; one-click ok → `markSenderUnsubscribed`, audit `unsubscribe`, `{method:'one-click'}`; else `{method:'url'|'mailto', target}` |
| `PUT /:id/status` | body `{status:'pending', reason?}` — any other status → 400; 404 unseen; already pending → 200 no-op; previous status archived/deleted AND gmail source → `modifyLabels(item.sourceId, ['INBOX'], [], item.sourceAccount, item.ownerUserId)` FIRST, failure → 502 + audit `restore {success:false}`, status unchanged; then `restoreItem`, audit `restore {from}`; `{ data: withoutBody(item) }` |
| `POST /:id/snooze` | body `{until}` ISO, must parse, be in the future, ≤ 366 days out → else 400; 404 unseen; `snoozeItem`; audit `snooze`; `{ data: withoutBody(item) }` |
| `POST /:id/draft` | body `{instruction?}`; 404 unseen; `draftReply` → 200 `{data:{subject,body,confidence}}` / 502 / 503; audit `draft {confidence}` on success (never the text) |

**Frontend contracts**
```tsx
// GlobalAuditTab.tsx (F5) — props unchanged: { apiBase: string; authFetch?: AuthFetch }
//   GET `${apiBase}/audit/global?limit=50&offset=N`, "Load more" while hasMore; shows subject;
//   View → GET `${apiBase}/${id}` + `${apiBase}/${id}/body`; Recover only for action ∈ archive|bulk_archive|delete|snooze,
//   PUT `${apiBase}/${id}/status {status:'pending', reason:'Recovered from audit log'}`; non-2xx or success:false → error toast with server error
// RulesManager.tsx (F5) — export default function RulesManager(props: { apiBase: string; authFetch: AuthFetch; canEdit: boolean })
//   CRUD only against `${apiBase}/rules` (list / add / edit / delete / enable toggle via PUT {enabled});
//   prompt-to-rule, stats, knowledge and AI-provider panels DELETED; canEdit=false → read-only list, no write buttons;
//   the server's 400 `error` is shown inline
// SmartActions.tsx (F5) — reduced to: export function DraftReplyPanel(props: { itemId: string; apiBase: string; authFetch: AuthFetch })
//   POST `${apiBase}/${itemId}/draft {instruction?}`; renders subject/body as TEXT (never HTML) + confidence;
//   503/502 → the server's error inline; handoff buttons = getDraftHandoffs(draft) → copy body to clipboard, then openWidgetHandoff,
//   toast "Draft copied — paste it into <label target>"; templates/batch/extract/workitem code DELETED
// NewslettersTab.tsx (F5) — props unchanged; restores an Unsubscribe button per sender (hidden when nl.unsubscribed → "Unsubscribed" badge)
//   PATCH `${inboxApiBase}/newsletters/${encodeURIComponent(sender)}/unsubscribe`;
//   one-click → toast "Unsubscribed", onRefresh(); url|mailto → window.open(target,'_blank','noopener,noreferrer') ONLY if target starts
//   with https: or mailto:, toast "Open link to finish"; none → toast "No unsubscribe link"; failure → error toast
// InboxZero.tsx (F4) — IZ_TABS/tab list gain 'rules' (label "Rules") and 'audit' (label "Audit");
//   <RulesManager apiBase={INBOX_API} authFetch={authFetch} canEdit={isGod} />, <GlobalAuditTab apiBase={INBOX_API} authFetch={authFetch} />;
//   5a: after a successful archive or delete, one session-only toast bar "Archived “subject” · Undo" (8 s; one at a time) →
//       PUT `${INBOX_API}/${id}/status`; mutationFailed() on failure; success → refetch items/stats;
//   5e: Snooze control on each triage card (1h / 4h / 1 day / 1 week) → POST `${INBOX_API}/${id}/snooze {until}`; mutationFailed(); refetch;
//   5f: expanded card gets "Draft reply" → mounts <DraftReplyPanel itemId apiBase={INBOX_API} authFetch />
```
Tests: backend `tests/inboxPhase5Store.test.ts` (B1), `tests/routingRulesStore.test.ts`,
`tests/listUnsubscribe.test.ts`, `tests/inboxDraft.test.ts` (B2), `tests/inboxPhase5Routes.test.ts`
(B3: every route's happy path, 404 for another owner's item, 403 without `widget:inbox`, 403 rule write
as non-god); frontend `src/test/inboxPhase5Tabs.test.tsx` (F5), `src/test/InboxZero.test.tsx` (F4).
Mutation-check each security test (remove the guard → the test fails).

---

## Phase 6 — Stop the drift (both repos)

- 6a Backend `tests/inboxContract.test.ts`: a literal array of every `(method, path)` the frontend calls under `/api/inbox` and `/api/gmail` — collect from **all** of `qualia-shell/src` (not just `components/InboxZero`; CommandPalette, Astra, Strata work orders and ComplianceEngine call these too) with `grep -rnoE "(INBOX_API|/api/inbox|/api/gmail)[^'\`\"]*" qualia-shell/src | grep -v /test/` — each asserted `!== 404` through the harness. Comment at the top: "add a row when the widget calls a new endpoint". This is the check that would have caught all eight dead tabs.
- 6b Fix the jsx-a11y errors in `InboxZero.tsx`: triage card main → `<button>` (`:1012`), label associations, a document-level Escape handler while the viewer is open (`:1449-1467`). Target: 0 jsx-a11y errors in `components/InboxZero`.
- 6c Extract the Settings tab (`InboxZero.tsx:1686-2422`) into `SettingsTab.tsx` with no behavior change (G4 decides whether it later moves to Control Panel).
- 6d Replace raw hex colors in inline styles on the lines 6b/6c touch with existing tokens (`--bg-surface`, `--border-default`, …).

**Size.** M. **Verify:** gates; `npx eslint src/components/InboxZero` → 0 errors.

---

## Phase 7 — Upstream integration (gated on G5; no work by default)

Options from the audit: (a) native (this plan), (b) iframe the local upstream (rejected: second data
plane, no D6 owner scoping, weakest license posture), (c) proxy upstream's API/MCP from the backend
like Documenso/Listmonk. Option (c) is only on the table if G5 confirms the Inbox Zero Inc. rider
(no commercial monetization; enterprise license at 5+ business users) does not apply, and after a
read-only check that the running image exposes the MCP/API. Until then, nothing.

### Phase 7 read-only check (2026-09-24) and the scope Ilya chose

G5 answered: under 5 business users, not sold → the rider exemption applies. Findings (container
`inbox-zero-services-web-1`, image built 2026-08-24, rev `70dfe79`; source clone `~/dev/inbox-zero` @ `d45588b`;
each cross-checked by a second agent):
- **No MCP server.** `api/mcp/*` is upstream acting as an MCP *client* (Notion, Stripe, …).
- **Public API = 7 endpoints**: `/api/v1/rules` CRUD, `GET /api/v1/stats/by-period`, `GET /api/v1/stats/response-time`
  (+ `/api/v1/openapi`). Header `API-Key` (`apps/web/utils/api-auth.ts:10`), one key per upstream email account.
  Reply tracking, cold-email and sender groups are internal session routes — not proxyable.
- The API reads the mailbox **upstream itself OAuth-linked**, never Dwellium's accounts; self-hosted needs
  `NEXT_PUBLIC_EXTERNAL_API_ENABLED=true` (off by default).
- The running container currently **500s every API route** ("Invalid environment variables" at startup).
- `localhost:3000` on the Mac is the Dwellium backend; the container is only reachable via colima's `*:3000` forward (G6).

**Ilya's choice: a per-user stats proxy** (response-time + by-period in the Stats tab). Rules stay native (5c).

**Phase 7 execution contract**
```ts
// backend src/services/inboxZeroUpstream.ts (new)
export const UPSTREAM_API_KEY_HEADER = 'API-Key';
export function upstreamBaseUrl(): string | null;   // env INBOX_ZERO_API_URL; http(s) only, trailing '/' stripped; else null
export function saveUpstreamKey(userId: string, apiKey: string): void;   // upsert table inbox_upstream_keys(user_id PK, api_key TEXT = encryptForDomain('astra', key), updated_at)
export function hasUpstreamKey(userId: string): boolean;
export function removeUpstreamKey(userId: string): boolean;            // the user's own key only (their UI action)
export async function fetchUpstreamStats(userId: string, kind: 'by-period' | 'response-time',
    query: { period?: 'day' | 'week' | 'month' | 'year'; fromDate?: number; toDate?: number }):
    Promise<{ ok: true; data: unknown } | { ok: false; status: 400 | 409 | 502 | 503 | 504; error: string; needsSetup?: true; needsKey?: true }>;
//   no base URL → 503 needsSetup; no key → 409 needsKey; GET `${base}/api/v1/stats/${kind}?…` with API-Key, 10 s timeout,
//   redirect:'manual' (3xx → 502); upstream 400 → 400; upstream 401/403 → 502 'Upstream rejected your API key'
//   (NEVER 401/403 from Dwellium — the app treats those as "sign out"); other failure → 502; timeout → 504; body cap 1 MB.
```
Routes (`inboxRoutes.ts`, before `/:id`): `GET /upstream/status` → `{configured, hasKey}`; `PUT /upstream/key {apiKey}`
(string 10–512 chars, no whitespace → 400) → `{hasKey:true}`; `DELETE /upstream/key`; `GET /upstream/stats/by-period`,
`GET /upstream/stats/response-time` (query whitelisted: period enum, fromDate/toDate integer ms). Owner-only by
construction: every call uses the CALLER's key. The key is never logged or returned. Audit rows `upstream_key_set` /
`upstream_key_remove` (inboxItemId = `upstream-key:<userId>`, no key material). Contract-test rows for all five.
Frontend: `UpstreamStats.tsx` in the Stats tab — honest states: server not configured / no key (password field + Save,
"create a key in Inbox Zero → Settings → API keys") / data (median + average response time, % within 1 h, emails
analyzed, distribution, by-period table) / upstream error (the server's message). Remove key behind a confirm.
Production (Cloud Run) cannot reach a Mac-local container, so it shows "not configured" there until a reachable
upstream exists.

---

## Execution — ruflo swarm by file ownership

`swarm_init` + `agent_spawn` register the agents; the work runs as Claude Code subagents
(`ruflo-core:coder`, `ruflo-core:reviewer`). One worktree per repo off `main`:
`.claude/worktrees/066-inbox-zero` (symlink `qualia-shell/node_modules`) and a backend branch
`feat/066-inbox-backend`. Parallel agents own disjoint files, ignore type errors in files they do
not own, and never run git writes. The orchestrator reads every wave's diff, runs the gates, and
commits between waves.

| Wave | Agents (parallel within a wave) | Owns |
|---|---|---|
| W1 | **B1** Phase 1 | backend `app.ts`, `gmailSendRoute.ts`, `taskRoutes.ts`, `inboxStore.ts` (settings + search fns only), `inboxRoutes.ts` (GET `/` only), new tests |
| W1 | **F1** Phase 2 | `components/InboxZero/**`, `components/InboxWidget/**`, `services/emailRouter.ts`, `UniversalShell/adapters/StrataMaintenanceAdapter.tsx`, `test/InboxZero.test.tsx` |
| W1 | **F2** Phase 3 | `registry/widgetRegistry.ts`, `lib/sessionRestoreStore.ts`, `CommandPalette/CommandPalette.tsx` (line 1029 only), `Sidebar/widgetSearch.ts`, `Shell/*` lookup sites, `PopupShell.tsx`, saved-layout store, `test/sessionRestore.test.tsx` + registry tests |
| W2 | **B2** Phase 4 (one integrator; the files overlap) | `inboxStore.ts`, `gmailService.ts`, `googleOAuthAccountStore.ts`, `statusRoutes.ts`, `inboxRoutes.ts`, `taskRoutes.ts`, `app.ts` (seed removal), tests |
| W2 | **F3** Phase 4h frontend + 6c/6d | `InboxZero.tsx` (triage iframe body source), `CommandPalette.tsx` (inbox scoring), new `SettingsTab.tsx`, new CommandPalette scoring test |
| W3 | **B3** backend half of 5a–5f · **F4** frontend half (one agent: `InboxZero.tsx` + remounted tabs) | per the Phase 5 table |
| W4 | **R1** adversarial reviewer · **B4** 6a contract test · **F5** 6b a11y | reviewer is read-only |

Reviewer brief (W4) — try to break: a restored `'inbox-zero'` window; archive of a secondary-account
item; restart mid-cycle then fetch (duplicates?); expired `historyId`; unauthenticated
`/api/gmail/fetch` with `AUTH_ENABLED=true`; search with regex metacharacters; undo after the Gmail
label call fails; a rule with an invalid regex; unsubscribe on a sender with only `mailto:`; any
success toast shown on a non-2xx.

## Definition of done (whole plan)

- Every endpoint the widget calls is in `tests/inboxContract.test.ts` and returns non-404.
- No tab, button or capability claim without a working backend path; failures are visible.
- `'inbox-zero'` gone from the registry; restored layouts still open Inbox Zero.
- Inbox state and dedupe survive a backend restart; secondary-account actions hit the right mailbox.
- `/api/gmail/*` requires a session in production.
- Full frontend gate and backend jest green on the final commits; `Docs/code.md` entries appended;
  `plans/README.md` row added with status.
