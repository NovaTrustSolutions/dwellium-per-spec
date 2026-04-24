# Phase 2 Task 2.2 — CommunicationModule Seed + Thread Rollup · Completion Report

**Task.** 2.2 — CommunicationModule: `communications.json` seed + `/communications/thread-rollup` route + Task 2.7 `/audit/unified-timeline` light-up. First Phase-2 general-pool task landed post-B3.

**Branch.** `feat/phase-2-task-2.2-communication-module` off `main@40875db`.
**Commits (pre-squash, atomic, all strict-gate-green):**
1. `5ee27e4` — `feat(types): Communication additive fields + CommunicationReadStatus + CommunicationThreadRollup (Task 2.2)`
2. `ebaf593` — `feat(data): seed communications.json (6 rows) + audit_timeline_index refresh (Task 2.2)`
3. `885a127` — `feat(api): add /communications/thread-rollup route (Task 2.2)`
4. `e442f4b` — `feat(ui): CommunicationModule — ErrorBoundary + 2 Sentry breadcrumbs + 5 data-testids (Task 2.2)`
5. `eb8d88a` — `test(parity): communication contract tests + Task 2.7 join light-up + contamination + PII guards (Task 2.2)`
6. `7a97736` — `docs(plan+repo): v2.3 -> v2.4 + §9 Task 2.2 row flip + Task 2.7 SHA backfill + CLAUDE.md drift sweep`
7. *This report + CDP render proofs (commit 7).*

**Merge SHA (post-squash).** _(populated by squash-to-main on close)_
**Closure date.** 2026-04-24.

---

## Summary

Task 2.2 seeds `communications.json` (0 → 6 rows across 3 real `properties.json` UUIDs), adds additive schema extensions on the pre-existing `Communication` interface + a new `CommunicationThreadRollup` aggregate, adds one new route `/communications/thread-rollup`, wires GR-13 observability onto the existing `CommunicationModule.tsx`, and proves end-to-end that Task 2.7's `/audit/unified-timeline` handler **lights up** `source: 'communication'` events automatically via its pre-existing defensive `c.propertyId` read at `strataApi.static.ts:252` — zero handler changes required.

**Scope reconciliation (documented in commit 6 / plan v2.4 changelog):** the task handoff initially labeled this as "Task 2.8" but plan v2.3 §8 L330 + scheduling-pass §6 L36 both assign 2.8 to Sentiment static handlers, while §8 L305 explicitly assigns Communication to Task 2.2. Plan is source of truth; executed + documented as Task 2.2 throughout. Task 2.8 (Sentiment) remains pending.

B3 serial chain remains **closed** at Task 2.7 merge (`40875db`). Task 2.2 is the first general-pool task landed post-B3.

---

## §1 — Scope & DoR evidence

### 15-item DoR complete (all green)

- **DoR 1** — Plan v2.3 §8 (L305 + L330) + §9 tracker current state + scheduling-pass §6 (surfaced 2.2↔2.8 scope ambiguity; resolved via Option A per plan-faithful recommendation) + Appendix D (row 1 untouched).
- **DoR-PRE1** — 36 real `properties.json` UUIDs enumerated; 3 used (BV / Woodland Parc / Riverwood Club Apartments).
- **DoR-PRE2** — all 3 propertyIds grep-verified against `properties.json` at commit 2 time (commit body includes the grep result paste: `e4b440e9-... -> FOUND: 128 BUENA VISTA DR N` / `52d4e301-... -> FOUND: Woodland Parc Townhomes` / `705a6f52-... -> FOUND: Riverwood Club Apartments`).
- **DoR 3** — `communications.json` confirmed empty `[]` pre-seed.
- **DoR 4** — Task 2.7's `audit_timeline_index.json` had 2 rows with `communication: 0`; refreshed in commit 2 alongside the seed.
- **DoR 5** — existing `Communication` interface at `packages/types/index.ts:621` inventoried; 5 optional fields added (`propertyId`, `threadId`, `preview`, `readStatus`, `attachmentCount`) — all required by Task 2.7's handler-defensive reads OR needed for the thread-rollup aggregate.
- **DoR 6** — `strataTypes.ts` barrel inventoried; 2 new names appended (`CommunicationReadStatus`, `CommunicationThreadRollup`).
- **DoR 7** — existing `/communications` route at `strataApi.static.ts:311` + generic `filterBy` helper at L574 (strict === equality with camelCase auto-map) — untouched. One new route added: `/communications/thread-rollup`.
- **DoR 8** — `CommunicationModule.tsx` exists (258 lines, 3 tabs); retrofit-only approach confirmed (no structural refactor).
- **DoR 9** — exclusive-key constants inventoried across `insurance.test.ts` / `complianceEngine.test.ts` / `audit.test.ts`.
- **DoR 10** — `audit.test.ts` already imports `communications.json`; light-up it-block added in commit 5.
- **DoR 11** — PII scanner 5-regex inventory memorized (SSN / 9+-digit / card / real-email-domain / parenthesized-phone / dashed-phone); all avoided by seed.
- **DoR 13** — CLAUDE.md drift confirmed across 3 lines (HEAD / last-green-CI / next-phase); swept in commit 6.
- **DoR 14** — existing `CommunicationModule.tsx` + `communication.test.ts` stub + `appfolioDerived/communications.ts` (7 rows, VITE_APPFOLIO_SEEDS-gated, not used by this seed) all inventoried.
- **DoR 15** — `appfolio-parity-gate.yml` paths already cover `public/data/**` and `test/appfolioParity/**`; no yaml changes needed.

