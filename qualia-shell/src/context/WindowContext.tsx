import { createContext, useContext, useState, useCallback, useRef, useEffect, useSyncExternalStore, ReactNode } from 'react';
import { WindowState, DockItem, LayoutState, SavedLayout } from '../data/types';
import { useUser } from './UserContext';
import { defaultDockItems } from '../data/hierarchy';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync, withSyncStatic } from '../lib/oneSaveStore';

const LAYOUT_STORAGE_KEY = 'dwellium-layout';
const LEGACY_LAYOUT_STORAGE_KEY = 'qualia-layout';
const DOCK_VERSION_KEY = 'dwellium-dock-version';
const DOCK_VERSION = 5; // Bumped: emoji icons → Lucide React SVG icon keys
const MIN_WIDTH = 500;
const MIN_HEIGHT = 380;

// ============================================
// SSR-SAFE EXTERNAL STORES (Phase-8+ Task 8.10 PROVIDER-SSR-REMEDIATION)
// ============================================
// Migrated from 2 useState lazy initializers reading localStorage (fired
// during render; threw ReferenceError on SSR) to useSyncExternalStore +
// getServerSnapshot per Cowork Q1 LOCK Option A at Task 8.10 PRE0.
//
// dockItemsStore (L60-89 in pre-Task-8.10) — static composite deserializer
// reading DOCK_VERSION_KEY + LAYOUT_STORAGE_KEY + LEGACY_LAYOUT_STORAGE_KEY
// + writing DOCK_VERSION_KEY on version mismatch (side effect preserved
// byte-for-byte from useState lazy init; runs once per client mount).
//
// savedLayoutsStore (L98 in pre-Task-8.10) — DYNAMIC key via factory
// Option β extension. Key resolver reads `savedLayoutsUserIdHolder.current`
// which WindowProvider updates during render (BEFORE useSyncExternalStore
// invocation) so getSnapshot sees fresh key. Cache invalidation on key
// change handled automatically by the factory.
//
// Exported for unit test access at src/test/appfolioParity/.

export const dockItemsStore = withSyncStatic(
    createLocalStorageStore<DockItem[]>(
    () => {
        try {
            const storedVersion = localStorage.getItem(DOCK_VERSION_KEY);
            if (storedVersion && parseInt(storedVersion) === DOCK_VERSION) {
                const saved = localStorage.getItem(LAYOUT_STORAGE_KEY) || localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
                if (saved) {
                    const layout: LayoutState = JSON.parse(saved);
                    const savedItems = layout.dockItems || [];
                    // Prune: remove stale items that no longer exist in defaults
                    const validComponents = new Set(defaultDockItems.map(d => d.component));
                    const defaultById = new Map(defaultDockItems.map(d => [d.id, d]));
                    const prunedItems = savedItems
                        .filter((i: DockItem) => validComponents.has(i.component))
                        // Reconcile cosmetic identity (label + icon) from current defaults so
                        // widget renames / icon changes propagate to an already-persisted dock
                        // WITHOUT resetting the user's saved order, pins, or group placement.
                        .map((i: DockItem) => {
                            const def = defaultById.get(i.id);
                            return def ? { ...i, label: def.label, icon: def.icon } : i;
                        });
                    // Merge: keep saved order but add any new defaults not yet in the layout
                    const savedIds = new Set(prunedItems.map((i: DockItem) => i.id));
                    const newItems = defaultDockItems.filter(d => !savedIds.has(d.id));
                    if (newItems.length > 0) {
                        return [...prunedItems, ...newItems];
                    }
                    return prunedItems;
                }
            } else {
                // Version mismatch — reset to defaults and update version
                localStorage.removeItem(LAYOUT_STORAGE_KEY);
                localStorage.removeItem(LEGACY_LAYOUT_STORAGE_KEY);
                localStorage.setItem(DOCK_VERSION_KEY, String(DOCK_VERSION));
            }
        } catch { /* ignore */ }
        localStorage.setItem(DOCK_VERSION_KEY, String(DOCK_VERSION));
        return defaultDockItems;
    },
    defaultDockItems,
    ),
    {
        objectType: 'dock-items',
        // dockItems live inside the composite dwellium-layout blob (not their own
        // key), so hydrate merges them back rather than doing a flat setItem.
        persistLocal: (items: DockItem[]) => {
            try {
                const raw = localStorage.getItem(LAYOUT_STORAGE_KEY) || localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
                const layout = raw ? JSON.parse(raw) : {};
                layout.dockItems = items;
                localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
            } catch { /* sandboxed */ }
        },
    },
);

