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
   { id: 'dock-astra', label: 'Astra', icon: '◈', component: 'astra-dashboard', pinned: true, group: 'Property Management' },
   { id: 'dock-strata', label: 'Strata', icon: '🏢', component: 'strata-dashboard', pinned: true, group: 'Property Management' },
   { id: 'dock-trello', label: 'Trello', icon: '📋', component: 'trello-board', pinned: true, group: 'Property Management' },
   { id: 'dock-inbox-zero', label: 'Inbox Zero', icon: '📭', component: 'inbox-zero', pinned: true, group: 'Property Management' },
   { id: 'dock-settings', label: 'Settings', icon: '⚙️', component: 'control-panel', pinned: true, group: 'Property Management' },
   { id: 'dock-tenant-portal', label: 'Tenant Portal', icon: '🏠', component: 'tenant-portal-mgmt', pinned: true, group: 'Property Management' },
   // ── AI Tools ──
   { id: 'dock-thought-weaver', label: 'Thought Weaver', icon: '🧶', component: 'thought-weaver', pinned: true, group: 'AI Tools' },
   { id: 'dock-transcription', label: 'Transcribe', icon: '🎙️', component: 'transcription', pinned: true, group: 'AI Tools' },
   { id: 'dock-factcheck', label: 'Fact Check', icon: '🔍', component: 'fact-check-log', pinned: true, group: 'AI Tools' },
   { id: 'dock-upkeep', label: 'Upkeep AI', icon: '🔧', component: 'home-upkeep-ai', pinned: true, group: 'AI Tools' },
   { id: 'dock-automation-hub', label: 'Automations', icon: '⚡', component: 'automation-hub', pinned: true, group: 'AI Tools' },
   { id: 'dock-two-brains', label: 'Two Brains', icon: '🧠', component: 'two-brains', pinned: true, group: 'AI Tools' },
   { id: 'dock-hydra-ai', label: 'Hydra AI', icon: '🐍', component: 'hydra-ai', pinned: true, group: 'AI Tools' },
   { id: 'dock-ara', label: 'ARA', icon: '🧠', component: 'ara-console', pinned: true, group: 'AI Tools' },
   { id: 'dock-stella', label: 'Stella', icon: '⭐', component: 'stella-agent', pinned: true, group: 'AI Tools' },
   // ── Filing Cabinet ──
   { id: 'dock-hierarchy', label: 'Explorer', icon: '🗂️', component: 'hierarchy-browser', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-tasks', label: 'Tasks', icon: '✅', component: 'tasks', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-inbox', label: 'Inbox', icon: '📬', component: 'inbox', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-files', label: 'Files', icon: '📁', component: 'file-manager', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-notepad', label: 'Notepad', icon: '📝', component: 'notepad', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-docs', label: 'Docs', icon: '📄', component: 'doc-viewer', pinned: true, group: 'Filing Cabinet' },
   { id: 'dock-terminal', label: 'Terminal', icon: '⬛', component: 'terminal', pinned: true, group: 'Filing Cabinet' },
];