---

## §2 — Strict gate (local paste)

```
=== tsc -b ===
(clean, no output)

=== vitest ===
 Test Files  26 passed (26)
      Tests  131 passed (131)
   Start at  23:29:22
   Duration  2.64s

=== vite build (default) ===
✓ built in 5.35s

=== vite build (VITE_APPFOLIO_SEEDS=false) ===
✓ built in 5.28s

=== PII scan ===
[OK] legacy scope: 0 files scanned, 0 findings.
PII scan clean (strict scope) — 47 files scanned across 2 roots, 0 leaks found (1549ms total).
```

- `tsc -b`: clean.
- `vitest`: **131 / 131** pass (was 123 post-Task-2.7; +8 net = +7 replacing stub + 1 light-up).
- `vite build` default: clean.
- `vite build` `VITE_APPFOLIO_SEEDS=false`: clean.
- PII scan strict scope: **47 files, 0 leaks** (count unchanged — `communications.json` already existed as `[]` pre-Task-2.2; content grew from empty to 6 rows).

---

## §3 — CDP render proofs

**Tool.** `ws`-based CDP client against headless Chrome (`--remote-debugging-port=9223`), `VITE_USE_STATIC_API=true` dev server on `http://127.0.0.1:5173/`.

### Capture 1 — `CommunicationModule-list.png` (637 KB)

Nav path: sign-in (Andy) → gate passphrase → expand Property Management → Strata → click Communication module. 6 rows rendered in the Inbox tab list.

**Non-empty guard clause:** `document.querySelectorAll('[data-testid="communication-row"]').length > 0` — enforced before `Page.captureScreenshot`.

```
rowCount              = 6
moduleRendered        = true  (communication-module testid)
listRendered          = true  (communication-list testid)
emptyRendered         = false (communication-empty testid absent — correct for non-empty)
firstThreeChannels    = ['email', 'email', 'sms']
pngBytes              = 637681
```

### Capture 2 — `AuditModule-unified-timeline-with-comms.png` (688 KB) ⭐ Light-up proof

Nav path: (continues from capture 1) → Audit Log module → click `audit-unified-tab` sub-tab.

**Stricter guard clause (ack-specified for the light-up proof):**
`Array.from(document.querySelectorAll('[data-testid="audit-unified-source-badge"]')).some(n => n.textContent.trim() === 'communication')` — if zero communication badges, harness aborts and no PNG written.

```
rowCount                        = 100 (at default handler limit)
communicationSourceBadges       = 6   (light-up confirmed ⭐)
communicationEventRows          = 6
allSources                      = ['insurance', 'compliance', 'communication', 'workitem', 'audit log']
pngBytes                        = 688261
```

**6 `source: 'communication'` events appearing in the timeline — Task 2.7's join handler emitted them automatically from the 6 seeded `communications.json` rows with no handler change required.** Proves the "light-up" end-to-end.

Seed probe (mid-harness, pre-nav):
```
communicationRows               = 6
communicationPropertyIds        = 3 unique real UUIDs (BV / WP / RV)
auditIndexRows                  = 3 (2 refreshed + 1 new Riverwood)
auditIndexCommunicationSum      = 6 (matches actual seed count)
```

Artifacts: `Docs/Baselines/phase_2_task_2_2/{CommunicationModule-list.png, AuditModule-unified-timeline-with-comms.png, cdp_summary.json}`.

---

## §4 — /security-review deep pass (Task 2.2 only)

**Scope.** Only code introduced by this branch.

### Sink grep (new code only)
```
dangerouslySetInnerHTML / __html / innerHTML= / eval( / new Function /
document.write / srcdoc= / setAttribute('on / outerHTML / .html(
  → 0 hits across all new code (types, API handler, UI retrofit, tests, fixture)
```

### Findings

