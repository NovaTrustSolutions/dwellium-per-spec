/**
 * widgetRegistry.ts — Centralized Widget Registry for the Qualia Shell.
 *
 * Single source of truth for ALL widget metadata, component loaders, and icons.
 * - Desktop.tsx reads components from here (no direct lazy imports)
 * - Sidebar reads icons/labels from here (no separate icon map needed)
 * - CommandPalette reads the full list from here (no hardcoded arrays)
 *
 * To add a new widget:
 *   1. Create the component file
 *   2. Add ONE entry to WIDGET_REGISTRY below
 *   That's it. Desktop, Sidebar, and CommandPalette auto-discover it.
 *
 * @see Fix #026 in docs/code.md
 */

import type { ComponentType } from 'react';

// Re-export the lazyWithReload utility for widget loading
import { lazyWithReload } from '../utils/lazyWithReload';
import { AUDIT_LOG_CATALOG_EMAILS } from '../components/AuditLog/auditLogAccess';

export interface WidgetRegistration {
    /** Unique key — matches hierarchy.ts component ID and WINDOW_COMPONENTS key */
    id: string;
    /** Human-readable display name shown in titlebar, command palette, etc. */
    label: string;
    /** One plain-English line: what it does for a property manager. Shown in ⌘K rows, sidebar hover, window-title hover. */
    description: string;
    /** Lucide icon key (from iconMap.ts) — used in sidebar and window titlebar */
    icon: string;
    /** Lazy-loadable component factory */
    component: React.LazyExoticComponent<ComponentType<any>>;
    /** Minimum window width in pixels */
    minWidth?: number;
    /** Minimum window height in pixels */
    minHeight?: number;
    /** Optional category for command palette grouping */
    category?: 'core' | 'ai' | 'filing' | 'tools';
    /**
     * Restrict visibility to specific account emails (lowercase). Consumers
     * that render catalogs (Holocron OS Apps, palettes) should hide entries
     * whose list doesn't include the signed-in user's email. The component
     * itself must ALSO hard-gate (defense in depth) — catalog filtering is
     * cosmetic, not security.
     */
    restrictedToEmails?: string[];
}

/**
 * WIDGET_REGISTRY — The single source of truth for all widgets.
 *
 * Each entry maps a widget key to its metadata + lazy component.
 * Order here determines command palette order.
 */
