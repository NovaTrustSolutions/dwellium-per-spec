/**
 * systemHealthCmn.test.ts — tests for Cognitive Memory Network health probing
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveStatus, probeLocal, HEALTH_ITEMS, type HealthCtx } from '../lib/systemHealth';
import { getCmn, resetCmnForTests } from '../lib/memoryGraphRag/shared';

describe('systemHealthCmn', () => {
    beforeEach(() => {
        resetCmnForTests();
    });

    describe('resolveStatus', () => {
        it('returns "down" when ctx.localOk[item.id].ok is false', () => {
            const item = HEALTH_ITEMS.find((i) => i.id === 'memory-graph-rag')!;
            const ctx: HealthCtx = {
                backendOk: true,
                llmOk: true,
                externalOk: {},
                localOk: { 'memory-graph-rag': { ok: false, detail: 'Engine failed' } },
            };
            expect(resolveStatus(item, ctx)).toBe('down');
        });

        it('returns "ok" when ctx.localOk[item.id].ok is true', () => {
            const item = HEALTH_ITEMS.find((i) => i.id === 'memory-graph-rag')!;
            const ctx: HealthCtx = {
                backendOk: true,
                llmOk: true,
                externalOk: {},
                localOk: { 'memory-graph-rag': { ok: true, detail: '5 passages' } },
            };
            expect(resolveStatus(item, ctx)).toBe('ok');
        });

        it('returns "ok" when ctx.localOk is undefined', () => {
            const item = HEALTH_ITEMS.find((i) => i.id === 'memory-graph-rag')!;
            const ctx: HealthCtx = {
                backendOk: true,
                llmOk: true,
                externalOk: {},
            };
            expect(resolveStatus(item, ctx)).toBe('ok');
        });

        it('returns "ok" when localOk entry does not exist', () => {
            const item = HEALTH_ITEMS.find((i) => i.id === 'memory-graph-rag')!;
            const ctx: HealthCtx = {
                backendOk: true,
                llmOk: true,
                externalOk: {},
                localOk: {},
            };
            expect(resolveStatus(item, ctx)).toBe('ok');
        });
    });

    describe('probeLocal', () => {
        it('returns ok:true with detail "Not started yet" when no CMN exists', () => {
            const probe = probeLocal();
            expect(probe['memory-graph-rag'].ok).toBe(true);
            expect(probe['memory-graph-rag'].detail).toBe('Not started yet');
        });

        it('returns the live CMN probe once getCmn has been created', async () => {
            const cmn = getCmn('test-user');
            await cmn.ready;
            const probe = probeLocal();
            expect(probe['memory-graph-rag'].ok).toBe(true);
            expect(probe['memory-graph-rag'].detail).toContain('passages');
        });
    });
});
