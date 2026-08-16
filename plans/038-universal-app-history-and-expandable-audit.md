# Plan 038: Universal per-login app history + fully expandable Audit Log

> **Executor instructions**: Follow step by step; verify every step. On STOP
> conditions, stop and report. Commit in the worktree per the git workflow.
> SKIP updating `plans/README.md` — the reviewer maintains the index.
>
> **Repo**: FRONTEND `/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec`
> (planned at frontend `5fac7c8`, 2026-07-04). All vitest/build verification
> runs on the Mac.
>
> **Drift check (run first)**:
> `git diff --stat 5fac7c8..HEAD -- qualia-shell/src/lib/perUserIdentity.ts qualia-shell/src/context/WindowContext.tsx qualia-shell/src/components/AuditLog/ qualia-shell/src/lib/oneSaveStore.ts`

## Status

- **Priority**: P1 (owner-requested)
- **Effort**: L
- **Risk**: MED (touches WindowContext — the shell's hot path; mitigated: additive-only, fire-and-forget logging, capped buffer)
- **Depends on**: 033/034 (DONE — deployed audit API with `location`; widget with capability gate)
- **Category**: direction
- **Planned at**: frontend `5fac7c8`, 2026-07-04

## Why this matters

Owner requirements (2026-07-04, verbatim intent): "make audit log more
expandable so that every single action can be reviewed" and "every single app
within the app should be attached and saved as history within the app,
accessible via the login." Today the Audit Log shows one-line rows (truncated
`entityType · entityId`; the `details` payload the backend already returns is
never shown), and only backend-recorded mutations exist — client-side app usage
(opening Scribe, running a Terminal command, sending a Stella message) leaves
no trace. After this plan: (1) every audit row expands to its complete record;
(2) EVERY app in the shell automatically logs open/close lifecycle to a
per-login history, with a `logActivity()` API for domain events (3 exemplar
widgets wired), persisted per-account via One Save so it follows the login
across devices; (3) a "My Activity" tab in the Audit Log widget shows any
signed-in user their own history.

## Current state (all verified at `5fac7c8`)

- `qualia-shell/src/components/AuditLog/AuditLogWidget.tsx` (post-plan-034):
  capability-gated (fetch → 403 = restricted card; `auditLogAccess.ts` catalog
  constant); Sessions/Activity tabs; `AuditEntry` has `location?: string|null`;
  rows render one line; the `details: Record<string, unknown>` field from the
  API is in the interface but NOT rendered; `?limit=500` fetch.
- `qualia-shell/src/context/WindowContext.tsx:246` —
  `const openWindow = useCallback((component: string, title: string, icon: string): string | null => {`
  the SINGLE choke point through which every widget/window opens (dedupe check
  at :248). There is a corresponding close path (locate `closeWindow` in the
  same file). This is where universal lifecycle capture goes.
- `qualia-shell/src/lib/perUserIdentity.ts` — the ONLY place per-user store id
  holders may live. Invariants (from CLAUDE.md, DO NOT BREAK): each holder is
  an independent object created by `makeHolder()`; every holder MUST be added
  to `ALL_HOLDERS`; ONLY `setPerUserIdentity` writes holders; consuming
  components call `usePerUserIdentity()` before the store's
  `useSyncExternalStore`. Violating this re-introduces the React #185 infinite
  render loop (FUCKUPS.md F-015).
- `qualia-shell/src/utils/createLocalStorageStore.ts` — factory; dynamic-key
  stores use the OBJECT signature `{ key: () => string, deserializer, defaultValue }`
  (Option β). PERMANENT convention: every factory store exports `.reset()`;
  tests call it in `beforeEach`.
- `qualia-shell/src/lib/oneSaveStore.ts` — `SyncOptions<T>` wrapper
  (`objectType`, `holder`, `resolveKey`, `debounceMs`) giving per-user
  write-through + hydrate/migrate. Model the new store's sync on an existing
  dynamic-key synced store (find one: `grep -ln "SyncOptions\|wrapSynced" src/lib/*.ts`
  and read the smallest, e.g. goals/tags/workspaces).
