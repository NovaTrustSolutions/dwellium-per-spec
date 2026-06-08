# Dwellium — User Guide

Dwellium is a desktop "operating system for your work": a windowed shell where every tool is a **widget** you open, move, resize, and arrange. It combines property-management dashboards, a suite of AI agents, document/filing tools, and developer tools — all in one workspace.

This guide covers how the shell works, every widget and what it does, the integrations, and how to fix common issues.

---

## 1. Getting started

### Install (new machine)
Use the **Dwellium Installer** wizard (`installer/`). It walks you through each step — click **Continue** and each section installs automatically: Prerequisites (Homebrew, Node, git, Python, uv) → Get the code (auto-detected; the backend is bundled) → Dependencies → Build → Services → Integrations → Finish. Run it with `npm start` in `installer/`, or build a double-click `.dmg` with `npm run dist`.

### Launch & sign in
The app opens to a login screen (the nebula background). Sign in with your account (e.g. Andy, Lisa). Each user has their own settings, API keys, layouts, and data.

### First thing you'll see: System Health
If anything isn't connected, a readiness banner appears at the top — **"N AI services need attention."** Click **Open System Health** to see every AI widget's status and a **Connect** button for each. (More in §4.)

---

## 2. The workspace shell

### Sidebar (left)
- **Domains** — your hierarchy of properties/projects. Expand/collapse, add domains, drill in.
- **Widgets list** — click any widget to open it in a window. Grouped by category (Property Management, AI Tools, Filing Cabinet, …).
- **Settings gear** (next to the DOMAINS header) — opens the Control Panel.
- **Lock / Unlock grid** (the padlock next to the gear) — freezes every open widget in place (no dragging, resizing, or tearing off) so you don't disturb your layout. Click again to unlock. The state is saved.
- **Search** — system-wide content search across your data.

### Windows
Every widget opens as a window you can:
- **Move** — drag the title bar.
- **Resize** — drag any edge/corner (8 handles).
- **Maximize / minimize / close** — the title-bar buttons (macOS-style, left side).
- **Pop out** — detach a widget into its own OS window (title-bar button, or drag the tear-off grip outside the window).
- **Snap** — drag near edges/other windows for alignment guides; optional region snapping.

### Free-form vs. regions
In **Settings → Layout → Desktop Regions**:
- **Off (free-form)** — place and size unlimited widgets anywhere; nothing auto-arranges.
- **On** — choose a region layout (Left/Right, Top/Bottom, Thirds, Quadrants) and windows snap into a tiled grid.

Use the **lock button** by the gear to freeze whichever arrangement you like.

---

## 3. Settings (Control Panel)

