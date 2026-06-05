/**
 * ingestionConvert — client-side "Convert now" engine (Cycle 5).
 *
 * Enumerates a picked SOURCE directory handle, converts each browser-convertible
 * file to Markdown, writes the result into the BACKUP destination handle, and
 * returns a per-file `ConvertedFileEntry[]` for the converted-file index. The
 * non-browser-convertible types (pdf/docx/xlsx/…) are NOT touched here — they
 * are recorded as `queued-backend` so the documented `/api/ingest/convert`
 * backend route (Cycle 3 contract) can pick them up in the sibling/Electron build.
 *
 * Reuse, not re-implementation: HTML → Markdown goes through the existing
 * `htmlToMarkdown` (injectable for tests); no second converter is introduced.
 *
 * Purity / testability: the engine takes the two directory handles + a `now`
 * clock as inputs and performs no global access (no `window`, no `localStorage`,
 * no module-eval side effects), so it is fully unit-testable against fake
 * handles and stays SSR-safe by construction.
 */
import type { FsDirectoryHandle, FsFileHandle, FsHandle } from './fsAccess';
import type { ConvertedFileEntry, IngestFileStatus } from './ingestionStore';
import { htmlToMarkdown as defaultHtmlToMarkdown } from '../htmlToMarkdown';

/** Extensions converted from HTML markup to Markdown. */
const HTML_EXTS = ['.html', '.htm'];
/** Extensions copied verbatim (already Markdown). */
const PASSTHROUGH_EXTS = ['.md', '.markdown'];
/** Plain-text extensions inserted as the Markdown body verbatim. */
const TEXT_EXTS = ['.txt', '.text', '.log'];

/** Lower-cased file extension incl. the dot (".html"), or "" when none. */
function fileExt(name: string): string {
    const i = name.lastIndexOf('.');
    return i === -1 ? '' : name.slice(i).toLowerCase();
}

/** Swap any extension for `.md` (e.g. "notes.html" → "notes.md"). */
function toMarkdownName(name: string): string {
    const i = name.lastIndexOf('.');
    return (i === -1 ? name : name.slice(0, i)) + '.md';
}

export interface ConvertOptions {
    /** Source directory handle (read). */
    source: FsDirectoryHandle;
    /** Backup destination directory handle (readwrite). */
    backup: FsDirectoryHandle;
    /** Clock — returns the ISO timestamp stamped on each entry. Injected for tests. */
    now: () => string;
    /** Override the HTML→Markdown converter (defaults to the shared htmlToMarkdown). */
    htmlToMarkdown?: (html: string) => string;
}

export interface ConvertResult {
    /** Per-file outcomes, in enumeration order. */
    entries: ConvertedFileEntry[];
    /** ISO timestamp to stamp as `lastSyncAt` (the run's completion time). */
    syncedAt: string;
}

/** Write a Markdown string to `<backup>/<name>`, overwriting any existing file. */
async function writeMarkdown(backup: FsDirectoryHandle, name: string, body: string): Promise<void> {
    const handle = await backup.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(body);
    await writable.close();
}

/** Convert+write one source file, returning its index entry. */
async function convertFile(
    fileHandle: FsFileHandle,
    backup: FsDirectoryHandle,
    now: () => string,
    htmlToMarkdown: (html: string) => string,
): Promise<ConvertedFileEntry> {
    const sourceName = fileHandle.name;
    const ext = fileExt(sourceName);
    const at = now();

    // Binary / rich formats the browser can't convert — defer to the backend route.
    if (!HTML_EXTS.includes(ext) && !PASSTHROUGH_EXTS.includes(ext) && !TEXT_EXTS.includes(ext)) {
        return {
            sourceName,
            destName: null,
            status: 'queued-backend' satisfies IngestFileStatus,
            bytes: 0,
            convertedAt: at,
            note: 'Needs backend conversion (/api/ingest/convert) — not browser-convertible.',
        };
    }

    try {
        const file = await fileHandle.getFile();
        const bytes = typeof file.size === 'number' ? file.size : 0;
        const raw = await file.text();

        let body: string;
        let status: IngestFileStatus;
        if (HTML_EXTS.includes(ext)) {
            body = htmlToMarkdown(raw);
            status = 'converted';
        } else if (PASSTHROUGH_EXTS.includes(ext)) {
            body = raw;
            status = 'passthrough';
        } else {
            // Plain text → already valid Markdown; copy the body verbatim.
            body = raw;
            status = 'converted';
        }

        const destName = PASSTHROUGH_EXTS.includes(ext) ? sourceName : toMarkdownName(sourceName);
        await writeMarkdown(backup, destName, body);

        return { sourceName, destName, status, bytes, convertedAt: at };
    } catch (err) {
        return {
            sourceName,
            destName: null,
            status: 'error' satisfies IngestFileStatus,
            bytes: 0,
            convertedAt: at,
            note: err instanceof Error ? err.message : 'Conversion failed.',
        };
    }
}

/**
 * Run a full "Convert now" pass: enumerate the source folder's top-level files,
 * convert+write each, and return the index entries + completion timestamp.
 *
 * Top-level only (no recursion in the web build) — sub-directories are skipped;
 * deep-tree walking is a backend-watcher concern per the Cycle-3 contract.
 */
export async function convertFolder(opts: ConvertOptions): Promise<ConvertResult> {
    const { source, backup, now } = opts;
    const htmlToMarkdown = opts.htmlToMarkdown ?? defaultHtmlToMarkdown;
    const entries: ConvertedFileEntry[] = [];

    for await (const entry of source.values() as AsyncIterableIterator<FsHandle>) {
        if (entry.kind !== 'file') continue; // skip sub-directories (flat pass)
        entries.push(await convertFile(entry, backup, now, htmlToMarkdown));
    }

    return { entries, syncedAt: now() };
}
