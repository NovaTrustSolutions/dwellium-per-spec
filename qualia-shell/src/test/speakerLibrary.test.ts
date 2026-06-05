import { describe, it, expect } from 'vitest';
import {
    l2normalize,
    cosineSimilarity,
    meanVector,
    updateCentroid,
    identifySpeaker,
    DEFAULT_MATCH_THRESHOLD,
    type EnrolledSpeaker,
} from '../components/TranscriptionHub/speakerLibrary';

const spk = (id: string, label: string, centroid: number[]): EnrolledSpeaker => ({
    id, label, centroid: l2normalize(centroid), sampleCount: 1,
    createdAt: '2026-06-02T00:00:00Z', updatedAt: '2026-06-02T00:00:00Z',
});

describe('speakerLibrary — matching math', () => {
    it('l2normalize produces a unit vector', () => {
        const n = l2normalize([3, 4]);
        expect(n[0]).toBeCloseTo(0.6, 6);
        expect(n[1]).toBeCloseTo(0.8, 6);
        expect(Math.hypot(...n)).toBeCloseTo(1, 6);
        expect(l2normalize([0, 0])).toEqual([0, 0]); // zero vector safe
    });

    it('cosineSimilarity: identical=1, orthogonal=0, opposite=-1, mismatched=0', () => {
        expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
        expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 6);
        expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 6);
        expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    });

    it('meanVector averages element-wise', () => {
        expect(meanVector([[1, 1], [3, 3]])).toEqual([2, 2]);
        expect(meanVector([])).toEqual([]);
    });

    it('updateCentroid folds a sample in and stays unit-length', () => {
        const c = l2normalize([1, 0]);
        const updated = updateCentroid(c, 1, [0, 1]); // should move toward [0,1]
        expect(updated[1]).toBeGreaterThan(0);
        expect(Math.hypot(...updated)).toBeCloseTo(1, 6);
        // first sample (count 0) just normalizes the embedding
        expect(updateCentroid([], 0, [0, 5])).toEqual([0, 1]);
    });

    it('identifySpeaker returns the best match above threshold, else null', () => {
        const lib = [spk('s1', 'Andy', [1, 0]), spk('s2', 'Lisa', [0, 1])];
        // Clearly Andy
        const m = identifySpeaker([10, 1], lib);
        expect(m?.id).toBe('s1');
        expect(m?.label).toBe('Andy');
        expect(m!.score).toBeGreaterThanOrEqual(DEFAULT_MATCH_THRESHOLD);
        // Ambiguous (equidistant ≈0.707 < 0.72) → unknown
        expect(identifySpeaker([1, 1], lib)).toBeNull();
        // No enrolled speakers → unknown
        expect(identifySpeaker([1, 0], [])).toBeNull();
        // Empty embedding → unknown
        expect(identifySpeaker([], lib)).toBeNull();
    });
});
