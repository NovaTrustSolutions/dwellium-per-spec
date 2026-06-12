/**
 * tabGroupStore — Phase-10 C1: named, persistent tab groups (Option α per
 * Ilya's 10.8 gate-lock 2026-06-11).
 *
 * Option α semantics: the 5-region window model stays UNTOUCHED internally —
 * a TabGroup is a UI-layer object: a named, ordered set of widget components
 * that materializes as a browser-style tab stack in one region via the
 * EXISTING `dwellium:apply-space {mode:'tabbed'}` bus (Desktop.tsx already
 * stacks + tabs + tear-off). Groups differ from Spaces: a Space is the whole
 * canvas; a group is one named tab stack, several can coexist.
 *
 * Storage: per-user dynamic-key factory (`tabgroups:<userId>`) + One Save
 * (`withSync`, objectType 'tab-groups') — exactly the agentTeamsStore /
 * savedLayoutsStore sister shape, including the v2.72.1 `.reset()` standing
 * convention. SSR-safe by construction (factory store).
 *
 * Structural migration (groups CONTAIN the window model) deferred to
 * Phase-11 per Option α — `layout` is reserved for future 'split-h'/'split-v'.
 */
import { useContext, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { UserContext } from '../context/UserContext';

export interface TabGroup {
    id: string;
    title: string;
    /** Ordered widget component ids — the tabs. */
    componentIds: string[];
    /** Option α: always 'tabs'; split modes reserved for Phase-11. */
    layout: 'tabs';
    createdAt: string;
    updatedAt: string;
}

export const tabGroupsUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = tabGroupsUserIdHolder.current;
    return uid ? `tabgroups:${uid}` : 'tabgroups:_anonymous';
}

function isGroup(g: unknown): g is TabGroup {
    return !!g
        && typeof (g as TabGroup).id === 'string'
        && typeof (g as TabGroup).title === 'string'
        && Array.isArray((g as TabGroup).componentIds);
}

function deserialize(raw: string | null): TabGroup[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(isGroup).map((g): TabGroup => ({
            id: g.id,
            title: g.title,
            componentIds: g.componentIds.filter((c): c is string => typeof c === 'string'),
            layout: 'tabs',
            createdAt: typeof g.createdAt === 'string' ? g.createdAt : '',
            updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : '',
        }));
    } catch {
        return [];
    }
}

export const tabGroupStore = withSync(
    createLocalStorageStore<TabGroup[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'tab-groups', holder: tabGroupsUserIdHolder, resolveKey },
);

function persist(next: TabGroup[]): void {
    tabGroupStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function newGroupId(): string {
    return `tg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Mutators ─── */

/** Create a group (deduped, ≥1 tab enforced at the caller's UI). */
export function createGroup(title: string, componentIds: string[]): TabGroup {
    const now = new Date().toISOString();
    const group: TabGroup = {
        id: newGroupId(),
        title: title.trim() || 'Untitled group',
        componentIds: [...new Set(componentIds)],
        layout: 'tabs',
        createdAt: now,
        updatedAt: now,
    };
    persist([...tabGroupStore.getSnapshot(), group]);
    return group;
}

export function renameGroup(id: string, title: string): void {
    persist(tabGroupStore.getSnapshot().map(g =>
        g.id === id ? { ...g, title: title.trim() || g.title, updatedAt: new Date().toISOString() } : g));
}

export function deleteGroup(id: string): void {
    persist(tabGroupStore.getSnapshot().filter(g => g.id !== id));
}

/** Replace a group's tab set (dedupes; deleting the last tab deletes the group). */
export function setGroupTabs(id: string, componentIds: string[]): void {
    const deduped = [...new Set(componentIds)];
    if (deduped.length === 0) { deleteGroup(id); return; }
    persist(tabGroupStore.getSnapshot().map(g =>
        g.id === id ? { ...g, componentIds: deduped, updatedAt: new Date().toISOString() } : g));
}

export function addTabToGroup(id: string, componentId: string): void {
    const g = tabGroupStore.getSnapshot().find(x => x.id === id);
    if (!g || g.componentIds.includes(componentId)) return;
    setGroupTabs(id, [...g.componentIds, componentId]);
}

export function removeTabFromGroup(id: string, componentId: string): void {
    const g = tabGroupStore.getSnapshot().find(x => x.id === id);
    if (!g) return;
    setGroupTabs(id, g.componentIds.filter(c => c !== componentId));
}

/** Move a tab within a group (drag-reorder). */
export function reorderTab(id: string, from: number, to: number): void {
    const g = tabGroupStore.getSnapshot().find(x => x.id === id);
    if (!g || from === to || from < 0 || from >= g.componentIds.length || to < 0 || to >= g.componentIds.length) return;
    const next = [...g.componentIds];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setGroupTabs(id, next);
}

/* ─── Materialization (Option α: ride the existing region/tab machinery) ─── */

/**
 * Open a group on the canvas: its widgets stack as browser-style tabs in one
 * region via the existing apply-space tabbed bus (additive — does not
 * minimize other windows; Desktop.tsx owns placement).
 */
export function applyGroup(group: TabGroup): void {
    if (group.componentIds.length === 0) return;
    try {
        window.dispatchEvent(new CustomEvent('dwellium:apply-space', {
            detail: { widgets: group.componentIds, mode: 'tabbed' },
        }));
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Opened group "${group.title}"` }));
    } catch { /* SSR / sandbox */ }
}

/* ─── Hook ─── */

export function useTabGroups() {
    const userCtx = useContext(UserContext);
    tabGroupsUserIdHolder.current = userCtx?.user?.id ?? null;
    const groups = useSyncExternalStore(
        tabGroupStore.subscribe,
        tabGroupStore.getSnapshot,
        tabGroupStore.getServerSnapshot,
    );
    return { groups, createGroup, renameGroup, deleteGroup, setGroupTabs, addTabToGroup, removeTabFromGroup, reorderTab, applyGroup };
}
