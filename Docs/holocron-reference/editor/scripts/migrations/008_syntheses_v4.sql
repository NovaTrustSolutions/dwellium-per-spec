-- 008_syntheses_v4.sql
-- Extend rag_syntheses for the architecture-v4 Syntheses tab.
-- See architecture-v4.md §7.5.
--
-- The current table (migration 001) holds the dormant fields for a
-- chat-answer-capture flow (`query`, `captured_back`, `captured_at`) that
-- was never wired. v4 turns the table into the persistence layer for
-- agent-generated synthesis documents: gap-bridges between Louvain
-- communities, theme syntheses, cross-Domaine connections, and
-- write-ups of approved Honcho dreams.
--
-- New columns:
--   • synthesis_type   — the kind of synthesis ('gap-bridge' | 'theme' |
--                        'cross-domain' | 'honcho-dream' | NULL for legacy).
--   • source_clusters  — JSONB array of {id, name} for the Louvain
--                        communities this synthesis draws on. NULL when
--                        derived from a dream rather than clusters.
--   • gap_id           — stable identifier for the structural gap this
--                        synthesis bridges. NULL unless gap-bridge.
--   • dream_id         — originating Honcho dream id. NULL unless dream.
--   • disk_path        — `_Library/Syntheses/<slug>.md`, mirroring the
--                        wiki-page disk-path convention so the boot
--                        self-healer can treat syntheses like wiki pages
--                        (row with no file, or file with no row, is a
--                        fixable invariant violation).
--   • domaine_id       — owning Domaine, nullable. Cross-Domaine
--                        syntheses are NULL; single-Domaine ones get set
--                        so the Syntheses tab can be Domaine-filtered.
--
-- Legacy columns kept as-is: `query`, `captured_back`, `captured_at` —
-- they're still useful for the future "capture a chat answer back to
-- Syntheses" flow (Part 13 question 13). `query` becomes NULLABLE so
-- agent-written syntheses (which have no originating query) can persist.
--
-- IDEMPOTENT — re-runnable. All ALTERs are IF NOT EXISTS or guarded.

BEGIN;

ALTER TABLE rag_syntheses
  ADD COLUMN IF NOT EXISTS synthesis_type TEXT;

ALTER TABLE rag_syntheses
  ADD COLUMN IF NOT EXISTS source_clusters JSONB;

ALTER TABLE rag_syntheses
  ADD COLUMN IF NOT EXISTS gap_id TEXT;

ALTER TABLE rag_syntheses
  ADD COLUMN IF NOT EXISTS dream_id TEXT;

ALTER TABLE rag_syntheses
  ADD COLUMN IF NOT EXISTS disk_path TEXT;

ALTER TABLE rag_syntheses
  ADD COLUMN IF NOT EXISTS domaine_id UUID REFERENCES rag_domaines(id);

-- `query` was NOT NULL in migration 001. Agent-generated syntheses don't
-- have an originating query, so relax to NULLABLE. Guarded so re-runs are
-- no-ops (the check looks for is_nullable = 'NO' on the column).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_syntheses'
      AND column_name = 'query'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE rag_syntheses ALTER COLUMN query DROP NOT NULL;
  END IF;
END $$;

-- Index Domaine-filtered lookups (the Syntheses tab's primary filter)
-- and synthesis_type partitioning (count "gap-bridge" syntheses per
-- Domaine, etc.).
CREATE INDEX IF NOT EXISTS rag_syntheses_domaine_idx
  ON rag_syntheses(domaine_id);
CREATE INDEX IF NOT EXISTS rag_syntheses_type_idx
  ON rag_syntheses(synthesis_type);
CREATE INDEX IF NOT EXISTS rag_syntheses_disk_path_idx
  ON rag_syntheses(disk_path);

COMMIT;
