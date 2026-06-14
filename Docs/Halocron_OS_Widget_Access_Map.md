# Halocron OS — Widget Access Map (all 50)

**Date:** 2026-06-13
**Reference:** Jack Roberts "Claude OS / Graphify" (`Owv503rTqYY`, frame @ 6:00 captured)
**Purpose:** Define how a user reaches **every** Dwellium widget from inside Halocron
OS — so nothing is orphaned when the OS hosts widgets internally (no bounce to Classic).

---

## 1. The access model (from the video)

Claude OS @ 6:00 shows the navigation pattern we mirror:

- **Left rail** of *sections* (video: Home · Skills · Memory · Knowledge Graph ·
  Activity). Each is a full-screen view, not a window.
- **Agent/persona** listed in the rail ("HERMES-AGENT") + a **persistent agent chat
  bar** at the bottom of every view ("How do I run it? · Give me a quick tour · Is
  anything broken or risky?").
- **Project/entity cards** as the content of a view (Claude OS, Publish Hub, …).
- A **right-side insights panel** (map confidence, most-important files, est. savings).

Halocron OS adapts this to **four ways to reach any widget**, so access is guaranteed:

| # | Access route | Reaches |
|--:|---|---|
| A | **Apps archive** (rail ▦) — searchable grid of ALL widgets, grouped by category | **every widget (universal fallback)** |
| B | **Curated rail sections** (Home, Memory, Workspace, Skills, Dream, Insights, Filing, Settings) | the marquee widgets, 1 click |
| C | **Keeper dock** (persona orbs) + agent chat bar | agent-facing widgets / actions |
| D | **⌘K command rune** (type a name) | every widget by name |

Rule: **A and D always work for all 50.** B/C are the fast, themed paths for the ones
users reach most.

---

## 2. Per-widget access map (all 50)

Every row is reachable via **Apps archive (A)** and **⌘K (D)**; the "Primary path"
column is the curated 1-click route (B/C).

### Home & agents (Keeper dock + Home)
| Widget | id | Primary path |
|---|---|---|
| ARA Console | `ara-console` | Home → agent chat bar; Keeper dock (any persona) |
| Stella Agent | `stella-agent` | Keeper dock → Stella; Apps · AI |
| Honcho | `honcho` | Keeper dock; Apps · AI |
| Two Brains | `two-brains` | Keeper dock; Apps · AI |
| Hydra AI | `hydra-ai` | Skills → Hydra; Apps · AI |

### Memory (rail ✶)
| Widget | id | Primary path |
|---|---|---|
| Knowledge Graph | `knowledge-graph` | **Memory → Knowledge Graph** (centerpiece, like the video) |
| Cognitive M Network | `memory-graph-rag` | Memory → Cognitive Network |
| Connections & Memory | `connections` | Memory → Connections |
| Thought Weaver | `thought-weaver` | Memory → Thought Weaver |
| NotebookLM | `notebooklm-context` | Memory → NotebookLM |
| Time Travel | `time-travel` | Memory → history; Settings |
| Wiki | `wiki` | Memory → Wiki |

### Workspace / Spaces (rail ◳)
| Widget | id | Primary path |
|---|---|---|
| Strata Dashboard | `strata-dashboard` | Workspace → Manage space |
| Astra Dashboard | `astra-dashboard` | Workspace → Manage space |
| Universal Shell | `universal-shell` | Workspace → Build space |
| Tenant Portal | `tenant-portal-mgmt` | Workspace → Manage space |
| Georgia Code | `georgia-code` | Workspace → Manage |
| Home Upkeep AI | `home-upkeep-ai` | Workspace → Manage |

### Skills / agents lab (rail ✦)
| Widget | id | Primary path |
|---|---|---|
| Agent Lab | `agent-lab` | Skills → Agent Lab |
| Builder Agents | `builder-agents` | Skills → Builder Agents |
| The Hive | `hive` | Skills → Hive |
| Autonomous Runs | `autonomous-runs` | Skills → Autonomous Runs |
| Synthesis Lab | `synthesis` | Skills → Synthesis |
| Foundry | `foundry` | Skills → Foundry |

### Dream / automation (rail ☾)
| Widget | id | Primary path |
|---|---|---|
| Automation Hub | `automation-hub` | Dream → scheduler |
| Mission Control | `mission-control` | Dream → Mission Control |
| Task Board | `task-board` | Dream → Tasks |
| Trello Board | `trello-board` | Dream → Tasks |
| Task Menu | `tasks` | Dream → Tasks |

### Insights (rail ▤)
| Widget | id | Primary path |
|---|---|---|
| AI Spend | `ai-spend` | Insights → Spend |
| System Health | `system-health` | Insights → Health |
| Fact Check Log | `fact-check-log` | Insights → Fact Check |
| Artifacts | `artifact-gallery` | Insights → Artifacts |

### Filing / documents (rail 🗄, via Apps · Filing)
| Widget | id | Primary path |
|---|---|---|
| Scribe | `scribe` | Filing → Scribe (or Write space) |
| Transcription Hub | `transcription` | Filing → Transcription (or Research space) |
| Doc Viewer | `doc-viewer` | Filing → Doc Viewer |
| PDF Gear | `pdf-gear` | Filing → PDF Gear |
| Notepad | `notepad` | Filing → Notepad |
| File Manager | `file-manager` | Filing → Files |
| File Explorer | `file-explorer` | Filing → Files |
| Workspace | `workspace` | Filing → Workspace |
| Tag File | `tag-file` | Filing → Tags |
| Template Generator | `template-generator` | Filing → Templates |

### Comms & inbox
| Widget | id | Primary path |
|---|---|---|
| Inbox Zero | `inbox` | Workspace → Comms space; Apps · Core |
| Inbox Zero (deprecated) | `inbox-zero` | Apps archive only (legacy; hidden by default) |
| Search | `content-search` | Top-bar search rune; Apps · Tools |

### System / settings (rail ⚙)
| Widget | id | Primary path |
|---|---|---|
| Control Panel | `control-panel` | Settings → full Control Panel |
| UI Editor | `ui-editor` | Settings → UI Editor |
| Holocron Library | `holocron-library` | Settings → Appearance; Apps · Tools |
| Terminal | `terminal` | Settings → Terminal; ⌘K "terminal" (hidden by default per prior Ilya call) |

**Coverage check:** 50 / 50 widgets mapped. Universal routes (Apps archive + ⌘K)
cover every one; `inbox-zero` (deprecated) and `terminal` are intentionally
archive/command-only, not on the curated rail.

---

## 3. Notes for the build

- The **Apps archive** is the safety net — it already enumerates `WIDGET_REGISTRY`
  live, so any future widget is reachable with zero extra wiring.
- Curated rail placements above are derived from each widget's `category`
  (core/ai/filing/tools) plus the video's section model; they're the recommended
  groupings, adjustable per taste.
- Agent-facing widgets (ARA, Stella, Honcho, Two Brains, Hydra) attach to the
  **keeper dock** so the active persona context carries in — matching the video's
  "HERMES-AGENT in the rail + chat bar" model.
- Once the **in-OS window host** lands (see `Halocron_OS_Gap_Analysis.md` GAP #4),
  every path above opens the widget *inside* the OS, never the Classic desktop.

*Uncommitted on `main`.*
