-- 002_namespaces.sql
-- Namespace isolation gate for tag-overlap relationships.
-- See architecture-v2.md §"Namespace & Context Isolation".
--
-- Rule: tag-shared relationships only form within the same namespace, OR
-- when at least one side's namespace has is_bridge_namespace = TRUE.
-- Namespace identity is derived from rag_documents.project_name, with
-- _Library and _Inbox docs (NULL project_name) mapped to synthetic
-- '__library__' / '__inbox__' rows that default to bridges.

CREATE TABLE IF NOT EXISTS rag_namespaces (
  name                 TEXT PRIMARY KEY,
  is_bridge_namespace  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Backfill: every distinct project_name currently in rag_documents gets an
-- isolated namespace row. Idempotent on re-run.
INSERT INTO rag_namespaces (name)
SELECT DISTINCT project_name FROM rag_documents WHERE project_name IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Bridge defaults for the synthetic library/inbox namespaces. Cross-domain
-- by design: a Library reference can form relationships with anything.
INSERT INTO rag_namespaces (name, is_bridge_namespace) VALUES
  ('__library__', TRUE),
  ('__inbox__',   TRUE)
ON CONFLICT (name) DO NOTHING;

-- One-time cleanup of cross-namespace tag-shared rows that step 3 wrote
-- before this gate existed. After this DELETE, the only writer is the
-- gated recomputeTagOverlap in ragIngest.ts, so re-runs delete nothing.
DELETE FROM rag_relationships r
WHERE r.relationship = 'tag-shared'
  AND EXISTS (
    SELECT 1
    FROM rag_documents da
    JOIN rag_documents db ON db.id = r.document_b_id
    LEFT JOIN rag_namespaces na ON na.name = COALESCE(da.project_name, '__' || da.source_root || '__')
    LEFT JOIN rag_namespaces nb ON nb.name = COALESCE(db.project_name, '__' || db.source_root || '__')
    WHERE da.id = r.document_a_id
      AND COALESCE(da.project_name, '__' || da.source_root || '__') <> COALESCE(db.project_name, '__' || db.source_root || '__')
      AND COALESCE(na.is_bridge_namespace, FALSE) = FALSE
      AND COALESCE(nb.is_bridge_namespace, FALSE) = FALSE
  );
