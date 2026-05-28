# Phase 1: Real Content Validation

**Date:** 2026-05-11
**Protocol:** `architecture-v3.md` §"Phase 1: Real Content Validation"
**Goal:** Validate the RAG pipeline (tag extraction, relationship detection, wiki compilation) against real PRD content rather than synthetic smoke-test data.

---

## Pre-state (before cleanup)

- Active docs: **35** (STATUS.md said 22 — stale)
- Tags: **165**
- Relationships: **3657** (≈104 edges/doc — clearly inflated by synthetic corpus)
- Wiki pages: **6** (rag_wiki_pages table) / **9** wiki documents (rag_documents)
- Wiki disk artifacts in `_Library/Wiki/`: **9 files**

## Post-cleanup state (interim — superseded by full reset)

After the targeted cleanup landed the active count at 10 docs / 53 tags / 1 rel / 0 wiki pages, with 98 inactive rows still bloating raw counts (inert per `is_active` filter in ragWiki). Andy elected to do a complete reset rather than carry forward the inactive bloat.

## Full reset state (verified 2026-05-11, true zero)

```
TRUNCATE TABLE rag_documents, rag_tags, rag_wiki_pages, rag_syntheses, rag_operations_log RESTART IDENTITY CASCADE;
```

CASCADE handled rag_document_tags, rag_relationships, rag_wiki_page_sources via FK chains.

**Wiped:**
- rag_documents: 108 → **0**
- rag_tags: 128 → **0**
- rag_document_tags: → **0**
- rag_relationships: 2728 → **0**
- rag_wiki_pages: 2 → **0**
- rag_wiki_page_sources: → **0**
- rag_syntheses: → **0**
- rag_operations_log: → **0**

**Preserved:**
- rag_namespaces: 5 (`AstraStrata_PRDs`, `Agenteryx`, `Test_Isolation`, `__library__`, `__inbox__`)
- rag_domaines: 1 (`General`)
- rag_config: 2 (daily_budget_usd=5, budget_hard_stop=false)
- rag_schema_migrations: 5 (001→005)

**Disk artifacts:**
- `_Library/Wiki/` — empty
- All 41 disk files removed in the prior targeted cleanup remain removed (29 BD_*.md test files, 9 wiki artifacts, 2 borderline, 1 v3)

**Implication for Stage A:** The 4 PRD-02-Astra docs that previously sat in DB are gone too. All ingestions in Stage A and Stage B are now net-new (no re-ingest path).

## Cleanup batch (25 doc rows + matching disk files)

**Deleted:**
- 11 smoke-test BDs (`BD_diag_*`, `BD_wiki_*`, `BD_watchtest_*`, `BD_shipgate_*`, `BD_overlap_smoketest_*`)
- 9 polluted wiki documents (`astra-strata`, `strategic-alignment`, `q3-planning`, `ai-integration`, `case-management`, `brain-dump`, `task-tracking`, `project-delivery`, `workstreams`)
- 4 borderline (`untitled.md` empty Agenteryx/Dev, `BD_AstraStrata_PRDs_PRD-02-Astra`, `BD_AstraStrata_PRDs_Holocron_Build`, `Notes_AstraStrata_PRDs_Holocron_Build`)
- 1 superseded revision (`PRD-02-A2 - Case File Management_v3.md`)

**Kept (baseline = 11 docs):**
- 4 PRD-02-Astra docs in DB: A1 HUD, A2 Case File (current), A3 Global Task Manager (+ A0 will be ingested in Stage A)
- 7 Agenteryx/Dev background docs (Library, HANDOFF_v07_step-11, Questions about Wiki RAG, Working Ideas, Items and Notes, Notes 2026-05-09, Agenteryx)

## Validation corpus (post-Stage-A + Stage-B = 15 active docs)

**Stage A — 4 PRD-02-Astra docs:**
- PRD-02-A0 Astra Overview (NEW ingestion, ~3500w from 22KB)
- PRD-02-A1 The HUD (re-ingest, 6079w)
- PRD-02-A2 Case File Management (re-ingest, 6986w)
- PRD-02-A3 Global Task Manager (re-ingest, 2979w)

