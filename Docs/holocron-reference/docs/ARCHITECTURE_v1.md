# ARCHITECTURE.md
**Holocron — System Architecture**
*Version: 1.1 | Date: May 2, 2026*

---

## 1. What Holocron Is

Holocron is a local-first, private document production engine for one user (Andy). It runs entirely on a single machine (M4 Max MacBook Pro, 64GB RAM) with no cloud dependency.

**The core job:** Take raw, unstructured input (brain dumps, transcripts, legacy documents) and produce structured, versioned work product (reports, policies, emails, PRDs) through an iterative AI-assisted pipeline.

**What Holocron is not:**
- A general-purpose chat interface
- A multi-agent orchestration platform
- A cloud-synced second brain
- A replacement for Opus/NotebookLM at the synthesis layer

---

## 2. The Two Content Domains

Holocron serves one user across two distinct but structurally identical content domains:

| Domain | Raw Input | Output |
|---|---|---|
| AstraStrata Design | Brain dumps, legacy Schema Reviews, PRD annotations | Versioned PRDs, architecture reports |
| Daily Operations | Meeting transcripts, brain dumps, directives | Policies, emails, implementation plans, directives |

The pipeline is identical in both cases. Only the content differs.

---

## 3. System Components

### 3.1 Local LLM — Gemma 4 31B via LM Studio
- Endpoint: `http://127.0.0.1:1234/v1`
- Context window: 32,768 tokens
- Role: All document production, extraction, drafting, redline suggestions, report generation
- Capability boundary: Gemma 4 handles single-thread document production well. It struggles with deep multi-document synthesis across large corpora. For that, output is exported to the external synthesis layer.

### 3.2 Memory — Honcho v3
- Endpoint: `http://localhost:8000`
- Workspace: `holocron` | Peer: `andy`
- Role: Persistent memory per thread. Stores message history, summaries, extracted insights, and peer representations.
- Each Thread maps 1:1 to one Honcho session.
- Honcho handles compression of older exchanges into summaries when context fills.

**The Dreaming Agent (native Honcho v3 feature — always on)**

Dreaming is a core architectural component of Honcho v3, not an optional add-on. It runs automatically in the background via the Deriver process without impacting runtime performance or costing additional tokens. Dreams are currently free for all workspaces.

What the Dreaming Agent does:
- Crawls all ingested messages and prior reasoning for a Peer (Andy) across all sessions
- Produces deductive, inductive, and abductive conclusions from conversation history
- Consolidates and prunes redundant or stale information
- Generates and continuously refines a Peer Card — a behavioral model of how Andy thinks, works, and communicates
- Creates session summaries and cross-session pattern recognition
- Runs concentrated during low-activity periods (evenings, overnight) when compute is less constrained

What this means for Holocron:
- Every thread conversation is being processed and synthesized in the background automatically
- Over time, Honcho builds an increasingly accurate model of Andy's working patterns, preferences, and decision-making tendencies
- The Honcho chat endpoint (`/chat`) can be queried at any time to retrieve dream-synthesized insights — not just raw message history
- Dream results should be surfaced in Holocron at two moments: (1) when a new thread is loaded, as a context brief derived from related threads in the project, and (2) after a Branch is created, as an opening synthesis of what was learned in the predecessor thread

### 3.3 Storage — PostgreSQL + Redis via Docker
- Managed via Docker Desktop
- PostgreSQL: persistent storage for Honcho memory data
- Redis: session caching
- Startup: `cd ~/holocron_link && docker compose up -d`

### 3.4 Application — Electron + React + TypeScript
- Editor: CodeMirror 6
- Local file system access via Electron IPC
- All files stored on local disk — nothing leaves the machine

### 3.5 External Synthesis Layer (Outside Holocron)
- Antigravity (Google) + NotebookLM + Claude Opus
- Receives: polished report packages exported from Holocron
- Role: Deep multi-document synthesis, final PRD production
- Holocron's job ends when the export package is ready

