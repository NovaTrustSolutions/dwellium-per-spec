import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { WindowState, DockItem, LayoutState, SavedLayout } from '../data/types';
import { useUser } from './UserContext';
import { defaultDockItems } from '../data/hierarchy';

const LAYOUT_STORAGE_KEY = 'dwellium-layout';
const LEGACY_LAYOUT_STORAGE_KEY = 'qualia-layout';
const DOCK_VERSION_KEY = 'dwellium-dock-version';
const DOCK_VERSION = 5; // Bumped: emoji icons → Lucide React SVG icon keys
const MIN_WIDTH = 500;
const MIN_HEIGHT = 380;

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
    const [windows, setWindows] = useState<WindowState[]>([]);
    const [dockItems, setDockItems] = useState<DockItem[]>(() => {
        try {
            // Check if dock version has changed — if so, reset to new defaults
            const storedVersion = localStorage.getItem(DOCK_VERSION_KEY);
            if (storedVersion && parseInt(storedVersion) === DOCK_VERSION) {
                const saved = localStorage.getItem(LAYOUT_STORAGE_KEY) || localStorage.getItem(LEGACY_LAYOUT_STORAGE_KEY);
                if (saved) {
                    const layout: LayoutState = JSON.parse(saved);
                    const savedItems = layout.dockItems || [];
                    // Prune: remove stale items that no longer exist in defaults
                    const validComponents = new Set(defaultDockItems.map(d => d.component));
                    const prunedItems = savedItems.filter((i: DockItem) => validComponents.has(i.component));
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
    });

    const windowsRef = useRef(windows);
    windowsRef.current = windows;
    const dockItemsRef = useRef(dockItems);
    dockItemsRef.current = dockItems;

    // Named Layouts State
    const savedLayoutsKey = user ? `qualia_saved_layouts_${user.id}` : 'qualia_saved_layouts_guest';
    const [savedLayouts, setSavedLayouts] = useState<SavedLayout[]>(() => {
        try {
            const saved = localStorage.getItem(savedLayoutsKey);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        return [];
    });

    useEffect(() => {
        setSavedLayouts(() => {
            try {
                const saved = localStorage.getItem(savedLayoutsKey);
                if (saved) return JSON.parse(saved);
            } catch { /* ignore */ }
            return [];
        });
    }, [savedLayoutsKey]);

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
        const winY = explicit
            ? Math.round((desktopH - winH) / 2)
            : Math.round(qAbsY + (qAbsH - winH) / 2);

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
        setWindows(prev => prev.map(w =>
            w.id === id ? { ...w, x, y } : w
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
            setWindows(layoutToLoad.layout.windows || []);
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
