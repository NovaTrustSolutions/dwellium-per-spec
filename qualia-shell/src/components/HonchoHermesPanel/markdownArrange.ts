/**
 * markdownArrange — pure sort/filter engine for the Honcho widget's Markdown
 * arrange/filter view (Cycle 7).
 *
 * The Honcho standalone widget lists the converted .md files recorded in the
 * Scribe ingestion index (`ingestionStore.converted`) and lets the user arrange
 * them by name / size / date and narrow by a text filter. All of that logic
 * lives here as pure functions over `ConvertedFileEntry[]` so it is fully
 * unit-testable without rendering the panel (which needs a UserProvider) — the
 * panel is a thin presentation layer over these helpers.
 *
 * "Markdown files" = entries that actually produced a `.md` artifact in the
 * backup destination: `converted` (html/txt → md) or `passthrough` (already md).
 * `queued-backend` (pdf/docx awaiting /api/ingest/convert) and `error` entries
 * are NOT markdown files and are excluded from this view by `markdownFiles()`.
 *
 * No window / localStorage / module-eval side effects — SSR-safe by construction.
 */
import type { ConvertedFileEntry } from '../Scribe/ingestion/ingestionStore';

/** Sort dimension for the arrange view. */
export type MdSortKey = 'name' | 'size' | 'date';
/** Sort direction. */
export type MdSortDir = 'asc' | 'desc';

export interface MdArrangeOptions {
    sortKey: MdSortKey;
    sortDir: MdSortDir;
    /** Case-insensitive substring match against source + dest names ('' = no filter). */
    filterText: string;
}

export const DEFAULT_ARRANGE: MdArrangeOptions = {
    sortKey: 'date',
    sortDir: 'desc',
    filterText: '',
};

/** True when an index entry produced a Markdown artifact in the backup folder. */
export function isMarkdownFile(e: ConvertedFileEntry): boolean {
    return (e.status === 'converted' || e.status === 'passthrough') && !!e.destName;
}

/** The Markdown-artifact subset of an ingestion index (order preserved). */
export function markdownFiles(entries: ConvertedFileEntry[]): ConvertedFileEntry[] {
    return entries.filter(isMarkdownFile);
}

/** The label shown for a file row — the produced .md name, falling back to source. */
export function displayName(e: ConvertedFileEntry): string {
    return e.destName ?? e.sourceName;
}

function matchesFilter(e: ConvertedFileEntry, needle: string): boolean {
    if (!needle) return true;
    const q = needle.toLowerCase();
    return (
        e.sourceName.toLowerCase().includes(q) ||
        (e.destName ? e.destName.toLowerCase().includes(q) : false)
    );
}

function compare(a: ConvertedFileEntry, b: ConvertedFileEntry, key: MdSortKey): number {
    switch (key) {
        case 'size':
            return a.bytes - b.bytes;
        case 'date':
            // ISO timestamps sort lexicographically; localeCompare keeps '' last-stable.
            return a.convertedAt.localeCompare(b.convertedAt);
        case 'name':
        default:
            return displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
    }
}

/**
 * Filter to Markdown files, narrow by `filterText`, and sort by the chosen key +
 * direction. Returns a new array (input is never mutated).
 */
export function arrangeMarkdownFiles(
    entries: ConvertedFileEntry[],
    opts: MdArrangeOptions,
): ConvertedFileEntry[] {
    const filtered = markdownFiles(entries).filter((e) => matchesFilter(e, opts.filterText));
    const dir = opts.sortDir === 'asc' ? 1 : -1;
    // Slice first so the sort doesn't mutate the source array.
    return filtered.slice().sort((a, b) => compare(a, b, opts.sortKey) * dir);
}

/** Compact human-readable byte size ("0 B", "1.4 KB", "2.0 MB"). */
export function formatBytes(bytes: number): string {
    if (!bytes || bytes < 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
}
