# DATA_MODEL.md
**Holocron — Data Model & File Naming Conventions**
*Version: 1.1 | Date: May 2, 2026*

---

## 1. Hierarchy Overview

```
projectsRoot/                          ← User-configured master root
  ├── [Project]/                       ← Project folder
  │   ├── [Thread]/                    ← Thread folder (created 2026-05-08+)
  │   │   ├── thread.json              ← Thread metadata (hidden from file tree)
  │   │   ├── System/                  ← All auto-generated files (created at thread create)
  │   │   │   ├── BD_[Project]_[Thread].md       ← Brain Dump
  │   │   │   ├── Notes_[Project]_[Thread].md    ← Saved agent responses
  │   │   │   ├── Comments_[stem].json           ← Inline comment sidecars (one per doc)
  │   │   │   └── Memory/                        ← Honcho memory snapshots
  │   │   │       └── Memory_[Project]_[Thread].json
  │   │   ├── References/              ← Reference documents (user-imported, stays at root)
  │   │   │   └── [source files]
  │   │   └── Reports/                 ← Generated reports (user-versioned, stays at root)
  │   │       ├── Report_[Project]_[Thread]_v1.md
  │   │       └── Report_[Project]_[Thread]_v2.md
  │   └── [Thread 2]/
  └── [Project 2]/
```

**Legacy threads (created before 2026-05-08)** keep their flat structure: `BD_*`, `Notes_*`, `Comments_*`, and `Memory/` lived directly under the thread folder. Holocron continues to read from those locations for backward compatibility. **No retroactive migration** — old threads are not auto-restructured. New auto-generated files in old threads continue to land at the thread root (the existence of `<threadPath>/System/` is the discriminator).

---

## 2. Entities

### 2.1 Project
A top-level work context. Self-contained. Maps to a folder directly under `projectsRoot`.

| Field | Type | Description |
|---|---|---|
| name | string | Folder name. User-defined at creation. |
| path | string | Full absolute path on disk. |
| threadCount | number | Count of subfolders (threads). |
| lastModified | datetime | Last modified timestamp of any file within. |
| createdAt | datetime | Folder creation time. |

No metadata file at the project level — all data derived from the filesystem.

---

### 2.2 Thread
A focused conversation and document workspace within a project. Maps to a subfolder inside a Project folder. Has a metadata file (`thread.json`) and a bound Honcho session.

**Thread folder contents (auto-managed):**

| File/Folder | Created When | Purpose |
|---|---|---|
| thread.json | Thread creation | Metadata, Honcho binding, status |
| BD_[P]_[T].md | First Dump submitted | Brain dump log |
| Notes_[P]_[T].md | First Note saved | Agent response log |
| References/ | First file imported during intake | Reference documents |
| Reports/ | First report generated | Versioned output documents |
| Memory/ | First context compression | Honcho memory snapshots |

**thread.json schema:**
```json
{
  "name": "PRD-01-Global-2",
  "projectName": "AstraStrata_PRDs",
  "createdAt": "2026-05-02T15:30:00Z",
  "lastModified": "2026-05-02T18:45:00Z",
  "honchoSessionId": "honcho-session-abc123",
  "status": "active",
  "stage": 3,
  "continuedFrom": {
    "threadName": "PRD-01-Global",
    "threadPath": "/Users/anzo/Projects/AstraStrata_PRDs/PRD-01-Global",
    "honchoSessionId": "honcho-session-xyz789",
    "branchedAt": "2026-05-02T20:00:00Z",
    "compressionCountAtBranch": 3
  },
  "compressionCount": 0,
  "dumpCount": 0,
  "reportCount": 0,
  "lastDreamQuery": "2026-05-02T20:01:00Z"
}
```

**Field definitions:**

| Field | Type | Description |
|---|---|---|
| name | string | Thread name. User-defined at creation. |
| projectName | string | Parent project name. |
| createdAt | ISO datetime | Thread creation timestamp. |
| lastModified | ISO datetime | Last activity timestamp. |
| honchoSessionId | string | Bound Honcho session ID. Empty until first load. |
| status | enum | `active` \| `complete` |
| stage | number | Current pipeline stage (1-5). User-controlled. |
| continuedFrom | object \| null | If this thread was Branched from a predecessor, stores its reference including when the Branch occurred and how many compressions the predecessor had at that point. Null if this is an original thread. |
| continuedFrom.branchedAt | ISO datetime | Timestamp when the Branch was created. |
| continuedFrom.compressionCountAtBranch | number | How many times the predecessor was compressed before Branch. |
| compressionCount | number | How many times this thread's context has been compressed. Branch advisory appears at 3+. |
| dumpCount | number | Total number of Dump submissions in this thread. |
| reportCount | number | Total number of reports generated. |
| lastDreamQuery | ISO datetime \| null | Timestamp of last query to Honcho Dreaming Agent for this thread. Used to avoid redundant queries. |

