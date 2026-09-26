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
import { wikiUserIdHolder } from '../../lib/perUserIdentity';

export interface WikiPage {
    path: string;
    tier: string;            // domain | project | thread | folder
    name: string;
    overview: string;
    concepts: string[];
    openQuestions: string[];
    sources: string[];       // source document paths cited
    inputs?: string[];       // every source path the page was compiled from (staleness baseline; cited `sources` may be a subset)
    compiledAt: string;      // ISO
    compiledBy: 'llm' | 'outline'; // 'outline' = structure-only (no LLM available)
}

export type WikiMap = Record<string, WikiPage>;

/** Set for every shell render by setPerUserIdentity (plan 067) — tied to the signed-in user. */
export { wikiUserIdHolder };

export function resolveWikiKey(): string {
    const uid = wikiUserIdHolder.current;
    return uid ? `dwellium:wiki:${uid}` : 'dwellium:wiki:_anonymous';
}

function deserialize(raw: string | null): unknown {
    if (!raw) return {};
    try {
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

const arrOfStrings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

/** Validate one raw value as a WikiPage. Requires string path+name; coerces
 *  array fields; defaults compiledBy to 'outline'; anything else → null. */
export function sanitizeWikiPage(raw: unknown): WikiPage | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    if (typeof o.path !== 'string' || !o.path) return null;
    if (typeof o.name !== 'string' || !o.name) return null;
    return {
        path: o.path,
        tier: typeof o.tier === 'string' ? o.tier : '',
        name: o.name,
        overview: typeof o.overview === 'string' ? o.overview : '',
        concepts: arrOfStrings(o.concepts),
        openQuestions: arrOfStrings(o.openQuestions),
        sources: arrOfStrings(o.sources),
        compiledAt: typeof o.compiledAt === 'string' ? o.compiledAt : '',
        compiledBy: o.compiledBy === 'llm' ? 'llm' : 'outline',
        ...(Array.isArray(o.inputs) ? { inputs: arrOfStrings(o.inputs) } : {}),
    };
}

/** Validate a raw value as a WikiMap — drops any entry that doesn't sanitize,
 *  keyed by each page's own `path` (never trusts the object's own keys). */
export function sanitizeWikiMap(raw: unknown): WikiMap {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: WikiMap = {};
    for (const v of Object.values(raw as Record<string, unknown>)) {
        const page = sanitizeWikiPage(v);
        if (page) out[page.path] = page;
    }
    return out;
}

function pageTime(p: WikiPage): number {
    const t = Date.parse(p.compiledAt);
    return Number.isNaN(t) ? 0 : t;
}

/** Union two wiki maps. Same path on both sides → newer `compiledAt` wins;
 *  an exact tie favors `b`. */
export function mergeWikiMaps(a: WikiMap, b: WikiMap): WikiMap {
    const out: WikiMap = { ...a };
    for (const [path, bPage] of Object.entries(b)) {
        const aPage = out[path];
        out[path] = !aPage || pageTime(bPage) >= pageTime(aPage) ? bPage : aPage;
    }
    return out;
}

const wikiBaseStore = createLocalStorageStore<WikiMap>({
    key: resolveWikiKey,
    deserializer: (raw) => sanitizeWikiMap(deserialize(raw)),
    defaultValue: {},
});

export const wikiStore = withSync(wikiBaseStore, {
    objectType: 'wiki',
    holder: wikiUserIdHolder,
    resolveKey: resolveWikiKey,
    // Local newer-wins per page: merge(local, remote) hands remote as `a` and
    // local as `b` to mergeWikiMaps so an exact-tie compiledAt favors the
    // value already on this device.
    merge: (l, r) => mergeWikiMaps(sanitizeWikiMap(r), sanitizeWikiMap(l)),
});

export function getWikiPage(map: WikiMap, path: string | null): WikiPage | null {
    if (!path) return null;
    return map[path] ?? null;
}

export function setWikiPage(page: WikiPage): void {
    if (typeof window === 'undefined') return;
    // Re-read localStorage before merging in `page` — another tab (cross-tab
    // sync) or a backend hydrate may have written pages since our in-memory
    // snapshot was cached, and a plain `{ ...snapshot, [page.path]: page }`
    // would silently drop them.
    let fresh: WikiMap = wikiStore.getSnapshot();
    try {
        fresh = mergeWikiMaps(fresh, sanitizeWikiMap(deserialize(localStorage.getItem(resolveWikiKey()))));
    } catch { /* sandboxed */ }
    const next: WikiMap = { ...fresh, [page.path]: page };
    wikiStore.set(next, () => {
        try { localStorage.setItem(resolveWikiKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** True when the page's recorded source set no longer matches `current`, or
 *  any current source was modified after the page was compiled. Missing or
 *  unparsable `modified` values are ignored (not treated as stale). */
export function isWikiPageStale(page: WikiPage, current: { path: string; modified?: string }[]): boolean {
    // Pages compiled before `inputs` existed only kept the LLM's cited subset, which
    // never matches the real file set — for those, judge by modification time alone
    // rather than flagging every legacy page "out of date" forever.
    if (page.inputs) {
        const pageKey = [...new Set(page.inputs)].sort().join('\u0000');
        const curKey = [...new Set(current.map((c) => c.path))].sort().join('\u0000');
        if (pageKey !== curKey) return true;
    }
    const compiledTime = Date.parse(page.compiledAt);
    if (Number.isNaN(compiledTime)) return false;
    return current.some((c) => {
        if (!c.modified) return false;
        const t = Date.parse(c.modified);
        return !Number.isNaN(t) && t > compiledTime;
    });
}

/** Listen for this store's key changing in another tab and merge the
 *  incoming map in. Uses the UNWRAPPED base store's `set()` (shares the same
 *  listener set as `wikiStore.subscribe`, per `makeSynced`) instead of
 *  `wikiStore.set()`, so applying data another tab already persisted does
 *  not also re-queue a redundant backend write-through here. Returns an
 *  unsubscribe function. */
export function attachWikiCrossTabSync(): () => void {
    if (typeof window === 'undefined') return () => { /* noop */ };
    const handler = (e: StorageEvent): void => {
        if (e.key !== resolveWikiKey()) return;
        const incoming = sanitizeWikiMap(deserialize(e.newValue));
        const merged = mergeWikiMaps(wikiBaseStore.getSnapshot(), incoming);
        wikiBaseStore.set(merged, () => { /* already persisted by the writing tab */ });
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
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
        const overview = typeof o.overview === 'string' ? o.overview.trim() : '';
        const concepts = arrOfStrings(o.concepts ?? o.keyConcepts);
        const openQuestions = arrOfStrings(o.openQuestions ?? o.open_questions);
        if (!overview && concepts.length === 0 && openQuestions.length === 0) return null;
        // The LLM can never introduce a source path that isn't real: intersect
        // its claimed sources with the actual list, deduped; an empty
        // intersection (LLM omitted sources, or hallucinated ones) falls back
        // to the real (deduped) source list.
        const realSet = new Set(sources);
        const dedupedReal = [...new Set(sources)];
        const intersection = [...new Set(arrOfStrings(o.sources).filter((s) => realSet.has(s)))];
        return {
            path: node.path, tier: node.tier, name: node.name,
            overview, concepts, openQuestions,
            sources: intersection.length ? intersection : dedupedReal,
            inputs: dedupedReal,
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
        inputs: [...new Set(sources)],
        compiledAt: now.toISOString(),
        compiledBy: 'outline',
    };
}
