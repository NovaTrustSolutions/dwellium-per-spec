import { describe, it, expect } from 'vitest';
import { resolveStatus, summarize, HEALTH_ITEMS, backendConnectionText, type HealthItem, type HealthCtx } from '../lib/systemHealth';

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

describe('systemHealth.backendConnectionText', () => {
    it('shows the real port for a localhost API_BASE', () => {
        const t = backendConnectionText('http://localhost:3000');
        expect(t.ok).toBe('Connected on :3000');
        expect(t.down).toContain(':3000');
    });

    it('shows a different local port when API_BASE uses one', () => {
        const t = backendConnectionText('http://127.0.0.1:4001');
        expect(t.ok).toBe('Connected on :4001');
    });

    it('never shows :3000 for a deployed (non-localhost) API_BASE — shows the host instead', () => {
        const t = backendConnectionText('https://dwellium-backend-abc123-uc.a.run.app');
        expect(t.ok).not.toContain(':3000');
        expect(t.down).not.toContain(':3000');
        expect(t.ok).toBe('Connected (dwellium-backend-abc123-uc.a.run.app)');
        expect(t.down).toContain('dwellium-backend-abc123-uc.a.run.app');
    });

    it('HEALTH_ITEMS.backend copy is wired to backendConnectionText(API_BASE), not a separate hardcoded string', async () => {
        const { API_BASE } = await import('../config');
        const backendItem = HEALTH_ITEMS.find(i => i.id === 'backend')!;
        const expected = backendConnectionText(API_BASE);
        expect(backendItem.okText).toBe(expected.ok);
        expect(backendItem.downText).toBe(expected.down);
    });
});
