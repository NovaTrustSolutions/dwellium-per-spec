# MVP.md
**Holocron — Minimum Viable Product Definition**
*Version: 1.1 | Date: May 2, 2026*

---

> **STATUS NOTE (2026-05-06):** Priorities P1 through P7 in this document are **all COMPLETE and in daily use**. The Phase 3 / RAG sketch later in this file is **superseded** by the canonical Phase 3 build spec at `docs/architecture-v3.md`. Read `docs/STATUS.md` first for current project state.
>
> This file remains as historical reference for what the MVP was and how P1-P7 were implemented. Don't add new spec content here — add to `architecture-v3.md` or create a new versioned spec.

---

## 1. MVP Philosophy

The MVP is the thinnest slice of Holocron that delivers real value on day one. It does not include every feature in the architecture. It includes exactly the features required to complete one full production pipeline cycle — from brain dump to versioned report — without friction.

Everything not in the MVP is Phase 2 or later. The MVP is the foundation everything else is built on top of.

---

## 2. The MVP Success Criterion

**Andy can:**
1. Create a project and thread
2. Drop reference documents into the thread
3. Open the Brain Dump Intake Tool and submit iterative dumps
4. Receive agent responses in chat
5. Generate a versioned report that lands in `/reports/`
6. Make redline edits to that report and accept them
7. Save a version (v1 → v2) without losing the original
8. Return to the thread later and resume with full history restored

**That's it. If those 8 things work reliably, the MVP is complete.**

---

## 3. MVP Feature List (Priority Order)

### Priority 1 — Thread Intelligence (Must work before anything else)

These are the foundational fixes identified in the backend audit. Nothing else matters until these work.

**P1-A: Thread history restore on load**
- When a thread is loaded, fetch its Honcho message history and restore it to the chat UI
- Context bar must reflect the loaded token count
- New threads start blank. Returning threads restore their conversation.
- File: ChatPane.tsx + threadActions.ts

**P1-B: Message save to correct thread session**
- Every user message and agent response saves to the correct thread's Honcho session
- Must work on: manual thread load, app startup with saved thread, after Clear button
- File: ChatPane.tsx + ipc.ts

**P1-C: Project/thread identity in system prompt**
- buildSystemMessage() must read activeProjectName and activeThreadName
- System prompt includes: current project, current thread, list of files in thread folder
- File: wherever buildSystemMessage() lives

**P1-D: Context compression at 80%**
- At 80% context: call Honcho summary endpoint, store result, update Memory file
- Context resets after compression
- Warning bar remains but now triggers actual compression, not just a visual alert
- compressionCount in thread.json increments

---

### Priority 2 — Brain Dump Intake Tool

The center column gains a second mode: Dump Mode.

**P2-A: Dump Mode UI**
- Center column can switch between Document Mode (current) and Dump Mode (new)
- Dump Mode: large full-height markdown editor, no tabs, no file tree interaction
- Two buttons at bottom: **Dump** (primary, large) | **Report** (secondary, appears after first dump)
- Dump tab is always pinned and accessible — never goes away

**P2-B: Dump submission behavior**
- On Dump click:
  1. Auto-prepend `# Prompt N` header to submitted content
  2. Auto-append `*Submitted: MM-DD-YYYY HH:MM*` and `---` separator
  3. Save to `BD_[Project]_[Thread].md` (auto-create if not exists)
  4. Send content to agent as user message
  5. Display compact link in chat: `[Prompt N — MM-DD-YYYY HH:MM]`
  6. Clicking link opens BD file scrolled to that prompt heading
- Agent response appears in chat panel as normal
- Chat does NOT display the raw dump text — only the link

**P2-C: Watermark logic**
- Agent only processes content in the current dump block (above its watermark)
- On subsequent dumps, agent receives only the new content, not the entire file
- Implemented via: tracking last processed character position in BD file, or via prompt injection telling agent "process only content after [timestamp]"

---

### Priority 3 — File Import & Conversion

**P3-A: Import button in FILES header**
- Opens native macOS file picker (dialog.showOpenDialog)
- Copies selected files into active thread folder
- If file already exists: "Replace?" confirmation dialog
- Log: `[Files] Imported: {filename} → {activeThreadPath}`

**P3-B: Document conversion (right-click)**
- Right-click any file in file explorer → "Convert to Markdown"
- Supported: .pdf → .md (pdf-parse), .docx → .md (mammoth), .xlsx/.csv → .md table
- Saves converted file alongside original: `[filename].md`
- Images: right-click shows "Convert to Markdown (OCR)" — warn that this is token-heavy
- Batch: select multiple files → right-click → "Convert All to Markdown"

