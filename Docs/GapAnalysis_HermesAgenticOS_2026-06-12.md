# Gap Analysis — "Hermes Agentic OS" (Jack Roberts video) vs Dwellium

**Source:** https://www.youtube.com/watch?v=zqUdtL5l9yM ("Hermes Agentic OS is Insane… just watch", 18:45, published 2026-06-01). Full caption transcript extracted and read end-to-end 2026-06-12. Dwellium-side claims verified against the codebase at HEAD `564151d` (greps cited inline), not from memory.

**What the video shows:** a web dashboard ("agentic OS") acting as a visual intelligence layer over Hermes agent + Claude Code — one place unifying chats, skills, personas, memory, goals, costs, and agent-created documents. It is a sales funnel for a Skool community (price-rise urgency at 18:15), but the feature set is a useful benchmark.

---

## Feature-by-feature comparison

| # | Video feature (timestamp) | Dwellium status | Evidence |
|---|---|---|---|
| 1 | **Unified hub** — one location for all AI tools; fixes "context isolation" (1:05) | ✅ **HAVE, deeper** — the entire One-Front-Door/One-Canvas architecture: 40+ widgets, ⌘K, Spaces, window manager, One Save | Consolidation proposal §2-3; shipped Phases 8-11 |
| 2 | **Embedded agent chat + history** (4:09) | ✅ **HAVE** — ARA console with threads (One Save-synced), personas, voice in/out | `ARAConsole.tsx`, `activeThread` store |
| 3 | **Dreaming function** — overnight agent re-reads everything, surfaces patterns (1:51, 7:20) | 🟡 **PARTIAL** — `honchoBackgroundRunner.ts` literally dreams ("synthesize a short 'dream' — a reflection over recent memories" → per-user dream store) while signed in. Gaps: scope is Honcho memories only (not ARA/Stella threads, skills usage, or goals); no overnight schedule; no morning-brief delivery surface | `services/honchoBackgroundRunner.ts:6-7` |
| 4 | **Morning brief** — daily digest with suggestions (2:55) | ❌ **GAP** — zero hits for brief/digest delivery | grep `morning|daily.*brief|digest` → none |
| 5 | **Personas/Pantheon** — visual persona gallery; per-persona **preferred model** so cheap models take cron work (3:01, 6:02) | 🟡 **PARTIAL** — Agent Lab has visual personas/teams with skills chips + ARA spawn; **no per-persona model preference** (one active LLM per user via `llmClient`) | grep `preferredModel` in `agentTeamsStore`/`orchestrator` → none |
| 6 | **AI spend dashboard** — live cost by hour/day across all tools, plan-utilization advice, context remaining (3:10, 7:06) | ❌ **GAP** — `llmClient` does not record usage/cost at all. (Context-remaining partially exists: `contextWindow.ts` warns in AraMiniPanel.) Browser-direct keys = every call passes through `llmClient`, so a usage ledger is one wrapper away | grep `spend|cost.*track|usage.*track` → none |
| 7 | **Mission Control goals** — midterm goal intake (agent asks clarifying Qs) → plan with brief / agent actions / "your role" tracked on the dashboard (5:54) | ❌ **GAP** — Task Board is task-level Kanban; nothing models goals with agent-generated plans and progress | `taskBoard` store (tasks, not goals) |
| 8 | **Connections panel** — every MCP/connection, global vs agent-scoped, versions, models, memory-activation counts (3:51) | 🟡 **PARTIAL** — Control Panel (LLM/Supabase/Postgres/Google cards) + System Health probes; no unified "what's connected, used how often" inventory | `LlmIntegrationsSection.tsx`, `SystemHealth.tsx` |
| 9 | **Memory stack overview** — what's plugged in (Obsidian/Pinecone/local), review+amend agent memory file in UI (7:50) | 🟡 **PARTIAL** — One Memory (`unifiedMemory` over honcho+copaw+TW) + Knowledge Graph (graphify) are deeper than the video's; missing the single "memory stack" overview pane and in-UI editing of agent context files | `lib/unifiedMemory.ts`, KG arc `3aef7e7` |
| 10 | **Document interface / artifact library** — agent outputs auto-land in a watched folder → dashboard grid: preview, filter by type, search, delete, auto 5-word title + ≤14-word summary (9:09-17:41) | 🟡 **PARTIAL** — File Explorer/Filing Cabinet/Scribe cover files; One Save guarantees persistence; compose-into-widget places drafts. Missing: a dedicated **"everything ARA/agents produced" gallery** with live updates, type filters, previews, and auto-summaries — chat outputs (invoices, decks, HTML) still live in the chat | the video's headline build; our `Workspace`/`FileExplorer` are file-centric, not artifact-centric |
| 11 | **Code graph (graphify)** — graph the repo so the agent navigates cheaply (10:51) | ✅ **HAVE, broader** — same repo, installed 2026-06-12; we graph the user's KNOWLEDGE (14 One Save types) + interactive viewer + ARA Graph tab + agent skill. Pointing it at a code repo too is trivial (same CLI) | backend `a315c4e`, frontend `3aef7e7` |
| 12 | **Scheduled tasks / cron view** (7:50) | 🟡 **PARTIAL** — AutomationHub has schedule cards (Launch/Settings/status); whether schedules EXECUTE unattended is unverified — no cron runner found server-side | `AutomationHub.tsx:5,48` |
| 13 | **Onboarding** — software detection, API-key intake, ROI-on-time per skill (8:30) | ❌ **GAP** (low value single-user) — API-key intake exists in Control Panel; no software detection or ROI tracking |  |
| 14 | **Obsidian / Pinecone connectors** (6:43) | ❌ N/A by choice — our equivalents are Supabase/Postgres/Google + the FS-is-truth spine |  |
| 15 | **Install-prompt distribution** — every module ships as a paste-able build prompt (15:35) | ❌ N/A — that's their product packaging, not a capability |  |

## Verdict

Dwellium already **is** the thing the video sells — and is structurally ahead on the hub, window manager, persistence (One Save), memory (One Memory + Knowledge Graph), agent execution (spawn/chains/skills/ReAct/widget-action bus), and voice. The video wins on **observability and rhythm**: it shows the user what the system spends, what it dreamed, what the goals are, and what it produced.

**Real gaps, ranked by value-for-effort:**

1. **Artifact gallery** (#10) — auto-file every ARA/agent output (invoice, draft, image, HTML) into One Save + a gallery widget with preview/filter/search/delete + auto title/summary. Biggest daily-driver win; most One Save plumbing exists.
2. **AI spend tracker** (#6) — wrap `callLlm` with a per-call usage ledger (provider, model, tokens, est. $) → dashboard card + "context left" strip. Browser-direct keys make this cheap to build.
3. **Dream expansion + morning brief** (#3/#4) — widen the existing Honcho dreamer to ARA threads + skills usage + goals; deliver a daily brief (banner/ARA message) on first open of the day.
4. **Mission Control goals** (#7) — goal store + ARA intake flow (clarifying questions → plan with agent-actions vs your-actions) + dashboard card.
5. **Per-persona preferred model** (#5) — small `llmClient` extension; lets cheap models take cron/autopilot work.
6. **Connections/memory-stack overview** (#8/#9) — one pane listing every integration + store + activation counts; fold System Health into it.
7. **Automation execution audit** (#12) — verify/finish the AutomationHub scheduler runtime.
