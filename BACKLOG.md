# Dwellium — Backlog (deferred, agreed work)

Things we've explicitly decided to do *later*. Newest first.

---

## ☐ ThoughtWeaver phone sync via Supabase  — *added 2026-05-30, deferred by Ilya*

**Goal:** Let the user capture thoughts from a phone and have them appear in ThoughtWeaver on the desktop (and vice-versa), without losing the "trusted, never-deleted" guarantee.

**Why this route:** the capture store is currently per-browser `localStorage` (`thought-weaver:captures:<userId>`), so a phone can't reach what's on the desktop. Supabase is the recommended path because it's already wired into the app (per-user Supabase config in the integrations bundle) and works without standing up the heavy Dwellium backend.

**Sketch of the work (when picked up):**
- Add a `thought_weaver_captures` table in the user's Supabase (cols mirror `LocalCapture`: id, user_id, text, filed_to, confidence, destination_name, created_at). RLS so a user only sees their own rows.
- Sync layer: on capture, write-through to Supabase when configured; on load, merge Supabase rows with local (local stays the offline-first source of truth so nothing is ever lost if Supabase is down).
- A mobile-friendly capture route/page (PWA-installable) that writes to the same table — minimal UI: textarea + Capture, reuse `localCategorize` for instant bucketing.
- Keep user-only-delete + verbatim-text guarantees across the sync.

**Relevant files:** `qualia-shell/src/components/ThoughtWeaver/thoughtWeaverStore.ts` (store + would gain a sync adapter), `localCategorizer.ts`, `localViews.ts`, the integrations Supabase config (`src/utils/integrationsStore.ts` / `useIntegrations`). Supabase MCP is connected for schema work.

**Acceptance:** a thought added on phone shows on desktop within a refresh; offline still works (local-first); a verified test of the sync/merge logic (not just "builds green").