export const WIDGET_REGISTRY: Record<string, WidgetRegistration> = {
    // ═══════════════════════════════════════
    //  RESTRICTED — Andy-only administration
    // ═══════════════════════════════════════
    // Server-side audit trail: who logged in/out (+ time, IP), what every
    // account worked on. Andy's login ONLY — the component hard-gates on the
    // signed-in email and the Apps catalog hides it for everyone else.
    'audit-log': {
        id: 'audit-log',
        label: 'Audit Log',
        description: 'Who signed in, when, from where, and what each account worked on (Andy only).',
        icon: 'scroll-text',
        component: lazyWithReload(() => import('../components/AuditLog/AuditLogWidget')),
        minWidth: 720,
        minHeight: 460,
        category: 'tools',
        restrictedToEmails: [...AUDIT_LOG_CATALOG_EMAILS],
    },
    // ═══════════════════════════════════════
    //  CORE — Property Management
    // ═══════════════════════════════════════
    'strata-dashboard': {
        id: 'strata-dashboard',
        label: 'Strata Dashboard',
        description: 'Day-to-day property operations: residents, work orders, money, compliance — your main desk.',
        icon: 'building-2',
        component: lazyWithReload(() => import('../components/StrataDashboard/StrataDashboard')),
        minWidth: 900,
        minHeight: 600,
        category: 'core',
    },
    'astra-dashboard': {
        id: 'astra-dashboard',
        label: 'Astra Dashboard',
        description: 'Executive view: portfolio heatmap, watchdog list, financial snapshots, compliance calendar.',
        icon: 'diamond',
        component: lazyWithReload(() => import('../components/AstraDashboard/AstraDashboard')),
        minWidth: 800,
        minHeight: 500,
        category: 'core',
    },
    // Knowledge layer (spec §7) — Three-Tier Wiki compilation
    'wiki': {
        id: 'wiki',
        label: 'Wiki',
        description: 'AI-compiled reference pages for each domain, project and thread, with source citations.',
        icon: 'book-open',
        component: lazyWithReload(() => import('../components/Wiki/Wiki')),
        minWidth: 720,
        minHeight: 480,
        category: 'ai',
    },
    // Knowledge layer (spec §7.3) — Synthesis / compounding loop
    'synthesis': {
        id: 'synthesis',
        label: 'Synthesis Lab',
        description: 'Ask a question across your documents, keep the answer, and build on it with a second pass.',
        icon: 'sparkles',
        component: lazyWithReload(() => import('../components/Synthesis/Synthesis')),
        minWidth: 760,
        minHeight: 500,
        category: 'ai',
    },
    // Knowledge layer (spec §7.4) — Foundry document intake
    'foundry': {
        id: 'foundry',
        label: 'Foundry',
        description: 'Intake for new documents: capture, AI triage, review, then admit to your library.',
        icon: 'inbox',
        component: lazyWithReload(() => import('../components/Foundry/Foundry')),
        minWidth: 720,
        minHeight: 500,
        category: 'ai',
    },
    // Knowledge layer (spec §7.5) — d3-style force-directed knowledge graph
    'knowledge-graph': {
        id: 'knowledge-graph',
        label: 'Knowledge Graph',
        description: 'Interactive map of how your files, projects and agents connect.',
        icon: 'network',
        component: lazyWithReload(() => import('../components/Shell/HalocronKnowledgeGraph')),
        minWidth: 760,
        minHeight: 540,
        category: 'ai',
    },
    // MemoryGraphRAG — three-layer memory Graph-RAG (Ontology/Fact/Passage) +
    // multi-agent extraction + bridging + Personalized-PageRank retrieval.
    'memory-graph-rag': {
        id: 'memory-graph-rag',
        label: 'Cognitive M Network',
        description: 'Long-term memory for AI: stores facts from your documents and answers with sources.',
        icon: 'earth',
        component: lazyWithReload(() => import('../components/MemoryGraphRAG/MemoryGraphRAG')),
        minWidth: 820,
        minHeight: 560,
        category: 'ai',
    },
    // Builder agents (spec §8.6/8.7/8.8) — Schema Producer + PRD synthesis + Gap analysis
    'builder-agents': {
        id: 'builder-agents',
        label: 'Builder Agents',
        description: 'Three AI helpers that draft data schemas, requirement docs and gap analyses.',
        icon: 'cpu',
        component: lazyWithReload(() => import('../components/BuilderAgents/BuilderAgents')),
        minWidth: 780,
        minHeight: 520,
        category: 'ai',
    },
    // Agent management (spec §8.1/8.2/8.3/8.5) — The Hive console
    'hive': {
        id: 'hive',
        label: 'The Hive',
        description: 'Control room for every AI agent: status, last action, manual trigger, cost by provider.',
        icon: 'layout-grid',
        component: lazyWithReload(() => import('../components/Hive/Hive')),
        minWidth: 820,
        minHeight: 520,
        category: 'ai',
    },
    // Pre-launch AI readiness check
    'system-health': {
        id: 'system-health',
        label: 'System Health',
        description: 'Which AI features are connected, which are limited, and a button to fix each one.',
        icon: 'layout-grid',
        component: lazyWithReload(() => import('../components/SystemHealth/SystemHealth')),
        minWidth: 480,
        minHeight: 560,
        category: 'ai',
    },
    // System-wide content search (spec §2.5)
    'content-search': {
        id: 'content-search',
        label: 'Search',
        description: 'Full-text search across notes, syntheses, wiki pages, intake items and file names.',
        icon: 'search-check',
        component: lazyWithReload(() => import('../components/ContentSearch/ContentSearch')),
        minWidth: 640,
        minHeight: 460,
        category: 'tools',
    },
    // Autonomous-run library (spec §1.4)
    'autonomous-runs': {
        id: 'autonomous-runs',
        label: 'Autonomous Runs',
        description: 'Catalog of long-running automated jobs with the exact command to launch each.',
        icon: 'terminal',
        component: lazyWithReload(() => import('../components/AutonomousRuns/AutonomousRuns')),
        minWidth: 700,
        minHeight: 460,
        category: 'tools',
    },
    // ─────────────────────────────────────────────────────────────────
    //  F-1 Universal Shell (Option C) — Phase 3-E ratified 2026-04-16.
    //  Persistent 4-column frame (Filing Cabinet / Scratch Pad / Canvas
    //  / Orchestrator). Containers bind via ContainerAdapter.
    //  [SOURCE: Phase3H_Engineer_Handoff.docx §3 Table 1 R1]
    //  [SOURCE: Phase3E_Architecture_Spec.docx §1.3]
    //  Canary: [CT-3H-HANDOFF-M4Q7]
    // ─────────────────────────────────────────────────────────────────
    'universal-shell': {
        id: 'universal-shell',
        label: 'Universal Shell',
        description: 'Four-column workbench: filing cabinet, scratch pad, canvas and orchestrator side by side.',
        icon: 'layout-grid',
        component: lazyWithReload(() => import('../components/UniversalShell/UniversalShell')),
        minWidth: 960,
        minHeight: 600,
        category: 'core',
    },
    'inbox': {
        id: 'inbox',
        label: 'Inbox Zero',
        description: 'Email triage: sort signal from noise, approve, and route messages to the right place.',
        icon: 'mail-open',
        component: lazyWithReload(() => import('../components/InboxZero/InboxZero')),
        minWidth: 700,
        minHeight: 500,
        category: 'core',
    },
    // Per-user API keys (2026-06-15): standalone window for the write-only
    // Active-LLM picker + 5 provider cards. Mounts the reusable ApiKeysPanel;
    // placed directly below Inbox Zero in hierarchy.ts. Storage/keys are owned
    // by useIntegrations() — this widget is a thin shell only.
    'api-keys': {
        id: 'api-keys',
        label: 'API Keys',
        description: 'Your own AI provider keys and which model is active (stored privately, write-only).',
        icon: 'settings',
        component: lazyWithReload(() => import('../components/ApiKeysWidget/ApiKeysWidget')),
        minWidth: 480,
        minHeight: 460,
        category: 'tools',
    },
    // ─────────────────────────────────────────────────────────────────
    //  DEPRECATED as of 2026-04-19 (Phase 3-H §3 Table 1 R2, C-1).
    //  The 'inbox-zero' widget is superseded by the headless routing
    //  engine in `src/services/emailRouter.ts`. Kept registered to
    //  avoid breaking any saved-window / dock references, but marked
    //  @deprecated in metadata so QA can track removal. Final deletion
    //  gated on the C-1 migration window closing.
    // ─────────────────────────────────────────────────────────────────
    'inbox-zero': {
        id: 'inbox-zero',
        label: 'Inbox Zero (deprecated)',
        description: 'Older Inbox Zero entry kept for saved layouts — use Inbox Zero instead.',
        icon: 'mail-open',
        component: lazyWithReload(() => import('../components/InboxZero/InboxZero')),
        minWidth: 700,
        minHeight: 500,
        category: 'core',
    },
    'tasks': {
        id: 'tasks',
        label: 'Task Menu',
        description: 'Your to-do list with urgency, status, AI ranking and a Kanban view.',
        icon: 'check-square',
        component: lazyWithReload(() => import('../components/TaskMenu/TaskMenu')),
        category: 'core',
    },
    'trello-board': {
        id: 'trello-board',
        label: 'Trello Board',
        description: 'Your Trello boards and cards, live inside Dwellium.',
        icon: 'layout-list',
        component: lazyWithReload(() => import('../components/TrelloBoard/TrelloBoard')),
        category: 'core',
    },
    'task-board': {
        id: 'task-board',
        label: 'Task Board',
        description: 'Local Kanban: drag cards between columns, bulk-move, full undo history.',
        icon: 'layout-grid',
        component: lazyWithReload(() => import('../components/TaskBoard/TaskBoard')),
        minWidth: 680,
        minHeight: 460,
        category: 'core',
    },
    'tag-file': {
        id: 'tag-file',
        label: 'Tag File',
        description: "Everything you've tagged anywhere in the app, grouped by tag.",
        icon: 'tag',
        component: lazyWithReload(() => import('../components/TagFile/TagFile')),
        minWidth: 420,
        minHeight: 420,
        category: 'filing',
    },
    'home-upkeep-ai': {
        id: 'home-upkeep-ai',
        label: 'Home Upkeep AI',
        description: 'Tracks building systems against their lifespans and flags inspections and wear early.',
        icon: 'home',
        component: lazyWithReload(() => import('../components/HomeUpkeepAI/HomeUpkeepAI')),
        category: 'core',
    },
    'automation-hub': {
        id: 'automation-hub',
        label: 'Automation Hub',
        description: 'Recurring workflow automations with schedules, launch buttons and an audit log.',
        icon: 'zap',
        component: lazyWithReload(() => import('../components/AutomationHub/AutomationHub')),
        category: 'core',
    },
    'tenant-portal-mgmt': {
        id: 'tenant-portal-mgmt',
        label: 'Tenant Portal',
        description: 'What residents see — directory, maintenance, payments, messages, lease alerts — and its admin.',
        icon: 'home',
        component: lazyWithReload(() => import('../components/TenantPortalMgmt/TenantPortalMgmt')),
        category: 'core',
    },
    'georgia-code': {
        id: 'georgia-code',
        label: 'Georgia Code',
        description: 'Search the Official Code of Georgia (OCGA) by meaning, not just keywords.',
        icon: 'book-open',
        component: lazyWithReload(() => import('../components/GeorgiaCode/GeorgiaCode')),
        category: 'core',
    },

    // ═══════════════════════════════════════
    //  AI — Intelligence Tools
    // ═══════════════════════════════════════
    'agent-lab': {
        id: 'agent-lab',
        label: 'Agent Lab',
        description: 'Give a goal to a team of AI specialists; they split the work, verify it and merge a result.',
        icon: 'bot',
        component: lazyWithReload(() => import('../components/AgentLab/AgentLab')),
        minWidth: 760,
        minHeight: 540,
        category: 'ai',
    },
    'ara-console': {
        id: 'ara-console',
        label: 'ARA Console',
        description: 'Your main AI assistant: chat, voice, files and actions across Dwellium.',
        icon: 'brain-circuit',
        component: lazyWithReload(() => import('../components/ARAConsole/ARAConsole')),
        minWidth: 600,
        minHeight: 400,
        category: 'ai',
    },
    // ARA's meeting note-taker (2026-06-15): start a meeting-assist session with
    // a Visible-bot vs Background(desktop) mode toggle, a recording/consent
    // indicator, and live transcript + ARA coaching. Calls the shared
    // /api/ara/meeting/* contracts (visible) and electronAPI.startBackgroundMeeting
    // (background). Recall.ai key lives in the API-Keys panel.
    'meeting': {
        id: 'meeting',
        label: 'Meeting Notetaker',
        description: 'ARA joins or listens to a meeting, transcribes live and coaches you during it.',
        icon: 'mic',
        component: lazyWithReload(() => import('../components/AraMeeting/AraMeetingPanel')),
        minWidth: 460,
        minHeight: 480,
        category: 'ai',
    },
    'stella-agent': {
        id: 'stella-agent',
        label: 'Stella Agent',
        description: 'Personal AI assistant with its own tools, memory and task follow-through.',
        icon: 'sparkles',
        component: lazyWithReload(() => import('../components/StellaAgent/StellaAgent')),
        minWidth: 600,
        minHeight: 400,
        category: 'ai',
    },
    // ─────────────────────────────────────────────────────────────────
    //  Honcho — standalone always-on memory + Hermes agent widget.
    //  Promoted out of Stella's inline `honcho` tab (Scribe-ingestion arc
    //  Cycle 6, 2026-05-29) into its own registered widget. Renders the
    //  SHARED HonchoHermesPanel — Stella's inline tab is UNTOUCHED (it has
    //  its own inline honcho/hermes code), so this is a zero-Stella-touch
    //  promotion; both surfaces can coexist.
    // ─────────────────────────────────────────────────────────────────
    'honcho': {
        id: 'honcho',
        label: 'Honcho',
        description: "The AI's always-on memory: what it remembers about you, searchable and editable.",
        icon: 'brain-circuit',
        component: lazyWithReload(() => import('../components/HonchoHermesPanel/HonchoHermesPanel')),
        minWidth: 600,
        minHeight: 400,
        category: 'ai',
    },
    // ─────────────────────────────────────────────────────────────────
    //  Hermes — dedicated launcher that opens the Honcho+Hermes panel
    //  straight to the Agents persona-card view (initialTab='agents').
    //  Distinct widget so a "Hermes" entry shows in BOTH the sidebar and
    //  the Holocron OS launcher (which auto-lists the registry).
    // ─────────────────────────────────────────────────────────────────
    'hermes': {
        id: 'hermes',
        label: 'Hermes',
        description: 'The AI agent roster: a persona card for each specialist and what it has learned.',
        icon: 'zap',
        component: lazyWithReload(() => import('../components/HonchoHermesPanel/HermesAgentsWidget')),
        minWidth: 600,
        minHeight: 400,
        category: 'ai',
    },
    'hydra-ai': {
        id: 'hydra-ai',
        label: 'Hydra AI',
        description: 'Ask one question, see every configured AI model answer side by side.',
        icon: 'network',
        component: lazyWithReload(() => import('../components/HydraAI/HydraSplit')),
        category: 'ai',
    },
    'thought-weaver': {
        id: 'thought-weaver',
        label: 'Thought Weaver',
        description: 'Drop raw thoughts — meetings, ideas, tasks — and AI sorts them into action items.',
        icon: 'brain',
        component: lazyWithReload(() => import('../components/ThoughtWeaver/ThoughtWeaver')),
        category: 'ai',
    },
    'notebooklm-context': {
        id: 'notebooklm-context',
        label: 'NotebookLM',
        description: 'Link your Google NotebookLM notebooks as AI context (manual — Google has no API).',
        icon: 'book-open',
        component: lazyWithReload(() => import('../components/NotebookLMContext/NotebookLMContext')),
        category: 'ai',
    },
    'two-brains': {
        id: 'two-brains',
        label: 'Two Brains',
        description: 'Shared board for two people: notes, reactions, screen share and an audit log.',
        icon: 'brain',
        component: lazyWithReload(() => import('../components/TwoBrains/TwoBrains')),
        category: 'ai',
    },
    'transcription': {
        id: 'transcription',
        label: 'Transcription Hub',
        description: 'Record or upload audio, transcribe it, identify speakers and search what was said.',
        icon: 'mic',
        component: lazyWithReload(() => import('../components/TranscriptionHub/TranscriptionHub')),
        category: 'ai',
    },
    'fact-check-log': {
        id: 'fact-check-log',
        label: 'Fact Check Log',
        description: 'Log of claims checked by AI, with verdicts and evidence.',
        icon: 'search-check',
        component: lazyWithReload(() => import('../components/FactCheckLog/FactCheckLog')),
        category: 'ai',
    },
    'cognitive-harness': {
        id: 'cognitive-harness',
        label: 'Cognitive Harness',
        description: "Animated map of the AI stack's parts (retrieval, memory, tools, routing) with live status.",
        icon: 'brain-circuit',
        component: lazyWithReload(() => import('../components/CognitiveHarness/CognitiveHarness')),
        minWidth: 800,
        minHeight: 500,
        category: 'ai',
    },

    // ═══════════════════════════════════════
    //  FILING — File & Document Management
    // ═══════════════════════════════════════
    // Cycle 11 FileManager merge (per Ilya design lock #2): the legacy FileManager
    // widget is aliased to FileExplorer so old dock items / saved layouts referencing
    // 'file-manager' open the new unified widget. Both registry entries point at the
    // same component; the FileManager.tsx source remains in the tree for now (will be
    // removed in a follow-up once we're sure no other code imports it).
    'file-manager': {
        id: 'file-manager',
        label: 'File Manager',
        description: 'Same as File Explorer — kept so older layouts still open.',
        icon: 'folder-open',
        component: lazyWithReload(() => import('../components/FileExplorer/FileExplorer')),
        category: 'filing',
    },
    'doc-viewer': {
        id: 'doc-viewer',
        label: 'Doc Viewer',
        description: 'Read and mark up uploaded or generated documents.',
        icon: 'file-text',
        component: lazyWithReload(() => import('../components/DocViewer/DocViewer')),
        category: 'filing',
    },
    'pdf-gear': {
        id: 'pdf-gear',
        label: 'PDF Gear',
        description: 'PDF toolkit in the browser: merge, split, compress, convert, fill and sign.',
        icon: 'file-stack',
        component: lazyWithReload(() => import('../components/PDFGear/PDFGear')),
        category: 'filing',
    },
    'notepad': {
        id: 'notepad',
        label: 'Notepad',
        description: 'Quick Markdown notes; type @ to link a task or project.',
        icon: 'file-edit',
        component: lazyWithReload(() => import('../components/Notepad/Notepad')),
        category: 'filing',
    },
    // P12-5 (2026-06-12): Mission Control — goals with agent-drafted plans
    // (brief + agent-vs-you actions + clarifying questions).
    'mission-control': {
        id: 'mission-control',
        label: 'Mission Control',
        description: "Mid-term goals with AI-drafted plans: the agent's actions, your actions, open questions.",
        icon: 'target',
        component: lazyWithReload(() => import('../components/MissionControl/MissionControl')),
        minWidth: 520,
        minHeight: 420,
        category: 'ai',
    },
    // P12-3 (2026-06-12): everything your agents produce, browsable —
    // auto-captured ARA replies, team-run deliverables, images, drafts.
    'artifact-gallery': {
        id: 'artifact-gallery',
        label: 'Artifacts',
        description: 'Everything your AI agents produced — replies, drafts, images — browsable and pinnable.',
        icon: 'layers',
        component: lazyWithReload(() => import('../components/ArtifactGallery/ArtifactGallery')),
        minWidth: 520,
        minHeight: 420,
        category: 'tools',
    },
    // P12-1 (2026-06-12): AI usage + estimated cost dashboard over the
    // callLlm chokepoint ledger.
    'ai-spend': {
        id: 'ai-spend',
        label: 'AI Spend',
        description: "Today's AI calls and cost, a 14-day trend, by provider, plus plan advice.",
        icon: 'coins',
        component: lazyWithReload(() => import('../components/AiSpend/AiSpend')),
        minWidth: 420,
        minHeight: 380,
        category: 'tools',
    },
    // P12-7 (gap items 8+9): connections + memory stack + agent context.
    'connections': {
        id: 'connections',
        label: 'Connections & Memory',
        description: 'Status of every integration (AI keys, Google, database, backend) and every memory store.',
        icon: 'cable',
        component: lazyWithReload(() => import('../components/Connections/ConnectionsPanel')),
        minWidth: 460,
        minHeight: 420,
        category: 'tools',
    },
    // UI Editor DISABLED (2026-07-06 Andy): activating it blanked the entire
    // screen. Registry entry removed so it can't be launched from the sidebar,
    // command palette, or saved layouts (Desktop renders unknown ids safely).
    // Component kept at components/UiEditor/ for a future fix — re-register here.
    'template-generator': {
        id: 'template-generator',
        label: 'Template Generator',
        description: 'Fill DOCX/HTML templates with variables and export PDFs — leases, notices, letters.',
        icon: 'file-text',
        component: lazyWithReload(() => import('../components/DocViewer/TemplateGenerator')),
        category: 'filing',
    },

    // ═══════════════════════════════════════
    //  TOOLS — System & Configuration
    // ═══════════════════════════════════════
    'scribe': {
        id: 'scribe',
        label: 'Scribe',
        description: 'Markdown writing desk: tabs, AI redlines, comments, versions and interactive docs.',
        icon: 'pen-tool',
        component: lazyWithReload(() => import('../components/Scribe/Scribe')),
        category: 'tools',
    },
    'file-explorer': {
        id: 'file-explorer',
        label: 'File Explorer',
        description: 'Browse, rename, create and drag files in your Dwellium file tree.',
        icon: 'folder-tree',
        component: lazyWithReload(() => import('../components/FileExplorer/FileExplorer')),
        category: 'filing',
        minWidth: 320,
        minHeight: 400,
    },
    'workspace': {
        id: 'workspace',
        label: 'Workspace',
        description: 'Browse by Domain → Project → Thread, with status and stage per thread.',
        icon: 'layers',
        component: lazyWithReload(() => import('../components/Workspace/Workspace')),
        category: 'filing',
        minWidth: 380,
        minHeight: 420,
    },
    'terminal': {
        id: 'terminal',
        label: 'Terminal',
        description: 'Command line and CLI tools (hidden by default; re-add from the widget gallery).',
        icon: 'terminal',
        component: lazyWithReload(() => import('../components/Terminal/Terminal')),
        category: 'tools',
    },
    'cloud-browser': {
        id: 'cloud-browser',
        label: 'Cloud Browser',
        description: 'A web browser rendered on the server, for sites that refuse to load in an iframe.',
        icon: 'globe',
        component: lazyWithReload(() => import('../components/CloudBrowser/CloudBrowser')),
        category: 'tools',
        minWidth: 520,
        minHeight: 420,
    },
    'control-panel': {
        id: 'control-panel',
        label: 'Control Panel',
        description: 'Appearance, layout and system settings for the shell.',
        icon: 'settings',
        component: lazyWithReload(() => import('../components/ControlPanel/ControlPanel')),
        category: 'tools',
    },
    // Assessment sweep 2026-06-12 (upgrade #7): time-travel over One Save logs.
    'time-travel': {
        id: 'time-travel',
        label: 'Time Travel',
        description: 'Version history for any saved object: diff versions and restore without losing anything.',
        icon: 'history',
        component: lazyWithReload(() => import('../components/TimeTravel/TimeTravel')),
        minWidth: 480,
        minHeight: 400,
        category: 'tools',
    },
    // Halocron theme (2026-06-12): animated Old Republic holocron archive.
    'holocron-library': {
        id: 'holocron-library',
        label: 'Holocron Library',
        description: 'Animated gallery of the eight holocrons — click one to read its lore.',
        icon: 'diamond',
        component: lazyWithReload(() => import('../components/HolocronLibrary/HolocronLibrary')),
        minWidth: 520,
        minHeight: 440,
        category: 'tools',
    },
};

// ═══════════════════════════════════════════════
//  Derived maps — for consumers that need specific lookups
// ═══════════════════════════════════════════════

/** Component map for Desktop.tsx — replaces WINDOW_COMPONENTS */
export const WINDOW_COMPONENTS: Record<string, React.LazyExoticComponent<ComponentType<any>>> =
    Object.fromEntries(
        Object.entries(WIDGET_REGISTRY).map(([key, reg]) => [key, reg.component])
    );

/** Get widget metadata by key */
export function getWidgetMeta(key: string): WidgetRegistration | undefined {
    return WIDGET_REGISTRY[key];
}

/** Get all widget keys */
export function getWidgetKeys(): string[] {
    return Object.keys(WIDGET_REGISTRY);
}

/** Get all widgets in a category */
export function getWidgetsByCategory(category: WidgetRegistration['category']): WidgetRegistration[] {
    return Object.values(WIDGET_REGISTRY).filter(w => w.category === category);
}
