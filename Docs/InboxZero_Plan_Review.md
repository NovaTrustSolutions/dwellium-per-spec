# Inbox Zero Implementation Spec — Review & Improvements

**Date:** 2026-07-06
**Reviewed against:** the live repo at `~/dwellium-per-spec` (registry, `qualia-shell/src/components/InboxZero/` — 15 files, `useInboxQueries.ts`, `inboxLinkage.ts`, existing tests) and repo conventions in `CLAUDE.md` / `FUCKUPS.md`.

## Verdict

The plan's core judgment is right and should be kept: do NOT transplant upstream (Next.js/Prisma/Postgres/BullMQ has no seam with Express/SQLite), Gmail-only scope, server-side tokens, conservative auto-actions, SQLite persistence, and honest UI (no dead decoration). That is the correct architecture for this codebase.

But the plan was written against a **stale copy of the frontend and without checking the registry**, so several anchor facts are wrong. Corrected plan below; every change is listed as a numbered decision with reasoning.

---

## A. Corrections (plan contradicts the repo)

**D1 — Target `~/Downloads/Dwellium -Per Spec` (the canonical, Netlify-deployed repo).**
[CORRECTED 2026-07-06 — the original review had this backwards.] Two clones exist: `~/Downloads/Dwellium -Per Spec` is canonical (Netlify deploy, advisor/001–040 history, active through 2026-07-05); `~/dwellium-per-spec` is a stale fork (common ancestor `bce60c6`) — do not implement there. See FUCKUPS F-017. The plan's original path was right; note that the repo-structure findings below (registry ids, InboxZero file inventory, API mix) were verified in the stale fork and MUST be re-verified against this tree before implementation, since 275 source files diverged.

