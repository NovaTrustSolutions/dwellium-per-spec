/**
 * Cycle 15 — ThoughtWeaver ↔ ARA ↔ Honcho linkage.
 *
 * Unit-tests the pure helpers in `thoughtWeaverLinkage.ts` with injected side effects /
 * direct input, so no live ARA backend, no rendered widget, and no real localStorage is
 * needed (mirrors ARAConsole.linkage.test.ts / Workspace.scribe.test.ts). Covers:
 *   TW → ARA   — composeCaptureContext / composeInsightContext / sendToAra
 *                (injected dispatch + default `scribe:send-to-ara` bus + null no-op)
 *   TW → Honcho — saveToHonchoMemory (injected append + default openWidget bus + suppress)
 *                + captureToHonchoSeed / insightToHonchoSeed
 *   pull       — buildTwContextDigest (captures + insights, caps, empty-safe)
 */
import { describe, it, expect, vi } from 'vitest';
import {
    composeCaptureContext,
    composeInsightContext,
    sendToAra,
    saveToHonchoMemory,
    captureToHonchoSeed,
    insightToHonchoSeed,
    buildTwContextDigest,
    type SendToAraDeps,
    type SaveToHonchoDeps,
} from '../components/ThoughtWeaver/thoughtWeaverLinkage';
import type { DreamEntry } from '../components/StellaAgent/honchoDreamStore';

describe('thoughtWeaverLinkage — TW → ARA compose', () => {
    it('composeCaptureContext includes the bucket + suggested destination', () => {
        const out = composeCaptureContext({ text: 'call the plumber', filed_to: 'admin', destination_name: 'Maintenance' });
        expect(out).not.toBeNull();
        expect(out!.text).toBe('call the plumber (filed under admin → Maintenance)');
        expect(out!.preface).toContain('captured');
    });

    it('composeCaptureContext omits the destination clause when none', () => {
        const out = composeCaptureContext({ text: 'idea about onboarding', filed_to: 'ideas', destination_name: null });
        expect(out!.text).toBe('idea about onboarding (filed under ideas)');
    });

    it('composeCaptureContext returns null for empty text', () => {
        expect(composeCaptureContext({ text: '   ', filed_to: 'ideas', destination_name: null })).toBeNull();
    });

    it('composeInsightContext prefixes the kind', () => {
        const out = composeInsightContext({ text: 'meetings cluster on Wednesdays', kind: 'pattern' });
        expect(out!.text).toBe('[pattern] meetings cluster on Wednesdays');
        expect(out!.preface).toContain('insight');
    });

    it('composeInsightContext returns null for empty text', () => {
        expect(composeInsightContext({ text: '', kind: 'connection' })).toBeNull();
    });
});

