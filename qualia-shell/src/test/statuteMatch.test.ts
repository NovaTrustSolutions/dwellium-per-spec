import { describe, it, expect } from 'vitest';
import {
    normalizeStatute,
    extractStatuteRefs,
    buildMatchedStatutes,
    dedupMatchedStatutes,
    formatSimilarity,
    primaryStatuteLabel,
} from '../components/TranscriptionHub/statuteMatch';

describe('normalizeStatute', () => {
    it('prefixes a bare section number with canonical O.C.G.A. form', () => {
        expect(normalizeStatute('44-7-7')).toBe('O.C.G.A. § 44-7-7');
    });
    it('canonicalizes an already-cited section regardless of surrounding text', () => {
        expect(normalizeStatute('OCGA 44-7-30 et seq.')).toBe('O.C.G.A. § 44-7-30');
    });
    it('collapses whitespace and keeps a non-coded authority verbatim', () => {
        expect(normalizeStatute('  Fair   Housing  Act ')).toBe('Fair Housing Act');
    });
    it('returns empty string for null/empty', () => {
        expect(normalizeStatute(null)).toBe('');
        expect(normalizeStatute('   ')).toBe('');
    });
    it('handles sub-section parens', () => {
        expect(normalizeStatute('§ 44-7-30(a)')).toBe('O.C.G.A. § 44-7-30(a)');
    });
});

describe('extractStatuteRefs', () => {
    it('extracts a single citation', () => {
        expect(extractStatuteRefs('see O.C.G.A. § 44-7-7 for notice')).toEqual(['O.C.G.A. § 44-7-7']);
    });
    it('extracts multiple distinct citations in order', () => {
        expect(extractStatuteRefs('violates 44-7-7 and also 16-5-1')).toEqual([
            'O.C.G.A. § 44-7-7',
            'O.C.G.A. § 16-5-1',
        ]);
    });
    it('de-duplicates repeated citations', () => {
        expect(extractStatuteRefs('44-7-30 then 44-7-30 again')).toEqual(['O.C.G.A. § 44-7-30']);
    });
    it('returns empty array when no coded section present', () => {
        expect(extractStatuteRefs('the Fair Housing Act')).toEqual([]);
        expect(extractStatuteRefs(null)).toEqual([]);
        expect(extractStatuteRefs(undefined)).toEqual([]);
    });
});

describe('buildMatchedStatutes', () => {
    it('treats code_ref sections as primary (similarity 1) with summary excerpt', () => {
        const out = buildMatchedStatutes({ code_ref: 'O.C.G.A. § 44-7-7', summary: 'Improper notice timeline.' });
        expect(out).toEqual([{ volumeId: 'O.C.G.A. § 44-7-7', similarity: 1, excerpt: 'Improper notice timeline.' }]);
    });
    it('adds summary-only sections as secondary (similarity 0.6)', () => {
        const out = buildMatchedStatutes({ code_ref: '44-7-7', summary: 'Also implicates 44-7-30 on deposits.' });
        expect(out[0]).toEqual({ volumeId: 'O.C.G.A. § 44-7-7', similarity: 1, excerpt: 'Also implicates 44-7-30 on deposits.' });
        const secondary = out.find(s => s.volumeId === 'O.C.G.A. § 44-7-30');
        expect(secondary?.similarity).toBe(0.6);
    });
    it('does not double-count a section cited in both code_ref and summary', () => {
        const out = buildMatchedStatutes({ code_ref: '44-7-7', summary: 'per 44-7-7' });
        expect(out).toHaveLength(1);
        expect(out[0].similarity).toBe(1);
    });
    it('keeps a non-coded authority verbatim as a primary match', () => {
        const out = buildMatchedStatutes({ code_ref: 'Fair Housing Act', summary: 'Discriminatory language.' });
        expect(out).toEqual([{ volumeId: 'Fair Housing Act', similarity: 1, excerpt: 'Discriminatory language.' }]);
    });
    it('falls back to suggested_action for the excerpt when summary is null', () => {
        const out = buildMatchedStatutes({ code_ref: '44-7-7', summary: null, suggested_action: 'Re-issue notice.' });
        expect(out[0].excerpt).toBe('Re-issue notice.');
    });
    it('returns empty for a benign segment with no citation', () => {
        expect(buildMatchedStatutes({ code_ref: null, summary: null })).toEqual([]);
    });
});

describe('dedupMatchedStatutes', () => {
    it('de-dupes by normalized volumeId keeping max similarity, sorted desc', () => {
        const out = dedupMatchedStatutes([
            { volumeId: '44-7-7', similarity: 0.5, excerpt: 'a' },
            { volumeId: 'O.C.G.A. § 44-7-7', similarity: 0.9, excerpt: 'b' },
            { volumeId: '44-7-30', similarity: 0.6, excerpt: 'c' },
        ]);
        expect(out).toHaveLength(2);
        expect(out[0]).toEqual({ volumeId: 'O.C.G.A. § 44-7-7', similarity: 0.9, excerpt: 'a' });
        expect(out[1].volumeId).toBe('O.C.G.A. § 44-7-30');
    });
    it('backfills an excerpt from a duplicate when the winner has none', () => {
        const out = dedupMatchedStatutes([
            { volumeId: '44-7-7', similarity: 1, excerpt: '' },
            { volumeId: '44-7-7', similarity: 0.3, excerpt: 'reason' },
        ]);
        expect(out[0].excerpt).toBe('reason');
    });
    it('tolerates null/empty input', () => {
        expect(dedupMatchedStatutes(null)).toEqual([]);
        expect(dedupMatchedStatutes([])).toEqual([]);
    });
});

describe('formatSimilarity', () => {
    it('renders a whole-percentage and clamps out-of-range', () => {
        expect(formatSimilarity(1)).toBe('100%');
        expect(formatSimilarity(0.6)).toBe('60%');
        expect(formatSimilarity(1.5)).toBe('100%');
        expect(formatSimilarity(-1)).toBe('0%');
        expect(formatSimilarity(NaN)).toBe('0%');
    });
});

describe('primaryStatuteLabel', () => {
    it('returns the single top match', () => {
        expect(primaryStatuteLabel([{ volumeId: 'O.C.G.A. § 44-7-7', similarity: 1, excerpt: '' }], 'x')).toBe('O.C.G.A. § 44-7-7');
    });
    it('adds a +N suffix for multiple matches', () => {
        expect(primaryStatuteLabel([
            { volumeId: 'O.C.G.A. § 44-7-7', similarity: 1, excerpt: '' },
            { volumeId: 'O.C.G.A. § 44-7-30', similarity: 0.6, excerpt: '' },
        ], 'x')).toBe('O.C.G.A. § 44-7-7 +1');
    });
    it('uses the fallback when nothing matched', () => {
        expect(primaryStatuteLabel([], 'N/A')).toBe('N/A');
    });
});
