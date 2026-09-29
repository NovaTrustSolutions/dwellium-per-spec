# Inbox Zero widget — capabilities, defects, and improvement report

**Date:** 2026-09-24 · **Audited:** frontend `c0814a3` (main), backend `9a1e935` (main)
**Method:** read-only ruflo swarm (`swarm-1790225917687-0p31w7`, 12 agents: 5 code mappers by file
ownership, 1 upstream comparison, 1 runtime probe, 5 adversarial verifiers), then orchestrator
spot-checks of every high-severity claim. ruflo registered the agents; the work ran as Claude Code
subagents (ruflo's `agent_spawn` only registers — it does not execute).
**Plan:** [`plans/066-inbox-zero-consolidation.md`](../plans/066-inbox-zero-consolidation.md)

---

## 1. Verdict

"Inbox Zero (deprecated)" is not a separate widget. It is a second registry id for the same
component: `'inbox'` (`qualia-shell/src/registry/widgetRegistry.ts:266`) and `'inbox-zero'`
(`:300`, `tier: 'labs'`) both lazy-load `components/InboxZero/InboxZero.tsx`. Auditing the
deprecated widget therefore means auditing the live one.

Of its **13 tabs, 3 work, 2 partly work, 8 are dead** — they call backend routes that have never
existed, and most fail silently. On the working Triage tab, **search, snooze, undo, bulk label and
bulk AI-classify do nothing** (undo reports success anyway). The backend keeps every inbox item
**in memory only**, archives secondary-account mail with the **default account's** client, and
leaves **`/api/gmail/fetch` and `/api/gmail/test` unauthenticated**.

The core loop is solid: Gmail fetch → NIF/rules/LLM classification → triage → approve (creates a
Task) / archive (Gmail label, never a hard delete) / link to Strata / per-item audit trail. That
loop is worth keeping; most of what surrounds it is decoration.

The "successor" named in the deprecation comment, `src/services/emailRouter.ts`, is inert: nothing
calls `routeEmail()`, it is gated off by a window flag nobody sets, and it fetches the same
non-existent `/api/v1/inbox/rules`.

The 2026-07-06 review (`Docs/InboxZero_Plan_Review.md`) diagnosed most of this and prescribed
"cut the dead tabs first" (D5). None of D5, D6, D8–D12 has been implemented.

---

## 2. Capability inventory

Status: **live** = works end to end · **partial** = works with a gap · **dead** = calls a missing
route or does nothing. Frontend paths are under `qualia-shell/src/`; backend paths under
`ai-dashboard369-file-manager/src/`.

### 2.1 Tabs (tab list at `components/InboxZero/InboxZero.tsx:684-697`)

| Tab | Status | What it does / why not | Evidence |
|---|---|---|---|
| Triage | **partial** | List, signal filter, sort, expand, approve / approve & route, archive, delete, retry Gmail, link to Strata (9 target types), per-item audit, bulk archive, load-more, sanitized sandboxed body iframe, multi-account badge, 3-way empty/error/rate-limited state. Search, snooze, undo, bulk label, bulk AI classify are dead (§3.2). | `InboxZero.tsx:719-1445`; backend `routes/inboxRoutes.ts:43-364` |
| Newsletters | **partial** | Sender list + read-rate works (`GET /api/inbox/newsletters`). "Unsubscribe" calls a route that does not exist. | `NewslettersTab.tsx:49-67`; `inboxRoutes.ts:101` |
| Stats | live | Donut, progress bar, signal ratio, 6 operator metrics from `/stats` + `/metrics`. | `StatsTab.tsx`; `inboxRoutes.ts:66,74` |
| Rules | dead | Rule CRUD + prompt-to-rule UI → `/api/v1/inbox/rules` (no `/api/v1` mount exists). | `RulesManager.tsx:16` |
| NIF Intel | dead | Feedback, sender reputation, adaptive thresholds → `/api/v1/inbox/nif`. | `NifIntelligence.tsx:16` |
| Actions | dead | Reply templates, AI draft, calendar extraction, create work item, batch route/assign → `/api/inbox/actions/*` (not implemented). | `SmartActions.tsx:17,148-329` |
| Analytics | dead | Six dashboards → `/api/v1/inbox/analytics`. | `AnalyticsDashboard.tsx:17` |
| Cold Block | dead | Cold-email scoring/log/config → `/api/v1/inbox/cold-email/*`; failures swallowed by `catch { /* silent */ }`. | `ColdEmailBlocker.tsx:48-95` |
| Replies | dead | Reply tracking (8 calls) → `/api/v1/inbox/replies*`; failures swallowed. | `ReplyTracker.tsx:73-164` |
| Tracker | dead | Email-open pixel tracking → `/api/inbox/tracker/*` (not implemented). Not an upstream feature. | `OpenTracker.tsx:39,52,76,190` |
| Audit Log | dead | Global audit feed → passed the bare origin instead of `INBOX_API`, so it requests `/audit/global`; that route does not exist under any prefix either. | `InboxZero.tsx:1607`; `GlobalAuditTab.tsx:33,47,61` |
| Capabilities | static, **misleading** | Hand-written feature matrix. Marks as `live`: SSE real-time updates (it polls every 60 s), a 30-second undo window, 1h/4h/1d/1w snooze, `/api/v1` versioning and "40+ v1 routes". The on/off toggle gates nothing and exists as two unsynced `useState` copies. | `InboxZeroTypes.ts:168-285`; `CapabilitiesTab.tsx`; `InboxZero.tsx:164,190` |
| Settings | partial | AI/Gmail/Trello/Drive/Security fields via `/api/settings`, app-wide theme pickers, god-only RBAC editor, Legal Shield check, LLM-safety log. Mostly app-wide settings living inside an email widget. | `InboxZero.tsx:1686-2422` |

Runtime confirmation (probe, local backend on `127.0.0.1:3000` and `[::1]:3000`, GET only):
`/api/inbox`, `/stats`, `/metrics`, `/settings`, `/newsletters` → 200; all nine `/api/v1/inbox/*`
paths the frontend calls → 404. The Vite proxy (`vite.config.ts:238-241`) and Netlify redirects
(`scripts/write-netlify-redirects.mjs:17-19`) forward all of `/api/*`, so this is a missing route
set, not a routing gap.

### 2.2 Backend pipeline

| Capability | Status | Evidence |
|---|---|---|
| Multi-account Gmail fetch (per-account OAuth client, `sourceAccount` tag, one failing mailbox skipped) | live | `services/gmailService.ts:181-194` |
| Poller (default 15 min, `GMAIL_FETCHER_ENABLED=true` opt-in) | partial — full `is:unread` refetch every cycle, no `historyId`; dedupe Set in memory, capped | `gmailService.ts:125-136,272,317` |
| Classification: regex NIF → 19 default regex rules (JSON-persisted) → optional OpenAI pass → else `unrouted` | live | `agents/nif.ts`, `agents/routingRules.ts:11,246`, `agents/ara.ts:89-278` |
| Rules engine CRUD methods (`getRules/addRule/updateRule/removeRule`) | exists, **no HTTP route** | `routingRules.ts:281-307` |
| Approve → Task; archive → Gmail label removal; delete; bulk archive; mark read; retry | live | `inboxRoutes.ts:124-278,329` |
| Strata thread links + per-item audit (SQLite) | live | `stores/inboxStore.ts:296-388` |
| Inbox items storage | **in-memory `Map`** — lost on every restart | `inboxStore.ts:14` |
| Archive / label / mark-read for a non-default linked account | **wrong account** — uses the default client | `gmailService.ts:199-262` |
| Owner scoping | **none** — one global Map; gated only by `widget:inbox`/`widget:inbox-zero`, which are `ALWAYS_ON` for non-tenant roles | `inboxRoutes.ts:35`; `services/permissionsService.ts:208-212` |
| `needs_reauth` on `invalid_grant`; tokens AES-encrypted at rest | live | `services/googleAuth.ts:21-31,161-177`; `services/googleOAuthAccountStore.ts:29-69` |
| `rate_limited` account state / quota backoff | missing | `googleOAuthAccountStore.ts:203` (`'ok' \| 'needs_reauth'` only) |
| Auto-archive / confidence gate / undo | missing — every item lands `pending` | `inboxStore.ts:47` |
| `/api/inbox/settings` (SQLite, 5 keys) | dead config — no code reads any key; only caller was the orphaned `InboxWidget` | `inboxStore.ts:330-336,445-450` |
| `/api/tasks/gmail-sync` | a second Gmail ingestion path sharing the same dedupe Set, bypassing NIF/audit; fabricates 5 demo tasks on Gmail error outside production by default | `routes/taskRoutes.ts:31-35,67-99` |

### 2.3 Cross-widget integration

Stella (`stellaLinkage.ts:38`, `stellaToolCatalog.ts:312`), ARA (`araLinkage.ts:35-38`),
`dwelliumCommands.ts:35`, `hierarchy.ts:25,73`, `defaultStack.ts:46`, `systemHealth.ts:79` all
target the live id `'inbox'`. **Only `CommandPalette.tsx:1029` still opens `'inbox-zero'`**, on
every ⌘K inbox-result click. CommandPalette is also an independent consumer of the list: it fetches
`${INBOX_API}?limit=80` (`CommandPalette.tsx:706`) and scores ⌘K matches on `item.body`
(`:272,318`), with no test. ARA's daily glance reads only `/api/inbox/stats`
(`lib/araDailyGlance.ts:79`). `/api/gmail/send` serves Strata work orders, ComplianceEngine and
Astra (`AstraDashboard/ThreadChannels.tsx:85`, `AstraWorkspace.tsx:151`), not Inbox Zero.
`AssistantLauncher.tsx:36,65` mounts `<InboxZero />` directly under its own key. Draft handoff to Scribe/ARA/Stella (`inboxLinkage.ts`) is tested, but its only producer
is the dead Actions tab.

---

## 3. Verified defects (ranked)

Every item below was confirmed by a mapper **and** an adversarial verifier, and the high ones were
re-read by the orchestrator. §3.6 lists where the swarm was wrong.

### 3.1 Security / data

| # | Severity | Defect | Evidence |
|---|---|---|---|
| S1 | High | `POST /api/gmail/fetch` and `/api/gmail/test` have no `authenticate`: in production anyone can trigger a cross-account Gmail pull plus NIF/ARA processing (optional paid OpenAI calls) and read connection status. Responses carry counts/status, not mail. | backend `app.ts:470`; `routes/gmailSendRoute.ts:76,90` (only `/send` has it, `:22`) |
| S2 | High (latent while Andy is the only user) | No owner scoping: every staff role sees and acts on every connected mailbox (D6 not done). | `inboxStore.ts:75-108`; `types/index.ts:67-88` |
| S3 | High | Inbox items live only in memory: approvals/archives and the dedupe set vanish on every Cloud Run restart; unread mail is re-ingested (D8 not done). | `inboxStore.ts:14`; `gmailService.ts:272` |
| S4 | High | Archive/delete/retry for mail from a secondary linked account call the default account's Gmail client. | `gmailService.ts:199-262`; `inboxRoutes.ts:174,217,337` |
| S5 | Medium | `GET /api/inbox` returns full bodies for up to 50 items; the per-message `GET /api/inbox/:id/body` the UI calls does not exist, so the viewer silently falls back to the list copy. The "body never in bulk state" contract (`InboxZeroTypes.ts:40`, D13) is false. | `InboxZero.tsx:1111,1193`; `useInboxQueries.ts:123`; `inboxRoutes.ts:43-64` |
| S6 | Medium | `/api/tasks/gmail-sync` injects 5 fictional tasks on Gmail error in any non-production run unless a flag says otherwise — against the repo's no-sample-data rule. | `taskRoutes.ts:31-35,85-98` |
| S7 | Low | `PUT /api/inbox/settings` writes arbitrary keys (no whitelist; permission-gated) — fixed in plan Phase 1b. `GET /api/settings` is readable by any signed-in user, but keys are masked `first4••••last4` — accepted as is, revisit with G4. | `inboxStore.ts:445-450`; `settingsRoutes.ts:18,26`; `settingsStore.ts:116-123,189-192` |

### 3.2 Broken behavior on the live Triage tab

| # | Severity | Defect | Evidence |
|---|---|---|---|
| T1 | High | **Search does nothing.** Frontend sends `search`; backend ignores it; the client-side filter block is empty. | `useInboxQueries.ts:71`; `inboxStore.ts:75-101`; `InboxZero.tsx:534-537` |
| T2 | High | **Undo** (header button and bottom toast) `PUT`s `/api/inbox/:id/status` (does not exist), never checks `res.ok`, and shows "Action undone and item recovered". The stack is plain `useState`, despite a "strictly persistent" comment. | `InboxZero.tsx:137,605,622-649,2424-2444` |
| T3 | Medium | **Snooze 2d** and **bulk Add Label** hit missing routes and never check `res.ok` (silent no-op). Labels are never rendered even if stored. | `InboxZero.tsx:861-898,1213-1229` |
| T4 | Medium | **Bulk AI Classify** hits a missing route (fails loudly via `alert()`). | `InboxZero.tsx:831-860` |
| T5 | Low | Full-viewer auto-resize/link-rewrite `onLoad` is dead: `sandbox="allow-popups"` makes the frame cross-origin. | `InboxZero.tsx:1543-1561` |

### 3.3 Honesty / UX

- 8 dead tabs, most failing silently (§2.1) — against the repo's honest-unavailable rule.
- Capabilities tab advertises features the code contradicts (§2.1).
- `NifIntelligence.tsx:16` carries a 2026-08-22 comment admitting "dead in prod", untouched since.

### 3.4 Accessibility (ESLint on the widget files: 43 errors, 72 warnings)

- Triage card expand/collapse is a `div` with `onClick`, no role/tabIndex/key handler — keyboard
  users cannot open a message (`InboxZero.tsx:1012`). jsx-a11y errors: 20 label-has-associated-control,
  11 no-static-element-interactions, 11 click-events-have-key-events, 1 interactive-supports-focus.
- Close button says "Close (Esc)"; no Escape handler exists (`InboxZero.tsx:1467`).
- 75 raw hex colors in inline styles (e.g. label picker `:871-880`) bypass theme tokens.

### 3.5 Dead code and duplication

| Item | Size | Evidence |
|---|---|---|
| `components/InboxWidget/` — a complete second inbox UI, imported nowhere | 464 + 519 lines | grep: no importer |
| `services/emailRouter.ts` — the claimed successor, never called | 230 lines | `routeEmail` has no callers; `StrataMaintenanceAdapter.tsx:20-23,85` only reads its empty queue |
| 7 of 9 mutation hooks + `useEmailBody` in `useInboxQueries.ts` | — | no importers |
| "PREMIUM UI POLISH" CSS block and legacy card BEM selectors | `InboxZero.css:2144-2199` + more | no matching class names |
| Demo seed functions in backend | `app.ts:588-773` | never called |
| Two settings stores (`settingsStore.ts` JSON vs `inbox_settings` SQLite); poll interval captured once at import so Settings changes need a restart | — | `settingsStore.ts:172`; `gmailService.ts:23,317` |
| Widget-memory key hard-coded `'inbox-zero'` for both registry ids | — | `InboxZero.tsx:89` (harmless; it is only a storage key) |
| Sidebar search profile keyed `'inbox-zero'` never matches (dock items use `'inbox'`; the `'inbox'` profile and intent boosts still find it) | — | `Sidebar/widgetSearch.ts:66-71,167` |
| Admin permission editor lists both `widget:inbox-zero` and `widget:inbox` | — | `InboxZero.tsx:1946-1947`; `permissionsService.ts:19-20` |

### 3.6 Where the swarm was wrong (orchestrator corrections)

The verifiers refuted **none** of the mappers' 42 findings. The orchestrator's own re-reads found
seven errors — a reminder that the swarm output is a starting point:

1. **Refuted — CORE-14, SUBA-4, SUBA-11 (auth half):** "sub-tabs send bare `fetch()` with no
   Authorization header". `app/entry.client.tsx:36` installs `installApiAuthFetch()`, which adds
   `Bearer <dwellium-auth-token>` to every same-origin/`API_BASE` `/api/*` request that lacks one
   (`src/lib/installApiAuthFetch.ts:53-78`). Those tabs are dead only because their routes are missing.
2. **Refuted — SUBA-3:** OpenTracker's `localStorage.getItem('auth_token')` is always null, so it
   sets no header and the global wrapper supplies the right one (`OpenTracker.tsx:29-34`). Dead code, not a bug.
3. **Downgraded — BACK-2 critical → high:** the unauthenticated Gmail routes return counts/status,
   not mail; the harm is unauthorized ingestion, quota burn and LLM cost.
4. **Missed — search (T1)** and **missing `/:id/body` route (S5):** both mappers and verifiers marked these live.

---

## 4. Deprecation status: what blocks deleting `'inbox-zero'`

- Registry comment gates deletion on "the C-1 migration window closing"
  (`widgetRegistry.ts:293-298`). No doc declares that window or its closure (BACKLOG.md, plans/, Docs/ searched).
- **Dock layouts are already safe:** the dock loader drops saved items whose `component` is not in
  the current defaults (`context/WindowContext.tsx:56-59`), and every default uses `'inbox'`.
  All 6 persisted `dock-items_*.json` objects in the backend data dir still carry an `'inbox-zero'`
  entry (`payload[n].id` / `.component`); it is pruned on load.
- **Still depending on the id:** `CommandPalette.tsx:1029` (live path), `widgetSearch.ts:66,167`,
  and any session that persisted `'inbox-zero'`. The plan-055 restore **drops** unknown ids:
  `knownWidget()` (`lib/sessionRestoreStore.ts:305-309`) filters restored classic windows
  (`:317-319`) and Halocron/Fluid tabs (`:343-344`) on `WIDGET_REGISTRY[id]`, so deleting the entry
  alone would make those windows vanish. Other registry lookups: `Desktop.tsx:1043,1139`,
  `PopupShell.tsx:15`, `FluidOS.tsx:138`, `HalocronOS.tsx:115,369`, `HalocronWorkspaces.tsx:43`.
  Also 8 of 237 backend event logs, and tests asserting it stays excluded from handoff targets.
- **Safe retirement** = read-time id normalization (`'inbox-zero'` → `'inbox'`) in the restore
  path (map before `knownWidget`) and at those lookups, then delete the entry. No persisted user data needs rewriting. Keep accepting the backend
  permission key `widget:inbox-zero` — custom permission rows may reference it.

---

## 5. Upstream comparison (elie222/inbox-zero)

A local upstream instance runs idle in Docker (`inbox-zero-services-web-1`,
`ghcr.io/elie222/inbox-zero:latest`, image built 2026-08-24, revision `70dfe79e`), published on
`0.0.0.0:3000`, with Postgres and Redis on loopback. Dwellium's dead tabs copy upstream's feature
names.

| Upstream feature | Dwellium today | Port value for Andy | Effort |
|---|---|---|---|
| AI rules in plain English | Rules UI dead; backend rule engine + CRUD methods exist | High | M (HTTP layer + slim UI) |
| Reply Zero (reply tracking) | UI dead, no backend | High | L |
| AI-drafted replies / templates | Actions UI dead; LLM router + handoff exist | High | M |
| Bulk unsubscriber | List works; action dead | Medium | M (List-Unsubscribe / RFC 8058) |
| Cold email blocker | Dead, no backend | Medium | M (needs auto-action safety first) |
| Analytics | Dead; audit rows exist to aggregate | Medium | L |
| Smart categories / sender reputation | Dead; only static regex NIF | Medium | L |
| Bulk archiver | **Works** | — | — |
| Core triage | **Works** (minus §3.2) | — | — |
| MCP server / API | None | High as integration route | M |
| Outlook, Slack/Telegram, meeting briefs | None (meeting briefs exist elsewhere in Dwellium) | Low | L–XL |

**License — verified by reading the file:** upstream is AGPL-3.0 **plus an "Additional Terms for
Inbox Zero" rider** (`LICENSE` lines 9-38 at `main`). It restricts use "for commercial purposes
that involve monetizing the software itself", including incorporating it into a commercial product
that is sold or licensed. Organizations with **five or more** business users need an Inbox Zero
Inc. enterprise license. Unlike Documenso/Listmonk (plain AGPL, proxied unmodified per plan 047),
proxying or embedding upstream therefore depends on whether Dwellium is sold or licensed, and on its
business-user count. That needs Ilya's decision and possibly a legal read. **Recommendation: build
the few high-value features natively on the existing backend; do not iframe upstream.**

Ops note (unverified whether it holds linked accounts): the idle upstream container listens on all
interfaces (`0.0.0.0:3000`), so it is reachable from the LAN. Bind it to `127.0.0.1` or stop it if
unused.

---

## 6. How to improve it (priority order)

1. **Close the security gaps** — authenticate `/api/gmail/*`, whitelist inbox settings keys, make
   the gmail-sync demo fallback explicit opt-in. (S)
2. **Make the widget honest** — remove the 8 dead tabs and the Capabilities matrix; remove or wire
   snooze/undo/label/AI-classify; check `res.ok` on every mutation; fix search; delete
   `InboxWidget/`, `emailRouter.ts`, dead hooks/CSS. Mostly deletions (~5k lines). (M)
3. **Retire the `'inbox-zero'` alias** — CommandPalette → `'inbox'`, read-time id normalization,
   drop the registry entry and duplicate search/permission rows. (S)
4. **Make the backend durable and account-correct** — SQLite-backed items (upsert), persisted
   dedupe + Gmail `historyId`, per-account mutations, `rate_limited` state, owner scoping, one
   settings store, live poll interval, list returns snippets + a real `/:id/body`. (L)
5. **Revive only what earns its place, natively** — real undo/unarchive, Rules CRUD over the
   existing engine, global audit feed, newsletter unsubscribe, snooze with resurface, AI draft
   (never auto-send). Reply tracking only if wanted. (M each)
6. **Stop the drift** — one backend contract test listing every endpoint the widget calls, fix the
   a11y errors in touched code, extract the 740-line Settings tab. (M)

Steps 1–3 are safe whichever product direction is chosen and can ship this week.

---

## 7. Decisions needed from Ilya

- **G1** Which features to revive, and in what order (default: undo → audit feed → rules → unsubscribe → snooze → AI draft; reply tracking deferred).
- **G2** Inbox visibility: owner-only, or a shared team inbox (e.g. a leasing@ mailbox several staff triage)?
- **G3** Email body retention (keep forever / prune after N days). An agent will not prune stored mail without an explicit call.
- **G4** Should app-wide settings (AI keys, theme, RBAC) leave the Inbox Zero Settings tab for Control Panel?
- **G5** Upstream: is Dwellium sold/licensed, or used by 5+ business users? This decides whether option (c) is even allowed.
- **G6** Stop or rebind the idle upstream Docker container.

## 8. Evidence and limits

- Tests: frontend 11 files / 250 tests pass (`InboxZero`, `InboxLinkage`, `emailBodySanitize`,
  `registryWalker`, `defaultStack`, `disclosureTiers`, `widgetMemory`, ARA/Stella linkage,
  `stellaToolCatalog`, `dwelliumCommands`); backend 14 suites / 98 tests pass. `tsc`: no errors in
  InboxZero/InboxWidget/emailRouter. ESLint: 43 errors / 72 warnings in those files.
- Only `InboxZero.tsx` and `inboxLinkage.ts` have dedicated tests; the 11 sub-tab modules have none —
  which is how 8 dead tabs survived green gates.
- **Not verified:** production (no Cloud Run probe this pass); a live UI pass in the browser; whether
  the upstream container holds linked accounts; upstream's MCP endpoint at this image version.
- Second pass: 3 adversarial reviewers (anchors, completeness, safety/feasibility) checked this
  report and plan 066 against the code and raised 11 issues. All were confirmed and applied: the
  restore-drop path, `/api/gmail/send`'s non-inbox callers, CommandPalette's body scoring, the
  `getGmailClientForAccount` signature, Gmail `history.list` semantics, RFC 8058 parsing, the
  plan-061 disk location, and 4 off-by-one citations.
- Raw swarm output: session scratchpad `iz_audit_raw.json` (not committed).
