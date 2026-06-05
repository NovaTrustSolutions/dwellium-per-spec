/**
 * contentSearch — pure keyword search over the local Dwellium corpus (spec §2.5).
 * Searches the local-first stores (brain dumps, syntheses, wiki pages, foundry
 * items, CoPaw memory) + file names from the tree. Ranks title matches above
 * body matches and builds a snippet around the first hit. Pure → unit-testable;
 * the widget assembles the docs and calls this.
 *
 * (Full file-content + semantic/vector search additionally requires the backend
 * index — surfaced honestly in the UI.)
 */

export type SearchDocType = 'file' | 'dump' | 'synthesis' | 'wiki' | 'foundry' | 'memory';

export interface SearchDoc {
    id: string;
    type: SearchDocType;
    title: string;
    body: string;
    /** widget id to open on click. */
    widget: string;
}

export interface SearchHit extends SearchDoc {
    score: number;
    snippet: string;
}

function snippetAround(body: string, idx: number, q: string): string {
    const start = Math.max(0, idx - 40);
    const end = Math.min(body.length, idx + q.length + 60);
    return (start > 0 ? '…' : '') + body.slice(start, end).trim() + (end < body.length ? '…' : '');
}

export function searchCorpus(query: string, docs: SearchDoc[], limit = 50): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const hits: SearchHit[] = [];
    for (const d of docs) {
        const title = d.title.toLowerCase();
        const body = d.body.toLowerCase();
        const inTitle = title.includes(q);
        let occ = 0;
        let from = body.indexOf(q);
        const firstIdx = from;
        while (from !== -1) { occ++; from = body.indexOf(q, from + q.length); }
        const score = (inTitle ? 5 : 0) + occ;
        if (score <= 0) continue;
        const snippet = firstIdx >= 0 ? snippetAround(d.body, firstIdx, q) : d.body.slice(0, 100);
        hits.push({ ...d, score, snippet });
    }
    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return hits.slice(0, limit);
}
