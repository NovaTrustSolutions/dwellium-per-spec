# Holocron → Agenteryx: Architecture V3
**Status:** Vision & Planning Document  
**Prepared for:** Opus deep planning session  
**Author:** Andy (via brainstorming session with Claude Sonnet)  
**Date:** May 2026

---

## How to Use This Document

This is a briefing document for a deep planning session. It contains:
1. What Holocron currently is and does (ground truth)
2. What is broken and must be fixed before expanding
3. The renamed terminology that will govern all future development
4. The expanded vision — new modules, new hierarchy, new pipelines
5. The sequencing recommendation — what to build in what order and why

Read it fully before proposing any implementation plan. Do not skip to the vision section without understanding the current state and the trust issues.

---

## Part 1: What Holocron Is Today

Holocron is a **local-first, AI-powered document production and knowledge management system** built on Electron, React, and TypeScript. It is a personal tool built by and for Andy — a solo power user running a property management business (AstraStrata) while simultaneously using Holocron for personal research, health tracking, relationship notes, and AI/coding learning.

### Current Modules

**Scribe** (formerly: Editor)  
A professional markdown editor built on CodeMirror 6. Supports redlines, comments, versioning, and smart paste. This is where documents are actively created and edited.

**Agent / Chat**  
A multi-provider LLM interface supporting Claude Sonnet, Gemini Flash/Pro, and local LM Studio models. Includes cost tracking. This is the primary interaction surface for AI-assisted work.

**RAG Pipeline**  
PostgreSQL + tsvector. Auto-ingests documents, extracts tags, builds relationships between documents, and compiles wiki pages every 5 ingests via Gemini Flash. The compounding knowledge loop is the core value proposition of the system.

**Codex** (formerly: Library)  
Full-text search, wiki browser, and read-only preview for cross-thread documents. This is the knowledge repository — the output of the RAG pipeline made browsable.

**Dashboard**  
System status, knowledge base stats, and API spend tracking.

**Namespace Isolation**  
Separates Work, Personal, and Learning domains with configurable bridge namespaces. Architecture exists in the database but has almost no UI surface — effectively invisible to the user.

**Thread / Project Model**  
Each thread is a focused conversation + document workspace. Projects group related threads.

### Primary Use Cases (Today)
- Brain dump intake and structuring
- Report generation and redline editing
- Versioned document outputs
- Property management work (AstraStrata PRDs, lease templates, tenant communication)
- Personal research and note-taking
- AI/coding learning and documentation

### Core Design Constraints
- **Local-first, always.** Data never touches a cloud server Andy doesn't control. Agents can be cloud. Knowledge cannot.
- **Privacy over convenience.** AstraStrata client data, personal notes, health information — all local.
- **Cost-aware.** Every API call is tracked. The pipeline is designed to use cheap models (Gemini Flash) for bulk processing and expensive models (Claude Sonnet, Opus) only when warranted.

---

## Part 2: What Is Broken (Fix Before Expanding)

These are not missing features. They are correctness failures that actively mislead the user and must be resolved before adding new capabilities — because they corrupt the user's ability to evaluate whether the system is working.

### 🔴 Trust Layer Failures

**1. Context / Token Counter**  
Currently displays output tokens, not input tokens. Input tokens are approximately 10x larger due to system prompts, RAG context, and conversation history. This means the user has no accurate signal for when the model is approaching context limits. It is directly responsible for observed hallucination and context-drop behavior. The user thinks there is headroom when there isn't.

*Fix required:* Either display accurate input token count, or replace the token metaphor entirely with a knowledge-worker-legible "Working Memory" model (see Part 4).

**2. Clear Button**  
Resets UI state only. Does not clear Honcho memory. The user's mental model of "Clear" is "start genuinely fresh." The system delivers a cosmetic reset. This is the most trust-damaging failure because it looks like it worked.

*Fix required:* Either clear Honcho memory completely on Clear, or clearly communicate what was and was not cleared: "Conversation reset. Honcho memory retained — clear memory separately?"

