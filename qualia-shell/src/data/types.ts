/* ============================================
   QUALIA — Data Types
   4-Tier Hierarchy: Domain > Node > Project > Asset
   ============================================ */

export interface HierarchyItem {
    id: string;
    name: string;
    icon: string;
    type: 'domain' | 'node' | 'project' | 'asset';
    children?: HierarchyItem[];
    metadata?: Record<string, unknown>;
}

export interface WindowState {
    id: string;
    title: string;
    icon: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    minimized: boolean;
    maximized: boolean;
    component: string; // key to lookup which component to render
    regionId?: string | null; // which region this window is snapped to
    isLoading?: boolean;      // shows shimmer bar in titlebar when true
}

export type RegionLayout = 'none' | 'halves-h' | 'halves-v' | 'thirds-h' | 'fourths-h' | 'quadrants';

export interface RegionRect {
    id: string;
    label: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface DockItem {
    id: string;
    label: string;
    icon: string;
    component: string;  // window component to open
    pinned: boolean;
    group?: string;     // group name in sidebar
}

export interface LayoutState {
    windows: WindowState[];
    dockItems: DockItem[];
}

export interface SavedLayout {
    id: string;
    name: string;
    timestamp: number;
    layout: LayoutState;
}

export interface DesktopMargins {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

export interface LayoutSettings {
    fontFamily: string;
    /** P11-11: when true the theme's typography wins (fontFamily ignored). */
    fontFollowsTheme?: boolean;
    fontScale: number;       // 0.8 – 1.4
    uiScale: number;         // 0.75 – 1.5
    gridSize: number;        // 16 – 64 px
    margins: DesktopMargins;
    snapEnabled: boolean;
    snapThreshold: number;   // 8 – 32 px
    snapToGrid: boolean;
    snapToEdges: boolean;
    snapToWindows: boolean;
    showSnapGuides: boolean;
    regionsEnabled: boolean;
    regionLayout: RegionLayout;
}

export interface SnapGuide {
    axis: 'x' | 'y';
    position: number;        // px offset
    type: 'edge' | 'grid' | 'window' | 'margin';
}

export type Theme = 'dark' | 'light' | 'trust' | 'vibrant' | 'luxury' | 'healthcare' | 'creative' | 'dark-excellence' | 'terminal-bl4' | 'cosmos' | 'deep-dark' | 'simple-black' | 'cyberpunk' | 'synthwave' | 'solarized' | 'rose-pine' | 'mocha' | 'dracula' | 'obsidian' | 'tokyo-night' | 'gruvbox' | 'apple-dark' | 'nord' | 'latte' | 'corporate';

export type FontPairing = 'default' | 'modern' | 'elegant' | 'friendly' | 'brutalist' | 'editorial';

export type Skin = 'default' | 'minimal' | 'aurora' | 'warm' | 'neon';
