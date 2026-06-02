import { describe, it, expect } from 'vitest';
import { identifyWithConfidence, l2normalize, type EnrolledSpeaker } from '../components/TranscriptionHub/speakerLibrary';
import { createSpeakerSmoother, clusterEmbeddings } from '../components/TranscriptionHub/speakerDiarization';
import { voicedRatio, trimSilence, shouldEmbed } from '../components/TranscriptionHub/speakerEmbedder';

const spk = (id: string, label: string, c: number[]): EnrolledSpeaker => ({
    id, label, centroid: l2normalize(c), sampleCount: 1, createdAt: '', updatedAt: '',
});

describe('#4 identifyWithConfidence — threshold + top1/top2 margin', () => {
    it('accepts a clear winner, rejects an ambiguous near-tie', () => {
        const clear = identifyWithConfidence([1, 0], [spk('a', 'Andy', [1, 0]), spk('b', 'Lisa', [0, 1])]);
        expect(clear.match?.label).toBe('Andy');
        expect(clear.margin).toBeGreaterThan(0.5);

        // Two very similar enrolled voices → top1≈top2 → no confident match
        const ambiguous = identifyWithConfidence([1, 0], [spk('a', 'Andy', [1, 0]), spk('b', 'Twin', [0.99, 0.14])]);
        expect(ambiguous.best?.label).toBe('Andy'); // still reports best
        expect(ambiguous.match).toBeNull();          // but won't confidently label
    });
    it('a single enrolled speaker matches when above threshold', () => {
        const d = identifyWithConfidence([0.9, 0.1], [spk('a', 'Andy', [1, 0])]);
        expect(d.match?.label).toBe('Andy');
    });
});

describe('#4 createSpeakerSmoother — hysteresis kills single-segment flips', () => {
    it('holds current through a stray segment, switches on a sustained change, holds on Unknown', () => {
        const sm = createSpeakerSmoother({ minSwitchStreak: 2 });
        expect(sm.push('Andy')).toBe('Andy');   // first → accept
        expect(sm.push('Lisa')).toBe('Andy');   // one stray → hold
        expect(sm.push('Lisa')).toBe('Lisa');   // sustained → switch
        expect(sm.push('Unknown')).toBe('Lisa'); // miss → hold known speaker
    });
});

describe('#5 clusterEmbeddings — groups unknown voices', () => {
    it('separates two distinct voice clusters', () => {
        const clusters = clusterEmbeddings([[1, 0], [0.98, 0.1], [0, 1], [0.1, 0.98]], 0.9);
        expect(clusters).toHaveLength(2);
        expect(clusters.every(c => c.indices.length === 2)).toBe(true);
    });
});

describe('#3 energy VAD + window gating', () => {
    it('voicedRatio is ~0 for silence and high for speech', () => {
        expect(voicedRatio(new Float32Array(16000))).toBe(0);
        expect(voicedRatio(new Float32Array(16000).fill(0.2))).toBeGreaterThan(0.9);
    });
    it('trimSilence keeps only the voiced span', () => {
        const sig = new Float32Array(12000);
        for (let i = 4000; i < 8000; i++) sig[i] = 0.2; // voiced middle
        const trimmed = trimSilence(sig);
        expect(trimmed.length).toBeLessThan(sig.length);
        expect(trimmed.length).toBeGreaterThan(0);
    });
    it('shouldEmbed rejects short or silent windows, accepts long voiced ones', () => {
        expect(shouldEmbed(new Float32Array(8000).fill(0.2), 16000)).toBe(false);   // 500ms < 800
        expect(shouldEmbed(new Float32Array(16000), 16000)).toBe(false);             // silent
        expect(shouldEmbed(new Float32Array(16000).fill(0.2), 16000)).toBe(true);    // 1s voiced
    });
});