/**
 * Module-level holder for the current user.id, updated by WindowProvider
 * during render. Powers savedLayoutsStore's dynamic key resolver. Exposed
 * for test access (e.g., `savedLayoutsUserIdHolder.current = 'test-user-id'`
 * before invoking savedLayoutsStore.getSnapshot()).
 */
export const savedLayoutsUserIdHolder: { current: string | null } = { current: null };

function resolveSavedLayoutsKey(): string {
    return savedLayoutsUserIdHolder.current
        ? `qualia_saved_layouts_${savedLayoutsUserIdHolder.current}`
        : 'qualia_saved_layouts_guest';
}

export const savedLayoutsStore = withSync(
    createLocalStorageStore<SavedLayout[]>({
        key: resolveSavedLayoutsKey,
        deserializer: (raw) => {
            try {
                if (raw) return JSON.parse(raw);
            } catch { /* ignore */ }
            return [];
        },
        defaultValue: [],
    }),
    { objectType: 'saved-layouts', holder: savedLayoutsUserIdHolder, resolveKey: resolveSavedLayoutsKey },
);

// Per-component default-size overrides for apps whose layouts require more
// real-estate than the quadrant-spawn default. The Strata dashboard uses a
// 3-column flex (sub-sidebar + .s-list-panel 320px + .s-detail-panel 1fr);
// at the quadrant-spawn default (~518px on a 1200px desktop) the 1fr column
// collapses to 0px, leaving the detail panel rendered-but-zero-width.
// Phase-6 Task 6.1: open Strata wide enough that the 3-col layout fits.
// Width is clamped to (desktopW - 40) at use-site so windows never overflow
// the canvas on small displays. Exported so Desktop.tsx's auto-region-snap
// effect can opt these components out (a 1100px window snapped into a 600px
// halves-h region would re-introduce the layout collapse).
export const COMPONENT_DEFAULT_SIZES: Record<string, { w: number; h: number }> = {
    'strata-dashboard': { w: 1100, h: 800 },
    // ARA opens roomy enough for the chat + the docked Honcho/Hermes/Tools drawer.
    'ara-console': { w: 1080, h: 760 },
};

interface WindowContextValue {
    windows: WindowState[];
    dockItems: DockItem[];
    openWindow: (component: string, title: string, icon: string) => string | null;
    closeWindow: (id: string) => void;
    focusWindow: (id: string) => void;
    minimizeWindow: (id: string) => void;
    maximizeWindow: (id: string) => void;
    restoreWindow: (id: string) => void;
    updateWindowPosition: (id: string, x: number, y: number) => void;
    updateWindowSize: (id: string, w: number, h: number) => void;
    reorderDock: (fromIndex: number, toIndex: number) => void;
    moveDockItem: (id: string, toGroup: string | undefined, toIndex: number) => void;
    saveLayout: () => void;
    resetLayout: () => void;
    savedLayouts: SavedLayout[];
    saveNamedLayout: (name: string) => void;
    loadNamedLayout: (id: string) => void;
    deleteNamedLayout: (id: string) => void;
    popOutWindow: (id: string) => void;
}

const WindowContext = createContext<WindowContextValue | null>(null);

let nextZIndex = 1;

