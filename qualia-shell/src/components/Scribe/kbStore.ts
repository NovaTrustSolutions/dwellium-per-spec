/**
 * kbStore — Scribe knowledge-base index (2026-06-14). Holds the chosen local
 * folder, an AI-generated short wiki per file, and concept links between
 * similar entries (feature E). Per-user + persisted.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { integrationsUserIdHolder } from '../../utils/integrationsStore';

export interface KbEntry {
    rel: string;        // path relative to the folder
    title: string;      // file name
    summary: string;    // AI short wiki blurb
    concepts: string[]; // AI-extracted key concepts
}

export interface KbState {
    folder: string;
    entries: KbEntry[];
    links: [number, number][]; // index pairs sharing concepts (feature E)
    indexedAt: number | null;
}

const EMPTY: KbState = { folder: '', entries: [], links: [], indexedAt: null };

function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `scribe-kb:${uid}` : 'scribe-kb:_anonymous';
}

function deserialize(raw: string | null): KbState {
    if (!raw) return EMPTY;
    try { const p = JSON.parse(raw); return { ...EMPTY, ...p }; } catch { return EMPTY; }
}

export const kbStore = createLocalStorageStore<KbState>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: EMPTY,
});

export function saveKb(state: KbState): void {
    kbStore.set(state, () => { try { localStorage.setItem(resolveKey(), JSON.stringify(state)); } catch { /* sandboxed */ } });
}

export function useKb(): KbState {
    return useSyncExternalStore(kbStore.subscribe, kbStore.getSnapshot, kbStore.getServerSnapshot);
}

/** Feature E: link entries that share concepts (case-insensitive overlap). */
export function linkByConcepts(entries: KbEntry[]): [number, number][] {
    const norm = entries.map((e) => new Set((e.concepts || []).map((c) => c.toLowerCase().trim()).filter(Boolean)));
    const links: [number, number][] = [];
    for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
            let shared = 0;
            for (const c of norm[i]) if (norm[j].has(c)) shared++;
            if (shared >= 1) links.push([i, j]);
        }
    }
    return links;
}
