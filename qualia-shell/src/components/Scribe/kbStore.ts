/**
 * kbStore — Scribe/Dwellium knowledge-base "data folders" (2026-06-14).
 *
 * Three categorized local folders the user can point at:
 *   • knowledge — general KB; AI-summarized into a short wiki + concept links.
 *   • personal  — Hobbies / Personal; AI-summarized like knowledge.
 *   • private   — LOCAL ONLY. Never summarized by an LLM, never exposed to any
 *                 agent (Honcho / Hermes / Stella / ARA). Listed locally so YOU
 *                 can browse it, but no model ever sees its contents.
 *
 * getAgentVisibleKb() is the single accessor agents use — it EXCLUDES private
 * folders by construction, so the private repo can never be tracked.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { integrationsUserIdHolder } from '../../utils/integrationsStore';

export interface KbEntry { rel: string; title: string; summary: string; concepts: string[]; }
export type KbCategory = 'knowledge' | 'personal' | 'private';

export interface KbFolder {
    category: KbCategory;
    name: string;
    folder: string;
    isPrivate: boolean;
    entries: KbEntry[];
    links: [number, number][];
    indexedAt: number | null;
}

export interface KbState { folders: Record<KbCategory, KbFolder> }

const FOLDER_DEFS: { category: KbCategory; name: string; isPrivate: boolean }[] = [
    { category: 'knowledge', name: 'Knowledge Base', isPrivate: false },
    { category: 'personal', name: 'Hobbies / Personal', isPrivate: false },
    { category: 'private', name: 'Private', isPrivate: true },
];

function emptyFolder(d: { category: KbCategory; name: string; isPrivate: boolean }): KbFolder {
    return { category: d.category, name: d.name, folder: '', isPrivate: d.isPrivate, entries: [], links: [], indexedAt: null };
}
function emptyState(): KbState {
    return { folders: { knowledge: emptyFolder(FOLDER_DEFS[0]), personal: emptyFolder(FOLDER_DEFS[1]), private: emptyFolder(FOLDER_DEFS[2]) } };
}

function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `scribe-kb:${uid}` : 'scribe-kb:_anonymous';
}

function deserialize(raw: string | null): KbState {
    const base = emptyState();
    if (!raw) return base;
    try {
        const p = JSON.parse(raw);
        // Migrate the legacy single-folder shape ({folder,entries,links,indexedAt}).
        if (p && !p.folders && (typeof p.folder === 'string' || Array.isArray(p.entries))) {
            base.folders.knowledge = { ...base.folders.knowledge, folder: String(p.folder || ''), entries: Array.isArray(p.entries) ? p.entries : [], links: Array.isArray(p.links) ? p.links : [], indexedAt: p.indexedAt ?? null };
            return base;
        }
        if (p?.folders) {
            for (const d of FOLDER_DEFS) {
                const f = p.folders[d.category];
                if (f) base.folders[d.category] = { ...emptyFolder(d), folder: String(f.folder || ''), entries: Array.isArray(f.entries) ? f.entries : [], links: Array.isArray(f.links) ? f.links : [], indexedAt: f.indexedAt ?? null };
            }
        }
        return base;
    } catch { return base; }
}

export const kbStore = createLocalStorageStore<KbState>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: emptyState(),
});

/** Persist one folder (by category), leaving the others untouched. */
export function saveKbFolder(category: KbCategory, patch: Partial<KbFolder>): void {
    const cur = kbStore.getSnapshot();
    const next: KbState = { folders: { ...cur.folders, [category]: { ...cur.folders[category], ...patch } } };
    kbStore.set(next, () => { try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ } });
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

/**
 * The ONLY accessor agents (Honcho/Hermes/Stella/ARA) should use to read KB
 * context. Excludes every private folder by construction — the Private repo is
 * never tracked by any model.
 */
export function getAgentVisibleKb(): KbEntry[] {
    const s = kbStore.getSnapshot();
    return Object.values(s.folders).filter((f) => !f.isPrivate).flatMap((f) => f.entries);
}