**3. Wiki Preview Renders Raw Markdown** ✅ **FIXED**
The wiki is the primary output of the RAG compounding loop — the proof that the system is getting smarter about the user's knowledge. It previously rendered as unstyled plain text. Every time the user opened a wiki, the system was actively demonstrating that it didn't work, even when the underlying content may have been good.

*Resolution:* Styled markdown rendering shipped in the Codex Wiki sub-tab (commits `f256357` / `7e568fb`), with `codex-preview-md` CSS class. Domaine-aware Wiki pages added in Task 2 commits 7 + 8 (dominant Domaine + "+N" overflow badge).

### 🟡 Incomplete Trust Surfaces

**4. Namespace Visibility** ✅ **FIXED** (via Domaines layer)
Namespace isolation was architecturally correct but had no UI surface. Task 2 (Domaines) made namespaces user-visible and navigable: the Domaines tab is the drill-down (Index → Domaine → Project → Threads), and `DomaineBadge` chips are rendered at the TitleBar breadcrumb, Sidebar ThreadSwitcherFooter, Codex Search ResultCard, and CodexPreview MetaLine. Codex Search has a Domaine selector + "Across all Domaines" toggle (bridge namespaces always reachable). Codex Wiki is filterable by Domaine with dominant-Domaine + "+N" overflow badges per page.

*Resolution:* Migrations 004 + 005, `rag_domaines` table, full drill-down UI, badge integrations across 4 surfaces, search + wiki Domaine scoping. Shipped as 8 commits (`2915113` … `4ba0bfa`).

**5. Ingestion Status** ✅ **FIXED**
The UI now accurately reports what was ingested, from where, and into which namespace + Domaine. The Codex/Ingest sub-tab (commit `7f441af`) provides: summary row (documents / tags / relationships / last-ingest timestamp), a filterable 8-column documents table (status / title / type / Project + DomaineBadge / tags / edges / ingested timestamp / per-row re-ingest), workspace-restricted manual ingest button, and a collapsible activity log driven by `rag_operations_log`.

*Resolution:* `editor/src/renderer/src/components/codex/Ingest.tsx` + `editor/src/main/ingestQueries.ts` + 4 new IPC handlers. Manual control + full inspection live in Codex → Ingest.

**6. Honcho Memory State**  
The user can clear Honcho memory (incompletely) but cannot inspect it. No readable surface for what Honcho currently knows. Write-only relationship with your own memory system.

*Fix required:* A readable memory state panel. "Honcho remembers: last updated 3 days ago — [summary peek]."

### ⚫ Missing Trust Surfaces (Build Later, But Flag Now)

- Knowledge base composition by namespace (not just total counts)
- Cost attribution by namespace (how much does AstraStrata work cost vs. personal?)
- RAG retrieval transparency (did this response use my documents or general training data?)
- Relationship graph visibility (what connections did the pipeline find?)

---

## Part 3: Renamed Terminology

All future development, documentation, and code should use these names. The old names are listed for reference only — retire them.

| Old Name | New Name | Notes |
|---|---|---|
| Library | **Codex** | The knowledge repository. Read-only raw documents + wiki output. |
| Editor | **Scribe** | The active document workspace. Where work happens. |
| Projects tab | **Domaines** | Top-level organizational layer. See Part 4. |
| Projects | **Projects** | Unchanged. Lives inside a Domaine. |
| Threads | **Threads** | Unchanged. Lives inside a Project. |
| (new) | **The Intake** | Research pipeline. Where external information enters before Codex admission. |
| (new) | **The Hive** | Agent management and configuration space. |
| Holocron | **Holocron** | The current application. One module within Agenteryx. |
| Agenteryx | **Agenteryx** | The full vision. Unified AI operating system. Holocron is one module. |

**The Intake needs a final name.** Candidates: The Atrium (things pass through it), The Crucible (raw material refined), The Current (information flowing in). Andy to decide before v3 documentation is finalized.

