import { describe, it, expect } from 'vitest';
import { resolveStatus, summarize, HEALTH_ITEMS, type HealthItem, type HealthCtx } from '../lib/systemHealth';

const item = (over: Partial<HealthItem>): HealthItem => ({ id: 'x', label: 'X', requires: 'backend', downText: '', ...over });
const ctx = (o: Partial<HealthCtx>): HealthCtx => ({ backendOk: false, llmOk: false, externalOk: {}, ...o });

describe('systemHealth.resolveStatus', () => {
    it('local is always ok', () => {
        expect(resolveStatus(item({ requires: 'local' }), ctx({}))).toBe('ok');
    });
    it('llm: ok when configured, down otherwise', () => {
        expect(resolveStatus(item({ requires: 'llm' }), ctx({ llmOk: true }))).toBe('ok');
        expect(resolveStatus(item({ requires: 'llm' }), ctx({ llmOk: false }))).toBe('down');
    });
    it('external: uses externalOk[id]', () => {
        expect(resolveStatus(item({ id: 'lf', requires: 'external' }), ctx({ externalOk: { lf: true } }))).toBe('ok');
        expect(resolveStatus(item({ id: 'lf', requires: 'external' }), ctx({ externalOk: { lf: false } }))).toBe('down');
    });
    it('backend: ok when reachable', () => {
        expect(resolveStatus(item({ requires: 'backend' }), ctx({ backendOk: true }))).toBe('ok');
    });
    it('backend: degraded when down but llmFallback + llm configured', () => {
        expect(resolveStatus(item({ requires: 'backend', llmFallback: true }), ctx({ backendOk: false, llmOk: true }))).toBe('degraded');
    });
    it('backend: down when no fallback', () => {
        expect(resolveStatus(item({ requires: 'backend' }), ctx({ backendOk: false, llmOk: true }))).toBe('down');
    });
    it('backend: down when fallback but no llm', () => {
        expect(resolveStatus(item({ requires: 'backend', llmFallback: true }), ctx({ backendOk: false, llmOk: false }))).toBe('down');
    });
});

describe('systemHealth.summarize', () => {
    it('counts statuses + allReady (down === 0)', () => {
        expect(summarize(['ok', 'ok', 'degraded', 'down'])).toEqual({ ok: 2, degraded: 1, down: 1, total: 4, allReady: false });
        expect(summarize(['ok', 'degraded'])).toEqual({ ok: 1, degraded: 1, down: 0, total: 2, allReady: true });
    });
});

describe('systemHealth registry', () => {
    it('includes the key AI widgets', () => {
        const ids = HEALTH_ITEMS.map((i) => i.id);
        for (const id of ['backend', 'llm', 'stella-agent', 'transcription', 'langflow', 'paperclip', 'open-notebook']) {
            expect(ids).toContain(id);
        }
    });
    it('every item has a downText and a label', () => {
        for (const i of HEALTH_ITEMS) { expect(i.label).toBeTruthy(); expect(typeof i.downText).toBe('string'); }
    });
});
