-- 003_wiki_sources.sql
-- Join table mapping a compiled wiki page to the source rag_documents that
-- back it. Required by step 10's "affected pages" lookup — without it,
-- finding which wiki pages share tags with a freshly-ingested document
-- would require an expensive tag-cardinality scan on every recompile.

CREATE TABLE IF NOT EXISTS rag_wiki_page_sources (
  wiki_page_id UUID REFERENCES rag_wiki_pages(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES rag_documents(id)  ON DELETE CASCADE,
  PRIMARY KEY (wiki_page_id, document_id)
);

CREATE INDEX IF NOT EXISTS rag_wiki_page_sources_doc_idx
  ON rag_wiki_page_sources(document_id);