Open from the sidebar gear. Sections:
- **Appearance** — theme (dark/light) and accent color presets.
- **Layout** — font family/scale, snapping (edges, windows, grid; grid size; sensitivity), Desktop Regions, margins.
- **API Keys — \<user\>** — your per-user LLM providers (Anthropic, OpenAI, Gemini, Local/Ollama, Custom) plus Supabase and Postgres. Pick an active provider and paste a key; it's stored per user and used by the AI widgets. **API keys are never backed up to Drive.**
- **Storage boxes** — back up your Wiki, Thought Weaver, File Explorer, and Honcho data to a local disk folder or your own **Google Drive** (paste a Google OAuth Client ID; `drive.file` scope; tokens stay in memory).
- **Integrations (backend)** — Gmail + Google Calendar status, with Test / Sync / Refresh / create-event controls (these use the backend's Google authorization).
- **System update** — update controls.

---

## 4. AI assistants

### The bottom-right launcher
Click the **bubble in the bottom-right corner** → a selector menu pops up to invoke one of four assistants:
- **Antigravity** — a Gemini, workspace-aware chat.
- **ARA** — the Dwellium agent console.
- **Inbox Zero** — AI email triage.
- **Stella** — voice + tools agent.

Each opens in a draggable, resizable panel and runs its real, full-featured component. Switch between them with the pills in the panel header. **Minimize** sends the active assistant to the background (collapses to the bubble) while it keeps running and preserves its state; click the bubble to bring it back.

### System Health (readiness check)
Open the **System Health** widget (sidebar) any time, or via the login banner. It checks each AI widget's real dependency and shows:
- **✓ Ready**, **⚠ Limited** (e.g., backend offline but running on your LLM key), or **✕ Not connected** (with the reason).
- A **Connect** button that opens the right Settings/widget to fix it.

What each AI widget needs:
- **Backend running** (`:3000`) — Stella, ARA, Inbox Zero, Transcription (upload/logs), Honcho, Thought Weaver.
- **An LLM key** (Settings → API Keys) — Antigravity, Hydra, Honcho, and the LLM-first fallback for Stella/ARA/Thought Weaver.
- **An external service** — LangFlow (`:7860`), Paperclip (`:3100`), Open Notebook (`:8502`).
- **Nothing** (local) — Cognitive M Network's engine.

To get a fully green system: start the backend, add an LLM key, and start any external services you want.

---

## 5. Widget reference

### AI & Agents
- **Stella Agent** — multi-tab AI agent (chat, tools, memory). Works against the backend, and end-to-end on your LLM key when the backend is offline.
- **ARA Console** — the Dwellium agent with selectable modes/personalities; creates notes and work items from a conversation; shows context sources and diagnostics. Falls back to your LLM key if the backend chat call fails.
- **Antigravity** — Gemini chat with a model selector (Flash/Pro), markdown rendering, conversation history. (Hosted in the bottom-right launcher.)
- **Hydra AI** — multi-LLM orchestrator (run several providers).
- **Honcho** — long-term memory + an always-on background "reflection" runner that synthesizes your memories on a throttled schedule (needs an LLM key + ≥3 memories).
- **Two Brains** — screen-sharing + human/AI collaboration.
- **Thought Weaver** — capture thoughts; AI categorizes them (LLM-first with backend fallback). The Capture button has dark text and no emojis.
- **Cognitive M Network** (MemoryGraphRAG) — 3D cognitive memory graph visualization with a one-click "Load demo" to import sample files and ask questions; pulls from transcripts, captures, and your workspace. Runs locally.
- **The Hive** — agent-management console: cost tracking, triggers, continuous capture (§8.1–8.5).
- **Builder Agents** — schema-producer, PRD-synthesis, and gap-analysis agents.
- **Wiki** — three-tier knowledge wiki.
- **Synthesis Lab** — the synthesis/compounding loop over your knowledge.
- **Foundry** — intake + processing pipeline.
- **Knowledge Graph** — d3-force interactive graph of your knowledge.
- **NotebookLM** — register NotebookLM notebooks as AI context (opens notebooklm.google.com with the right account). Its **Open Notebook** tab embeds the self-hosted Open Notebook app (`:8502`).
- **Transcription Hub** — live transcription (local Moonshine/browser speech, no backend needed) + file upload, saved logs, speaker library, fact-check, legal-shield scan, and meeting coaching (backend features need the server running; a banner tells you if it's offline).
- **Fact Check Log** — log of AI fact-checks.
- **Autonomous Runs** — library/history of autonomous agent runs.
- **Home Upkeep AI** — home-maintenance assistant (vision + maintenance tracking).

### Property management & operations
- **Strata Dashboard** — the main property-management workspace (properties, residents, leasing, maintenance, owners, vendors, accounting). Opens at 1100×800.
- **Astra Dashboard** — analytics/overview dashboard.
- **Inbox Zero** — AI email triage: classify, approve/route, archive, snooze, bulk actions (Gmail via the backend).
- **Task Menu / Task Board / Trello Board** — tasks in list or board views; next-step sub-cards with owners.
- **Tenant Portal** — tenant-facing portal management.
- **Georgia Code** — Georgia legal-code reference/lookup.
- **Automation Hub** — automation recipes/pipelines.
- **Universal Shell** — adapter shell for embedded modules.

### Filing & documents
- **File Explorer** — browse and manage your files; persists its structure locally and hydrates instantly on reload.
- **File Manager / Workspace** — workspace tree with domains, threads (move-to-thread, thread switcher), and root-path visibility.
- **Doc Viewer** — view documents.
- **PDF Gear** — full PDF toolkit: text/table extraction, page ops, click-on-canvas placement, OCR (tesseract), forms.
- **Notepad** — quick notes.
- **Scribe** — long-form writing studio: brain-dump/intake, find & replace, focus mode, inline flags (`::flag:: ::todo:: ::question::`), document priority, drag-in references.
- **Template Generator** — generate documents from templates.
- **Tag File** — universal tagging across content (tags link to projects).

### Tools
- **Terminal** — a real workspace shell, plus tabs: **Paperclip** (agent control plane, `:3100`), **LangFlow** (visual LangChain builder, `:7860`), **CrewAI** (multi-agent framework quickstart + control plane). Each external tab embeds the running app or shows a setup guide.
- **Search** — system-wide content search.
- **Control Panel** — Settings (see §3).
- **System Health** — the readiness check (see §4).

---

## 6. External integrations

These are separate apps/services Dwellium connects to. Start them, then the matching tab/widget detects and embeds them.

| Integration | What it is | Start it | Appears in |
|---|---|---|---|
| **Google (Gmail/Calendar)** | Email triage + calendar sync | Authorize the backend (one-time `npm run oauth-setup`) | Inbox Zero, Settings → Integrations |
| **Google Drive** | Back up Wiki/Thought Weaver/etc. | Paste a Google OAuth Client ID in Settings → Storage | Settings → Storage |
| **NotebookLM** | Google's NotebookLM as context | Open notebooklm.google.com | NotebookLM widget |
| **Open Notebook** | Self-hosted NotebookLM alternative | `docker compose up` (`:8502`) | NotebookLM → Open Notebook tab |
| **LangFlow** | Visual LangChain flow builder | `uv tool install langflow && langflow run` (`:7860`) | Terminal → LangFlow tab |
| **CrewAI** | Multi-agent framework (CLI) | `uv tool install 'crewai[tools]'` → `crewai create crew` → `crewai run` | Terminal → CrewAI tab |
| **Paperclip** | Agent-orchestration control plane | `npx paperclipai onboard --yes` (`:3100`) | Terminal → Paperclip tab |
| **LLM providers** | Anthropic/OpenAI/Gemini/Ollama/Custom | Paste a key in Settings → API Keys | Powers all AI widgets |

LangChain and CrewAI are Python *libraries/frameworks*, not embeddable UIs — they're "operational" once installed and run from the Terminal. LangFlow is the visual app built on LangChain.

---

## 7. Troubleshooting

- **A widget says "backend offline" / a banner appears** — the backend server (`:3000`) isn't running. Backend failures never log you out; click the reconnect banner or start the backend. **System Health** shows exactly what's down.
- **Transcription**: live/local capture works with no backend; **upload + saved logs + meeting coaching need the backend**. If it's offline, the widget now tells you instead of failing silently.
- **An AI widget won't respond** — check **System Health**: it's usually a missing LLM key (Settings → API Keys) or the backend being down.
- **LangFlow / CrewAI: "command not found"** after install — uv's bin dir isn't on PATH: run `uv tool update-shell`, open a new terminal, retry.
- **Open Notebook / Paperclip frame is blank** even when reachable — that instance blocks embedding; use **Open ↗** to launch it in a new window (same data).
- **Want to freeze your layout** — click the **lock** button next to the Settings gear.

---

*For developer/build details (gate, CI, repo layout) see `CLAUDE.md`. For the installer see `installer/README.md`. For the Gmail/Calendar backend setup see `CLAUDE_CODE_GMAIL_CALENDAR_HANDOFF.md`.*
