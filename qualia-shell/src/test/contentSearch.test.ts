/**
 * System-wide content search engine (spec §2.5).
 */
import { describe, it, expect } from 'vitest';
import { searchCorpus, type SearchDoc } from '../components/ContentSearch/searchEngine';

const docs: SearchDoc[] = [
    { id: '1', type: 'wiki', title: 'Vendor Compliance', body: 'tracking certificates of insurance', widget: 'wiki' },
    { id: '2', type: 'dump', title: 'Random note', body: 'the vendor vendor vendor appears three times', widget: 'scribe' },
    { id: '3', type: 'file', title: 'lease.md', body: 'Acme/Legal/lease.md', widget: 'file-explorer' },
];

describe('searchCorpus', () => {
    it('returns [] for an empty query', () => {
        expect(searchCorpus('', docs)).toEqual([]);
        expect(searchCorpus('   ', docs)).toEqual([]);
    });

    it('ranks a title match above body-only matches', () => {
        const hits = searchCorpus('vendor', docs);
        // doc1 title "Vendor Compliance" (+5) beats doc2 body x3 (score 3)
        expect(hits[0].id).toBe('1');
        expect(hits.map((h) => h.id)).toContain('2');
    });

    it('counts body occurrences toward score', () => {
        const hits = searchCorpus('vendor', docs);
        const d2 = hits.find((h) => h.id === '2')!;
        expect(d2.score).toBe(3); // three "vendor" occurrences, not in title
    });

    it('builds a snippet around the match', () => {
        const hits = searchCorpus('insurance', docs);
        expect(hits[0].snippet.toLowerCase()).toContain('insurance');
    });

    it('matches file names', () => {
        const hits = searchCorpus('lease', docs);
        expect(hits.some((h) => h.type === 'file')).toBe(true);
    });
});