---

## 4. The Production Pipeline (5 Stages)

Every thread — regardless of content domain — follows this pipeline. Stages are not enforced; they are visible indicators that reflect current thread state.

```
STAGE 1 — SETUP
Create Project + Thread. Optional: Finder opens to drop reference docs.
/references/ folder auto-created if files are added.
Duration: seconds. Happens before work begins.

STAGE 2 — INTAKE
Reference documents loaded into thread context.
Agent reads and acknowledges situational context.
Supported: .md, .txt, .pdf (converted), .docx (converted), .xlsx (converted to table).
No output generated yet.

STAGE 3 — BRAIN DUMP / DIALOGUE
Brain Dump Intake Tool active in center column.
User dictates or types in large markdown editor.
Submits via Dump button — agent responds in chat.
Iterative back-and-forth until direction is clear.
braindump file auto-created and continuously updated.

STAGE 4 — REPORT GENERATION
Agent produces versioned structured documents.
Files land in auto-created /reports/ subfolder.
In-document redline editing available.
Versioning via Version button — never overwrites.

STAGE 5 — DELIVERABLE
For operational work: final email, policy, directive — Gemma handles delivery.
For AstraStrata: export report package → external synthesis layer (Opus).
Holocron's job is complete.
```

---

## 5. Data Flow Diagram

```
[User: brain dump / transcript / annotation]
                ↓
    [Brain Dump Intake Tool]
    (BD_[Project]_[Thread].md)
                ↓
    [Gemma 4 31B via LM Studio]
    (32K context window)
                ↓
         ┌──────┴──────┐
         ↓             ↓
   [Chat response]  [Auto-save to Honcho]
         ↓             ↓
   [User: accept,  [Memory compression
    save to Notes,  at 80% context]
    or ignore]
         ↓
   [Report generation]
   (Report_[Project]_[Thread]_v1.md)
         ↓
   [Redline editing + versioning]
   (Report_[Project]_[Thread]_v2.md)
         ↓
         ┌────────────────────┐
         ↓                    ↓
   [Operational           [AstraStrata
    deliverable:           export package
    email/policy]          → Opus]
```

---

## 6. Context Window Management

### 6.1 The 80% Threshold
When token usage reaches 80% of 32,768 (~26,000 tokens):
1. Warning bar appears above chat input
2. Honcho compresses the oldest ~40% of conversation into a summary
3. Raw old messages are dropped from active context
4. Context resets to approximately 30-40% (summary + recent messages remain)
5. Conversation continues with no interruption

### 6.2 Compression Fidelity Degradation
Each compression cycle loses nuance. After 3-4 cycles on a complex thread, fidelity drops meaningfully. At this point, Thread continuation is preferable to further compression.

### 6.3 Thread Branching

When a thread has been compressed 3+ times, or when the topic materially shifts to the point where continuing in the same thread would degrade memory quality, the user should Branch into a new thread rather than continue compressing.

**The Branch Button**

A **Branch** button lives persistently in the Thread workspace toolbar — always visible, not just at 80% context. Location: top-right of the thread header bar, alongside the thread name and stage indicator. It does not require the user to be at any particular context level to use it — Branching is always available and always intentional.

After 3 compression cycles, a subtle advisory appears near the Branch button:
`⚑ This thread has been compressed 3 times — consider Branching`
The advisory is informational only. The user decides when to Branch.

**What happens when Branch is clicked:**

1. A modal appears: "Branch from [Thread Name]?"
   - Pre-filled name: `[ThreadName]-2` (user can edit)
   - Brief description field (optional): "What is this branch focused on?"
   - Confirm | Cancel

2. On confirm, the system:
   - Queries the current thread's Honcho session for its full summary via the chat endpoint
   - Queries the Dreaming Agent for any cross-session insights about this project
   - Fetches the last 5 messages from the current thread
   - Creates a new thread folder: `[ThreadName]-2/`
   - Writes a new `thread.json` with `continuedFrom` field pointing to predecessor
   - Creates a new Honcho session for the branch thread
   - Injects the following as the opening context of the new session:

