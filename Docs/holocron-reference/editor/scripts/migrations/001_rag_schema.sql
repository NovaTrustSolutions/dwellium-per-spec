-- Holocron RAG schema (Level 4 — no pgvector)
-- Source: docs/architecture-v2.md §"Database schema"
-- Idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS rag_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_path     TEXT NOT NULL,
  source_root     TEXT NOT NULL,        -- 'projects' | 'library' | 'inbox'
  source_type     TEXT NOT NULL,        -- 'brain_dump' | 'report' | 'note' |
                                        -- 'reference' | 'wiki' | 'synthesis' | 'inbox'
  project_name    TEXT,
  thread_name     TEXT,
  title           TEXT,
  content         TEXT NOT NULL,
  word_count      INTEGER,
  ingested_at     TIMESTAMPTZ DEFAULT NOW(),
  last_modified   TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE,
  content_tsv     tsvector GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,''))
  ) STORED
);
CREATE INDEX IF NOT EXISTS rag_documents_tsv_idx     ON rag_documents USING GIN (content_tsv);
CREATE INDEX IF NOT EXISTS rag_documents_source_idx  ON rag_documents (source_root, source_type);
CREATE INDEX IF NOT EXISTS rag_documents_project_idx ON rag_documents (project_name, thread_name);

CREATE TABLE IF NOT EXISTS rag_tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  category   TEXT,                      -- 'topic' | 'person' | 'property' | 'project'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_document_tags (
  document_id UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
  tag_id      UUID REFERENCES rag_tags(id) ON DELETE CASCADE,
  confidence  FLOAT DEFAULT 1.0,
  PRIMARY KEY (document_id, tag_id)
);

CREATE TABLE IF NOT EXISTS rag_relationships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_a_id   UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
  document_b_id   UUID REFERENCES rag_documents(id) ON DELETE CASCADE,
  relationship    TEXT NOT NULL,         -- 'wikilink' | 'tag-shared' | 'contradicts' |
                                         -- 'expands' | 'summarizes' | 'references'
  strength        FLOAT DEFAULT 0.5,
  discovered_by   TEXT DEFAULT 'agent',  -- 'agent' | 'user' | 'tag-overlap'
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_relationships_a_idx ON rag_relationships (document_a_id);
CREATE INDEX IF NOT EXISTS rag_relationships_b_idx ON rag_relationships (document_b_id);

CREATE TABLE IF NOT EXISTS rag_wiki_pages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT UNIQUE NOT NULL,
  title        TEXT NOT NULL,
  content      TEXT NOT NULL,
  source_count INTEGER DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  compiled_by  TEXT DEFAULT 'agent'
);

CREATE TABLE IF NOT EXISTS rag_syntheses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title          TEXT,
  query          TEXT NOT NULL,
  content        TEXT NOT NULL,
  source_doc_ids UUID[],
  captured_back  BOOLEAN DEFAULT FALSE,
  captured_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rag_operations_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation   TEXT NOT NULL,             -- 'ingest' | 'compile' | 'query' |
                                         -- 'synthesize' | 'capture' | 'connect'
  target_id   UUID,
  target_type TEXT,
  details     JSONB,
  duration_ms INTEGER,
  cost_usd    NUMERIC(10,6),
  provider    TEXT,                      -- 'gemini' | 'anthropic' | 'lmstudio'
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS rag_operations_log_date_idx ON rag_operations_log (created_at DESC);

CREATE TABLE IF NOT EXISTS rag_config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