---

### 2.3 Brain Dump File
**Filename:** `BD_[Project]_[Thread].md`
**Location:** Thread root folder
**Created:** Automatically on first Dump submission
**Managed by:** Holocron — never manually edited structure

**File structure:**
```markdown
# Brain Dump — [Project] / [Thread]
*Created: MM-DD-YYYY HH:MM*

---

# Prompt 1
[User's raw dump content]

*Submitted: MM-DD-YYYY HH:MM*

---

# Prompt 2
[User's raw dump content]

*Submitted: MM-DD-YYYY HH:MM*

---
```

**Rules:**
- Each dump submission auto-generates a `# Prompt N` header at the top
- Timestamp and `---` separator auto-appended at the bottom on submit
- Agent processes only content above the most recent watermark
- User can freely format content within each prompt block using markdown
- File is append-only — Holocron never modifies previous prompt blocks

---

### 2.4 Notes File
**Filename:** `Notes_[Project]_[Thread].md`
**Location:** Thread root folder
**Created:** Automatically on first Note action
**Managed by:** User + Holocron

**File structure:**
```markdown
# Notes — [Project] / [Thread]

---

## Note — MM-DD-YYYY HH:MM
[Agent response content saved here]

---

## Note — MM-DD-YYYY HH:MM
[Agent response content saved here]

---
```

**Distinction from "Add to Doc":**
- **Add to Doc:** Inserts agent response into whatever document is currently open in the editor. Contextual — depends on active file.
- **Note:** Always appends to Notes_[Project]_[Thread].md regardless of what is open. Persistent log.

---

### 2.5 Report Files
**Filename:** `Report_[Project]_[Thread]_v[N].md`
**Location:** `Reports/` subfolder inside thread (auto-created)
**Created:** On first report generation or on Version action

**Versioning rules:**
- First report: `Report_[Project]_[Thread]_v1.md`
- Version button: saves current file as current version, creates next version with same content as starting point
- Never overwrites — previous versions are always preserved
- Agent always writes to the highest-numbered version unless instructed otherwise
- User can open any previous version for reference

**Named reports:** If a report has a specific topic, the name can be prefixed:
`CaseMgmt_AstraStrata_PRD01_v1.md`
User sets the name prefix at report creation time. If no name given, defaults to `Report_`.

---

### 2.6 Memory File
**Filename:** `Memory_[Project]_[Thread].json`
**Location:** `System/Memory/` subfolder inside thread (created with the thread). Legacy threads use `Memory/` at thread root — both paths are read.
**Created:** On thread creation (folder); first context compression event (file)
**Managed by:** Holocron + Honcho

```json
{
  "threadName": "PRD-01-Global",
  "projectName": "AstraStrata_PRDs",
  "honchoSessionId": "honcho-session-abc123",
  "lastCompressed": "2026-05-02T20:00:00Z",
  "compressionCount": 1,
  "summaries": [
    {
      "compressionIndex": 1,
      "timestamp": "2026-05-02T20:00:00Z",
      "tokensBefore": 26000,
      "tokensAfter": 9800,
      "summary": "[Honcho-generated summary text]"
    }
  ],
  "dreamInsights": [
    {
      "queriedAt": "2026-05-02T20:01:00Z",
      "trigger": "branch",
      "insight": "[Dreaming Agent synthesized insight text]"
    }
  ],
  "keyFacts": []
}
```

**dreamInsights field:** Populated when Holocron queries the Honcho Dreaming Agent chat endpoint. The `trigger` field records what prompted the query — `"branch"` when a Branch was created, `"thread_load"` when a thread is loaded for the first time. Insights are cumulative and never overwritten.

---

### 2.7 Message (Honcho-stored)
Messages are stored in Honcho, not on the local filesystem directly. The Memory file above is a local snapshot/mirror for reference and offline access.

**Honcho message structure (per Honcho v3 API):**
- Workspace: `holocron`
- Peer: `andy`
- Session: `[honchoSessionId from thread.json]`
- Each message: role (`user` | `assistant`), content, timestamp

