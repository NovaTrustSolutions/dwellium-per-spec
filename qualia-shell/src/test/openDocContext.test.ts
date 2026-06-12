/**
 * openDocContext — 2026-06-12 (Ilya): ARA reads the Markdown file open in
 * Scribe ("Ara, review the Markdown file open and look for inconsistencies")
 * without copy-paste.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    detectsOpenDocRequest,
    getActiveScribeDoc,
    buildOpenDocPrompt,
    OPEN_DOC_MAX_CHARS,
} from '../lib/openDocContext';
import { useScribeStore } from '../components/Scribe/scribeStore';

beforeEach(() => {
    useScribeStore.setState({ openFiles: [], activeFilepath: null });
});

describe('detectsOpenDocRequest', () => {
    it("matches Ilya's exact phrasing", () => {
        expect(detectsOpenDocRequest('Ara, review the Markdown file open and look for inconsistencies')).toBe(true);
    });

    it('matches order variants', () => {
        expect(detectsOpenDocRequest('review the open markdown file')).toBe(true);
        expect(detectsOpenDocRequest('check the current document for typos')).toBe(true);
        expect(detectsOpenDocRequest('summarize this file')).toBe(true);
        expect(detectsOpenDocRequest('proofread the doc I have open in scribe')).toBe(true);
        expect(detectsOpenDocRequest('what is wrong with the md file on my screen')).toBe(true);
    });

    it('does NOT match ordinary chat or commands', () => {
        expect(detectsOpenDocRequest('open strata')).toBe(false);
        expect(detectsOpenDocRequest('what is a markdown file')).toBe(false); // no open-word
        expect(detectsOpenDocRequest('review the lease terms')).toBe(false); // no file-word
        expect(detectsOpenDocRequest('open the notepad')).toBe(false); // no action verb on a doc
    });
});

describe('getActiveScribeDoc', () => {
    it('null when Scribe has nothing open', () => {
        expect(getActiveScribeDoc()).toBeNull();
    });

    it('returns the ACTIVE file with title derived from the path', () => {
        useScribeStore.setState({
            openFiles: [
                { filepath: 'notes/other.md', content: 'other', dirty: false, scrollTop: 0 },
                { filepath: 'notes/spec.md', content: '# Spec\nbody', dirty: true, scrollTop: 0 },
            ],
            activeFilepath: 'notes/spec.md',
        });
        expect(getActiveScribeDoc()).toMatchObject({
            filepath: 'notes/spec.md',
            title: 'spec.md',
            content: '# Spec\nbody',
            dirty: true,
        });
    });
});

describe('buildOpenDocPrompt', () => {
    const doc = { filepath: 'a/b.md', title: 'b.md', content: 'hello world', dirty: false };

    it('embeds instruction, title, path, and full content with end fence', () => {
        const p = buildOpenDocPrompt('find inconsistencies', doc);
        expect(p).toContain('find inconsistencies');
        expect(p).toContain('OPEN DOCUMENT: b.md (a/b.md)');
        expect(p).toContain('hello world');
        expect(p).toContain('END DOCUMENT');
    });

    it('truncates oversized documents with an honest note', () => {
        const big = { ...doc, content: 'x'.repeat(OPEN_DOC_MAX_CHARS + 500) };
        const p = buildOpenDocPrompt('review', big, OPEN_DOC_MAX_CHARS);
        expect(p).toContain('[Document truncated');
        expect(p.length).toBeLessThan(OPEN_DOC_MAX_CHARS + 400);
    });
});