```
--- Branched from: [Original Thread Name] ---
Honcho Summary: [dream-synthesized summary of predecessor thread]
Key Insights from Dreaming Agent: [cross-session patterns relevant to this project]
Last 5 messages:
[message 1]
[message 2]
...
--- End of inherited context ---
```

3. The new branch thread opens automatically as the active thread
4. The chat displays the inherited context as a collapsible block at the top:
   `[Inherited from: ThreadName] ▼` — collapsed by default, expandable on click
5. The user begins working in a fresh context window, but with full situational awareness from the predecessor

**thread.json additions for branched threads:**
```json
{
  "continuedFrom": {
    "threadName": "PRD-01-Global",
    "threadPath": "/path/to/PRD-01-Global",
    "honchoSessionId": "abc123",
    "branchedAt": "2026-05-02T20:00:00Z",
    "compressionCountAtBranch": 3
  }
}
```

**Branch chain visibility**

In the Thread Switcher footer drawer, branched threads are visually linked:
```
PRD-01-Global
  └─ PRD-01-Global-2   ← branch indicator
       └─ PRD-01-Global-3
```
This makes the full branch history of a topic visible at a glance without navigating away from the editor.

### 6.4 Cross-Thread Memory Query
Any thread can query the memory files of all other threads in the same project. This is the orchestration layer — no dedicated orchestration thread needed. The memory architecture handles it automatically via Honcho session IDs stored in each thread.json.

---

## 7. Document Conversion

Holocron should natively convert non-markdown files for token-efficient ingestion:

| Source Format | Conversion Target | Method |
|---|---|---|
| .pdf | .md | Text extraction via pdf-parse or pdfplumber |
| .docx | .md | mammoth (already installed) |
| .xlsx / .csv | .md (table) | Convert rows to markdown table format |
| .html | .md | HTML-to-markdown stripping |
| Images (.png, .jpg) | — | Flag as token-heavy; warn user; optional OCR via tesseract |
| Screenshots | — | Same as images; suggest OCR or manual transcription |

Right-click any file in the file explorer → "Convert to Markdown" → saves as [filename].md alongside original. Batch convert: select multiple files → right-click → "Convert All to Markdown."

---

## 8. Scope Boundaries

### In Scope (Holocron)
- Document production pipeline
- Brain Dump Intake Tool
- In-document redline editing and versioning
- File conversion utilities
- Local memory via Honcho
- Honcho Dreaming Agent integration (surfacing dream insights on thread load and Branch)
- Library project (general reference storage)
- Context compression and Thread Branching

### Out of Scope (belongs in Memory Engine / future tools)
- Multi-agent orchestration (Hermes)
- Agent task runner (CoPaw)
- News feed / AI topic aggregation
- Web search / internet-connected agents
- Multi-user collaboration
- Cloud sync

### Explicitly Deferred
- Semantic/embedding search over thread documents (phase 3)
- MCP server integration
- Voice input

---

## 9. Startup Sequence

```
1. Open Docker Desktop
2. cd ~/holocron_link && docker compose up -d
3. Open LM Studio → verify Gemma 4 31B shows READY (context: 32768)
4. cd /Users/anzo/_AI/Projects/Holocron/editor && npm run dev
```

---

## 10. Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Local LLM | Gemma 4 31B | Strong document production; fits in 64GB RAM; fast enough for iterative work |
| Memory | Honcho v3 | Purpose-built for agent memory; already integrated; Ilya-supported |
| Editor | CodeMirror 6 | Markdown with custom syntax highlighting; extensible |
| Storage | PostgreSQL + Redis | Reliable; Honcho-compatible; Docker-managed |
| App shell | Electron | Local file system access; macOS native dialogs; no browser sandboxing |
