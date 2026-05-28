# Functionality Audit — Per-Section Runtime-Dependency Inventory

> Produced by reading source 2026-05-25. Goal: for every registered widget (26 in `widgetRegistry.ts`) plus the Strata dashboard's major modules, determine what each needs at runtime and classify into one of:
>
> - **(A) WORKS in static mode already** — no backend; reads `/data/*.json` + localStorage.
> - **(B) NEEDS the sibling `/api/dwellium` (or other `/api/*`) Express backend running** (the sibling repo `../ai-dashboard369-file-manager`).
> - **(C) NEEDS an external AI service / API key** (named). Note: in this app the external AI is wired **server-side** — the frontend only talks to the local Express backend, which itself holds the LLM keys and proxies the Stella agent. So "C" here means "even with the Express backend up, the section stays empty/non-functional unless that backend has the external service/key configured."
> - **(D) NEEDS a browser capability** (e.g. microphone).
> - **(E) GENUINELY BROKEN** — a code error, not just a missing backend.

## How API routing actually works (critical context)

There are **two distinct API paths** in this codebase, and only one of them honors static mode:

1. **Strata data layer** — `strataApi.ts` (`qualia-shell/src/components/StrataDashboard/strataApi.ts:22-26`) reads `VITE_USE_STATIC_API`; when `true`/`'1'` it routes to `strataApi.static.ts` which fetches `/data/*.json` + localStorage (`strataApi.static.ts:7,19-41`). When unset/false it routes to `strataApi.backend.ts` → `const API_BASE = '/api/dwellium'` (`strataApi.backend.ts:19`). **Only modules that call `strataGet`/`strataPost`/etc. get the static fallback.**
2. **Everything else (all AI widgets, file tools, several Strata sub-modules)** imports `API_BASE` from `qualia-shell/src/config.ts:10` = `import.meta.env.VITE_API_URL || 'http://localhost:3002'`, OR uses a hardcoded relative path like `/api/stella`. These calls **do not honor `VITE_USE_STATIC_API`** — they always hit a backend. There is no static fixture for them.

**Proxy:** `qualia-shell/vite.config.ts:34-36` proxies `/api` and `/health` → `http://localhost:3000`. So relative `/api/*` calls go to the sibling Express backend on :3000 in dev.

**Env actually configured** (`qualia-shell/.env`, 2 vars only):
- `VITE_ANAM_API_KEY=…` (Anam.ai avatar/voice key — used by voice avatar surfaces, NOT a chat-LLM key)
- `VITE_API_URL=http://localhost:3000`
- **Not set:** `VITE_USE_STATIC_API` (so Strata defaults to BACKEND mode unless launched with the flag), `VITE_SENTRY_DSN`, `VITE_API_BASE`, `VITE_APPFOLIO_SEEDS`.

The frontend holds **no LLM API keys** — Hydra's `apiKeyEnv` field (`HydraAI.tsx:21,65`) and Stella's provider list (`StellaAgent.tsx:172-179`: OpenAI/Anthropic/custom) are sent to the backend, which is where the actual OpenAI/Anthropic/Gemini keys must live.

---

## Inventory — Registered Widgets (26 in `widgetRegistry.ts`)

