/**
 * wikiStore — local-first persistence for the Three-Tier Wiki (spec §7.2).
 *
 * Each compiled wiki page (one per Domain / Project / Thread node) is stored in
 * a per-user localStorage namespace via the `createLocalStorageStore`
 * dynamic-key factory, so synthesized pages survive restarts with no backend.
 * Pages are keyed by their tree path.
 *
 * Storage key:  dwellium:wiki:<userId>   (fallback :_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface WikiPage {
    path: string;
    tier: string;            // domain | project | thread | folder
    name: string;
    overview: string;
    concepts: string[];
    openQuestions: string[];
    sources: string[];       // source document paths cited
    compiledAt: string;      // ISO
    compiledBy: 'llm' | 'outline'; // 'outline' = structure-only (no LLM available)
}

export type WikiMap = Record<string, WikiPage>;

export const wikiUserIdHolder: { current: string | null } = { current: null };

export function resolveWikiKey(): string {
    const uid = wikiUserIdHolder.current;
    return uid ? `dwellium:wiki:${uid}` : 'dwellium:wiki:_anonymous';
}

function deserialize(raw: string | null): WikiMap {
    if (!raw) return {};
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
        return o as WikiMap;
    } catch {
        return {};
    }
}

export const wikiStore = withSync(
    createLocalStorageStore<WikiMap>({
        key: resolveWikiKey,
        deserializer: deserialize,
        defaultValue: {},
    }),
    { objectType: 'wiki', holder: wikiUserIdHolder, resolveKey: resolveWikiKey },
);

export function getWikiPage(map: WikiMap, path: string | null): WikiPage | null {
    if (!path) return null;
    return map[path] ?? null;
}

export function setWikiPage(page: WikiPage): void {
    if (typeof window === 'undefined') return;
    const cur = wikiStore.getSnapshot();
    const next: WikiMap = { ...cur, [page.path]: page };
    wikiStore.set(next, () => {
        try { localStorage.setItem(resolveWikiKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/**
 * Parse an LLM JSON response into a WikiPage. Tolerant of fenced code blocks and
 * missing fields. Returns null if nothing usable was produced.
 */
export function parseWikiResponse(
    raw: string,
    node: { path: string; tier: string; name: string },
    sources: string[],
    now: Date = new Date(),
): WikiPage | null {
    if (!raw) return null;
    let text = raw.trim();
    // Strip ```json fences if present.
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) text = fence[1].trim();
    try {
        const o = JSON.parse(text);
        const arr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
        const overview = typeof o.overview === 'string' ? o.overview.trim() : '';
        const concepts = arr(o.concepts ?? o.keyConcepts);
        const openQuestions = arr(o.openQuestions ?? o.open_questions);
        if (!overview && concepts.length === 0 && openQuestions.length === 0) return null;
        return {
            path: node.path, tier: node.tier, name: node.name,
            overview, concepts, openQuestions,
            sources: arr(o.sources).length ? arr(o.sources) : sources,
            compiledAt: now.toISOString(), compiledBy: 'llm',
        };
    } catch {
        return null;
    }
}

/** Build a structure-only page (no LLM) so the tier view is useful offline. */
export function outlinePage(
    node: { path: string; tier: string; name: string },
    sources: string[],
    now: Date = new Date(),
): WikiPage {
    return {
        path: node.path, tier: node.tier, name: node.name,
        overview: '',
        concepts: [],
        openQuestions: [],
        sources,
        compiledAt: now.toISOString(),
        compiledBy: 'outline',
    };
}
