import { describe, it, expect } from 'vitest';
import { downsampleTo16k, fallbackEmbedding } from '../components/TranscriptionHub/speakerEmbedder';

describe('speakerEmbedder — pure audio helpers', () => {
    it('downsampleTo16k reduces 48k → ~16k and passes through equal rate', () => {
        const in48k = new Float32Array(48000).map((_, i) => Math.sin(i / 10));
        const out = downsampleTo16k(in48k, 48000);
        expect(out.length).toBeCloseTo(16000, -2); // ~16000
        const same = new Float32Array([1, 2, 3]);
        expect(downsampleTo16k(same, 16000)).toBe(same); // no-op at target rate
        expect(downsampleTo16k(new Float32Array(0), 48000).length).toBe(0);
    });

    it('fallbackEmbedding is fixed-length and deterministic', () => {
        const sig = new Float32Array(1600).map((_, i) => Math.sin(i / 5) * (i % 7 === 0 ? 1 : 0.3));
        const a = fallbackEmbedding(sig);
        const b = fallbackEmbedding(sig);
        expect(a).toEqual(b);                 // deterministic
        expect(a).toHaveLength(32);           // 16 frames × (RMS+ZCR)
        expect(a.some(x => x > 0)).toBe(true); // non-trivial for real signal
        expect(fallbackEmbedding(new Float32Array(0))).toHaveLength(32); // safe on empty
    });
});