**D2 — The canonical widget id is `inbox`, not `inbox-zero`.**
`widgetRegistry.ts:175` registers the LIVE launchable surface as `'inbox'` (label "Inbox Zero"); `'inbox-zero'` (line 192) is explicitly marked superseded/deprecated in the registry comments, and both Stella's and ARA's handoff catalogs (plus Persona Studio's `open_widget` tool) target `inbox`. Why: "keep registry id inbox-zero for compatibility" preserves the deprecated entry and misses the real one. Revised: build on `inbox`; leave the deprecated `inbox-zero` entry as-is (or remove it in a separate cleanup) — do not invest in it.

**D3 — Fix the hardcoded backend URL in `NifIntelligence.tsx`.**
`NifIntelligence.tsx:13` calls `http://localhost:3000/api/v1/inbox/nif` directly — it bypasses `API_BASE`/proxy and breaks in any non-local deployment. Why the plan missed it: it only names the `/api/inbox` vs `/api/v1/inbox` mix. If the NIF tab survives the scope cut, route it through `API_BASE`; if it's cut (recommended, see D5), delete the file.

**D4 — Drop the `/api/v1/inbox/rules` compatibility alias.**
Grep shows the only `/api/v1/inbox/*` callers are frontend files inside this same refactor (`RulesManager`, `ColdEmailBlocker`, `ReplyTracker`, `AnalyticsDashboard`, `NifIntelligence`). Why: an alias for callers you are editing in the same PR is dead weight and a second contract to test. One caveat: grep the **backend** repo and any cron/Stella skills for `/api/v1/inbox` before deleting the routes server-side; if something external calls it, keep the alias with a sunset comment.

---

## B. Sequencing improvement

**D5 — Cut the dead tabs FIRST (new step 0), then canonicalize the API.**
The removal list (Analytics, Open Tracker, Reply Tracker, Cold Email Blocker, NIF, Stats/Capabilities/Newsletters as applicable) eliminates most `/api/v1/inbox` call sites. Doing the cut first shrinks the API-migration surface to roughly `RulesManager` + `useInboxQueries`. Why: less code to migrate, and the contract audit then measures the *real* surviving surface instead of code that's about to be deleted. Delete the files outright rather than hiding tabs — repo precedent (functionality bring-up arc) favors honest-unavailable over disabled decoration, and dead files rot.

---

## C. Additions the plan needs

**D6 — Auth specifics: reuse `authFetch`/`getAuthToken` and never trust client-sent owner.**
The repo already has a canonical Bearer pattern (`UserContext.getAuthToken`; ARA/Stella use it everywhere). `/api/gmail/fetch` and all `/api/inbox/*` routes must derive `owner` from the authenticated token server-side, not from a request field. Why: two-user product (Andy/Lisa); an owner field in the body is a trivial horizontal-access bug.

**D7 — PII discipline for tests and fixtures (repo-specific, plan misses it entirely).**
This repo runs a blocking PII scan, and `CLAUDE.md` documents that the guard regex `/\b(?:\d[ -]*?){13,19}\b/` false-positives on 16-digit hex/UUID prefixes — fixtures must use slug-namespace ids. All frontend/backend test fixtures for emails must be synthetic (no real names/addresses from anyone's mailbox), and no fixture may land under the scanned scopes with realistic PII. Why: a fixture with a real email thread is exactly the leak the gate exists to catch, and it will block CI.

**D8 — SQLite specifics: WAL mode, migration file, and a body-retention decision.**
Add: enable WAL (concurrent read during fetch), a versioned migration (whatever the backend repo's convention is — verify before inventing one), and an explicit retention policy for stored bodies (suggest: bodies pruned after 90 days or on item deletion; metadata kept). Why: email bodies are the most sensitive data Dwellium will persist; unbounded plaintext accumulation in SQLite is a liability, and the plan currently says nothing about lifetime. Encryption-at-rest for the DB file can be a documented non-goal for v1, but say so explicitly.

**D9 — Incremental sync watermark (cheap now, expensive later).**
Persisting processed Gmail ids (plan step 4) prevents duplicates but still refetches the whole unread list every cycle. Store per-account `historyId` (Gmail's incremental sync cursor) or at minimum a `lastFetchedAt` watermark, falling back to full unread fetch when the cursor expires. Why: quota and latency scale with mailbox size; the fallback keeps it simple while the cursor makes steady-state cheap.

**D10 — Quota/backoff handling as a first-class account state.**
Add a `rate_limited` account state alongside `needs_reauth`: on Gmail 429/403-quota, exponential backoff, skip the account this cycle, surface it in Engine Status. Why: with multiple accounts, one throttled mailbox must not stall or crash the whole fetch loop, and "silently skipped" violates the plan's own explainability goal.

**D11 — Auto-archive needs a global kill-switch AND an undo path.**
Keep the ≥0.95 + per-rule opt-in gate, but add (a) a global engine-level "auto-actions enabled" toggle, default OFF, and (b) an `unarchive` endpoint (Gmail archive is just an INBOX-label removal, so undo is nearly free) with the audit event linking both actions. Why: the only cheap way to make the scariest feature trustworthy is a one-click global off and a one-click undo; upstream's own users demanded both.

**D12 — Confidence threshold: global default 0.95, overridable per rule.**
Why: a hard-coded constant forces redeploys to tune; per-rule override matches how the rules UI already frames explainability. Keep 0.95 as the shipped default.

**D13 — Keep the existing frontend contracts that already work.**
Preserve: body-never-in-list-state (already enforced in `InboxZeroTypes.ts` + `/api/inbox/:id/body` comment), React Query hooks in `useInboxQueries.ts`, the `inboxLinkage.ts` draft handoff, `lazyWithReload` at registry altitude, and the existing `InboxZero.test.tsx` / `InboxLinkage.test.ts` suites (update, don't delete). Why: the plan says "align hooks" but doesn't acknowledge how much is already correct — churn beyond the contract change is risk without payoff.

**D14 — New UI must be SSR-safe per repo taxonomy.**
Any new state in the three views (Review Queue, Rules, Engine Status) that touches `localStorage`/`window` must use the `createLocalStorageStore` factory or effect-time access — init-time browser globals are the documented SSR failure class in this repo, and the SSR smoke test is gate-blocking. Why: this is a standing repo convention the plan doesn't mention; violating it fails the gate at the last step.

**D15 — Verification must use the repo's actual gate, not generic `npm test`/`npm run build`.**
Frontend: `npx tsc -b && npx vitest run && npx react-router build && VITE_APPFOLIO_SEEDS=false npx react-router build && node Scripts/verify_no_pii_leak.mjs && SMOKE_TEST_SKIP_BUILD=true node Scripts/smoke_test_ssr_phase8.mjs` (note: `npx vite build` is a documented silent no-op in this repo — FUCKUPS F-004). Backend commands as the backend repo defines them. Why: the plan's generic commands would skip the PII scan, the second seed mode, and the SSR smoke test — three of the repo's blocking gates. Also verify the backend path: `CLAUDE.md` references the sibling `../ai-dashboard369-file-manager`, the plan says `~/dwellium-backend/ai-dashboard369-file-manager` — confirm which exists before running anything.

**D16 — Strengthen the live smoke into the success criteria.**
Add two specifics: (a) the persistence check is "restart backend → list unchanged → fetch → zero duplicates"; (b) the correct-account check uses TWO connected accounts and asserts the archive landed in the right mailbox and *not* the other. Why: these are the two bugs this architecture is most likely to ship (in-memory habits and default-client habits), and the plan's smoke as written could pass with either bug present.

---

## D. Kept from the original plan (endorsed as-is)

No upstream transplant; Gmail-only v1; tokens server-side with `TOKEN_ENCRYPTION_KEY` required outside dev; SQLite over Prisma/Postgres/Redis; `/api/inbox` as the canonical namespace; `sourceAccount` on `InboxItem` and account-scoped archive/read; `invalid_grant → needs_reauth` + reconnect UI; regex hardening so a bad rule can't crash classification; AI prompt-to-rule as preview-then-save only; no auto-send, no hard-delete; approval creates/links Dwellium artifacts; audit event on every action; three honest views (Review Queue / Rules / Engine Status).

## Revised step order

0. Cut dead tabs + delete their files (D5) — shrink the surface.
1. Contract audit on what survives (original step 1, minus alias per D4, plus D3).
2. OAuth + account health (original step 2, plus `rate_limited` per D10).
3. Account-scoped Gmail provider (original step 3, plus watermark per D9).
4. Persistent SQLite store (original step 4, plus WAL/migration/retention per D8).
5. Rules engine (original step 5, threshold default per D12).
6. Actions + audit (original step 6, plus unarchive + global kill-switch per D11).
7. Frontend refactor (original step 7, per D2/D6/D13/D14).
8. Verification + rollout (original step 8, replaced by D15/D16; fixtures per D7).
