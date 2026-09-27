/**
 * Synthesis / compounding-loop store (spec §7.3).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    synthesisStore, synthesisUserIdHolder, captureSynthesis, removeSynthesis, clearSyntheses,
    buildSecondLayerPrompt, MAX_SYNTHESES,
} from '../components/Synthesis/synthesisStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    synthesisStore.reset();
    synthesisUserIdHolder.current = null;
});

describe('captureSynthesis', () => {
    it('captures most-recent-first using the caller-supplied id', () => {
        const a = captureSynthesis({ id: 'a', query: 'q1', result: 'r1', layer: 1, parentId: null }, NOW);
        expect(a.ok).toBe(true);
        if (!a.ok) throw new Error('unreachable');
        const b = captureSynthesis({ id: 'b', query: 'q2', result: 'r2', layer: 2, parentId: a.synthesis.id }, NOW);
        expect(b.ok).toBe(true);
        if (!b.ok) throw new Error('unreachable');
        expect(b.synthesis.id).toBe('b');
        const snap = synthesisStore.getSnapshot();
        expect(snap[0].query).toBe('q2');     // newest first
        expect(snap[1].query).toBe('q1');
        expect(snap[0].layer).toBe(2);
        expect(snap[0].parentId).toBe(a.synthesis.id);
    });

    it('ignores an empty result', () => {
        const r = captureSynthesis({ id: 'x', query: 'q', result: '   ', layer: 1, parentId: null }, NOW);
        expect(r).toEqual({ ok: false, reason: 'empty' });
        expect(synthesisStore.getSnapshot()).toEqual([]);
    });

    it('persists per-user and survives reset', () => {
        synthesisUserIdHolder.current = 'andy';
        captureSynthesis({ id: 'a', query: 'q', result: 'r', layer: 1, parentId: null }, NOW);
        expect(localStorage.getItem('dwellium:synthesis:andy')).toBeTruthy();
        synthesisStore.reset();
        expect(synthesisStore.getSnapshot()[0].result).toBe('r');
    });

    it('lands in the owner-scoped key from synthesisUserIdHolder', () => {
        synthesisUserIdHolder.current = 'andy';
        captureSynthesis({ id: 'a', query: 'q', result: 'r', layer: 1, parentId: null }, NOW);
        expect(localStorage.getItem('dwellium:synthesis:andy')).toBeTruthy();
        expect(localStorage.getItem('dwellium:synthesis:_anonymous')).toBeNull();
    });

    it('re-capturing the same id replaces it in place instead of duplicating', () => {
        captureSynthesis({ id: 'a', query: 'q1', result: 'r1', layer: 1, parentId: null }, NOW);
        captureSynthesis({ id: 'b', query: 'q2', result: 'r2', layer: 1, parentId: null }, NOW);
        const edited = captureSynthesis({ id: 'a', query: 'q1-edited', result: 'r1-edited', layer: 1, parentId: null }, NOW);
        expect(edited.ok).toBe(true);
        const snap = synthesisStore.getSnapshot();
        expect(snap.length).toBe(2);
        expect(snap[0].id).toBe('a');
        expect(snap[0].result).toBe('r1-edited');
    });

    it('caps at MAX_SYNTHESES, dropping the oldest', () => {
        for (let i = 0; i < MAX_SYNTHESES + 5; i++) {
            captureSynthesis({ id: `s${i}`, query: `q${i}`, result: `r${i}`, layer: 1, parentId: null }, NOW);
        }
        const snap = synthesisStore.getSnapshot();
        expect(snap.length).toBe(MAX_SYNTHESES);
        // newest survives, oldest (s0..s4) were dropped
        expect(snap[0].id).toBe(`s${MAX_SYNTHESES + 4}`);
        expect(snap.find((x) => x.id === 's0')).toBeUndefined();
        expect(snap.find((x) => x.id === 's4')).toBeUndefined();
    });

    it('returns {ok:false, reason:"quota"} and leaves the store unchanged on QuotaExceededError', () => {
        captureSynthesis({ id: 'a', query: 'q1', result: 'r1', layer: 1, parentId: null }, NOW);
        const before = synthesisStore.getSnapshot();
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('full', 'QuotaExceededError');
        });
        const r = captureSynthesis({ id: 'b', query: 'q2', result: 'r2', layer: 1, parentId: null }, NOW);
        spy.mockRestore();
        expect(r).toEqual({ ok: false, reason: 'quota' });
        expect(synthesisStore.getSnapshot()).toEqual(before);
    });

    it('accepts in-memory on a non-quota throw (sandboxed/private mode)', () => {
        const spy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError');
        });
        const r = captureSynthesis({ id: 'a', query: 'q1', result: 'r1', layer: 1, parentId: null }, NOW);
        spy.mockRestore();
        expect(r.ok).toBe(true);
        expect(synthesisStore.getSnapshot()[0]?.id).toBe('a');
    });

    it('clearSyntheses wipes the corpus', () => {
        captureSynthesis({ id: 'a', query: 'q', result: 'r', layer: 1, parentId: null }, NOW);
        clearSyntheses();
        expect(synthesisStore.getSnapshot()).toEqual([]);
    });
});

describe('removeSynthesis', () => {
    it('removes only the matching id and persists', () => {
        captureSynthesis({ id: 'a', query: 'q1', result: 'r1', layer: 1, parentId: null }, NOW);
        captureSynthesis({ id: 'b', query: 'q2', result: 'r2', layer: 1, parentId: null }, NOW);
        removeSynthesis('a');
        const snap = synthesisStore.getSnapshot();
        expect(snap.length).toBe(1);
        expect(snap[0].id).toBe('b');
        const persisted = JSON.parse(localStorage.getItem('dwellium:synthesis:_anonymous')!);
        expect(persisted.length).toBe(1);
    });

    it('is a no-op for an unknown id', () => {
        captureSynthesis({ id: 'a', query: 'q1', result: 'r1', layer: 1, parentId: null }, NOW);
        const before = synthesisStore.getSnapshot();
        removeSynthesis('does-not-exist');
        expect(synthesisStore.getSnapshot()).toEqual(before);
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
