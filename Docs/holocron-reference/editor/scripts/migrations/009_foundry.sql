-- 009_foundry.sql
-- The Foundry holding area — architecture-v4 Part 6, Session 4.
-- See architecture-v4.md §6 and Part 13 §4.
--
-- The Foundry is the intake pipeline: Capture → Triage → Review → Admit.
-- Nothing enters the Codex except through here (or the legacy direct-drop
-- into a thread folder, which still works per Part 13 §6 "coexist"
-- recommendation).
--
-- Per Part 13 §4 we go with a separate `foundry_items` table rather than
-- a staging flag on `rag_documents`: the lifecycle is distinct enough,
-- and "nothing is a real document until it's admitted" is a clean
-- invariant. The triage output + source provenance shape is also
-- different enough from rag_documents that a join is cleaner than a
-- column explosion on the main table.
--
-- Lifecycle (`triage_status` values):
--   • pending   — just captured; triage hasn't run yet (or failed twice)
--   • triaged   — Triage Agent (Gemini Flash) populated the suggestions
--   • approved  — Andy approved (Approve / Edit-then-Approve); admitted
--                 to rag_documents via the standard chokidar ingest path
--   • rejected  — Andy rejected; kept around for "undo" + analytics
--
-- IDEMPOTENT — re-runnable. All statements use IF NOT EXISTS guards.

BEGIN;

CREATE TABLE IF NOT EXISTS foundry_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Source provenance ──────────────────────────────────────────────────
  -- source_type values: 'url' | 'paste' | 'file' | 'telegram' | 'icloud'.
  -- 'url' covers Firecrawl scrapes + any future readability-extract path.
  -- 'paste' is the in-app textarea + title. 'file' is the manual upload
  -- path (the existing "+ Ingest file…" picker, unified here eventually).
  -- 'telegram' + 'icloud' arrive via Hermes (Session 5).
  source_type           TEXT NOT NULL,
  source_url            TEXT,           -- for url / telegram sources
  source_filename       TEXT,           -- for file / paste sources (the title)
  raw_content           TEXT NOT NULL,  -- the captured markdown / text

  -- ── Triage output (populated by the Triage Agent — Gemini Flash) ───────
  triage_status         TEXT NOT NULL DEFAULT 'pending',
  proposed_tags         TEXT[],         -- 3-7 kebab-case tags
  proposed_domain       TEXT,           -- matches a rag_domaines.name, or NULL
  quality_score         REAL,           -- 0.0-1.0 (0=noise, 1=highly relevant)
  signal_assessment     TEXT,           -- one-sentence triage note
  -- proposed_connections is reserved for the follow-up enhancement: the
  -- Triage Agent's `connections` field per arch §6.3 (suggested
  -- rag_documents to link the candidate to). The Session-4 prompt doesn't
  -- populate this — connections will be derived server-side via
  -- tag-overlap + tsvector search in a future pass. Column kept so the
  -- shape is settled.
  proposed_connections  UUID[],
  triage_completed_at   TIMESTAMPTZ,

  -- ── Review outcome ─────────────────────────────────────────────────────
  reviewed_at           TIMESTAMPTZ,
  reviewer_notes        TEXT,

  -- ── Admission ──────────────────────────────────────────────────────────
  -- admitted_doc_id links to the rag_documents row created when chokidar
  -- picks up the disk file written by the Approve flow. SET NULL on
  -- cascade so a downstream rag_documents delete leaves the foundry
  -- audit trail intact (you can still see what was admitted, even if the
  -- final doc is gone).
  admitted_at           TIMESTAMPTZ,
  admitted_doc_id       UUID REFERENCES rag_documents(id) ON DELETE SET NULL,
  target_thread         TEXT,           -- optional thread assignment

  -- Lifecycle constraint: status values are bounded. CHECK rather than an
  -- enum so future statuses don't require an ALTER TYPE.
  CONSTRAINT foundry_items_status_check
    CHECK (triage_status IN ('pending', 'triaged', 'approved', 'rejected')),
  CONSTRAINT foundry_items_source_check
    CHECK (source_type IN ('url', 'paste', 'file', 'telegram', 'icloud'))
);

-- updated_at trigger. Touches the column on any UPDATE so the renderer
-- can stable-sort the queue by "last touched" once the Edit-then-Approve
-- flow lands. Idempotent: function CREATE OR REPLACE; trigger DROP+CREATE
-- pattern so re-runs leave the trigger in its current shape.
CREATE OR REPLACE FUNCTION foundry_items_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS foundry_items_updated_at ON foundry_items;
CREATE TRIGGER foundry_items_updated_at
  BEFORE UPDATE ON foundry_items
  FOR EACH ROW
  EXECUTE FUNCTION foundry_items_touch_updated_at();

-- ── Indexes ────────────────────────────────────────────────────────────
-- The Review queue's primary query is "list pending+triaged items,
-- newest first" + secondary "list approved/rejected for the collapsed
-- sections." A composite index on (triage_status, created_at DESC)
-- serves both.
CREATE INDEX IF NOT EXISTS foundry_items_status_created_idx
  ON foundry_items(triage_status, created_at DESC);

-- Reverse lookup: when a rag_documents row's source_path matches an
-- admitted Foundry item, we may want to surface "this doc came from the
-- Foundry" in the future. Indexed on admitted_doc_id (sparse — most
-- rows are NULL here until approved).
CREATE INDEX IF NOT EXISTS foundry_items_admitted_doc_idx
  ON foundry_items(admitted_doc_id)
  WHERE admitted_doc_id IS NOT NULL;

COMMIT;
