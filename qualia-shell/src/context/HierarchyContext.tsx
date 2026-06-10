import { createContext, useContext, useState, useCallback, useEffect, useSyncExternalStore, ReactNode } from 'react';
import { HierarchyItem } from '../data/types';
import { defaultHierarchy } from '../data/hierarchy';
import { API_BASE } from '../config';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSyncStatic } from '../lib/oneSaveStore';

const STORAGE_KEY = 'dwellium-hierarchy';
const IMPORTED_DOMAIN_ID = 'imported-files-domain';
const IMPORTED_NODE_ID = 'imported-files-node';

interface ImportedFolder {
    id: string;
    name: string;
    type: 'folder';
}

/* ── helpers ───────────────────────────────────── */

function generateId(type: string): string {
    return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function findItem(items: HierarchyItem[], id: string): HierarchyItem | null {
    for (const item of items) {
        if (item.id === id) return item;
        if (item.children) {
            const found = findItem(item.children, id);
            if (found) return found;
        }
    }
    return null;
}

function findPath(items: HierarchyItem[], id: string, path: HierarchyItem[] = []): HierarchyItem[] {
    for (const item of items) {
        const newPath = [...path, item];
        if (item.id === id) return newPath;
        if (item.children) {
            const found = findPath(item.children, id, newPath);
            if (found.length > 0) return found;
        }
    }
    return [];
}

function deepClone(items: HierarchyItem[]): HierarchyItem[] {
    return JSON.parse(JSON.stringify(items));
}

function insertChild(items: HierarchyItem[], parentId: string, child: HierarchyItem): HierarchyItem[] {
    return items.map(item => {
        if (item.id === parentId) {
            return { ...item, children: [...(item.children || []), child] };
        }
        if (item.children) {
            return { ...item, children: insertChild(item.children, parentId, child) };
        }
        return item;
    });
}

function removeFromTree(items: HierarchyItem[], id: string): HierarchyItem[] {
    return items
        .filter(item => item.id !== id)
        .map(item => ({
            ...item,
            children: item.children ? removeFromTree(item.children, id) : undefined,
        }));
}

function renameInTree(items: HierarchyItem[], id: string, name: string): HierarchyItem[] {
    return items.map(item => {
        if (item.id === id) return { ...item, name };
        if (item.children) return { ...item, children: renameInTree(item.children, id, name) };
        return item;
    });
}

function replaceChildren(items: HierarchyItem[], id: string, children: HierarchyItem[]): HierarchyItem[] {
    return items.map(item => {
        if (item.id === id) return { ...item, children };
        if (item.children) return { ...item, children: replaceChildren(item.children, id, children) };
        return item;
    });
}

function upsertImportedProjects(items: HierarchyItem[], folders: ImportedFolder[]): HierarchyItem[] {
    const importedFolders = folders.filter(folder => folder.id !== 'unassigned');
    if (importedFolders.length === 0) return items;

    let next = deepClone(items);

    if (!findItem(next, IMPORTED_DOMAIN_ID)) {
        next.push({
            id: IMPORTED_DOMAIN_ID,
            name: 'Imported Files',
            icon: '🗂️',
            type: 'domain',
            children: [],
            metadata: { source: 'backend-files' }
        });
    }

    if (!findItem(next, IMPORTED_NODE_ID)) {
        next = insertChild(next, IMPORTED_DOMAIN_ID, {
            id: IMPORTED_NODE_ID,
            name: 'Vacation Requests',
            icon: '🧳',
            type: 'node',
            children: [],
            metadata: { source: 'backend-files' }
        });
    }

    const importedNode = findItem(next, IMPORTED_NODE_ID);
    if (!importedNode) return next;

    const preservedChildren = (importedNode.children || []).filter(child => child.metadata?.source !== 'backend-files');
    const existingIds = new Set<string>();

    function collectIds(nodes: HierarchyItem[]) {
        for (const node of nodes) {
            existingIds.add(node.id);
            if (node.children) collectIds(node.children);
        }
    }

    collectIds(next);

    const importedProjects: HierarchyItem[] = importedFolders
        .filter(folder => !existingIds.has(folder.id) || !!findItem(importedNode.children || [], folder.id))
        .map(folder => ({
            id: folder.id,
            name: folder.name,
            icon: '📋',
            type: 'project' as const,
            metadata: { source: 'backend-files' }
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    return replaceChildren(next, IMPORTED_NODE_ID, [...preservedChildren, ...importedProjects]);
}

const ICONS: Record<string, string> = {
    domain: '📂',
    node: '📁',
    project: '📋',
};

/* ── load / save ───────────────────────────────── */

function loadHierarchy(): HierarchyItem[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch { /* ignore */ }
    return deepClone(defaultHierarchy);
}

function saveHierarchy(items: HierarchyItem[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

// ============================================
// SSR-SAFE EXTERNAL STORE (Phase-8+ Task 8.10 PROVIDER-SSR-REMEDIATION)
// ============================================
// Migrated from useState<HierarchyItem[]>(loadHierarchy) at L186 (fired
// during render; loadHierarchy() at L153 calls localStorage.getItem and
// threw ReferenceError on SSR) to useSyncExternalStore + getServerSnapshot
// per Cowork Q1 LOCK Option A at Task 8.10 PRE0. loadHierarchy() reused
// as the store deserializer; getServerSnapshot returns a fresh deepClone
// of defaultHierarchy (matches the pre-Task-8.10 fallback path of
// loadHierarchy()'s catch branch). Exported for unit test access at
// src/test/appfolioParity/.

export const hierarchyStore = withSyncStatic(
    createLocalStorageStore<HierarchyItem[]>(
        loadHierarchy,
        deepClone(defaultHierarchy),
    ),
    { objectType: 'hierarchy', storageKey: STORAGE_KEY },
);

/* ── context ───────────────────────────────────── */

interface HierarchyContextValue {
    hierarchy: HierarchyItem[];
    selectedId: string | null;
    expandedIds: Set<string>;
    selectItem: (id: string) => void;
    toggleExpand: (id: string) => void;
    expandAll: () => void;
    collapseAll: () => void;
    getSelectedItem: () => HierarchyItem | null;
    getBreadcrumb: () => HierarchyItem[];
    addItem: (parentId: string | null, name: string, type: 'domain' | 'node' | 'project') => void;
    removeItem: (id: string) => void;
    renameItem: (id: string, name: string) => void;
}

const HierarchyContext = createContext<HierarchyContextValue | null>(null);

export function HierarchyProvider({ children }: { children: ReactNode }) {
    const hierarchy = useSyncExternalStore(
        hierarchyStore.subscribe,
        hierarchyStore.getSnapshot,
        hierarchyStore.getServerSnapshot,
    );
    const setHierarchy = useCallback((value: HierarchyItem[] | ((prev: HierarchyItem[]) => HierarchyItem[])) => {
        const next = typeof value === 'function' ? value(hierarchyStore.getSnapshot()) : value;
        // Persistence happens in useEffect below (preserves pre-Task-8.10 every-change semantic).
        hierarchyStore.set(next, () => { /* persistence in useEffect */ });
    }, []);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // persist on every change
    useEffect(() => {
        saveHierarchy(hierarchy);
    }, [hierarchy]);

    useEffect(() => {
        let cancelled = false;

        async function hydrateImportedProjects() {
            try {
                const response = await fetch(`${API_BASE}/api/files/tree`);
                const json = await response.json();
                if (!json?.success || !Array.isArray(json.data) || cancelled) return;

                setHierarchy(prev => upsertImportedProjects(prev, json.data as ImportedFolder[]));
                setExpandedIds(prev => {
                    const next = new Set(prev);
                    next.add(IMPORTED_DOMAIN_ID);
                    next.add(IMPORTED_NODE_ID);
                    return next;
                });
            } catch {
                // Ignore when backend tree is unavailable; local hierarchy still works.
            }
        }

        hydrateImportedProjects();

        return () => {
            cancelled = true;
        };
    }, []);

    const selectItem = useCallback((id: string) => {
        setSelectedId(id);
    }, []);

    const toggleExpand = useCallback((id: string) => {
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const collectAllIds = useCallback((items: HierarchyItem[]): string[] => {
        const ids: string[] = [];
        for (const item of items) {
            if (item.children && item.children.length > 0) {
                ids.push(item.id);
                ids.push(...collectAllIds(item.children));
            }
        }
        return ids;
    }, []);

    const expandAll = useCallback(() => {
        setExpandedIds(new Set(collectAllIds(hierarchy)));
    }, [hierarchy, collectAllIds]);

    const collapseAll = useCallback(() => {
        setExpandedIds(new Set());
    }, []);

    const getSelectedItem = useCallback(() => {
        if (!selectedId) return null;
        return findItem(hierarchy, selectedId);
    }, [selectedId, hierarchy]);

    const getBreadcrumb = useCallback(() => {
        if (!selectedId) return [];
        return findPath(hierarchy, selectedId);
    }, [selectedId, hierarchy]);

    const addItem = useCallback((parentId: string | null, name: string, type: 'domain' | 'node' | 'project') => {
        const newItem: HierarchyItem = {
            id: generateId(type),
            name,
            icon: ICONS[type] || '📄',
            type,
            children: type !== 'project' ? [] : undefined,
        };

        if (parentId === null) {
            // add at root (domain)
            setHierarchy(prev => [...prev, newItem]);
        } else {
            setHierarchy(prev => insertChild(prev, parentId, newItem));
            // auto-expand parent
            setExpandedIds(prev => {
                const next = new Set(prev);
                next.add(parentId);
                return next;
            });
        }
    }, []);

    const removeItem = useCallback((id: string) => {
        setHierarchy(prev => removeFromTree(prev, id));
        setSelectedId(prev => prev === id ? null : prev);
    }, []);

    const renameItem = useCallback((id: string, name: string) => {
        setHierarchy(prev => renameInTree(prev, id, name));
    }, []);

    return (
        <HierarchyContext.Provider value={{
            hierarchy, selectedId, expandedIds,
            selectItem, toggleExpand, expandAll, collapseAll, getSelectedItem, getBreadcrumb,
            addItem, removeItem, renameItem,
        }}>
            {children}
        </HierarchyContext.Provider>
    );
}

export function useHierarchy() {
    const ctx = useContext(HierarchyContext);
    if (!ctx) throw new Error('useHierarchy must be used within HierarchyProvider');
    return ctx;
}
