import { HierarchyItem, DockItem } from './types';

/* ============================================
   Default 4-Tier Hierarchy Seed Data
   Domain > Node > Project > Asset
   Users build their own hierarchy dynamically.
   ============================================ */

export const defaultHierarchy: HierarchyItem[] = [];

/* ============================================
   Default Dock Items
   ============================================ */

export const defaultDockItems: DockItem[] = [
   // ── Property Management ──
   { id: 'dock-astra', label: 'Astra', icon: 'diamond', component: 'astra-dashboard', pinned: true, group: 'Property Management' },
   { id: 'dock-strata', label: 'Strata', icon: 'building-2', component: 'strata-dashboard', pinned: true, group: 'Property Management' },
   // F-1 Universal Shell — Phase 3-E Option C ratified 2026-04-16. [CT-3H-HANDOFF-M4Q7]
   { id: 'dock-universal-shell', label: 'Universal Shell', icon: 'layout-grid', component: 'universal-shell', pinned: true, group: 'Property Management' },
   { id: 'dock-trello', label: 'Trello', icon: 'layout-list', component: 'trello-board', pinned: true, group: 'Property Management' },
   { id: 'dock-task-board', label: 'Task Board', icon: 'layout-grid', component: 'task-board', pinned: true, group: 'Property Management' },
   { id: 'dock-inbox-zero', label: 'Inbox Zero', icon: 'mail-open', component: 'inbox-zero', pinned: true, group: 'Property Management' },
   // dock-settings removed 2026-05-26 — Settings is now opened from the inline gear button next to the Domains header in Sidebar.tsx. Filter at Sidebar.tsx::permittedItems (component !== 'control-panel') also drops it for existing installs that have it in their saved layout.
   { id: 'dock-tenant-portal', label: 'Tenant Portal', icon: 'home', component: 'tenant-portal-mgmt', pinned: true, group: 'Property Management' },
   // ── AI Tools ──
   { id: 'dock-thought-weaver', label: 'Thought Weaver', icon: 'brain-circuit', component: 'thought-weaver', pinned: true, group: 'AI Tools' },
   { id: 'dock-notebooklm', label: 'NotebookLM', icon: 'book-open', component: 'notebooklm-context', pinned: true, group: 'AI Tools' },

   { id: 'dock-transcription', label: 'Transcribe', icon: 'mic', component: 'transcription', pinned: true, group: 'AI Tools' },
   { id: 'dock-factcheck', label: 'Fact Check', icon: 'search-check', component: 'fact-check-log', pinned: true, group: 'AI Tools' },
   { id: 'dock-upkeep', label: 'Upkeep AI', icon: 'wrench', component: 'home-upkeep-ai', pinned: true, group: 'AI Tools' },
   { id: 'dock-automation-hub', label: 'Automations', icon: 'zap', component: 'automation-hub', pinned: true, group: 'AI Tools' },
   { id: 'dock-two-brains', label: 'Two Brains', icon: 'brain', component: 'two-brains', pinned: true, group: 'AI Tools' },
   { id: 'dock-hydra-ai', label: 'Hydra AI', icon: 'network', component: 'hydra-ai', pinned: true, group: 'AI Tools' },
   { id: 'dock-ara', label: 'ARA', icon: 'cpu', component: 'ara-console', pinned: true, group: 'AI Tools' },
   { id: 'dock-stella', label: 'Stella', icon: 'sparkles', component: 'stella-agent', pinned: true, group: 'AI Tools' },
   { id: 'dock-honcho', label: 'Honcho', icon: 'brain-circuit', component: 'honcho', pinned: true, group: 'AI Tools' },
   { id: 'dock-memory-graph-rag', label: 'Cognitive M Network', icon: 'earth', component: 'memory-graph-rag', pinned: true, group: 'AI Tools' },
   // ── Filing Cabinet ──
   { id: 'dock-hierarchy', label: 'Explorer', icon: 'folder-tree', component: 'hierarchy-browser', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-tasks', label: 'Tasks', icon: 'check-square', component: 'tasks', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-inbox', label: 'Inbox', icon: 'inbox', component: 'inbox', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-files', label: 'Files', icon: 'folder-open', component: 'file-manager', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-notepad', label: 'Notepad', icon: 'file-edit', component: 'notepad', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-scribe', label: 'Scribe', icon: 'pen-tool', component: 'scribe', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-tag-file', label: 'Tag File', icon: 'tag', component: 'tag-file', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-file-explorer', label: 'File Explorer', icon: 'folder-tree', component: 'file-explorer', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-workspace', label: 'Workspace', icon: 'layers', component: 'workspace', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-docs', label: 'Docs', icon: 'file-text', component: 'doc-viewer', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-pdf-gear', label: 'PDF Gear', icon: 'file-stack', component: 'pdf-gear', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-terminal', label: 'Terminal', icon: 'terminal', component: 'terminal', pinned: true, group: 'Filing Cabinet' },
];