---

## Part 4: The Expanded Vision

### 4.1 The Domaines Hierarchy

The current Project/Thread model is insufficient for Andy's actual use. Work, personal, health, learning, and AI research are genuinely different contexts that must not bleed together. The solution is one additional organizational layer above Projects.

**Proposed hierarchy:**
```
Agenteryx
└── Holocron
    └── Domaines (top level — replaces "Projects tab")
        ├── AstraStrata (work)
        │   ├── Project: Chalet Renovation
        │   │   ├── Thread: Contractor negotiations
        │   │   └── Thread: Permit documentation
        │   └── Project: Lease Templates 2026
        ├── Personal
        │   ├── Project: Health tracking
        │   └── Project: Relationships
        ├── Learning
        │   ├── Project: AI development
        │   └── Project: Coding sessions
        └── AI Research
            └── Project: Tool evaluation
```

**Key design decisions:**
- Domaines map directly to existing namespace isolation. Domaines *are* namespaces made visible and navigable.
- Each Domaine has its own wiki in the Codex, but cross-Domaine search must be possible.
- Projects and Threads are unchanged — just organized under Domaines.
- The Codex is shared but filterable by Domaine.

### 4.2 Document Lifecycle: Three States

Every document in Holocron exists in one of three states. These states must be explicit, visible, and enforced by the UI.

**State 1: Raw**
- Uploaded or ingested into the Codex
- Read-only. Never edited directly.
- Source of truth. The original is preserved.
- Tagged, indexed, and included in the RAG knowledge graph.

**State 2: Working Copy**
- Pulled from the Codex into a Project/Thread for active work in Scribe.
- Versioned from the moment it is pulled.
- Changes here do not touch the Raw original.
- Batch import from Codex into a Project should be supported — select multiple documents, pull them all as Working Copies.

**State 3: Output**
- A finished artifact produced by a Thread — a report, a redlined document, a compiled analysis.
- May itself be submitted back to the Codex as a new Raw document, closing the loop.

**The flow:**
```
External source → [Intake] → Raw (Codex) → Working Copy (Scribe/Thread) → Output → Raw (Codex)
```

### 4.3 The Intake Pipeline

A new module that sits upstream of the Codex. All external information enters here before being admitted to the knowledge base. Nothing goes directly from the internet into the Codex.

**What feeds the Intake:**
- Firecrawl web scraping (API key already configured in settings)
- YouTube transcript extraction (via YouTube API — no download required)
- Browser extension captures (MarkDownload-style, markdown from any webpage)
- Paste-a-URL ingestion (native within Holocron)
- Coding session logs (every Claude Code session exported as a document)
- TikTok/video transcripts (manual upload after local transcription)
- AI research outputs (Perplexity results, research papers, analysis)

**The four-stage Intake pipeline:**

1. **Capture** — Raw content arrives via any of the above sources. Stored in Intake, not yet in Codex.

2. **Triage** — An agent reads the content, scores signal density, extracts candidate tags, flags potential Codex connections, identifies which Domaine it belongs to.

3. **Review** — Andy sees the triage output: proposed tags, proposed Domaine, quality score, connections found. Approve, reject, or edit before admission.

4. **Admit** — Content becomes a Raw document in the Codex. Fully ingested, tagged, part of the knowledge graph.

**Design principles:**
- Nothing bypasses Review. The user is the quality gate.
- The agent removes noise but doesn't make final decisions.
- Admitted documents are treated identically to manually uploaded documents — same RAG pipeline, same wiki compilation, same relationship building.

### 4.4 The Hive

A dedicated space for agent management, configuration, and (eventually) agent building. Not scoped for immediate development but should be reserved in the navigation architecture.

**Near-term scope:**
- View and configure active agents (which models, which roles)
- Monitor agent activity and cost by Domaine
- Manage Honcho memory state (the readable memory surface described in Part 2)