| # | Category | Severity | Disposition |
|---|---|---|---|
| S-1 | XSS via communication body / subject / addresses rendering | N/A | **Defended.** All fields render as React JSX text content (auto-escaped). `whiteSpace: 'pre-wrap'` preserves newlines without HTML-escape risk. No `dangerouslySetInnerHTML`, no `setAttribute('on…')`. Channel badge text derives from the literal `ChannelType` union (not free-text). |
| S-2 | PII exposure via high-risk fixture (`communications.json`) | N/A | **Defended.** All email addresses use the fictional `@dwellium.example` domain (deliberately outside the PII scanner's real-domain set `gmail|yahoo|hotmail|outlook|aol|icloud|me|mac|live|msn × com|net|org`). No SSN / 9+-digit / card / parenthesized-phone / dashed-phone patterns. Positive test assertion (it-block #8) enforces `@dwellium.example` domain on every address. |
| S-3 | Reply / thread injection (malicious threadId from input params) | N/A | **Defended.** `filterBy` helper (`strataApi.static.ts:574`) uses strict `===` on row fields only; no substring match, no regex, no SQL/NoSQL. A crafted `?threadId=` param can only match exact `threadId` values on seeded rows. `/communications/thread-rollup` similarly uses strict `propertyFilter === r.propertyId`. |
| S-4 | Recipient impersonation via spoofed `fromAddress` | N/A | **N/A to Task 2.2.** Seed is read-only from a trusted static fixture; no write endpoint introduced; existing backend `/communications` POST/PUT surface untouched (GR-5). Any write-side impersonation surface belongs to Task 5.x backend work. |
| S-5 | Recipient PII leakage via search endpoint | N/A | **Defended.** `/communications` search is the existing `filterBy` helper (strict equality, not substring); `readStatus` / `channel` / `direction` filters do not index or return raw recipient content. Existing `CommunicationModule.tsx` search input (L121 client-side filter on `subject` + `fromAddress`) does NOT call the backend with free-text — filtering happens purely client-side on already-fetched data. No information-disclosure vector. |
| S-6 | Thread-rollup aggregation reveals cross-property metadata | N/A | **Defended.** `/communications/thread-rollup` `?propertyId=` filter uses strict `===`; when `propertyFilter` is absent, all threads return (matches the existing `/communications` no-param behavior — no new exposure). Each rollup's `propertyId` field is copied from the member row's own `propertyId`, never computed or fabricated. |
| S-7 | Type-confusion between Communication and upstream-task types | N/A | **Defended.** Bidirectional contamination guard (it-block #7) enforces `TASK_2_2_EXCLUSIVE_KEYS` (8 keys) forbidden on all upstream fixtures AND Task-1.x / 2.3 / 2.5 / 2.7 exclusive keys forbidden on Communication rows. Grep-verified at commit 5 time; full transparency table in commit body. |
| S-8 | Observability side-channel via Sentry breadcrumbs | N/A | **Defended.** Breadcrumb `data` fields carry only non-PII metadata (`messageCount`, `id`, `channel`, `direction`). Message bodies, subjects, and addresses NEVER appear in breadcrumb payloads. Pattern matches Task 1.5 / 2.3 / 2.5 / 2.7 observability precedent. |

**Verdict: High = 0, Medium = 0, Low = 0.**

---

## §5 — Verification matrix

| # | Claim | Evidence |
|---|---|---|
| 1 | Communication additive fields + CommunicationReadStatus + CommunicationThreadRollup declared | `packages/types/index.ts` L621-667 (Task 2.2 block) |
| 2 | Barrel re-exports land | `strataTypes.ts` L78-79 (2 new names appended after Task 2.7 block) |
| 3 | 6 seeded rows, 3 real property UUIDs (DoR-PRE2) | `public/data/communications.json` + commit 2 body grep-verify paste + test it-block #2 |
| 4 | `audit_timeline_index.json` refreshed in sync with seed | `public/data/audit_timeline_index.json` (BV/WP communication 0→2, RV row new) + commit 2 body |
| 5 | `/communications/thread-rollup` route works | `strataApi.static.ts:313-362` + test it-block #6 |
| 6 | Existing `/communications` route UNCHANGED | `strataApi.static.ts:311` (1 line, unchanged) |
| 7 | `strataApi.backend.ts` UNTOUCHED (GR-5) | `git diff main...HEAD -- qualia-shell/src/**/strataApi.backend.ts` = empty |
| 8 | 5 data-testids + 2 Sentry breadcrumbs + ErrorBoundary in UI | `CommunicationModule.tsx` L1-15 imports; L85-91 loaded breadcrumb; L156-181 list panel testids + click breadcrumb; L197 detail testid; L280 ErrorBoundary close |
| 9 | Task 2.7 join light-up proven | audit.test.ts light-up it-block (L326+) AND `cdp_summary.json` `auditLightUp.guard.communicationSourceBadges === 6` AND CDP PNG artifact |
| 10 | Bidirectional contamination guard 8+8 keys | communication.test.ts TASK_2_2_EXCLUSIVE_KEYS (8 keys); TASK_1_1..1_5 + 2.3 + 2.5 + 2.7 reverse check |
| 11 | PII 0 leaks on new fixture | PII scan 47/0; test it-block #8 regex check + positive `@dwellium.example` assertion |
| 12 | vitest 123 → 131 (+8 net) | §2 strict-gate paste |
| 13 | Plan doc v2.3 → v2.4 + §9 Task 2.2 row flip + Task 2.7 SHA backfill | `Docs/AppFolio_Parity_Implementation_Plan_v2.md` header + §9 (L367-370) + Changelog v2.4 |
| 14 | CLAUDE.md drift fixed (HEAD / CI / next-phase) | `CLAUDE.md` L9-14 |
| 15 | Pending narrowed to 6 items (2.1, 2.4, 2.6, 2.8, 2.9, 2.10; 2.8 retained) | plan §9 tracker pending-row + CLAUDE.md next-phase line |
| 16 | Appendix D row 1 text UNTOUCHED | `grep -n "packages/types/index.ts"` L580 reads "Task 2.3 → 2.5 → 2.7 (strictly serial)" — same as PR #8 landed |

---

## §6 — Rollback

Atomic per-commit rollback supported (all 7 commits pure-additive):

```
# Full revert
git revert --no-commit 7a97736 eb8d88a e442f4b 885a127 ebaf593 5ee27e4
git commit -m "revert: Task 2.2 CommunicationModule seed (post-B3 general-pool rollback)"
```

Partial fingerprints:
- Types only: revert `5ee27e4` — removes Communication additive fields + CommunicationReadStatus + CommunicationThreadRollup. Commits 2–6 depend on these; must revert 2–6 first.
- Seed only: revert `ebaf593` — restores `communications.json = []` AND reverts audit_timeline_index + audit.test.ts length bump. Task 2.7 /audit/unified-timeline communication branch reverts to 0-count (no handler change).
- API only: revert `885a127` — removes `/communications/thread-rollup`. `/communications` + Task 2.7 join still work.
- UI only: revert `e442f4b` — removes ErrorBoundary + Sentry + testids. Pre-existing module behavior preserved.
- Tests only: revert `eb8d88a` — restores the 16-line stub + removes light-up it-block. Suite reverts 131 → 123.
- Docs only: revert `7a97736` — plan reverts v2.4 → v2.3; CLAUDE.md reverts to pre-Task-2.2 state.

---

## §7 — Deferred

1. **Synthetic `"riverwood-club"` cleanup in Tasks 2.3 / 2.5 fixtures** — Task 2.2 OPPORTUNISTICALLY uses the real Riverwood UUID `705a6f52-...` in its `communications.json` seed + `audit_timeline_index.json` row, proving the pattern works. A standalone cleanup PR could migrate the 9 `compliance.json` rows + 3 `insurance_policies.json` rows from synthetic `"riverwood-club"` to the real UUID. Carried forward from PR #11 deferred list.
2. **`appfolioDerived/communications.ts` (7-row VITE_APPFOLIO_SEEDS-gated derived fixture)** — contains PII-style addresses (`ashley.johnson@zp-group.example`, `tenant-0@example.com`) that predate Task 2.2. Not consumed by Task 2.2's public seed. Future Task 2.8 / 2.10 may need to reconcile.
3. **`archived` readStatus** — declared in the union but no seeded row exercises it. Future growth when archive flows land.
4. **`phone` channel** — declared in the `ChannelType` union but no seeded row exercises it (a real captured call-log row would need additional schema for call duration / recording links). Future work.
5. **`CommunicationModule.tsx` search input L121** — the client-side filter reads `msg.subject` and `msg.fromAddress` only; `preview` field is not searched despite being populated. Small follow-up.
6. **Linux Playwright baselines** — carried forward from Phase 0.0.

---

## §8 — Next-task unblock

**B3 chain remains closed.** Phase-2 general pool now has **6 remaining tasks**:

- **2.1** — Properties enrichment.
- **2.4** — Forecast 50-property seed + new `/forecast` static handler.
- **2.6** — Utilities module + vendor additions.
- **2.8** — Sentiment static handlers (`/sentiment/scores`, `/sentiment/history`, `/sentiment/by-entity`) + `sentiment_scores.json` — **STILL PENDING post-Task-2.2** per plan §8 L330 source-of-truth.
- **2.9** — Projects entity-grouped Kanban seed.
- **2.10** — PropertyTimeline unified feed (reads `workitems.json` + `communications.json` — can now leverage Task 2.2's 6-row seed + thread-rollup).

Any of these can open immediately from `main@<Task-2.2-squash-SHA>`. Task 2.10 gets the biggest leverage boost from Task 2.2's close.

---

🧪