- Exemplar-widget event sources (wire `logActivity` into exactly these three):
  - Terminal: command execution site in `src/components/Terminal/` (locate the run/submit handler).
  - Stella: message-send handler in `src/components/StellaAgent/` (or its chat submit).
  - ThoughtWeaver: capture handler in `src/components/ThoughtWeaver/`.
- Test conventions: vitest + RTL; `vi.setSystemTime` (NEVER `vi.useFakeTimers`
  with async-render paths); `.reset()` in beforeEach; existing audit widget
  suite at `src/test/auditLogWidget.test.tsx`.
- Gate: `bash Scripts/gate.sh` (repo root; SMOKE_TEST_PORT=3210 if :3000 busy).

## Approach (decided)

**New `qualia-shell/src/lib/activityLogStore.ts`** — the contract:

```ts
export interface ActivityEntry {
    id: string;            // crypto.randomUUID()
    ts: number;            // Date.now()
    widgetId: string;      // registry key, e.g. 'scribe', 'terminal', or 'shell'
    widgetLabel: string;   // human label at time of logging
    action: string;        // 'open' | 'close' | domain verbs ('command-run', 'message-sent', 'capture')
    details?: Record<string, unknown>;  // small, non-sensitive summary (NEVER secrets/full message bodies — first 140 chars max for text)
}
export const activityUserIdHolder: { current: string | null };  // lives in perUserIdentity.ts, re-exported or imported here
export function logActivity(widgetId: string, widgetLabel: string, action: string, details?: Record<string, unknown>): void;
export const activityLogStore: /* factory store of ActivityEntry[] */;
```

- Ring buffer: cap at 2,000 entries (drop oldest on append) — bounded
  localStorage + One Save payload.
- Per-user dynamic key (`dwellium-activity-log:<userId>`, `_anonymous`
  fallback) via the Option β factory signature; holder added to
  `perUserIdentity.ts` `ALL_HOLDERS` (single-writer discipline).
- One Save sync via the `SyncOptions` wrapper (`objectType: 'activity-log'`,
  default debounce) → history follows the login across devices.
- `logActivity` is fire-and-forget and try/catch-wrapped: a logging failure
  must NEVER break an app action.

**Universal lifecycle capture**: in `WindowContext.tsx`, inside `openWindow`
(after a NEW window is actually created — not on dedupe-focus) call
`logActivity(component, title, 'open')`; in the close path,
`logActivity(component, title, 'close')`. Two call sites cover every current
and future app automatically.

