/**
 * llmStream + araPrefsStore — assessment sweep 2026-06-12 (C8 foundation,
 * upgrade #6/#10). The streaming-shaped API works today via single-shot
 * fallback; ARA prefs default OFF (zero behavior change).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { streamLlm, STREAMING_AVAILABLE } from '../lib/llmStream';
import { araPrefsStore, DEFAULT_ARA_PREFS } from '../lib/araPrefsStore';
import * as llmClient from '../lib/llmClient';

describe('streamLlm (single-shot fallback today)', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('yields one final event with the full text', async () => {
        vi.spyOn(llmClient, 'callLlm').mockResolvedValue({ text: 'hello world', provider: 'openai', model: 'x' });
        const events = [];
        const gen = streamLlm({ prompt: 'hi' }, {} as any);
        let r = await gen.next();
        while (!r.done) { events.push(r.value); r = await gen.next(); }
        expect(events).toEqual([{ delta: 'hello world', text: 'hello world', done: true }]);
        expect(r.value).toBe('hello world');
    });

    it('returns null when no provider is configured', async () => {
        vi.spyOn(llmClient, 'callLlm').mockResolvedValue(null);
        const gen = streamLlm({ prompt: 'hi' }, {} as any);
        const r = await gen.next();
        expect(r.done).toBe(true);
        expect(r.value).toBeNull();
    });

    it('advertises streaming as not-yet-available (honest)', () => {
        expect(STREAMING_AVAILABLE).toBe(false);
    });
});

describe('araPrefsStore', () => {
    beforeEach(() => araPrefsStore.reset());

    it('defaults all prefs OFF (ARA unchanged until opt-in)', () => {
        expect(araPrefsStore.getSnapshot()).toEqual(DEFAULT_ARA_PREFS);
        expect(DEFAULT_ARA_PREFS.streamTokens).toBe(false);
    });

    it('set + reset round-trips', () => {
        araPrefsStore.set('streamTokens', true);
        expect(araPrefsStore.getSnapshot().streamTokens).toBe(true);
        araPrefsStore.reset();
        expect(araPrefsStore.getSnapshot().streamTokens).toBe(false);
    });
});
