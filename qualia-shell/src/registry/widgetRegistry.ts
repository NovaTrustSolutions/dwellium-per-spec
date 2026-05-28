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
    'hydra-ai': {
        id: 'hydra-ai',
        label: 'Hydra AI',
        icon: 'network',
        component: lazyWithReload(() => import('../components/HydraAI/HydraAI')),
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
    'file-manager': {
        id: 'file-manager',
        label: 'File Manager',
        icon: 'folder-open',
        component: lazyWithReload(() => import('../components/FileManager/FileManager')),
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
