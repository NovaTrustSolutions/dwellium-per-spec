-- 004_domaines.sql
-- Add Domaines as the top organizational level above Projects.
-- See architecture-v2.md §"Domaines" (to be added in this commit batch).
--
-- A Domaine groups Projects. Each project's namespace (rag_namespaces row)
-- carries a domaine_id FK linking it to its Domaine. Domaine grouping is
-- the new default scope for cross-namespace queries; the existing
-- is_bridge_namespace flag stays per-namespace and is preserved.
--
-- Migration creates a default "General" Domaine and assigns every existing
-- namespace (including the synthetic __library__ / __inbox__ namespaces)
-- to it, so nothing breaks. Users can create additional Domaines and
-- reassign projects via the Domaines tab UI.

CREATE TABLE IF NOT EXISTS rag_domaines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT UNIQUE NOT NULL,
  description TEXT,
  color       TEXT,                         -- hex tint for the badge, optional
  position    INTEGER NOT NULL DEFAULT 0,   -- user-defined ordering in the Domaines tab
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the General Domaine (idempotent — ON CONFLICT keeps the existing row's id).
INSERT INTO rag_domaines (name, position)
VALUES ('General', 0)
ON CONFLICT (name) DO NOTHING;

-- Add the FK to rag_namespaces. Nullable initially so the backfill UPDATE
-- can populate, then enforced NOT NULL after backfill.
ALTER TABLE rag_namespaces
  ADD COLUMN IF NOT EXISTS domaine_id UUID REFERENCES rag_domaines(id);

UPDATE rag_namespaces
SET domaine_id = (SELECT id FROM rag_domaines WHERE name = 'General')
WHERE domaine_id IS NULL;

-- Enforce NOT NULL only if every row was successfully backfilled. The check
-- below makes this re-runnable: on second run domaine_id is already NOT NULL
-- and the ALTER is a no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM rag_namespaces WHERE domaine_id IS NULL) THEN
    BEGIN
      ALTER TABLE rag_namespaces ALTER COLUMN domaine_id SET NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      -- already NOT NULL; ignore
      NULL;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rag_namespaces_domaine_idx ON rag_namespaces(domaine_id);
