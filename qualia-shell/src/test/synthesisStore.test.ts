/**
 * Synthesis / compounding-loop store (spec §7.3).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    synthesisStore, synthesisUserIdHolder, captureSynthesis, clearSyntheses, buildSecondLayerPrompt,
} from '../components/Synthesis/synthesisStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    synthesisStore.reset();
    synthesisUserIdHolder.current = null;
});

describe('captureSynthesis', () => {
    it('captures most-recent-first and stamps an id', () => {
        const a = captureSynthesis({ query: 'q1', result: 'r1' }, NOW)!;
        const b = captureSynthesis({ query: 'q2', result: 'r2', layer: 2, parentId: a.id }, NOW)!;
        expect(b.id).toMatch(/^syn-|[0-9a-f-]{8}/);
        const snap = synthesisStore.getSnapshot();
        expect(snap[0].query).toBe('q2');     // newest first
        expect(snap[1].query).toBe('q1');
        expect(snap[0].layer).toBe(2);
        expect(snap[0].parentId).toBe(a.id);
    });

    it('ignores an empty result', () => {
        expect(captureSynthesis({ query: 'q', result: '   ' }, NOW)).toBeNull();
        expect(synthesisStore.getSnapshot()).toEqual([]);
    });

    it('persists per-user and survives reset', () => {
        synthesisUserIdHolder.current = 'andy';
        captureSynthesis({ query: 'q', result: 'r' }, NOW);
        expect(localStorage.getItem('dwellium:synthesis:andy')).toBeTruthy();
        synthesisStore.reset();
        expect(synthesisStore.getSnapshot()[0].result).toBe('r');
    });

    it('clearSyntheses wipes the corpus', () => {
        captureSynthesis({ query: 'q', result: 'r' }, NOW);
        clearSyntheses();
        expect(synthesisStore.getSnapshot()).toEqual([]);
    });
});

describe('buildSecondLayerPrompt', () => {
    it('embeds the original query and prior synthesis', () => {
        const p = buildSecondLayerPrompt('What drives churn?', 'Pricing and onboarding friction.', 'pricing');
        expect(p).toContain('Original question: What drives churn?');
        expect(p).toContain('Pricing and onboarding friction.');
        expect(p).toContain('Focus this second pass on: pricing');
    });

    it('uses a default focus line when no follow-up is given', () => {
        const p = buildSecondLayerPrompt('Q', 'S');
        expect(p).toContain('sharper, more complete second-layer synthesis');
    });
});