**P3-C: References folder auto-creation**
- On thread creation: optional prompt "Add reference documents now?"
- If accepted: native file picker opens, selected files copied to auto-created `/references/` folder
- If dismissed: skipped. No empty folder created.
- Setting in Settings → toggle "Show intake prompt on new thread" on/off

---

### Priority 4 — Report Generation

**P4-A: Report button behavior**
- Report button in Dump Mode: initially hidden, appears after first Dump submission
- On click: agent generates a structured report from BD file + any open reference docs
- Report auto-saved to `reports/` subfolder (auto-created)
- Default name: `Report_[Project]_[Thread]_v1.md`
- If user provides a name prefix at generation time, use: `[Name]_[Project]_[Thread]_v1.md`
- Report opens in Document Mode automatically after generation

**P4-B: Versioning**
- "Version" button on any open document
- On click: saves current file as-is (preserves it), creates next version with same content
- `v1.md` → creates `v2.md` with v1 content as starting point
- Opens v2 in editor. v1 remains untouched.
- No manual file copying ever required.

---

### Priority 5 — Redline Editing

**P5-A: Inline redline display**
- User selects text in document → Cmd+L → quoted into chat (already built)
- Agent responds with suggested edit
- Document view: original sentence highlighted red (text + background, overrides syntax highlighting)
- Proposed replacement appears directly below, highlighted yellow
- Accept button (✓) and Reject button (✗) appear inline at right margin of redline block

**P5-B: Accept / Reject behavior**
- Accept: replaces original with proposed text, removes both highlights, syntax highlighting resumes
- Reject: removes proposed text, restores original, removes highlights
- Accept All: processes all pending redlines top-to-bottom in one action

**P5-C: Multi-edit pass**
- When agent proposes multiple edits in one response, all redlines appear simultaneously
- User can navigate between them (Next/Previous redline)
- Accept All processes all at once

---

### Priority 6 — Notes

**P6-A: Note button on agent responses**
- Third action button below each agent response: **Note** (alongside existing Copy and Add to Doc)
- On click: appends entire response to `Notes_[Project]_[Thread].md` with timestamp header
- Auto-creates Notes file if not exists
- Toast confirmation: "Saved to Notes"

**P6-B: Notes file format**
```markdown
# Notes — [Project] / [Thread]

---

## Note — MM-DD-YYYY HH:MM
[agent response content]

---
```

---

### Priority 7 — Thread Branching

**P7-A: Branch button**
- A **Branch** button lives persistently in the Thread workspace toolbar, top-right of the thread header bar
- Always visible — does not require any particular context level to activate
- After compressionCount reaches 3 in thread.json, a subtle advisory appears near the button:
  `⚑ This thread has been compressed 3 times — consider Branching`
- Advisory is informational only — user decides when to Branch

**P7-B: Branch modal and thread creation**
- On Branch click: modal appears with pre-filled name `[ThreadName]-2` (user can edit) and optional description field
- On confirm:
  1. Fetch predecessor thread's Honcho summary via chat endpoint (2000 tokens max)
  2. Query Honcho Dreaming Agent for cross-session insights relevant to this project
  3. Fetch predecessor's last 5 messages
  4. Create new thread folder with new Honcho session
  5. Inject inherited context as opening block in new session:
     `--- Branched from: [Original Thread Name] ---`
  6. Write `continuedFrom` field in new thread.json including `branchedAt` and `compressionCountAtBranch`
  7. Write dream insights to Memory file under `dreamInsights` array
  8. New branch thread opens automatically as active thread

**P7-C: Branch chain visibility in Thread Switcher footer**
- Branched threads are visually indented under their predecessor in the footer drawer:
  ```
  PRD-01-Global
    └─ PRD-01-Global-2
         └─ PRD-01-Global-3
  ```
- Inherited context shown as collapsible block at top of chat: `[Branched from: PRD-01-Global] ▼`

---

## 4. What Is NOT in the MVP

These features are confirmed for later phases. Do not implement during MVP build.

| Feature | Phase |
|---|---|
| Semantic/embedding search over thread files | Phase 3 |
| Honcho Dreaming Agent surface on thread load (not Branch) | Phase 2 |
| Cross-thread permission modal (Allow Once / Always Allow) | Phase 2B |
| Explicit thread reference parsing in chat | Phase 2B |
| Codex project (general reference storage) | Phase 2 |
| Branch chain relationship visualization beyond footer drawer | Phase 2 |
| AI topic aggregation / news feed | Out of scope |
| Multi-agent orchestration | Out of scope (Memory Engine) |
| Agent launcher (CoPaw) | Out of scope (Memory Engine) |
| Voice input | Phase 3 |
| Cloud sync | Never (local-first by design) |

