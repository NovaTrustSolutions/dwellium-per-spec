-- 007_wiki_three_tier.sql
-- Convert rag_wiki_pages from TAG-anchored to NAMESPACE-anchored, with a
-- three-tier hierarchy:
--
--   • thread wiki  — one page per (domaine, project, thread).
--                    Sources = raw rag_documents in that thread.
--   • project wiki — one page per (domaine, project), synthesizing the
--                    thread wikis underneath it.
--   • domaine wiki — one page per domaine, synthesizing the project wikis
--                    underneath it.
--
-- Existing tag-anchored pages have semantics that don't map cleanly to the
-- new model (a tag-page can span Domaines; a tier-1 page belongs to ONE
-- Domaine). Andy opted for a clean slate — DROP every wiki_pages row,
-- bootstrap recompiles on next boot.
--
-- IDEMPOTENT — re-runnable.

BEGIN;

-- 1. Clear all wiki content. CASCADE drops rag_wiki_page_sources rows
--    via the FK ON DELETE CASCADE declared in migration 003.
DELETE FROM rag_wiki_pages;

-- 2. New columns. `namespace` is the project_name for tier-1 + tier-2
--    pages, NULL for tier-3. `tier` discriminates: 'thread' | 'project'
--    | 'domaine'.
ALTER TABLE rag_wiki_pages
  ADD COLUMN IF NOT EXISTS namespace TEXT;

ALTER TABLE rag_wiki_pages
  ADD COLUMN IF NOT EXISTS tier TEXT;

-- 3. Drop the old slug-only PK-style UNIQUE constraint (added in
--    migration 001 via `slug TEXT UNIQUE`).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rag_wiki_pages_slug_key'
      AND conrelid = 'rag_wiki_pages'::regclass
  ) THEN
    ALTER TABLE rag_wiki_pages DROP CONSTRAINT rag_wiki_pages_slug_key;
  END IF;
END $$;

-- 4. Add composite uniqueness on (slug, namespace, domaine_id) with NULLS
--    NOT DISTINCT so two domaine-tier rows with namespace=NULL but
--    different domaine_ids are unique, while two rows with the same
--    triplet are rejected. Requires Postgres 15+, matches the pattern
--    used by rag_namespaces in migration 006.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'rag_wiki_pages_slug_namespace_domaine_unique'
  ) THEN
    ALTER TABLE rag_wiki_pages
      ADD CONSTRAINT rag_wiki_pages_slug_namespace_domaine_unique
      UNIQUE NULLS NOT DISTINCT (slug, namespace, domaine_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS rag_wiki_pages_tier_idx
  ON rag_wiki_pages(tier);
CREATE INDEX IF NOT EXISTS rag_wiki_pages_namespace_domaine_idx
  ON rag_wiki_pages(namespace, domaine_id);

COMMIT;
