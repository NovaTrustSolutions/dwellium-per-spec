/**
 * markdownArrange.test — Cycle 7 pure arrange/filter engine for the Honcho
 * widget's Markdown file view. No panel render (which needs a UserProvider) —
 * the logic is fully exercised as pure functions over ConvertedFileEntry[].
 */
import { describe, it, expect } from 'vitest';
import {
    isMarkdownFile,
    markdownFiles,
    arrangeMarkdownFiles,
    displayName,
    formatBytes,
    DEFAULT_ARRANGE,
} from '../components/HonchoHermesPanel/markdownArrange';
import type { ConvertedFileEntry } from '../components/Scribe/ingestion/ingestionStore';

function entry(p: Partial<ConvertedFileEntry>): ConvertedFileEntry {
    return {
        sourceName: 'x.html',
        destName: 'x.md',
        status: 'converted',
        bytes: 0,
        convertedAt: '2026-05-29T00:00:00.000Z',
        ...p,
    };
}

const SAMPLE: ConvertedFileEntry[] = [
    entry({ sourceName: 'beta.html', destName: 'beta.md', bytes: 300, convertedAt: '2026-05-27T10:00:00.000Z' }),
    entry({ sourceName: 'alpha.txt', destName: 'alpha.md', bytes: 100, convertedAt: '2026-05-29T10:00:00.000Z' }),
    entry({ sourceName: 'notes.md', destName: 'notes.md', status: 'passthrough', bytes: 200, convertedAt: '2026-05-28T10:00:00.000Z' }),
    entry({ sourceName: 'report.pdf', destName: null, status: 'queued-backend', bytes: 0, convertedAt: '2026-05-29T11:00:00.000Z' }),
    entry({ sourceName: 'broken.html', destName: null, status: 'error', bytes: 0, convertedAt: '2026-05-29T12:00:00.000Z', note: 'read failed' }),
];

describe('markdownArrange — markdown-file selection', () => {
    it('isMarkdownFile accepts converted + passthrough with a destName', () => {
        expect(isMarkdownFile(entry({ status: 'converted', destName: 'a.md' }))).toBe(true);
        expect(isMarkdownFile(entry({ status: 'passthrough', destName: 'a.md' }))).toBe(true);
    });

    it('isMarkdownFile rejects queued-backend, error, and missing destName', () => {
        expect(isMarkdownFile(entry({ status: 'queued-backend', destName: null }))).toBe(false);
        expect(isMarkdownFile(entry({ status: 'error', destName: null }))).toBe(false);
        expect(isMarkdownFile(entry({ status: 'converted', destName: null }))).toBe(false);
    });

    it('markdownFiles excludes queued + error entries', () => {
        const md = markdownFiles(SAMPLE);
        expect(md).toHaveLength(3);
        expect(md.map(displayName).sort()).toEqual(['alpha.md', 'beta.md', 'notes.md']);
    });
});

describe('markdownArrange — sorting', () => {
    it('sorts by name ascending', () => {
        const out = arrangeMarkdownFiles(SAMPLE, { sortKey: 'name', sortDir: 'asc', filterText: '' });
        expect(out.map(displayName)).toEqual(['alpha.md', 'beta.md', 'notes.md']);
    });

    it('sorts by name descending', () => {
        const out = arrangeMarkdownFiles(SAMPLE, { sortKey: 'name', sortDir: 'desc', filterText: '' });
        expect(out.map(displayName)).toEqual(['notes.md', 'beta.md', 'alpha.md']);
    });

    it('sorts by size ascending', () => {
        const out = arrangeMarkdownFiles(SAMPLE, { sortKey: 'size', sortDir: 'asc', filterText: '' });
        expect(out.map(e => e.bytes)).toEqual([100, 200, 300]);
    });

    it('sorts by date descending (newest first) — the default arrange', () => {
        const out = arrangeMarkdownFiles(SAMPLE, DEFAULT_ARRANGE);
        expect(out.map(displayName)).toEqual(['alpha.md', 'notes.md', 'beta.md']);
    });

    it('does not mutate the input array', () => {
        const copy = SAMPLE.slice();
        arrangeMarkdownFiles(SAMPLE, { sortKey: 'size', sortDir: 'desc', filterText: '' });
        expect(SAMPLE).toEqual(copy);
    });
});

describe('markdownArrange — filtering', () => {
    it('filters by case-insensitive substring across source + dest names', () => {
        const out = arrangeMarkdownFiles(SAMPLE, { sortKey: 'name', sortDir: 'asc', filterText: 'ALP' });
        expect(out.map(displayName)).toEqual(['alpha.md']);
    });

    it('empty filter returns all markdown files', () => {
        const out = arrangeMarkdownFiles(SAMPLE, { sortKey: 'name', sortDir: 'asc', filterText: '' });
        expect(out).toHaveLength(3);
    });

    it('no-match filter returns empty', () => {
        const out = arrangeMarkdownFiles(SAMPLE, { sortKey: 'name', sortDir: 'asc', filterText: 'zzz' });
        expect(out).toHaveLength(0);
    });
});

describe('markdownArrange — formatBytes', () => {
    it('formats bytes / KB / MB and guards zero/negative', () => {
        expect(formatBytes(0)).toBe('0 B');
        expect(formatBytes(-5)).toBe('0 B');
        expect(formatBytes(512)).toBe('512 B');
        expect(formatBytes(1536)).toBe('1.5 KB');
        expect(formatBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    });
});
