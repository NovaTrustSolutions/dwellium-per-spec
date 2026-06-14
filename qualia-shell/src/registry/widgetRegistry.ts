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

export interface WidgetRegistration {
    /** Unique key — matches hierarchy.ts component ID and WINDOW_COMPONENTS key */
    id: string;
    /** Human-readable display name shown in titlebar, command palette, etc. */
    label: string;
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
}

/**
 * WIDGET_REGISTRY — The single source of truth for all widgets.
 *
 * Each entry maps a widget key to its metadata + lazy component.
 * Order here determines command palette order.
 */
export const WIDGET_REGISTRY: Record<string, WidgetRegistration> = {
    // ═══════════════════════════════════════
    //  CORE — Property Management
    // ═══════════════════════════════════════
    'strata-dashboard': {
        id: 'strata-dashboard',
        label: 'Strata Dashboard',
        icon: 'building-2',
        component: lazyWithReload(() => import('../components/StrataDashboard/StrataDashboard')),
        minWidth: 900,
        minHeight: 600,
        category: 'core',
    },
    'astra-dashboard': {
        id: 'astra-dashboard',
        label: 'Astra Dashboard',
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
        icon: 'layout-grid',
        component: lazyWithReload(() => import('../components/UniversalShell/UniversalShell')),
        minWidth: 960,
        minHeight: 600,
        category: 'core',
    },
    'inbox': {
        id: 'inbox',
        label: 'Inbox Zero',
        icon: 'mail-open',
        component: lazyWithReload(() => import('../components/InboxZero/InboxZero')),
        minWidth: 700,
        minHeight: 500,
        category: 'core',
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
        icon: 'mail-open',
        component: lazyWithReload(() => import('../components/InboxZero/InboxZero')),
        minWidth: 700,
        minHeight: 500,
        category: 'core',
    },
    'tasks': {
        id: 'tasks',
        label: 'Task Menu',
        icon: 'check-square',
        component: lazyWithReload(() => import('../components/TaskMenu/TaskMenu')),
        category: 'core',
    },
    'trello-board': {
        id: 'trello-board',
        label: 'Trello Board',
        icon: 'layout-list',
        component: lazyWithReload(() => import('../components/TrelloBoard/TrelloBoard')),
        category: 'core',
    },
    'task-board': {
        id: 'task-board',
        label: 'Task Board',
        icon: 'layout-grid',
        component: lazyWithReload(() => import('../components/TaskBoard/TaskBoard')),
        minWidth: 680,
        minHeight: 460,
        category: 'core',
    },
    'tag-file': {
        id: 'tag-file',
        label: 'Tag File',
        icon: 'tag',
        component: lazyWithReload(() => import('../components/TagFile/TagFile')),
        minWidth: 420,
        minHeight: 420,
        category: 'filing',
    },
    'home-upkeep-ai': {
        id: 'home-upkeep-ai',
        label: 'Home Upkeep AI',
        icon: 'home',
        component: lazyWithReload(() => import('../components/HomeUpkeepAI/HomeUpkeepAI')),
        category: 'core',
    },
    'automation-hub': {
        id: 'automation-hub',
        label: 'Automation Hub',
        icon: 'zap',
        component: lazyWithReload(() => import('../components/AutomationHub/AutomationHub')),
        category: 'core',
    },
    'tenant-portal-mgmt': {
        id: 'tenant-portal-mgmt',
        label: 'Tenant Portal',
        icon: 'home',
        component: lazyWithReload(() => import('../components/TenantPortalMgmt/TenantPortalMgmt')),
        category: 'core',
    },
    'georgia-code': {
        id: 'georgia-code',
        label: 'Georgia Code',
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
        icon: 'bot',
        component: lazyWithReload(() => import('../components/AgentLab/AgentLab')),
        minWidth: 760,
        minHeight: 540,
        category: 'ai',
    },
    'ara-console': {
        id: 'ara-console',
        label: 'ARA Console',
        icon: 'brain-circuit',
        component: lazyWithReload(() => import('../components/ARAConsole/ARAConsole')),
        minWidth: 600,
        minHeight: 400,
        category: 'ai',
    },
    'stella-agent': {
        id: 'stella-agent',
        label: 'Stella Agent',
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
        icon: 'brain-circuit',
        component: lazyWithReload(() => import('../components/HonchoHermesPanel/HonchoHermesPanel')),
        minWidth: 600,
        minHeight: 400,
        category: 'ai',
    },
    'hydra-ai': {
        id: 'hydra-ai',
        label: 'Hydra AI',
        icon: 'network',
        component: lazyWithReload(() => import('../components/HydraAI/HydraSplit')),
        category: 'ai',
    },
    'thought-weaver': {
        id: 'thought-weaver',
        label: 'Thought Weaver',
        icon: 'brain',
        component: lazyWithReload(() => import('../components/ThoughtWeaver/ThoughtWeaver')),
        category: 'ai',
    },
    'notebooklm-context': {
        id: 'notebooklm-context',
        label: 'NotebookLM',
        icon: 'book-open',
        component: lazyWithReload(() => import('../components/NotebookLMContext/NotebookLMContext')),
        category: 'ai',
    },
    'two-brains': {
        id: 'two-brains',
        label: 'Two Brains',
        icon: 'brain',
        component: lazyWithReload(() => import('../components/TwoBrains/TwoBrains')),
        category: 'ai',
    },
    'transcription': {
        id: 'transcription',
        label: 'Transcription Hub',
        icon: 'mic',
        component: lazyWithReload(() => import('../components/TranscriptionHub/TranscriptionHub')),
        category: 'ai',
    },
    'fact-check-log': {
        id: 'fact-check-log',
        label: 'Fact Check Log',
        icon: 'search-check',
        component: lazyWithReload(() => import('../components/FactCheckLog/FactCheckLog')),
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
        icon: 'folder-open',
        component: lazyWithReload(() => import('../components/FileExplorer/FileExplorer')),
        category: 'filing',
    },
    'doc-viewer': {
        id: 'doc-viewer',
        label: 'Doc Viewer',
        icon: 'file-text',
        component: lazyWithReload(() => import('../components/DocViewer/DocViewer')),
        category: 'filing',
    },
    'pdf-gear': {
        id: 'pdf-gear',
        label: 'PDF Gear',
        icon: 'file-stack',
        component: lazyWithReload(() => import('../components/PDFGear/PDFGear')),
        category: 'filing',
    },
    'notepad': {
        id: 'notepad',
        label: 'Notepad',
        icon: 'file-edit',
        component: lazyWithReload(() => import('../components/Notepad/Notepad')),
        category: 'filing',
    },
    // P12-5 (2026-06-12): Mission Control — goals with agent-drafted plans
    // (brief + agent-vs-you actions + clarifying questions).
    'mission-control': {
        id: 'mission-control',
        label: 'Mission Control',
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
        icon: 'cable',
        component: lazyWithReload(() => import('../components/Connections/ConnectionsPanel')),
        minWidth: 460,
        minHeight: 420,
        category: 'tools',
    },
    // Natural-language UI editor (2026-06-12 Ilya): "change the header color
    // to yellow" — Edit-mode panel + click-to-pick; edits persist per-user.
    'ui-editor': {
        id: 'ui-editor',
        label: 'UI Editor',
        icon: 'paintbrush',
        component: lazyWithReload(() => import('../components/UiEditor/UiEditorPanel')),
        minWidth: 420,
        minHeight: 380,
        category: 'tools',
    },
    'template-generator': {
        id: 'template-generator',
        label: 'Template Generator',
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
        icon: 'pen-tool',
        component: lazyWithReload(() => import('../components/Scribe/Scribe')),
        category: 'tools',
    },
    'file-explorer': {
        id: 'file-explorer',
        label: 'File Explorer',
        icon: 'folder-tree',
        component: lazyWithReload(() => import('../components/FileExplorer/FileExplorer')),
        category: 'filing',
        minWidth: 320,
        minHeight: 400,
    },
    'workspace': {
        id: 'workspace',
        label: 'Workspace',
        icon: 'layers',
        component: lazyWithReload(() => import('../components/Workspace/Workspace')),
        category: 'filing',
        minWidth: 380,
        minHeight: 420,
    },
    'terminal': {
        id: 'terminal',
        label: 'Terminal',
        icon: 'terminal',
        component: lazyWithReload(() => import('../components/Terminal/Terminal')),
        category: 'tools',
    },
    'control-panel': {
        id: 'control-panel',
        label: 'Control Panel',
        icon: 'settings',
        component: lazyWithReload(() => import('../components/ControlPanel/ControlPanel')),
        category: 'tools',
    },
    // Assessment sweep 2026-06-12 (upgrade #7): time-travel over One Save logs.
    'time-travel': {
        id: 'time-travel',
        label: 'Time Travel',
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