**Stage B — 3 PRD-01-Global docs:**
- PRD-01-G1 Global Shell (NEW, ~3500w from 25KB)
- PRD-01-G2 Object Model (NEW, ~2900w from 20KB)
- PRD-01-G3 Global Search (NEW, ~3700w from 26KB)

**Background noise:** 7 Agenteryx/Dev docs (already ingested). Should not bleed into PRD relationships.

---

## Andy's expectations (written BEFORE ingestion)

### Q1 — Tag expectations

**Expected good tags:** `case-file`, `global-shell`, `object-model`, `task-management`, `heads-up-display`, `astra-module`, `case-routing`, `ai-integration`, `search-indexing`, `workspace`

**Red-flag generic tags (signal tag collapse):** `ui`, `design`, `system`

**Synonyms to watch:**
- `case file` / `case management` / `case-mgmt` should collapse to one tag (yellow flag if kept distinct, not a failure)
- `global shell` / `shell` / `app-shell` should collapse to one tag (same threshold)

### Q2 — Relationship expectations

**Strong-tie pairs that MUST connect:**
- PRD-02-A1 HUD ↔ PRD-02-A2 Case File (HUD surfaces case info)
- PRD-02-A2 Case File ↔ PRD-02-A3 Global Task Manager (tasks live inside cases)
- PRD-01-G1 Global Shell ↔ PRD-02-A0 Astra Overview (shell hosts Astra)
- PRD-01-G2 Object Model ↔ PRD-02-A2 Case File (Object Model defines what a case is)

**Cross-PRD bridges that should connect:**
- PRD-01-G3 Global Search ↔ PRD-02-A3 Global Task Manager (search surfaces tasks)
- PRD-01-G2 Object Model ↔ PRD-02-A3 Global Task Manager (tasks are objects)

**Pairs that should NOT connect (false-positive watch):**
- PRD-01-G3 Global Search ↔ PRD-02-A1 HUD (parallel modules, not related)
- Any PRD ↔ Agenteryx/Dev docs (meta-content about building Holocron, not Astra-domain content — heavy connection here = namespace leakage signal)

**Edge density target:** 10-30 edges/doc. Anything over 50 = over-connection.

### Q3 — Wiki page expectations

**Expected wiki pages to compile:**
- `case-management` — primary sources: A2 Case File, A3 Task Manager, G2 Object Model
- `global-shell` — primary sources: G1 Global Shell, A0 Astra Overview
- `astra-overview` — primary sources: A0 Overview, A1 HUD, A2 Case File

**All deleted wiki pages were wrong** (synthetic corpus produced wiki drift across the board — summarization without synthesis).

### Q4 — Namespace / Domaine

**Decision:** Keep everything in General Domaine for this validation pass. No new Domaines created. Goal is pipeline validation, not org structure. Re-Domaine after the pipeline is proven on real content.

---

## Failure modes to watch for (per arch-v3 §"Four Failure Modes")

1. **Tag collapse** — extractor produces only generic tags
2. **Relationship sparsity** — obvious connections missing from the graph
3. **Wiki drift** — wiki page reads as TOC instead of synthesis
4. **Namespace leakage** — PRDs and Agenteryx/Dev docs heavily connected, or wrong project_name assignments

---

## Stage A results (TO FILL IN AFTER INGESTION)

- Active docs:
- Tags:
- Relationships:
- Wiki pages compiled:
- Edge density:

**Tag observations:**

**Relationship observations (vs Q2 strong-tie pairs):**

**Wiki observations:**

**Failure mode flags:**

---

## Stage B results (TO FILL IN AFTER INGESTION)

- Active docs:
- Tags:
- Relationships:
- Wiki pages compiled:
- Edge density:

**Cross-PRD bridge observations (vs Q2 cross-PRD pairs):**

**Wiki observations:**

**Failure mode flags:**

---

## Validation question (TO ASK AFTER STAGE B)

A real operational question about the AstraStrata module specs (not a test question). E.g., "What are the integration points between the HUD and the Case File system?" or "How does Global Search interact with the Object Model?"

**Question:**

**Answer (with citations):**

**Verdict (uses my docs / surfaces non-obvious connection / no confabulation?):**

---

## Verdict

**Pipeline ready for production ingestion?**

**Action items:**
