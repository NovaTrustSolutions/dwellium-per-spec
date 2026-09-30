import type { FileEntry } from './FileExplorerCell';

export interface FilterResult {
    entries: FileEntry[];
    /** Every ancestor folder of a kept match; the caller forces these open. */
    expand: Set<string>;
}

/**
 * Case-insensitive name-substring filter. A matching folder keeps all its
 * descendants; a non-matching folder survives only as the branches that lead to
 * a match. Pure: input entries are never mutated (kept subtrees are shared).
 */
export function filterTree(entries: FileEntry[], query: string): FilterResult {
    const q = query.trim().toLowerCase();
    const expand = new Set<string>();
    if (!q) return { entries, expand };
    const walk = (e: FileEntry): { node: FileEntry | null; hit: boolean } => {
        const kids = (e.children ?? []).map(walk);
        const below = kids.some((k) => k.hit);
        const self = e.name.toLowerCase().includes(q);
        if (below) expand.add(e.path);
        if (self) return { node: e, hit: true };
        if (!below) return { node: null, hit: false };
        const children = kids.flatMap((k) => (k.node ? [k.node] : []));
        return { node: { ...e, children }, hit: true };
    };
    const kept = entries.flatMap((e) => {
        const r = walk(e);
        return r.node ? [r.node] : [];
    });
    return { entries: kept, expand };
}