function generateId() {
    return `win-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function WindowProvider({ children }: { children: ReactNode }) {
    const { user } = useUser();

    // Update savedLayouts key holder DURING render (before useSyncExternalStore
    // call) so getSnapshot resolves the fresh key. Factory cache invalidates
    // automatically on key change → useSyncExternalStore returns the new
    // per-user-id value without a separate re-init effect.
    savedLayoutsUserIdHolder.current = user?.id ?? null;

    const [windows, setWindows] = useState<WindowState[]>([]);
    const dockItems = useSyncExternalStore(
        dockItemsStore.subscribe,
        dockItemsStore.getSnapshot,
        dockItemsStore.getServerSnapshot,
    );
    const setDockItems = useCallback((value: DockItem[] | ((prev: DockItem[]) => DockItem[])) => {
        const next = typeof value === 'function' ? value(dockItemsStore.getSnapshot()) : value;
        // Persistence is the composite LAYOUT_STORAGE_KEY useEffect below;
        // pass no-op here.
        dockItemsStore.set(next, () => { /* composite persistence in useEffect */ });
    }, []);

    const windowsRef = useRef(windows);
    windowsRef.current = windows;
    const dockItemsRef = useRef(dockItems);
    dockItemsRef.current = dockItems;

    // Named Layouts State — dynamic per-user.id key via factory Option β
    const savedLayoutsKey = user ? `qualia_saved_layouts_${user.id}` : 'qualia_saved_layouts_guest';
    const savedLayouts = useSyncExternalStore(
        savedLayoutsStore.subscribe,
        savedLayoutsStore.getSnapshot,
        savedLayoutsStore.getServerSnapshot,
    );
    const setSavedLayouts = useCallback((value: SavedLayout[] | ((prev: SavedLayout[]) => SavedLayout[])) => {
        const next = typeof value === 'function' ? value(savedLayoutsStore.getSnapshot()) : value;
        // Persistence in useEffect below (preserves pre-Task-8.10 behavior).
        savedLayoutsStore.set(next, () => { /* persistence in useEffect */ });
    }, []);

    useEffect(() => {
        localStorage.setItem(savedLayoutsKey, JSON.stringify(savedLayouts));
    }, [savedLayouts, savedLayoutsKey]);

    // Auto-save layout on changes
    useEffect(() => {
        const timer = setTimeout(() => {
            const layout: LayoutState = { windows, dockItems };
            localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
        }, 500);
        return () => clearTimeout(timer);
    }, [windows, dockItems]);

    const openWindow = useCallback((component: string, title: string, icon: string): string | null => {
        // Check if window of this component type is already open
        const existing = windowsRef.current.find(w => w.component === component);
        if (existing) {
            setWindows(prev => prev.map(w =>
                w.id === existing.id
                    ? { ...w, minimized: false, zIndex: ++nextZIndex }
                    : w
            ));
            return existing.id; // return existing ID so caller can re-focus region
        }

        // ── Smart Quadrant Spawn ─────────────────────────────────────────────
        // Use the actual desktop canvas element to get real available space
        // (excludes sidebar width, which is dynamic/resizable)
        const desktopEl = document.querySelector<HTMLElement>('.desktop-canvas');
        const desktopRect = desktopEl?.getBoundingClientRect();
        const desktopW  = desktopRect?.width  ?? (window.innerWidth  - 240);
        const desktopH  = desktopRect?.height ?? (window.innerHeight - 48);

        const quadrants = [
            { id: 'tl', x: 0.01, y: 0.01, w: 0.49, h: 0.49 }, // top-left
            { id: 'tr', x: 0.50, y: 0.01, w: 0.49, h: 0.49 }, // top-right
            { id: 'bl', x: 0.01, y: 0.50, w: 0.49, h: 0.49 }, // bottom-left
            { id: 'br', x: 0.50, y: 0.50, w: 0.49, h: 0.49 }, // bottom-right
        ];

        // Count non-minimized windows in each quadrant
        const active = windowsRef.current.filter(w => !w.minimized && !w.maximized);
        const occupancy = quadrants.map(q => {
            const qX = q.x * desktopW;
            const qY = q.y * desktopH;
            const qW = q.w * desktopW;
            const qH = q.h * desktopH;
            const count = active.filter(w =>
                w.x + w.width / 2 >= qX && w.x + w.width / 2 <= qX + qW &&
                w.y + w.height / 2 >= qY && w.y + w.height / 2 <= qY + qH
            ).length;
            return { ...q, count };
        });

        // Pick least-occupied quadrant (tie-break: TL → TR → BL → BR)
        const best = occupancy.reduce((a, b) => a.count <= b.count ? a : b);

        const qAbsX = best.x * desktopW;
        const qAbsY = best.y * desktopH;
        const qAbsW = best.w * desktopW;
        const qAbsH = best.h * desktopH;

        // Size at 88% of quadrant, centered — unless the component declares
        // an explicit default size (clamped to the canvas so it never overflows).
        const explicit = COMPONENT_DEFAULT_SIZES[component];
        const winW = explicit
            ? Math.min(explicit.w, Math.max(MIN_WIDTH, desktopW - 40))
            : Math.round(Math.max(MIN_WIDTH, qAbsW * 0.88));
        const winH = explicit
            ? Math.min(explicit.h, Math.max(MIN_HEIGHT, desktopH - 40))
            : Math.round(Math.max(MIN_HEIGHT, qAbsH * 0.88));
        const winX = explicit
            ? Math.round((desktopW - winW) / 2)
            : Math.round(qAbsX + (qAbsW - winW) / 2);
        const winY = Math.max(8, explicit
            ? Math.round((desktopH - winH) / 2)
            : Math.round(qAbsY + (qAbsH - winH) / 2));

        const newId = generateId();
        const newWindow: WindowState = {
            id: newId,
            title,
            icon,
            x: winX,
            y: winY,
            width: winW,
            height: winH,
            zIndex: ++nextZIndex,
            minimized: false,
            maximized: false,
            component,
        };
        setWindows(prev => [...prev, newWindow]);
        return newId;
    }, []);

    const closeWindow = useCallback((id: string) => {
        setWindows(prev => prev.filter(w => w.id !== id));
    }, []);

    const focusWindow = useCallback((id: string) => {
        setWindows(prev => prev.map(w =>
            w.id === id ? { ...w, zIndex: ++nextZIndex } : w
        ));
    }, []);

    const minimizeWindow = useCallback((id: string) => {
        setWindows(prev => prev.map(w =>
            w.id === id ? { ...w, minimized: true } : w
        ));
    }, []);

    const maximizeWindow = useCallback((id: string) => {
        setWindows(prev => prev.map(w =>
            w.id === id ? { ...w, maximized: !w.maximized, zIndex: ++nextZIndex } : w
        ));
    }, []);

    const restoreWindow = useCallback((id: string) => {
        setWindows(prev => prev.map(w =>
            w.id === id ? { ...w, minimized: false, zIndex: ++nextZIndex } : w
        ));
    }, []);

    const updateWindowPosition = useCallback((id: string, x: number, y: number) => {
        // Central titlebar-rescue clamp (2026-06-10): y may NEVER go negative —
        // a window whose titlebar is above the desktop top is undraggable and
        // looks "cut off". Covers every caller (drag, spaces, regions, tile,
        // restore) in one place.
        setWindows(prev => prev.map(w =>
            w.id === id ? { ...w, x, y: Math.max(0, y) } : w
        ));
    }, []);

    const updateWindowSize = useCallback((id: string, w: number, h: number) => {
        setWindows(prev => prev.map(win =>
            win.id === id ? { ...win, width: Math.max(w, MIN_WIDTH), height: Math.max(h, MIN_HEIGHT) } : win
        ));
    }, []);

    const reorderDock = useCallback((fromIndex: number, toIndex: number) => {
        setDockItems(prev => {
            if (fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) {
                return prev;
            }
            if (fromIndex === toIndex) return prev;
            const items = [...prev];
            const [moved] = items.splice(fromIndex, 1);
            items.splice(toIndex, 0, moved);
            return items;
        });
    }, []);

    const moveDockItem = useCallback((id: string, toGroup: string | undefined, toIndex: number) => {
        setDockItems(prev => {
            const items = [...prev];
            const itemIndex = items.findIndex(i => i.id === id);
            if (itemIndex === -1) return prev;

            const [movedItem] = items.splice(itemIndex, 1);
            movedItem.group = toGroup; // Update the group

            // Find the insertion point in the flat array
            let insertIndex = items.length; // Default to end

            if (toGroup) {
                // Find all items in the target group
                const groupItems = items.filter(i => i.group === toGroup);
                if (toIndex < groupItems.length) {
                    // Insert before the item that currently occupies toIndex in this group
                    const targetItem = groupItems[toIndex];
                    insertIndex = items.indexOf(targetItem);
                } else if (groupItems.length > 0) {
                    // Append after the last item in the group
                    const lastItemInGroup = groupItems[groupItems.length - 1];
                    insertIndex = items.indexOf(lastItemInGroup) + 1;
                }
                // If group is empty, we just append to the end
            } else {
                // For ungrouped items
                const ungroupedItems = items.filter(i => !i.group);
                if (toIndex < ungroupedItems.length) {
                    const targetItem = ungroupedItems[toIndex];
                    insertIndex = items.indexOf(targetItem);
                }
            }

            items.splice(insertIndex, 0, movedItem);
            return items;
        });
    }, []);

    const saveLayout = useCallback(() => {
        const layout: LayoutState = { windows, dockItems };
        localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout));
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Layout Saved' }));
    }, [windows, dockItems]);

    const resetLayout = useCallback(() => {
        setWindows([]);
        setDockItems(defaultDockItems);
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Layout Reset to Default' }));
    }, []);

    // ── Pop-out window into native browser window ─────────────────────────
    const popOutWindow = useCallback((id: string) => {
        const win = windowsRef.current.find(w => w.id === id);
        if (!win) return;

        // Store window state for the popup to read
        const popupKey = `dwellium-popup-${win.component}`;
        localStorage.setItem(popupKey, JSON.stringify({
            component: win.component,
            title: win.title,
            icon: win.icon,
        }));

        // Open native popup window
        const popupW = Math.min(win.width, screen.availWidth * 0.5);
        const popupH = Math.min(win.height, screen.availHeight * 0.7);
        const left = Math.round((screen.availWidth - popupW) / 2);
        const top = Math.round((screen.availHeight - popupH) / 4);
        const popup = window.open(
            `/?popup=${win.component}`,
            `qualia-popup-${win.component}`,
            `width=${popupW},height=${popupH},left=${left},top=${top},resizable=yes,scrollbars=no`
        );

        if (popup) {
            // Minimize the original window
            setWindows(prev => prev.map(w =>
                w.id === id ? { ...w, minimized: true } : w
            ));
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `"${win.title}" popped out` }));
        } else {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Pop-out blocked — allow popups for this site' }));
        }
    }, []);

    const saveNamedLayout = useCallback((name: string) => {
        setSavedLayouts(prev => {
            if (prev.length >= 10) {
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Cannot save: 10 layout limit reached' }));
                return prev;
            }
            const newLayout: SavedLayout = {
                id: `layout-${Date.now()}`,
                name,
                timestamp: Date.now(),
                layout: { windows: windowsRef.current, dockItems: dockItemsRef.current }
            };
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Layout "${name}" saved` }));
            return [...prev, newLayout];
        });
    }, []);

    const loadNamedLayout = useCallback((id: string) => {
        const layoutToLoad = savedLayouts.find(l => l.id === id);
        if (layoutToLoad) {
            // titlebar-rescue clamp: saved layouts from a different viewport
            // size must never restore a window above the desktop top.
            setWindows((layoutToLoad.layout.windows || []).map(w => ({ ...w, y: Math.max(0, w.y) })));
            setDockItems(layoutToLoad.layout.dockItems || defaultDockItems);
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Layout "${layoutToLoad.name}" loaded` }));
        }
    }, [savedLayouts]);

    const deleteNamedLayout = useCallback((id: string) => {
        setSavedLayouts(prev => {
            const filtered = prev.filter(l => l.id !== id);
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Layout deleted' }));
            return filtered;
        });
    }, []);

    // ── Cross-widget intent bus ──────────────────────────────────────
    // Any widget can fire `dwellium:open-widget` with detail { widgetId, label?, icon? }
    // and the shell will open/restore that widget. Used by Stella's
    // self-diagnose CTA ("Open Settings") and the Scribe → ARA send button.
    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail || {};
            const { widgetId, label, icon } = detail;
            if (!widgetId) return;
            try { openWindow(widgetId, label || widgetId, icon || ''); } catch { /* ignore */ }
        };
        window.addEventListener('dwellium:open-widget', handler);
        return () => window.removeEventListener('dwellium:open-widget', handler);
    }, [openWindow]);

    // Spaces (dwellium:apply-space) handling lives in Desktop.tsx — it has BOTH
    // the window manager and the region/tab context, so it opens the Space's
    // widgets AND tabs them into one region in a single tick (no race).

    // ── Tile/arrange bus (proposal §4 talk-to-customize) ─────────────
    // `dwellium:tile` { components?: string[] } grids the visible windows (or
    // just the named set) across the canvas. Fired by dwelliumCommands.
    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent).detail || {};
            const filter: string[] | null = Array.isArray(detail.components) ? detail.components : null;
            const targets = windowsRef.current.filter(w => !w.minimized && (!filter || filter.includes(w.component)));
            const n = targets.length;
            if (n === 0) return;
            const pad = 12;
            const top = 48;
            const W = window.innerWidth;
            const H = window.innerHeight - top;
            const cols = Math.ceil(Math.sqrt(n));
            const rows = Math.ceil(n / cols);
            const cw = Math.floor((W - pad * (cols + 1)) / cols);
            const ch = Math.floor((H - pad * (rows + 1)) / rows);
            targets.forEach((w, i) => {
                const c = i % cols;
                const r = Math.floor(i / cols);
                updateWindowPosition(w.id, pad + c * (cw + pad), top + pad + r * (ch + pad));
                updateWindowSize(w.id, cw, ch);
            });
        };
        window.addEventListener('dwellium:tile', handler);
        return () => window.removeEventListener('dwellium:tile', handler);
    }, [updateWindowPosition, updateWindowSize]);

    return (
        <WindowContext.Provider value={{
            windows, dockItems,
            openWindow, closeWindow, focusWindow,
            minimizeWindow, maximizeWindow, restoreWindow,
            updateWindowPosition, updateWindowSize,
            reorderDock, moveDockItem, saveLayout, resetLayout,
            savedLayouts, saveNamedLayout, loadNamedLayout, deleteNamedLayout,
            popOutWindow,
        }}>
            {children}
        </WindowContext.Provider>
    );
}

export function useWindows() {
    const ctx = useContext(WindowContext);
    if (!ctx) throw new Error('useWindows must be used within WindowProvider');
    return ctx;
}
