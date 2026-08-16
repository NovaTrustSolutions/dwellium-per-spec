# Plan 028 (SPIKE): Design cross-device ThoughtWeaver sync via Supabase

> **Executor instructions**: This is a **design/spike** plan — the deliverable is a design
> document + a thin proof-of-concept, NOT a shipped feature. Do not build the full sync
> layer. Honor STOP conditions. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**:
> `cd "/Users/ilyaklipinitser/Downloads/Dwellium -Per Spec" && git diff --stat 730c82a..HEAD -- qualia-shell/src/components/ThoughtWeaver qualia-shell/src/utils/integrationsStore.ts`

## Status

- **Priority**: P3 (direction)
- **Effort**: M (spike + design doc; full build is a follow-up)
- **Risk**: LOW (design + POC; no production behavior change unless the POC is wired)
- **Depends on**: none
- **Category**: direction
- **Planned at**: `730c82a`, 2026-07-02

## Why this matters

ThoughtWeaver capture is `localStorage`-only, so ideas jotted on a phone never reach the
desktop — a real capability asymmetry (grounded in `BACKLOG.md`: "ThoughtWeaver phone sync
via Supabase", deferred by Ilya 2026-05-30). Supabase is already wired per-user (config in
`integrationsStore.ts`), so the architecture makes this disproportionately cheap. The hard
part is not the plumbing — it is the **conflict-resolution + never-delete guarantee**: the
product promises captures are verbatim and only the user can delete them. This spike defines
the schema, the sync/merge model, and the offline behavior, and de-risks it with a minimal
POC, so a build plan can follow with the tradeoffs already decided.

## Current state

- `src/components/ThoughtWeaver/ThoughtWeaver.tsx` — the widget. It writes captures to a
  local store (`thoughtWeaverStore` / a `createLocalStorageStore` factory). Confirm the exact
  store file and shape with
  `grep -rn "thoughtWeaver" src/components/ThoughtWeaver src/lib | grep -i store`.
- Capture shape (confirm by reading the store): roughly `{ id, text, filedTo, confidence,
  destinationName, createdAt, deletedAt? }`.
- `src/utils/integrationsStore.ts` + the Supabase card in `LlmIntegrationsSection.tsx` — how
  per-user Supabase config (url + keys) is stored and read (`integrations.supabase`).
- Precedent for per-user durable sync: the One Save store (`src/lib/oneSaveStore.ts`,
  `oneSaveClient.ts`) — same "local is live, remote is durable, never clobber on flap"
  discipline the sync layer must follow. Read it as the reference model.
- `BACKLOG.md` — the deferred item and Ilya's constraints (verbatim + user-only-delete).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `cd qualia-shell && npx tsc -b` | exit 0 |
| Targeted tests | `cd qualia-shell && npx vitest run src/test/thoughtWeaverSync.test.ts` | pass (if POC written) |

## Scope

**In scope:**
- `Docs/ThoughtWeaver_Supabase_Sync_Design.md` (create) — the primary deliverable.
- Optional thin POC: a `src/lib/thoughtWeaverSync.ts` (create) implementing only
  write-through + merge-on-load against Supabase, behind the existing per-user Supabase
  config, with a unit test — ONLY if Step 3 is reached and stays small.

**Out of scope:**
- Shipping the sync in the live widget (a follow-up build plan does that after the design is
  approved).
- Any change to the capture UI or the local store's existing behavior.
- A mobile-specific route (separate).

## Steps

### Step 1: Schema + merge design

In `Docs/ThoughtWeaver_Supabase_Sync_Design.md`, specify: the Supabase table
(`thought_weaver_captures`: id, user_id, text, filed_to, confidence, destination_name,
created_at, deleted_at) with RLS keyed to the authenticated user; the sync model
(write-through on capture when Supabase configured; merge on load = union by id, local wins
for offline-created rows until synced); and the **never-delete guarantee** (a delete is a
tombstone `deleted_at` set by the user; a local delete never erases the Supabase row for
another device — only a user-initiated delete tombstones it everywhere). Include a decision
on conflict when the same id has divergent text (captures are verbatim + immutable, so text
should never diverge — state that invariant and how it's enforced).

**Verify**: the doc answers, explicitly: offline capture then reconnect (no loss, no dup);
delete-on-device-A visibility on device-B; Supabase-down behavior (local stays authoritative).

### Step 2: Offline + failure walkthrough

Add a section enumerating: Supabase not configured (feature inert, local-only — like One
Save when the flag is off); Supabase configured but unreachable (writes queue/retry, reads
fall back to local); account switch mid-sync (drop stale writes — mirror the One Save
account-change-drop guard). Cite the One Save patterns you're mirroring by file:line.

**Verify**: each failure mode has a defined, no-data-loss behavior in the doc.

### Step 3 (optional POC — only if it stays small): thin sync module + test

If time allows and the design is settled, implement `src/lib/thoughtWeaverSync.ts` with just
`pushCapture()` (write-through) and `mergeOnLoad()` (union by id, tombstone-aware), reading
Supabase config from the existing integrations bundle. Add
`src/test/thoughtWeaverSync.test.ts` (mock the Supabase client) covering: push writes the
row; merge unions without dup; a tombstoned remote row stays deleted; unconfigured Supabase
is a no-op. Do NOT wire it into the widget.

**Verify**: `npx vitest run src/test/thoughtWeaverSync.test.ts` → pass. `npx tsc -b` → 0.

## Done criteria

- [ ] `Docs/ThoughtWeaver_Supabase_Sync_Design.md` exists and answers the offline/delete/down
      questions explicitly, with the never-delete guarantee specified
- [ ] The design cites the One Save patterns it mirrors (file:line)
- [ ] If a POC was written: `thoughtWeaverSync.test.ts` passes and the module is NOT wired
      into the live widget
- [ ] `npx tsc -b` exits 0
- [ ] `plans/README.md` updated; a follow-up build plan is recommended in the doc

## STOP conditions

- The capture store shape differs materially from the assumed shape — update the doc and
  report; don't guess.
- The design surfaces a hard conflict-resolution problem (e.g. captures are actually mutable)
  — STOP and raise it; the verbatim-immutable invariant is load-bearing.
- The POC starts requiring widget changes to be testable — stop at the design; wiring is a
  separate plan.

## Maintenance notes

- Supabase RLS is the security boundary — the build plan must verify a user cannot read
  another user's captures.
- Keep the local store authoritative for offline; Supabase is the durable mirror, never the
  gate.
- The follow-up build plan wires `thoughtWeaverSync` into the widget behind the per-user
  Supabase config and adds an E2E cross-device check.
