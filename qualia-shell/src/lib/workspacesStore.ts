/**
 * workspacesStore — user-created, persistent Holocron OS workspaces (2026-06-14).
 *
 * Each workspace remembers its apps, its split layout (screen breaks), the
 * active pane, and a scratch note — per user, synced. Switch away and back and
 * it restores exactly, so you continue where you left off. Per-widget internal
 * state (ARA threads, notes, etc.) already persists per-user on its own; this
 * store persists the WORKSPACE composition + layout around them.
 *
 * Uses the established createLocalStorageStore dynamic-key factory (sister to
 * integrationsStore / llmUsageStore / subscriptionsStore).
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { withSync } from './oneSaveStore';

export interface Frame { x: number; y: number; w: number; h: number; }

export interface Workspace {
    id: string;
    name: string;
    appIds: string[];      // widget ids hosted in this workspace
    split: 1 | 2 | 3 | 4;  // screen breaks (columns) — used in grid layout
    layout: 'grid' | 'custom';  // grid = split columns; custom = free move/resize
    frames: Record<string, Frame>; // per-app position+size (custom layout), % units
    activeAppId?: string;  // last-focused pane (single-split view)
    notes: string;         // free scratch text that persists
    updatedAt: number;
}

function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `workspaces:${uid}` : 'workspaces:_anonymous';
}

function deserialize(raw: string | null): Workspace[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.map((w) => ({
            id: String(w.id),
            name: String(w.name ?? 'Workspace'),
            appIds: Array.isArray(w.appIds) ? w.appIds.map(String) : [],
            split: ([1, 2, 3, 4].includes(w.split) ? w.split : 1) as 1 | 2 | 3 | 4,
            layout: (w.layout === 'custom' ? 'custom' : 'grid') as 'grid' | 'custom',
            frames: (w.frames && typeof w.frames === 'object') ? w.frames : {},
            activeAppId: w.activeAppId ? String(w.activeAppId) : undefined,
            notes: typeof w.notes === 'string' ? w.notes : '',
            updatedAt: Number(w.updatedAt) || Date.now(),
        }));
    } catch { return []; }
}

export const workspacesStore = withSync(
    createLocalStorageStore<Workspace[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'workspaces', holder: integrationsUserIdHolder, resolveKey },
);

export function saveWorkspaces(list: Workspace[]): void {
    workspacesStore.set(list, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(list)); } catch { /* sandboxed */ }
    });
}

export function useWorkspaces(): Workspace[] {
    return useSyncExternalStore(workspacesStore.subscribe, workspacesStore.getSnapshot, workspacesStore.getServerSnapshot);
}

export function newWorkspaceId(): string {
    return `ws-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
