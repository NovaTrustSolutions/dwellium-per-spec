/**
 * Cycle 5 — ingestionConvert "Convert now" engine tests.
 *
 * Exercises the enumerate → convert → backup-write pass against FAKE File System
 * Access handles (no jsdom FS API). Covers:
 *   - html → markdown via the (injectable) htmlToMarkdown
 *   - .md / .markdown passthrough (verbatim, original name kept)
 *   - .txt plain-text → markdown body verbatim, renamed to .md
 *   - pdf/docx → queued-backend (not read, destName null, note set)
 *   - sub-directories skipped (flat pass)
 *   - per-file read/write errors recorded as status 'error'
 *   - written bodies + filenames land in the backup handle
 *
 * Deterministic clock injected via `now` (no fake timers — Phase-7 Finding (B)).
 */
import { describe, it, expect } from 'vitest';
import { convertFolder } from '../components/Scribe/ingestion/ingestionConvert';
import type { FsDirectoryHandle, FsFileHandle, FsHandle, FsWritableStream } from '../components/Scribe/ingestion/fsAccess';

/** A fake source file handle backed by an in-memory string. */
function fakeFile(name: string, content: string, opts: { throwOnRead?: boolean } = {}): FsFileHandle {
    return {
        kind: 'file',
        name,
        async getFile(): Promise<File> {
            if (opts.throwOnRead) throw new Error('read failed');
            return {
                size: content.length,
                text: async () => content,
            } as unknown as File;
        },
        async createWritable(): Promise<FsWritableStream> {
            throw new Error('source files are not written');
        },
    };
}

/** A fake sub-directory handle (should be skipped by the flat pass). */
function fakeSubdir(name: string): FsDirectoryHandle {
    return {
        kind: 'directory',
        name,
        async *values() { /* empty */ },
        getFileHandle: async () => { throw new Error('nope'); },
        getDirectoryHandle: async () => { throw new Error('nope'); },
    };
}

/** A fake backup directory that records everything written into it. */
function fakeBackup(opts: { throwOnWrite?: boolean } = {}) {
    const written: Record<string, string> = {};
    const handle: FsDirectoryHandle = {
        kind: 'directory',
        name: 'Backup',
        async *values() { /* not enumerated */ },
        async getFileHandle(name: string): Promise<FsFileHandle> {
            if (opts.throwOnWrite) throw new Error('write denied');
            return {
                kind: 'file',
                name,
                getFile: async () => { throw new Error('not read'); },
                async createWritable(): Promise<FsWritableStream> {
                    return {
                        async write(data) { written[name] = String(data); },
                        async close() { /* no-op */ },
                    };
                },
            };
        },
        getDirectoryHandle: async () => { throw new Error('nope'); },
    };
    return { handle, written };
}

/** A source directory yielding the given child handles. */
function fakeSource(children: FsHandle[]): FsDirectoryHandle {
    return {
        kind: 'directory',
        name: 'Source',
        async *values() { for (const c of children) yield c; },
        getFileHandle: async () => { throw new Error('nope'); },
        getDirectoryHandle: async () => { throw new Error('nope'); },
    };
}

const CLOCK = () => '2026-05-29T00:00:00.000Z';

