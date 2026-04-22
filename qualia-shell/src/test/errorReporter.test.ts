/**
 * errorReporter Tests — Regression coverage for error tracking client
 *
 * Ensures:
 * - reportError sends POST to /api/errors/report
 * - Message and stack are truncated to limits
 * - Rate limiter blocks after 10 calls in 1 minute
 * - Errors in reporting never propagate
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('errorReporter', () => {
    let reportError: typeof import('../services/errorReporter').reportError;

    beforeEach(async () => {
        globalThis.fetch = vi.fn().mockResolvedValue({ ok: true });
        // Re-import to reset module-level state (rate limiter counters)
        vi.resetModules();
        const mod = await import('../services/errorReporter');
        reportError = mod.reportError;
    });

    it('sends POST to /api/errors/report with correct payload', () => {
        const error = new Error('Test error');

        reportError(error, 'TestComponent', { extra: 'data' });

        expect(globalThis.fetch).toHaveBeenCalledWith(
            '/api/errors/report',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Content-Type': 'application/json',
                }),
            }),
        );

        const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.message).toBe('Test error');
        expect(body.component).toBe('TestComponent');
        expect(body.level).toBe('error');
        expect(body.metadata.extra).toBe('data');
    });

    it('attaches auth token from localStorage', () => {
        localStorage.setItem('dwellium-auth-token', 'my-jwt');

        reportError(new Error('auth test'));

        const headers = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].headers;
        expect(headers['Authorization']).toBe('Bearer my-jwt');
    });

    it('accepts string errors', () => {
        reportError('string error message');

        const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.message).toBe('string error message');
    });

    it('truncates message to 2000 chars', () => {
        const longMessage = 'x'.repeat(3000);
        reportError(new Error(longMessage));

        const body = JSON.parse((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
        expect(body.message.length).toBe(2000);
    });

    it('rate-limits after 10 calls', () => {
        for (let i = 0; i < 15; i++) {
            reportError(new Error(`error ${i}`));
        }

        // Only first 10 should have triggered fetch
        expect(globalThis.fetch).toHaveBeenCalledTimes(10);
    });

    it('never throws even if fetch rejects', () => {
        (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

        // Should not throw
        expect(() => reportError(new Error('test'))).not.toThrow();
    });
});