**Lifecycle:**
1. User submits Dump → stored as `user` message in Honcho
2. Agent responds → stored as `assistant` message in Honcho
3. At 80% context → Honcho compresses oldest messages → local Memory file updated
4. Thread loaded → Honcho history fetched → restored into chat UI

---

## 3. File Naming Convention (Complete Reference)

### Pattern
```
[Descriptor]_[Project]_[Thread]_[version?].md
```

### Rules
- Spaces replaced with underscores
- No special characters except underscores and hyphens
- Project and Thread names truncated to 20 characters if longer
- Version suffix only on report files
- All names generated by Holocron — user never types these

### Full Reference Table

| File Type | Naming Pattern | Example |
|---|---|---|
| Brain Dump | `BD_[Project]_[Thread].md` | `BD_AstraStrata_PRD01Global.md` |
| Notes | `Notes_[Project]_[Thread].md` | `Notes_AstraStrata_PRD01Global.md` |
| Report (generic) | `Report_[Project]_[Thread]_v[N].md` | `Report_AstraStrata_PRD01Global_v1.md` |
| Report (named) | `[Name]_[Project]_[Thread]_v[N].md` | `CaseMgmt_AstraStrata_PRD01Global_v1.md` |
| Memory | `Memory_[Project]_[Thread].json` | `Memory_AstraStrata_PRD01Global.json` |
| Thread metadata | `thread.json` | `thread.json` (always this name, hidden) |

---

## 4. Folder Structure Rules

### Auto-created folders
| Folder | Created When | Contents |
|---|---|---|
| `System/` | Thread creation (new threads only, 2026-05-08+) | All auto-generated files: BD, Notes, Comments_*.json, Memory/ |
| `System/Memory/` | Thread creation (alongside `System/`) | Memory snapshot JSON (`Memory_*.json`) — written on first context compression |
| `References/` | User accepts intake prompt on thread creation, OR first file imported | Source documents for this thread |
| `Reports/` | First report generated | Versioned report files |
| `Memory/` *(legacy)* | First context compression in pre-2026-05-08 threads | Same as `System/Memory/` — Holocron reads both locations for backward compatibility |

### User-created folders
The user may create additional subfolders inside a thread for their own organization. These are visible in the file explorer and have no special behavior.

### Hard boundaries
- File explorer is locked to the active thread folder — cannot navigate above it
- New folders created from the file explorer are always inside the active thread
- The file explorer never shows sibling threads or the project root while a thread is active

---

## 5. Pipeline Stage Field

The `stage` field in thread.json tracks which pipeline stage the thread is currently in. It is user-controlled (moved manually via a stage indicator in the UI) — Holocron does not auto-advance stages.

| Stage | Name | Description |
|---|---|---|
| 1 | Setup | Thread created. No documents yet. |
| 2 | Intake | Reference documents loaded. Agent has context. |
| 3 | Brain Dump | Active dialogue. braindump.md being built. |
| 4 | Reports | Report generation underway. Redline editing active. |
| 5 | Deliverable | Final output ready. Thread effectively complete. |

Stage 1 is almost always immediately advanced to 2 or 3 — it exists for tracking completeness, not as a blocking step.

---

## 6. Redline State (Document-level)

When the agent proposes edits to an open document, individual paragraphs enter a redline state. This is ephemeral — it exists only in the UI until accepted or rejected.

**Redline state per paragraph:**
```
{
  originalText: string,       // The text being replaced
  proposedText: string,       // The agent's suggestion
  state: 'pending' | 'accepted' | 'rejected',
  timestamp: ISO datetime
}
```

**Visual rules:**
- Original sentence: text color and background tinted red (overrides syntax highlighting)
- Proposed sentence: text color and background tinted yellow, appears directly below original
- Accept button: replaces original with proposed, removes both highlights
- Reject button: removes proposed, restores original, removes highlights
- Accept All: processes all pending redlines in document top-to-bottom
- Syntax highlighting resumes on all text once redline state is cleared

---

## 7. Chat Link Format (Brain Dump References)

When a Dump is submitted, the chat displays a compact reference link instead of the full text:

**Format:** `[Prompt N — MM-DD-YYYY HH:MM]`

**Example:** `[Prompt 7 — 05-02-2026 14:23]`

Clicking the link opens the brain dump file and scrolls to the `# Prompt 7` heading. This keeps the chat clean while maintaining full traceability to the source dump.
