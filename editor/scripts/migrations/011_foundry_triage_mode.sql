-- 011_foundry_triage_mode.sql
-- Add triage_mode to foundry_items so the Triage Agent can be opted out
-- of cleaning on a per-capture basis.
--
-- Two modes:
--   'extract' (default) — current behavior. Gemini Flash proposes tags
--                          + Domain + quality score + signal assessment,
--                          AND rewrites the body into cleaned_content
--                          (boilerplate stripped). What lands on disk
--                          on Approve is the cleaned version.
--   'convert'           — skip cleaning. Tags + Domain + quality + signal
--                          still get extracted, but cleaned_content stays
--                          NULL and the raw_content is what gets written
--                          on Approve. Used for paste-text (the user
--                          already curated it) and for any URL/file
--                          capture where Andy wants the source preserved
--                          word-for-word.
--
-- NOT NULL with DEFAULT 'extract' so any rows captured before this
-- migration get the safe default. CHECK constraint pins the value set
-- so a typo never breaks the rendering paths that switch on it.
--
-- IDEMPOTENT — `IF NOT EXISTS` on the column add, `DO $$` guard on the
-- CHECK constraint add (CHECK doesn't have IF NOT EXISTS in Postgres).

BEGIN;

ALTER TABLE foundry_items
  ADD COLUMN IF NOT EXISTS triage_mode TEXT NOT NULL DEFAULT 'extract';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'foundry_items_triage_mode_check'
  ) THEN
    ALTER TABLE foundry_items
      ADD CONSTRAINT foundry_items_triage_mode_check
        CHECK (triage_mode IN ('extract', 'convert'));
  END IF;
END $$;

COMMIT;