**Longer-term scope:**
- Build and test custom agent configurations
- Define agent roles per Domaine (e.g., AstraStrata agent with property management context vs. personal research agent)
- Multi-agent orchestration (Agenteryx-level feature, not Holocron-level)

### 4.5 The Working Memory Model (Replacing Token Counter)

The current token counter is an engineering artifact that has leaked into the UI. It should be replaced with a knowledge-worker-legible "Working Memory" display.

**Proposed replacement — a small persistent panel showing:**

- **Active session:** Duration and exchange count. "This conversation: 47 minutes, 23 exchanges."
- **Grounded in:** Documents currently in context, by name. Clickable to inspect. Reveals whether a response is RAG-grounded or floating on training data.
- **Memory active:** Honcho state at a glance. "Active — last updated 3 days ago." One click to inspect or clear.
- **Coherence signal:** Qualitative, not quantitative. "Fresh" / "Extended" / "Long session — consider a checkpoint." Maps to how a knowledge worker thinks about a working session.

**The deeper value:** If you surface what the model is grounded in, you can distinguish "this answer came from my AstraStrata documents" from "this answer came from Claude's general training." Right now these look identical. Making them distinguishable is a fundamental trust improvement.

### 4.6 Web Research Integration

Holocron should support web search as an additional retrieval source alongside the local RAG pipeline, similar to how Perplexity works but grounded in local knowledge first.

**Proposed query flow:**
1. Query arrives
2. Check local Codex RAG first
3. If local knowledge is thin or the question requires current information → augment with web search
4. Synthesize both sources
5. Cite everything — distinguish local sources from web sources

This is differentiated from Perplexity: Perplexity treats the web as its knowledge base. Holocron treats *your documents* as the knowledge base, with the web as a supplement. That ordering matters.

---

## Part 5: The Real Ingestion Pass (First Validation Protocol)

The knowledge base has been populated almost entirely with synthetic smoke-test documents. Every design decision about the RAG pipeline has been validated against fake data. The first real ingestion pass is effectively a second beta — treat it as structured testing, not migration.

### Before Ingesting Anything
Write down explicit expectations: What will the tag extractor do with AstraStrata PRDs? What relationships do you expect to find? What wiki pages should eventually compile? This baseline is required for evaluating output quality.

### Ingest in Stages
Start with AstraStrata only — 10-15 documents. Stop. Evaluate before adding more. Look at tag quality, relationship detection, and wiki output before expanding to other Domaines.

### The Four Failure Modes to Watch For

**Tag collapse:** The extractor produces the same generic tags for every document. "Property," "management," "tenant." Technically correct, useless for retrieval.

**Relationship sparsity:** Documents that obviously connect in Andy's mind show no relationship in the graph. The relationship logic is too conservative or shared vocabulary isn't recognized.

**Wiki drift:** The compiled wiki page describes documents accurately but doesn't synthesize them. Reads like a table of contents rather than a knowledge article. Common RAG failure — looks reasonable, isn't useful.

**Namespace leakage:** A document ends up indexed in the wrong Domaine/namespace, or a query in one Domaine returns results from another. Must be explicitly tested.

### The Validation Test
After the first real wiki compiles for AstraStrata, ask it a question you actually need answered — not a test question, a real operational question about a property or tenant situation. A good answer uses your documents, adds a connection you wouldn't have made yourself, and confabulates nothing.

That single test will tell you more about whether the design is working than any amount of synthetic validation.

---

## Part 6: Sequencing Recommendation

This is the recommended build order based on the current state of the system.

### Phase 0: Trust Layer (Do First, Non-Negotiable) — **Partial (2/4 ✅)**
1. ✅ Fix wiki markdown rendering — styled output, not plain text (Codex Wiki sub-tab)
2. ⏳ Fix Clear button — either full clear or honest partial clear communication
3. ⏳ Fix context display — accurate input tokens or Working Memory replacement
4. ✅ Add namespace badges — persistent, visible on all documents and threads (DomaineBadge across 4 surfaces, see Task 2)

