/**
 * contentSearch — pure keyword search over the local Dwellium corpus (spec §2.5).
 * Searches the local-first stores (brain dumps, syntheses, wiki pages, foundry
 * items, CoPaw memory) + file names from the tree. A doc matches only if every
 * whitespace-separated token of the query appears (case-insensitive) in its
 * title or body. Ranks title matches above body matches and builds a snippet
 * around the first body hit. Pure → unit-testable; the widget assembles the
 * docs and calls this.
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

export interface SearchResult {
    hits: SearchHit[];
    /** Number of matching docs before `limit` was applied. */
    total: number;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function tokenize(query: string): string[] {
    return query.trim().split(/\s+/).filter(Boolean);
}

/** Fresh regex per call so global-flag state never leaks between checks. */
function tokenRegex(token: string): RegExp {
    return new RegExp(escapeRegExp(token), 'giu');
}

function tokenInText(token: string, text: string): boolean {
    return tokenRegex(token).test(text);
}

/** Occurrences of `token` in `text`, stopping at `cap` (the score never uses more). */
function countOccurrences(text: string, token: string, cap: number): number {
    const re = tokenRegex(token);
    let count = 0;
    while (count < cap && re.exec(text)) count++;
    return count;
}

/** Earliest match (index + matched length) among all tokens in `body`, or null. */
function firstBodyMatch(body: string, tokens: string[]): { idx: number; len: number } | null {
    let best: { idx: number; len: number } | null = null;
    for (const token of tokens) {
        const m = tokenRegex(token).exec(body);
        if (m && (!best || m.index < best.idx)) best = { idx: m.index, len: m[0].length };
    }
    return best;
}

function snippetAround(body: string, idx: number, matchLen: number): string {
    const start = Math.max(0, idx - 40);
    const end = Math.min(body.length, idx + matchLen + 60);
    return (start > 0 ? '…' : '') + body.slice(start, end).trim() + (end < body.length ? '…' : '');
}

/** Every whitespace token must appear (title or body), case-insensitive, AND semantics. */
export function searchCorpus(query: string, docs: SearchDoc[], limit = 50): SearchResult {
    const tokens = tokenize(query);
    if (tokens.length === 0) return { hits: [], total: 0 };

    const hits: SearchHit[] = [];
    for (const d of docs) {
        let score = 0;
        let matchesAll = true;
        for (const token of tokens) {
            const inTitle = tokenInText(token, d.title);
            const inBody = tokenInText(token, d.body);
            if (!inTitle && !inBody) { matchesAll = false; break; }
            score += (inTitle ? 5 : 0) + (inBody ? countOccurrences(d.body, token, 3) : 0);
        }
        if (!matchesAll) continue;

        const match = firstBodyMatch(d.body, tokens);
        const snippet = match ? snippetAround(d.body, match.idx, match.len) : d.body.slice(0, 100);
        hits.push({ ...d, score, snippet });
    }

    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return { hits: hits.slice(0, limit), total: hits.length };
}

/** Split `text` into plain/match parts for <mark> rendering (Phase 2). Overlapping token matches merge. */
export function highlightParts(text: string, query: string): Array<{ text: string; match: boolean }> {
    const tokens = tokenize(query);
    if (tokens.length === 0 || !text) return [{ text, match: false }];

    const ranges: Array<[number, number]> = [];
    for (const token of tokens) {
        const re = tokenRegex(token);
        let m: RegExpExecArray | null;
        while ((m = re.exec(text))) ranges.push([m.index, m.index + m[0].length]);
    }
    if (ranges.length === 0) return [{ text, match: false }];

    ranges.sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [];
    for (const [s, e] of ranges) {
        const last = merged[merged.length - 1];
        if (last && s <= last[1]) last[1] = Math.max(last[1], e);
        else merged.push([s, e]);
    }

    const parts: Array<{ text: string; match: boolean }> = [];
    let cursor = 0;
    for (const [s, e] of merged) {
        if (s > cursor) parts.push({ text: text.slice(cursor, s), match: false });
        parts.push({ text: text.slice(s, e), match: true });
        cursor = e;
    }
    if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
    return parts;
}
