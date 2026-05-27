-- 005_wiki_pages_domaine.sql
-- Domaine assignment for wiki pages.
--
-- A wiki page is compiled from N source documents that may span multiple
-- Domaines. Per Andy's spec, the page is assigned to its DOMINANT Domaine
-- (the one contributing the most source rows), with an overflow_count
-- tracking how many OTHER Domaines contributed. The renderer shows the
-- dominant Domaine as a chip and the overflow as a "+N" indicator.
--
-- This migration adds the columns. The assignment logic at compile time
-- lands in commit 8 (ragWiki.ts changes); until then, existing wiki pages
-- have domaine_id = NULL (treated as "unassigned" in the UI, visible only
-- under "Across all Domaines").

ALTER TABLE rag_wiki_pages
  ADD COLUMN IF NOT EXISTS domaine_id UUID REFERENCES rag_domaines(id);

ALTER TABLE rag_wiki_pages
  ADD COLUMN IF NOT EXISTS domaine_overflow_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS rag_wiki_pages_domaine_idx ON rag_wiki_pages(domaine_id);