---

## 5. Build Order for Claude Code

Tackle in strict priority order. Each priority is a prerequisite for the next.

```
P1 → Thread Intelligence (history restore, message save, system prompt, compression)
  ↓
P2 → Brain Dump Intake Tool (Dump Mode UI, submission, watermark)
  ↓
P3 → File Import & Conversion (import button, right-click convert, references folder)
  ↓
P4 → Report Generation (Report button, auto-naming, versioning)
  ↓
P5 → Redline Editing (inline display, accept/reject, multi-edit)
  ↓
P6 → Notes (Note button, Notes file)
  ↓
P7 → Thread Continuation (compression prompt, context handoff)
```

Do not skip ahead. P1 must be verified working (via console logs and manual testing) before P2 begins. P2 must be verified before P3. And so on.

---

## 6. Verification Checklist per Priority

### P1 Verification
- [ ] Load Thread A, send 3 messages, switch to Thread B, switch back → Thread A messages restored
- [ ] Thread B is empty (or shows its own history)
- [ ] Context bar reflects correct token count per thread
- [ ] Clear button does not orphan Honcho session
- [ ] App startup with saved thread → history restored without manual load
- [ ] System prompt contains project name, thread name, file list
- [ ] At 80% context: compression fires, Memory file created, compressionCount increments

### P2 Verification
- [ ] Dump Mode toggle switches center column correctly
- [ ] Dump submission creates BD file with correct naming
- [ ] Chat shows compact link, not raw dump text
- [ ] Clicking link opens BD file at correct heading
- [ ] Second dump appends correctly with incremented Prompt number
- [ ] Agent receives only new content on each dump (watermark working)

### P3 Verification
- [ ] Import button opens native file picker
- [ ] Files copied (not moved) into thread folder
- [ ] Duplicate file → "Replace?" dialog appears
- [ ] Right-click convert works for .pdf, .docx, .xlsx
- [ ] Batch convert works on multi-select
- [ ] References folder created only when files are added (not as empty folder)

### P4 Verification
- [ ] Report button hidden until first dump submitted
- [ ] Report generated into /reports/ subfolder with correct naming
- [ ] v1 → Version button → v2 created, v1 preserved, v2 opens in Scribe
- [ ] Named report prefix works correctly

### P5 Verification
- [ ] Select text → Cmd+L → text appears in chat input
- [ ] Agent response generates redline in document
- [ ] Original text highlighted red, proposed text highlighted yellow below
- [ ] Accept swaps text, removes highlights, restores syntax highlighting
- [ ] Reject removes proposed, restores original, removes highlights
- [ ] Accept All processes multiple redlines correctly

### P6 Verification
- [ ] Note button appears on all agent responses
- [ ] Note saved to correctly named Notes file
- [ ] Notes file created automatically if not exists
- [ ] Toast confirmation appears

### P7 Verification
- [ ] Branch button visible in thread toolbar at all times
- [ ] Advisory appears after 3 compressions
- [ ] Branch modal opens with pre-filled name
- [ ] New branch thread created with predecessor context injected
- [ ] thread.json continuedFrom field populated with branchedAt and compressionCountAtBranch
- [ ] Memory file dreamInsights array populated with Dreaming Agent response
- [ ] Inherited context visible as collapsible block in new branch thread chat
- [ ] Branch chain indentation visible in Thread Switcher footer drawer

---

## 7. CLAUDE.md Instructions (add to repo root)

Add this file to `/Users/anzo/_AI/Projects/Holocron/editor/CLAUDE.md`:

```markdown
# Holocron — Agent Instructions

Before implementing anything, read:
- /docs/ARCHITECTURE.md — system components, data flow, scope boundaries
- /docs/DATA_MODEL.md — all entities, file naming, folder structure, schemas
- /docs/MVP.md — what to build, in what order, and how to verify it

## Rules
1. We are building MVP.md only. Do not add features outside MVP scope.
2. Build in priority order: P1 → P2 → P3 → P4 → P5 → P6 → P7.
3. Do not start the next priority until the current one passes its verification checklist.
4. If a request is ambiguous, ask before coding.
5. After every completed priority, run `tsc --noEmit` and confirm zero errors.
6. All auto-generated files must follow the naming conventions in DATA_MODEL.md §3.
7. The file explorer must never allow navigation above activeThreadPath.
8. Never overwrite existing report versions — always create a new version file.
```
