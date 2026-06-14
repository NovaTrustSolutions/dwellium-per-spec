/**
 * tagsStore — global tags created via Cmd/Ctrl+T (2026-06-14). A tag captures
 * whatever you had selected (text), names it, and links it to one or more
 * projects. Per-user + persisted via the established factory.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';

export interface Tag {
    id: string;
    name: string;
    projects: string[];   // project ids/names this tag links to
    content: string;      // captured selection / context
    source: string;       // where it came from (widget id / 'selection')
    createdAt: number;
}

/** The known projects a tag can link to (mirrors the KG project set). */
export const TAG_PROJECTS = ['Hermes Agent', 'Stella', 'Claude Code', 'AntiGravity', 'ChatGPT', 'Codex'];

function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `tags:${uid}` : 'tags:_anonymous';
}

function deserialize(raw: string | null): Tag[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}

export const tagsStore = createLocalStorageStore<Tag[]>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: [],
});

export function addTag(tag: Omit<Tag, 'id' | 'createdAt'>): Tag {
    const full: Tag = { ...tag, id: `tag-${Date.now().toString(36)}`, createdAt: Date.now() };
    const next = [...tagsStore.getSnapshot(), full];
    tagsStore.set(next, () => { try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ } });
    return full;
}

export function useTags(): Tag[] {
    return useSyncExternalStore(tagsStore.subscribe, tagsStore.getSnapshot, tagsStore.getServerSnapshot);
}
