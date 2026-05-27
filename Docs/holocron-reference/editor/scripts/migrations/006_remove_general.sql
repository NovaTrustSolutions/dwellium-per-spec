-- 006_remove_general.sql
-- Architectural reset for the nested Domaine folder layout.
-- See HANDOFF_v11_org-crud.md and the v11 follow-up architectural reset.
--
-- Changes:
--   1. Drop NOT NULL on rag_namespaces.domaine_id (bridges live without one).
--   2. NULL out bridge namespaces' Domaine assignment.
--   3. DELETE all user namespace rows (clean slate; future ingestion seeds
--      new rows with the right Domaine derived from the document's path).
--   4. DELETE the General row in rag_domaines — no fallback exists anymore.
--   5. Replace rag_namespaces.name PK with a synthetic UUID id PK, so we
--      can have composite (name, domaine_id) uniqueness with nullable
--      domaine_id (Postgres 15+ NULLS NOT DISTINCT — bridges with NULL
--      domaine_id can't be duplicated, but two projects with the same
--      name in different Domaines CAN coexist, e.g. AstraStrata/Chalet
--      and Personal/Chalet).
--   6. Add UNIQUE NULLS NOT DISTINCT (name, domaine_id).
--
-- IDEMPOTENT — re-runnable.

BEGIN;

-- 1. Allow domaine_id to be NULL (for bridges).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rag_namespaces' AND column_name = 'domaine_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE rag_namespaces ALTER COLUMN domaine_id DROP NOT NULL;
  END IF;
END $$;

-- 2. NULL out bridges (currently pointing at General).
UPDATE rag_namespaces SET domaine_id = NULL
  WHERE name IN ('__library__', '__inbox__');

-- 3. Clean slate for user namespaces. The DB content was truncated earlier
--    in the v11 session; this defensively removes any user rows that may
--    still exist. Bridge namespaces are preserved.
DELETE FROM rag_namespaces WHERE name NOT IN ('__library__', '__inbox__');

-- 4. Drop General Domaine. After step 3 nothing references it.
DELETE FROM rag_domaines WHERE name = 'General';

-- 5. Replace the (name) PK with a synthetic UUID id PK so we can have
--    composite (name, domaine_id) uniqueness with nullable domaine_id.
ALTER TABLE rag_namespaces ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();
UPDATE rag_namespaces SET id = gen_random_uuid() WHERE id IS NULL;
ALTER TABLE rag_namespaces ALTER COLUMN id SET NOT NULL;

DO $$
BEGIN
  -- Drop the existing PK (on `name`) only if that's still its shape.
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rag_namespaces_pkey'
      AND conrelid = 'rag_namespaces'::regclass
      AND pg_get_constraintdef(oid) LIKE '%(name)%'
  ) THEN
    ALTER TABLE rag_namespaces DROP CONSTRAINT rag_namespaces_pkey;
  END IF;
  -- Add PK on id only if not already present.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rag_namespaces_pkey'
      AND conrelid = 'rag_namespaces'::regclass
  ) THEN
    ALTER TABLE rag_namespaces ADD PRIMARY KEY (id);
  END IF;
END $$;

-- 6. Composite uniqueness on (name, domaine_id) with NULL treated as equal
--    so bridges (NULL domaine_id) can't be duplicated, but the same project
--    name CAN appear in two different Domaines.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rag_namespaces_name_domaine_unique'
  ) THEN
    ALTER TABLE rag_namespaces
      ADD CONSTRAINT rag_namespaces_name_domaine_unique
      UNIQUE NULLS NOT DISTINCT (name, domaine_id);
  END IF;
END $$;

COMMIT;