describe('thoughtWeaverLinkage — sendToAra', () => {
    it('calls an injected dispatch with the context', () => {
        const dispatch = vi.fn();
        const deps: SendToAraDeps = { dispatch };
        const ok = sendToAra({ text: 'hi', preface: 'p' }, deps);
        expect(ok).toBe(true);
        expect(dispatch).toHaveBeenCalledWith({ text: 'hi', preface: 'p' });
    });

    it('no-ops (returns false, no dispatch) for null context', () => {
        const dispatch = vi.fn();
        expect(sendToAra(null, { dispatch })).toBe(false);
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('defaults to firing the scribe:send-to-ara bus ARA already listens for', () => {
        const handler = vi.fn();
        window.addEventListener('scribe:send-to-ara', handler);
        try {
            const ok = sendToAra({ text: 'note', preface: 'context:' });
            expect(ok).toBe(true);
            expect(handler).toHaveBeenCalledTimes(1);
            const detail = (handler.mock.calls[0][0] as CustomEvent).detail;
            expect(detail).toEqual({ text: 'note', preface: 'context:' });
        } finally {
            window.removeEventListener('scribe:send-to-ara', handler);
        }
    });
});

describe('thoughtWeaverLinkage — saveToHonchoMemory', () => {
    const fakeEntry: DreamEntry = { id: 'd1', title: 't', text: 'x', sources: [], createdAt: '2026-05-29T00:00:00Z' };

    it('appends a trimmed memory via the injected append + surfaces the Honcho widget', () => {
        const append = vi.fn().mockReturnValue(fakeEntry);
        const openWidget = vi.fn();
        const deps: SaveToHonchoDeps = { append, openWidget };
        const out = saveToHonchoMemory({ title: ' Note ', text: ' body ', sources: ['c1'] }, deps);
        expect(out).toBe(fakeEntry);
        expect(append).toHaveBeenCalledWith({ title: 'Note', text: 'body', sources: ['c1'] });
        expect(openWidget).toHaveBeenCalledWith('honcho', 'Honcho', 'brain-circuit');
    });

    it('falls back to a title when the seed title is blank', () => {
        const append = vi.fn().mockReturnValue(fakeEntry);
        saveToHonchoMemory({ title: '   ', text: 'remember this', sources: [] }, { append, openWidget: null });
        expect(append).toHaveBeenCalledWith(expect.objectContaining({ title: 'Captured note', text: 'remember this' }));
    });

    it('does not surface the widget when openWidget is suppressed (null)', () => {
        const append = vi.fn().mockReturnValue(fakeEntry);
        const out = saveToHonchoMemory({ title: 'a', text: 'b', sources: [] }, { append, openWidget: null });
        expect(out).toBe(fakeEntry);
        // no throw, no widget bus — suppression honored
    });

    it('returns null for an empty seed and never appends', () => {
        const append = vi.fn();
        expect(saveToHonchoMemory(null, { append })).toBeNull();
        expect(saveToHonchoMemory({ title: 't', text: '  ', sources: [] }, { append })).toBeNull();
        expect(append).not.toHaveBeenCalled();
    });

    it('captureToHonchoSeed / insightToHonchoSeed build correct seeds', () => {
        const cap = captureToHonchoSeed({ id: 'c1', text: 'buy milk', destination_name: 'Groceries', filed_to: 'admin' });
        expect(cap).toEqual({ title: 'Groceries', text: 'buy milk', sources: ['c1'] });

        const capNoDest = captureToHonchoSeed({ id: 'c2', text: 'long thought here', destination_name: null, filed_to: 'ideas' });
        expect(capNoDest!.title).toBe('ideas: long thought here');
        expect(capNoDest!.sources).toEqual(['c2']);

        const ins = insightToHonchoSeed({ id: 'i1', text: 'pattern found', kind: 'pattern' });
        expect(ins).toEqual({ title: 'Insight (pattern)', text: 'pattern found', sources: ['i1'] });

        expect(captureToHonchoSeed({ id: 'x', text: '  ', destination_name: null, filed_to: 'ideas' })).toBeNull();
        expect(insightToHonchoSeed({ id: 'x', text: '', kind: 'suggestion' })).toBeNull();
    });
});

describe('thoughtWeaverLinkage — buildTwContextDigest (pull payload)', () => {
    it('renders captures + insights as Markdown', () => {
        const digest = buildTwContextDigest(
            [{ text: 'call plumber', filed_to: 'admin' }, { text: 'app idea', filed_to: 'ideas' }],
            [{ text: 'you defer admin tasks', kind: 'pattern' }],
        );
        expect(digest).toContain('# ThoughtWeaver context');
        expect(digest).toContain('## Recent captures');
        expect(digest).toContain('- call plumber _(admin)_');
        expect(digest).toContain('## Insights');
        expect(digest).toContain('- **pattern:** you defer admin tasks');
    });

    it('caps captures + insights to the requested maxima, newest-first order preserved', () => {
        const caps = Array.from({ length: 12 }, (_, i) => ({ text: `c${i}`, filed_to: 'ideas' }));
        const ins = Array.from({ length: 9 }, (_, i) => ({ text: `i${i}`, kind: 'connection' as const }));
        const digest = buildTwContextDigest(caps, ins, { maxCaptures: 3, maxInsights: 2 });
        expect(digest).toContain('- c0 _(ideas)_');
        expect(digest).toContain('- c2 _(ideas)_');
        expect(digest).not.toContain('- c3 _(ideas)_');
        expect(digest).toContain('- **connection:** i1');
        expect(digest).not.toContain('- **connection:** i2');
    });

    it('skips a section with no usable rows and returns empty string when both are empty', () => {
        const onlyInsights = buildTwContextDigest([], [{ text: 'lone insight', kind: 'suggestion' }]);
        expect(onlyInsights).toContain('## Insights');
        expect(onlyInsights).not.toContain('## Recent captures');
        expect(buildTwContextDigest([], [])).toBe('');
        expect(buildTwContextDigest([{ text: '  ', filed_to: 'ideas' }], [])).toBe('');
    });
});