| Section (widget id) | Class | What it needs at runtime | File : evidence |
|---|---|---|---|
| **strata-dashboard** (Strata Dashboard) | **A** (core data) | Strata modules route reads through `strataApi` → static `/data/*.json` + localStorage. Works offline. (Sub-modules vary — see Strata table below.) | `widgetRegistry.ts:49-57`; `strataApi.ts:22-26`; `strataApi.static.ts:7,19-41` |
| **astra-dashboard** (Astra Dashboard) | **B** | Hits `${API_BASE}/api/dwellium/workitems`, `/api/intelligence/*`, `/api/ara/chat`, `/api/gmail/send`. No static fallback. Has `catch { /* offline fallback */ }` so it renders but stays empty. | `AstraDashboard.tsx:243-244`; `AstraWorkspace.tsx:66,95,149`; `IntelligenceDashboard.tsx:69,80,132,268` |
| **universal-shell** (Universal Shell) | **A** | Layout frame; binds Strata/file adapters. No own backend call (adapters defer to their targets). | `widgetRegistry.ts:75-83`; `UniversalShell/adapters/*` |
| **inbox** (Inbox Zero) | **B** | `EventSource(${INBOX_API}/stream)` + many `/api/v1/inbox/*` and `/api/inbox/*` fetches. No static fallback. | `InboxZero.tsx:329-330`; `SmartActions.tsx:15,146`; `RulesManager.tsx:15`; `ReplyTracker.tsx:53,71` |
| **inbox-zero** (deprecated) | **B** | Same component as `inbox`. Marked deprecated but still registered. | `widgetRegistry.ts:101-109` |
| **tasks** (Task Menu) | **B** | `fetch('/api/tasks')`, `/api/tasks/ai-organize`, `/api/tasks/gmail-sync`. AI-organize + gmail-sync also need external (see below). | `TaskMenu.tsx:71,139,171,193` |
| **trello-board** (Trello Board) | **B** | `const API = ${API_BASE}/api/trello`. No static fallback. | `TrelloBoard.tsx:6` |
| **home-upkeep-ai** (Home Upkeep AI) | **B** + **C** | `${API_BASE}/api/maintenance/*` for stats/systems/alerts (B). `/analyze-photo` POST is an LLM vision call (C — server-side LLM). | `HomeUpkeepAI.tsx:13,144-146,214` |
| **automation-hub** (Automation Hub) | **A** | State seeded from localStorage (`STORAGE_KEY_AUTOMATIONS/_AUDIT/_APPROVALS`); renders the 7 workflow cards offline. Optional `${API_BASE}/api/automations` enriches but isn't required to render. | `AutomationHub.tsx:13,417-447` |
| **tenant-portal-mgmt** (Tenant Portal) | **A** | Wraps `TenantPortalModule` which routes through `strataApi` (static-aware). | `TenantPortalMgmt.tsx:6,15`; `TenantPortalModule` uses strataApi |
| **georgia-code** (Georgia Code) | **B** + **C** | `${API_BASE}/api/georgia-code/status` + `/search`. Shows "Offline" badge when `status.downloaded === 0`. Search is a vector/RAG index that lives on the backend (C — needs the indexed statute corpus + embedding service server-side). | `GeorgiaCode.tsx:67,91,167-169` |
| **ara-console** (ARA Console) | **B** + **C** | `${API_BASE}/api/ara/*` chat + `/api/transcribe`. Chat requires a server-side LLM provider. Voice status surfaces TTS/STT providers (C). | `ARAConsole.tsx:10-11,59-69` |
| **stella-agent** (Stella Agent) | **B** + **C** + **D** | Calls `/api/stella/*` (`status`, `init`, `chat`, `skills`, `memory`, `cron`, `mcp`), `/api/honcho/*`, `/api/hermes/*`, `/api/v1/telegram/*`. Shows **"Stella is not running"** when `/status` fails (`status==='offline'`). Needs (B) the Express backend AND (C) the **Stella Python/AgentScope agent process** + an LLM provider (OpenAI/Anthropic) + Honcho memory svc + Hermes svc; (D) mic for voice. | `StellaAgent.tsx:12,306,734-735,1120-1122,172-179`; comment L2-3 "Integrates Stella (Python/AgentScope)" |
| **hydra-ai** (Hydra AI) | **B** + **C** | `const API_HYDRA = ${API_BASE}/api/hydra`. The **"0/5 heads"** state = multi-model fan-out where each "head" is a provider (`provider:'openai'`, `apiKeyEnv`, `endpoint`). Needs backend (B) AND each head's external LLM API key configured server-side (C: OpenAI/Anthropic/custom-OpenAI-compat e.g. `localhost:1234/v1/chat/completions`). | `HydraAI.tsx:4,7,21,56-69,758` |
| **thought-weaver** (Thought Weaver) | **B** | `const API = '/api/thought-weaver'`; `/captures`, `/stats`, `/timeline`, `/capture`, `/seed`. No static fallback. | `ThoughtWeaver.tsx:64,127-211` |
| **notebooklm-context** (NotebookLM) | **B** + **C** | `${API_BASE}/api/v1/notebooklm/notebooks` + `/enabled`. Backend integrates Google NotebookLM (C — external NotebookLM access server-side). Sets `error` on failure. | `NotebookLMContext.tsx:13,49,72,106,135` |
| **two-brains** (Two Brains) | **B** | Uses `authFetch` against server-side `twoBrainsRoutes.ts`/`twoBrainsStore.ts` (per comment L55). No static fallback. | `TwoBrains.tsx:55,58` |
| **transcription** (Transcription Hub) | **B** + **C** + **D** | `${API_BASE}/api/transcribe/*` (logs, fact-check, live-stt, meeting/*), `/api/georgia-code/legal-scan`, `/api/ara/meeting-manager`. **(D)** mic capture via Web Speech API (`window.SpeechRecognition`) + `@moonshine-ai/moonshine-js` `MicrophoneTranscriber`. **(C)** server-side Whisper/cloud STT + LLM for summarize/fact-check. | `TranscriptionHub.tsx:2,23-27,96-97,406,523,559,833,842` |
| **fact-check-log** (Fact Check Log) | **B** + **C** | `${API_BASE}/api/transcribe/fact-check`. Has explicit offline fallback ("Backend offline — fact-check unavailable"). Fact-check itself is a server-side LLM/search call (C). | `FactCheckLog.tsx:22,48,54,91-97` |
| **file-manager** (File Manager) | **B** | `const API_FILES = ${API_BASE}/api/files`; upload/list/sync-status. No static fallback. | `FileManager.tsx:26,65,90,100` |
| **doc-viewer** (Doc Viewer) | **B** | `${API_BASE}/api/files/*` list/preview/materialize/content. | `DocViewer.tsx:70,151,238,1117,1184` |
| **pdf-gear** (PDF Gear) | **B** | `${API_BASE}/files?…`, `/files/{id}`, `/docs/convert`. | `PDFGear.tsx:89,149,224` |
| **notepad** (Notepad) | **B** | `const API_FILES = ${API_BASE}/api/files`; `/notes` CRUD + cross-search `/api/tasks`. | `Notepad.tsx:27,70-71,114,129` |
| **template-generator** (Template Generator) | **B** | Re-exports from `DocViewer/TemplateGenerator`; same `/api/files` family. | `widgetRegistry.ts:248-254` |
| **terminal** (Terminal) | **B** + **E-risk** | `const API_TERMINAL = ${API_BASE}/api/terminal`; spawns a **server-side shell session** (PTY). Cannot work without backend; the backend must expose a real terminal endpoint — security-sensitive, may be intentionally absent. | `Terminal.tsx:29,2` |
| **control-panel** (Control Panel) | **A / B** | Theme/window/layout controls are local (A). The integrations panel (`${API_BASE}/api/integrations` — Gmail/Calendar connect status) needs backend (B). Core panel renders offline. | `ControlPanel.tsx:5,19-20` |

---

## Inventory — Strata Dashboard major modules

These render inside `strata-dashboard`. The split is whether a module routes through `strataApi` (static-aware = A) or hits a backend directly (B).

| Strata module | Class | What it needs | File : evidence |
|---|---|---|---|
| Properties / Residents / Owners / Leasing / Vendors / Maintenance / Accounting / WorkOrders / Profiles / Compliance / Insurance / Projects / Communication / PropertyOverview / Reporting / Utilities / Vehicles | **A** | Route reads via `strataGet`/`strataPost` → static `/data/*.json` + localStorage in static mode. (These power the "property-management modules work with seed data" observation.) | `ProfilesModule.tsx:77-91`; `ResidentsModule.tsx:18` (`strataGet…`); 33 modules import `../strataApi` (grep) |
| TenantPortalModule | **A** | strataApi-routed. | imports `../strataApi` |
| **SentimentModule** | **B** | `const API = 'http://localhost:3000'` raw — but rewired in static mode to short-circuit via `isStaticMode`. Trends call still expects backend `/api/sentiment/*`. | `SentimentModule.tsx:12,45`; `strataApi.ts:36` `isStaticMode` |
| **ForecastModule** | **B** | Backend `/api/forecast`; rewired off raw localhost but still backend-bound. | `ForecastModule.tsx:42`; `strataApi.static.ts:447` |
| **CalendarModule** | **B** | `const API = 'http://localhost:3000'`; `/api/calendar/export/ics` + `webcal://localhost:3000`. | `CalendarModule.tsx:23,164` |
| **AuditModule** | **B** | Rewired off direct localhost:3000 but consumes backend audit feed. | `AuditModule.tsx:175` |
| **StatusCheckModule** | **B** | `const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000'`. Health/status probe of the backend itself. | `StatusCheckModule.tsx:44` |
| **TrelloCardModal** | **B** | `VITE_API_BASE || 'http://localhost:3000'` + `/api/trello`. | `TrelloCardModal.tsx:14` |
| DesignStudio / CivilEngineeringStudio / VisualizationModule / IncidentModule / LegalModule / ManagerHome / CorporateReview / PropertyTimeline | **B (mixed)** | Use `${API_BASE}/api/…` or strataApi POST writes; back-end-leaning. (ManagerHome `${API_BASE}/api`.) | `ManagerHome.tsx:13`; modules grep |

---

## Non-registry surfaces touched (for completeness)

| Surface | Class | Evidence |
|---|---|---|
| **OpenJarvis** (mounted in App.tsx as `OpenJarvisWidget`, not in registry) | **B** + **C** | `const DWELLIUM_API = VITE_API_URL || 'http://localhost:3002'`; chat models include `gpt-4o-mini`, Gemini (`gemini-2.5-flash`); health check → "disconnected". Needs backend + server-side LLM (OpenAI/Gemini). | `OpenJarvis.tsx:90,97,103,124-129` |
| **CommandPalette** | **B** | `/api/tasks`, `${INBOX_API}`, `${FILES_API}/search`. Degrades quietly. | `CommandPalette.tsx:10-11,626,655,705` |
| **Antigravity** (component present) | **B** + **C** | `${API_BASE}/api/v1/antigravity/chat` — LLM chat. | `Antigravity.tsx:259,315` |

---

## Classification counts (26 registered widgets)

Counting each widget by its **blocking** class (the thing that stops it functioning). Many B widgets also carry C as a deeper dependency.

- **(A) Works in static mode:** 5 — universal-shell, automation-hub, tenant-portal-mgmt, control-panel (core), strata-dashboard (its core property modules).
- **(B) Needs the Express backend (`/api/*` on :3000):** all of the remaining 21 widgets reach a backend; of those, the ones whose **only** blocker is the backend (no external AI, no mic): astra-dashboard, inbox, inbox-zero, tasks, trello-board, thought-weaver, two-brains, file-manager, doc-viewer, pdf-gear, notepad, template-generator, terminal = **13**.
- **(C) Needs an external AI service / API key (in addition to B):** stella-agent, hydra-ai, ara-console, georgia-code, notebooklm-context, fact-check-log, transcription, home-upkeep-ai = **8** (these are the ones that stay "offline/empty/0 heads" even with the backend up, until the backend has the external svc/key).
- **(D) Needs a browser capability (mic):** transcription, stella-agent (voice) = **2** (also B+C).
- **(E) Genuinely broken (code error):** **0** confirmed. Terminal is an E-*risk* (depends on a security-sensitive server-side PTY endpoint that may be intentionally absent) but the frontend code is not erroneous.
