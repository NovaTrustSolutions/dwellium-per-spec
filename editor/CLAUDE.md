Reference and strictly follow @AGENTS.md

# === READ FIRST — every fresh session ===
# /Users/anzo/_AI/Projects/Holocron/docs/STATUS.md
# Tells you what state the project is in, what's done, what's next, and
# which other docs to read based on the task you've been given. ~250 lines.
# Costs ~5K tokens to load but saves you re-deriving the entire context.

# Read this BEFORE debugging anything that takes more than 2 turns:
# /Users/anzo/_AI/Projects/Holocron/docs/gotcha.md
# Captures discipline + project-specific priors from past sessions.
# When you burn time on an avoidable mistake, add a tight entry there.

# Read this BEFORE any Phase 3 (RAG / Library / Knowledge base) work:
# /Users/anzo/_AI/Projects/Holocron/docs/architecture-v2.md
# Canonical Phase 3 build spec. Supersedes the older Phase 3 sketch in
# MVP.md and the Library.md draft in _Notes/.

# CLAUDE.md — Holocron
# Rules for Claude Code working on this project.
# Add new rules whenever Claude Code messes 
# something up that you never want repeated.

## PROJECT OVERVIEW
Holocron is a local-first AI document editor 
built with Electron + React + TypeScript.
Location: /Users/anzo/_AI/Projects/Holocron/editor

## ARCHITECTURE DOCS — READ BEFORE EVERY TASK
Three canonical documents define what Holocron is and how to build it.
Read all three before implementing anything:
- /Users/anzo/_AI/Projects/Holocron/docs/ARCHITECTURE.md
- /Users/anzo/_AI/Projects/Holocron/docs/DATA_MODEL.md
- /Users/anzo/_AI/Projects/Holocron/docs/MVP.md

We are building MVP.md priorities only, in order P1→P7.
Do not add features outside MVP scope.
Do not start the next priority until the current one
passes its verification checklist in MVP.md.
All auto-generated files must follow naming conventions
in DATA_MODEL.md §3.

## STACK
- Electron + React + TypeScript
- CodeMirror 6 (markdown editor)
- Honcho v3 API at http://localhost:8000
- LM Studio at http://127.0.0.1:1234/v1
- chokidar for file watching
- mammoth for DOCX reading

## BEFORE EVERY TASK
1. Read the relevant source files before editing
2. Understand what already exists — do not 
   duplicate existing functionality
3. Check what components are affected by your change

## AFTER EVERY TASK
1. ALWAYS run: tsc --noEmit
2. ALWAYS run: npm run build
3. Fix ALL TypeScript errors before finishing
4. Never report success if build has errors

### Imports — always verify before using
If you add a new component or function, verify
it is actually exported from its source file.
Missing imports cause black screen crashes in 
the renderer — this has happened multiple times.
Always check Icons.tsx exports match what 
SidebarCell.tsx and other components import.


### Honcho — never break the integration
When modifying ChatPane.tsx or ipc.ts:
- Never remove honchoSaveMessage calls
- Never remove honchoInit on mount
- Never remove honchoGetMessages on startup
- The Honcho v3 API uses workspaces/peers/sessions
  NOT apps/users (that was v1)
- No JWT tokens needed for localhost

### File operations — use fs.rename for moves
When moving folders, always use fs.rename()
which moves the entire directory tree atomically.
Never m