**Expandable rows (server tabs + My Activity)**: each row gets a chevron;
clicking toggles an expanded panel rendering the FULL record — for server
entries: pretty-printed `details` JSON (`<pre>`), entityType/entityId, userId,
role, IP + location, ISO timestamp; for activity entries: details JSON +
widget id + ISO timestamp. Keyboard accessible (`aria-expanded` on the row
button; the repo's a11y conventions — see the RefreshCw aria-label precedent).

**"My Activity" tab**: third tab in AuditLogWidget, rendered for ANY signed-in
user (it reads the LOCAL per-user store, no backend call, so it works for
quick-access users too); the two server tabs keep their existing capability
gating. Uses `usePerUserIdentity()` before reading the store. Search box
filters it like the other tabs; entries render newest-first.

## Commands you will need

| Purpose | Command (in `qualia-shell/`) | Expected |
|---|---|---|
| Typecheck | `npx tsc -b` | exit 0 |
| Focused tests | `npx vitest run src/test/activityLogStore.test.ts src/test/auditLogWidget.test.tsx` | pass |
| Full suite | `npx vitest run` | all pass |
| Lint | `npm run lint` | no NEW errors in touched files (repo has a pre-existing backlog) |
| Full gate | `cd .. && SMOKE_TEST_PORT=3210 bash Scripts/gate.sh` | GATE GREEN |

## Scope

**In scope:**
- `qualia-shell/src/lib/activityLogStore.ts` (create)
- `qualia-shell/src/lib/perUserIdentity.ts` (add ONE holder + ALL_HOLDERS entry only)
- `qualia-shell/src/context/WindowContext.tsx` (two `logActivity` call sites only)
- `qualia-shell/src/components/AuditLog/AuditLogWidget.tsx` (expandable rows + My Activity tab)
- The three exemplar widget files (ONE `logActivity` call site each; locate precisely, change nothing else)
- `qualia-shell/src/test/activityLogStore.test.ts` (create) + `qualia-shell/src/test/auditLogWidget.test.tsx` (extend)

**Out of scope:** backend repo (client history stays client+One Save; a backend
mirror is a possible follow-up, not this plan); instrumenting more than the 3
exemplar widgets; any change to window management logic itself; retention UI.

## Git workflow

- Worktree: `git worktree add ".advisor-worktrees/038" -b advisor/038-app-history main` (quote paths); `npm ci` in its `qualia-shell/`.
- Conventional commits, e.g. `feat(activity): per-login universal app history store + shell lifecycle capture` / `feat(audit-log): expandable rows + My Activity tab`. Do NOT push.

## Steps

1. **Store**: create `activityLogStore.ts` per the contract; holder in
   `perUserIdentity.ts` (follow an existing ALIAS-store holder line exactly);
   One Save sync via `SyncOptions` modeled on the smallest existing synced
   dynamic-key store; `.reset()` export.
   Verify: `npx tsc -b` → 0.
2. **Store tests** (`activityLogStore.test.ts`): append + read newest-first;
   ring-buffer cap (append 2,001 → oldest dropped); per-user isolation (switch
   holder id → different list; switch back → original intact — model on
   `holderIsolation.test.ts`); `logActivity` never throws even when
   localStorage throws (stub it to throw).
   Verify: focused run passes.
3. **Shell capture**: the two WindowContext call sites (new-window create +
   close). Do NOT log on dedupe-focus of an existing window.
   Verify: `npx tsc -b` → 0; full vitest still green (WindowContext has
   existing suites).
4. **Exemplar widgets**: one call each (Terminal command-run with
   `{ command: <first 140 chars> }`, Stella message-sent with
   `{ preview: <first 140 chars> }`, ThoughtWeaver capture with
   `{ preview: … }`). Never log secrets/API keys; if the handler has key-like
   content, log only lengths.
   Verify: `npx tsc -b` → 0.
5. **Widget UI**: expandable rows on all tabs + the My Activity tab per
   Approach. Extend `auditLogWidget.test.tsx`: expanding a server row reveals
   pretty-printed details JSON + location + ISO time (`aria-expanded` flips);
   My Activity tab renders store entries for a signed-in user WITHOUT any
   fetch (assert fetch not called for that tab); search filters activity
   entries; existing assertions untouched.
   Verify: focused suites pass → full `npx vitest run` green → full gate GREEN.

## Done criteria

- [ ] `npx tsc -b`, full vitest, and `Scripts/gate.sh` all green (Mac)
- [ ] `git diff --name-only main..HEAD` ⊆ the in-scope list
- [ ] Opening any window logs exactly one 'open' entry (assert via a WindowContext-level test or the store test harness)
- [ ] No message bodies/secrets in logged details (grep your diff for the 140-char truncation on all three exemplars)
- [ ] Committed on the branch; report lists any interface deviations from the contract

## STOP conditions

- `WindowContext.tsx` close path can't be located cleanly or windows close through multiple uncoordinated paths — report the structure.
- Adding the holder or the One Save wrapper triggers ANY render-loop symptom in tests (React #185 / max update depth) — STOP immediately; this is the FUCKUPS.md F-015 class; do not work around it ad hoc.
- The three exemplar handlers can't be located confidently — report candidates instead of guessing.
- Full-suite failures outside your touched files.

## Maintenance notes

- Future widgets get lifecycle history for free; domain events are one `logActivity` call — document that in the store's header comment.
- Follow-ups deferred: backend mirror of client activity (durable server copy), retention/clear-history UI, wiring the remaining ~27 widgets' domain events incrementally.
- Reviewer: scrutinize the WindowContext diff hardest (hot path — must be additive only), and the per-user isolation test.
