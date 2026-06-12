/**
 * Lucide Icon Map — Professional SVG icons for the Dwellium sidebar.
 *
 * Maps string icon keys (stored in DockItem.icon / WIDGET_GROUPS) to
 * Lucide React components. Tree-shakeable — only imported icons ship.
 *
 * Usage:
 *   import { getIcon } from './iconMap';
 *   const IconComponent = getIcon('building-2');
 *   <IconComponent size={16} />
 */

import {
    Building2,
    Building,
    LayoutList,
    MailOpen,
    Settings,
    Home,
    BrainCircuit,
    Earth,
    BookOpen,
    Mic,
    SearchCheck,
    Wrench,
    Zap,
    Brain,
    Network,
    Cpu,
    Sparkles,
    FolderTree,
    CheckSquare,
    Inbox,
    FolderOpen,
    FileEdit,
    FileText,
    FileStack,
    Terminal,
    PenTool,
    Paintbrush,
    Coins,
    Archive,
    Diamond,
    LayoutGrid,
    Layers,
    Tag,
    type LucideIcon,
} from 'lucide-react';

/**
 * Icon registry — maps string keys to Lucide components.
 * Keys match DockItem.icon values in hierarchy.ts.
 */
const ICON_MAP: Record<string, LucideIcon> = {
    // ── Property Management ──
    'diamond':        Diamond,
    'layout-grid':    LayoutGrid,
    'building-2':     Building2,
    'layout-list':    LayoutList,
    'mail-open':      MailOpen,
    'settings':       Settings,
    'home':           Home,

    // ── AI Tools ──
    'brain-circuit':  BrainCircuit,
    'earth':          Earth,
    'book-open':      BookOpen,
    'mic':            Mic,
    'search-check':   SearchCheck,
    'wrench':         Wrench,
    'zap':            Zap,
    'brain':          Brain,
    'network':        Network,
    'cpu':            Cpu,
    'sparkles':       Sparkles,

    // ── Filing Cabinet ──
    'folder-tree':    FolderTree,
    'layers':         Layers,
    'check-square':   CheckSquare,
    'inbox':          Inbox,
    'folder-open':    FolderOpen,
    'file-edit':      FileEdit,
    'pen-tool':       PenTool,
    'paintbrush':     Paintbrush,
    'coins':          Coins,
    'file-text':      FileText,
    'file-stack':     FileStack,
    'terminal':       Terminal,
    'tag':            Tag,

    // ── Group Headers ──
    'building':       Building,
    'archive':        Archive,
};

/**
 * Get the Lucide icon component for a given key.
 * Returns null if the key is not in the map (falls back to emoji rendering).
 */
export function getIcon(key: string): LucideIcon | null {
    return ICON_MAP[key] || null;
}

/**
 * Check if a string is a Lucide icon key (not an emoji).
 */
export function isLucideKey(key: string): boolean {
    return key in ICON_MAP;
}

export type { LucideIcon };
