import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from 'react';
import { WindowState, DockItem, LayoutState, SavedLayout } from '../data/types';
import { useUser } from './UserContext';
import { defaultDockItems } from '../data/hierarchy';

const LAYOUT_STORAGE_KEY = 'dwellium-layout';
const LEGACY_LAYOUT_STORAGE_KEY = 'qualia-layout';
const DOCK_VERSION_KEY = 'dwellium-dock-version';
const DOCK_VERSION = 3; // Bumped: removed CoPaw/TARS, added Stella
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;

interface WindowContextValue {
    windows: WindowState[];
    dockItems: DockItem[];
    openWindow: (component: string, title: string, icon: string) => void;
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
                    // Merge: keep saved order but add any new defaults not yet in the layout
                    const savedIds = new Set(savedItems.map(i => i.id));
                    const newItems = defaultDockItems.filter(d => !savedIds.has(d.id));
                    if (newItems.length > 0) {
                        return [...savedItems, ...newItems];
                    }
                    return savedItems;
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

    const openWindow = useCallback((component: string, title: string, icon: string) => {
        // Check if window of this component type is already open
        const existing = windowsRef.current.find(w => w.component === component);
        if (existing) {
            // Restore if minimized and focus
            setWindows(prev => prev.map(w =>
                w.id === existing.id
                    ? { ...w, minimized: false, zIndex: ++nextZIndex }
                    : w
            ));
            return;
        }

        const offset = (windowsRef.current.length % 8) * 30;
        const newWindow: WindowState = {
            id: generateId(),
            title,
            icon,
            x: 80 + offset,
            y: 40 + offset,
            width: 700,
            height: 480,
            zIndex: ++nextZIndex,
            minimized: false,
            maximized: false,
            component,
        };
        setWindows(prev => [...prev, newWindow]);
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
            savedLayouts, saveNamedLayout, loadNamedLayout, deleteNamedLayout
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
