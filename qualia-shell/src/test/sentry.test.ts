/**
 * sentry.test — privacy contract for the Sentry user context (plan 012).
 *
 * `setSentryUser` must forward only non-PII identifiers (`id`, `username`) and
 * must NOT forward `email`. We mock `@sentry/react` and stub a DSN so the module
 * initializes, then assert the payload handed to `Sentry.setUser`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const setUserMock = vi.fn();
const initMock = vi.fn();

vi.mock('@sentry/react', () => ({
    init: initMock,
    setUser: setUserMock,
    browserTracingIntegration: () => ({}),
    replayIntegration: () => ({}),
    withScope: vi.fn(),
    captureException: vi.fn(),
    setTag: vi.fn(),
    setExtras: vi.fn(),
}));

// A non-empty DSN so initSentry() runs instead of no-opping.
vi.stubEnv('VITE_SENTRY_DSN', 'https://examplePublicKey@o0.ingest.sentry.io/0');

describe('setSentryUser — PII minimization', () => {
    beforeEach(() => {
        setUserMock.mockClear();
    });

    it('forwards id + username but never email', async () => {
        const { initSentry, setSentryUser } = await import('../services/sentry');
        initSentry();

        setSentryUser({ id: 'user-uuid-123', email: 'secret@example.com', role: 'admin' });

        expect(setUserMock).toHaveBeenCalledTimes(1);
        const payload = setUserMock.mock.calls[0][0];
        expect(payload).toMatchObject({ id: 'user-uuid-123', username: 'admin' });
        expect(payload).not.toHaveProperty('email');
        // Belt-and-suspenders: the email value must not appear anywhere.
        expect(JSON.stringify(payload)).not.toContain('secret@example.com');
    });
});
