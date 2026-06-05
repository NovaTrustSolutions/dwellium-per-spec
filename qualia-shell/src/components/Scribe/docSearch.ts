/**
 * docSearch — pure cross-document search for Scribe (suitenumerique/docs has
 * searchable content). Searches the text of the documents it's given (the
 * loaded/known Scribe files) and returns located matches with line context.
 * Dependency-free + deterministic → unit-testable without an editor or backend.
 */

export interface SearchDoc {
    filepath: string;
    content: string;
}

export interface SearchMatch {
    filepath: string;
    line: number;       // 1-based
    column: number;     // 1-based, position of the match in the line
    lineText: string;   // the full line the match is on (trimmed for display)
    matchText: string;  // the exact matched text
}

export interface SearchOptions {
    caseSensitive?: boolean;
    maxPerFile?: number;
    maxTotal?: number;
}

/**
 * Find all occurrences of `query` across `docs`. Returns [] for an empty query.
 * Matches are ordered by document (input order), then by position.
 */
export function searchDocuments(docs: SearchDoc[], query: string, opts: SearchOptions = {}): SearchMatch[] {
    const q = query ?? '';
    if (!q.trim()) return [];
    const { caseSensitive = false, maxPerFile = 50, maxTotal = 500 } = opts;
    const needle = caseSensitive ? q : q.toLowerCase();
    const out: SearchMatch[] = [];

    for (const doc of docs) {
        if (out.length >= maxTotal) break;
        const lines = (doc.content ?? '').split('\n');
        let perFile = 0;
        for (let li = 0; li < lines.length && perFile < maxPerFile && out.length < maxTotal; li++) {
            const line = lines[li];
            const hay = caseSensitive ? line : line.toLowerCase();
            let from = 0;
            while (perFile < maxPerFile && out.length < maxTotal) {
                const idx = hay.indexOf(needle, from);
                if (idx === -1) break;
                out.push({
                    filepath: doc.filepath,
                    line: li + 1,
                    column: idx + 1,
                    lineText: line.trim().slice(0, 200),
                    matchText: line.slice(idx, idx + q.length),
                });
                perFile++;
                from = idx + q.length;
            }
        }
    }
    return out;
}

/** Count of files that contain at least one match (for a results header). */
export function countMatchedFiles(matches: SearchMatch[]): number {
    return new Set(matches.map(m => m.filepath)).size;
}
