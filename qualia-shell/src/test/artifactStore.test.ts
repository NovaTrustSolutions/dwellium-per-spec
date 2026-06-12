/**
 * artifactStore — P12-3 Artifact Gallery (gap item 10, the video's headline
 * build): agent outputs auto-captured, typed, titled ≤5 words, summarized
 * ≤14 words.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    artifactStore,
    artifactsUserIdHolder,
    recordArtifact,
    deleteArtifact,
    togglePinArtifact,
    clearArtifacts,
    resetArtifacts,
    detectType,
    autoTitle,
    autoSummary,
    isSubstantialOutput,
} from '../lib/artifactStore';

beforeEach(() => {
    artifactsUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    resetArtifacts();
});

describe('detectType', () => {
    it('classifies the six types', () => {
        expect(detectType('data:image/png;base64,AAAA')).toBe('image');
        expect(detectType('<!DOCTYPE html><html><body>x</body></html>')).toBe('html');
        expect(detectType('{"invoice": 50000, "to": "Dana White"}')).toBe('data');
        expect(detectType('function add(a, b) { return a + b; }')).toBe('code');
        expect(detectType('# Lease Overview\n\n- term: 12mo\n- rent: $1500')).toBe('markdown');
        expect(detectType('Just a plain paragraph of prose with nothing special.')).toBe('text');
    });
});

describe('auto title + summary (video spec: ≤5 words / ≤14 words)', () => {
    it('title from the first heading, capped at 5 words', () => {
        const t = autoTitle('# Quarterly Roof Repair Vendor Cost Comparison Report\nbody', 'markdown');
        expect(t.split(' ').length).toBeLessThanOrEqual(5);
        expect(t).toContain('Quarterly');
    });

    it('summary capped at 14 words and strips markdown', () => {
        const s = autoSummary(`# Title\n${'word '.repeat(40)}`, 'markdown');
        expect(s.split(' ').length).toBeLessThanOrEqual(14);
        expect(s).not.toContain('#');
    });

    it('strips chatbot preamble from titles', () => {
        expect(autoTitle("Here's the invoice you asked for, ready to send", 'text')).not.toMatch(/^Here/i);
    });
});

describe('recordArtifact lifecycle', () => {
    it('records, dedupes immediate repeats, deletes, pins, clears', () => {
        const a = recordArtifact({ content: '# Invoice\nDana White — $50,000', source: 'ara' });
        expect(a).not.toBeNull();
        expect(a!.type).toBe('markdown');
        expect(recordArtifact({ content: '# Invoice\nDana White — $50,000', source: 'ara' })).toBeNull(); // dedupe
        const b = recordArtifact({ content: 'data:image/png;base64,QUJD', source: 'skill', type: 'image' })!;
        expect(artifactStore.getSnapshot()).toHaveLength(2);

        togglePinArtifact(b.id);
        expect(artifactStore.getSnapshot().find(x => x.id === b.id)?.pinned).toBe(true);

        deleteArtifact(a!.id);
        expect(artifactStore.getSnapshot()).toHaveLength(1);

        clearArtifacts();
        expect(artifactStore.getSnapshot()).toHaveLength(0);
    });

    it('never throws on garbage', () => {
        expect(recordArtifact({ content: '', source: 'ara' })).toBeNull();
        expect(() => recordArtifact({ content: '   ', source: 'ara' })).not.toThrow();
    });
});

describe('isSubstantialOutput (auto-capture gate)', () => {
    it('short chat replies do NOT become artifacts; long-form and images do', () => {
        expect(isSubstantialOutput('Sure — opening Strata now.')).toBe(false);
        expect(isSubstantialOutput('data:image/png;base64,AAAA')).toBe(true);
        expect(isSubstantialOutput('x'.repeat(800))).toBe(true);
    });
});