*Rationale: These are correctness failures, not missing features. Building on top of them means evaluating real content through broken surfaces. You won't be able to tell signal from noise.*

### Phase 1: Real Content Validation
1. Run the first real ingestion pass (AstraStrata, staged, with the protocol above)
2. Evaluate wiki quality on real content
3. Evaluate tag and relationship quality on real content
4. Document what works and what doesn't before building more

*Rationale: The compounding value loop is the core proposition. Before building more architecture, prove the loop works on real material.*

### Phase 2: Hierarchy and Lifecycle — **Domaines complete (1 + 4 ✅)**
1. ✅ Implement Domaines as the top-level organizational layer (Task 2, 8 commits; migrations 004 + 005; full drill-down UI; persistence; backfill of all existing namespaces to General)
2. ⏳ Implement the three document states (Raw, Working Copy, Output)
3. ⏳ Implement batch import from Codex into Projects
4. ✅ Surface namespace/Domaine throughout the UI (DomaineBadge at TitleBar, Sidebar, Codex Search, CodexPreview; Domaine selectors in Search + Wiki)

### Phase 3: Intake Pipeline
1. Build the Intake module with the four-stage pipeline
2. Integrate Firecrawl (API key already exists)
3. Add YouTube transcript extraction
4. Add paste-a-URL ingestion
5. Build agent-driven triage and the Review interface

### Phase 4: Working Memory and Research
1. Replace token counter with Working Memory model
2. Add RAG retrieval transparency (show which documents grounded each response)
3. Add web search as a secondary retrieval source with citation

### Phase 5: The Hive
1. Build agent management and configuration surface
2. Readable Honcho memory state
3. Cost attribution by Domaine

### Phase 6+: Agenteryx
Holocron becomes one module in a larger system. The Hive expands into multi-agent orchestration. The Intake becomes a universal information pipeline. The Codex connects across modules. Mobile companion. Command center. This is the long horizon — do not plan implementation until Phase 5 is complete and the foundation is proven.

---

## Part 7: Open Questions for the Planning Session

These are unresolved decisions that need to be made during the Opus planning session.

1. **Final name for the Intake module.** Atrium, Crucible, Current, or something else?

2. **Honcho vs. native memory.** Is Honcho the right long-term memory solution, or should the system build its own memory layer that can be inspected, edited, and cleared with full transparency?

3. **Wiki compilation trigger.** Every 5 ingests is arbitrary. Should this be namespace-aware (compile per Domaine when that Domaine reaches 5 new documents)? Should it be manually triggerable? Should there be a preview before it writes to the Codex?

4. **Cross-Domaine search.** What are the rules? Can an AstraStrata query surface a personal document if it's relevant? Or is cross-Domaine search always explicit and opt-in?

5. **Coding session integration.** How should Claude Code session logs be captured and routed to the Intake? Is this a manual export, a Holocron extension, or something else?

6. **The ds4 / local inference question.** Salvatore Sanfilippo's ds4 engine offers persistent, resumable KV cache per conversation. Does this change the local inference strategy? Could it replace or supplement Honcho for per-thread context persistence?

7. **Extended thinking integration.** Opus with extended thinking is the right tool for deep architectural planning sessions. Should Holocron expose an explicit "deep planning mode" that switches to Opus + extended thinking for designated sessions?

---

## Appendix: Key Decisions Already Made

- Local-first is non-negotiable. Data stays local. Agents can be cloud.
- The document editor is CodeMirror 6. Not changing.
- PostgreSQL + tsvector for RAG. Not changing for now.
- Gemini Flash for bulk processing (tag extraction, wiki compilation). Cost-effective.
- Claude Sonnet for primary chat. Opus reserved for deep planning.
- Namespace isolation is the right architecture. Just needs UI surface.
- Raw documents in the Codex are read-only. Working copies are versioned from pull point.
- Nothing goes from external sources directly into the Codex. Everything routes through Intake.

---

*End of Architecture V3 — Prepared May 2026*