describe('convertFolder', () => {
    it('converts html → markdown via the injected converter and writes <base>.md', async () => {
        const source = fakeSource([fakeFile('notes.html', '<h1>Hi</h1>')]);
        const { handle: backup, written } = fakeBackup();

        const { entries, syncedAt } = await convertFolder({
            source, backup, now: CLOCK,
            htmlToMarkdown: () => '# Hi',
        });

        expect(syncedAt).toBe('2026-05-29T00:00:00.000Z');
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
            sourceName: 'notes.html',
            destName: 'notes.md',
            status: 'converted',
            bytes: '<h1>Hi</h1>'.length,
            convertedAt: '2026-05-29T00:00:00.000Z',
        });
        expect(written['notes.md']).toBe('# Hi');
    });

    it('passes through .md and .markdown verbatim, keeping the original name', async () => {
        const source = fakeSource([
            fakeFile('a.md', '# Already markdown'),
            fakeFile('b.markdown', '## Also markdown'),
        ]);
        const { handle: backup, written } = fakeBackup();

        const { entries } = await convertFolder({ source, backup, now: CLOCK });

        expect(entries.map((e) => e.status)).toEqual(['passthrough', 'passthrough']);
        expect(entries[0].destName).toBe('a.md');
        expect(entries[1].destName).toBe('b.markdown');
        expect(written['a.md']).toBe('# Already markdown');
        expect(written['b.markdown']).toBe('## Also markdown');
    });

    it('treats .txt as a markdown body and renames to .md', async () => {
        const source = fakeSource([fakeFile('log.txt', 'plain line one\nline two')]);
        const { handle: backup, written } = fakeBackup();

        const { entries } = await convertFolder({ source, backup, now: CLOCK });

        expect(entries[0]).toMatchObject({ sourceName: 'log.txt', destName: 'log.md', status: 'converted' });
        expect(written['log.md']).toBe('plain line one\nline two');
    });

    it('returns markdown document bodies for files it converts or passes through', async () => {
        const source = fakeSource([
            fakeFile('log.txt', 'plain line one\nline two'),
            fakeFile('already.md', '# Existing'),
        ]);
        const { handle: backup } = fakeBackup();

        const result = await convertFolder({ source, backup, now: CLOCK });

        expect((result as any).documents).toEqual([
            { sourceName: 'log.txt', destName: 'log.md', content: 'plain line one\nline two' },
            { sourceName: 'already.md', destName: 'already.md', content: '# Existing' },
        ]);
    });

    it('queues pdf/docx for the backend without reading or writing them', async () => {
        const source = fakeSource([
            fakeFile('report.pdf', 'BINARY'),
            fakeFile('memo.docx', 'BINARY'),
        ]);
        const { handle: backup, written } = fakeBackup();

        const { entries } = await convertFolder({ source, backup, now: CLOCK });

        expect(entries).toHaveLength(2);
        for (const e of entries) {
            expect(e.status).toBe('queued-backend');
            expect(e.destName).toBeNull();
            expect(e.bytes).toBe(0);
            expect(e.note).toMatch(/backend conversion/i);
        }
        expect(Object.keys(written)).toHaveLength(0);
    });

    it('skips sub-directories (flat pass)', async () => {
        const source = fakeSource([fakeSubdir('nested'), fakeFile('x.md', '# x')]);
        const { handle: backup } = fakeBackup();

        const { entries } = await convertFolder({ source, backup, now: CLOCK });

        expect(entries).toHaveLength(1);
        expect(entries[0].sourceName).toBe('x.md');
    });

    it('records a read failure as status error', async () => {
        const source = fakeSource([fakeFile('bad.md', '', { throwOnRead: true })]);
        const { handle: backup } = fakeBackup();

        const { entries } = await convertFolder({ source, backup, now: CLOCK });

        expect(entries[0]).toMatchObject({ sourceName: 'bad.md', status: 'error', destName: null });
        expect(entries[0].note).toBe('read failed');
    });

    it('records a write failure as status error', async () => {
        const source = fakeSource([fakeFile('ok.html', '<p>hi</p>')]);
        const { handle: backup } = fakeBackup({ throwOnWrite: true });

        const { entries } = await convertFolder({ source, backup, now: CLOCK, htmlToMarkdown: () => 'hi' });

        expect(entries[0].status).toBe('error');
        expect(entries[0].note).toBe('write denied');
    });

    it('returns an empty index for an empty source folder', async () => {
        const source = fakeSource([]);
        const { handle: backup } = fakeBackup();

        const { entries } = await convertFolder({ source, backup, now: CLOCK });

        expect(entries).toEqual([]);
    });
});
