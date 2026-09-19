/**
 * BackendConnectionBanner — plan 060 phase 2: the rate-limited countdown.
 * Uses vi.setSystemTime (not vi.useFakeTimers) per repo convention — the
 * component's own setInterval runs on the real clock; waitFor settles it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { backendStatusStore } from '../lib/backendStatusStore';
import BackendConnectionBanner from '../components/Shell/BackendConnectionBanner';

describe('BackendConnectionBanner', () => {
    beforeEach(() => {
        backendStatusStore.reset();
    });
    afterEach(() => {
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    it('rate-limited shows a countdown, then disappears once retryAt passes', async () => {
        // Small real-clock window (the store's auto-clear timer runs on the
        // real clock) so the test settles fast without vi.useFakeTimers.
        const retryAt = Date.now() + 100;
        backendStatusStore.markRateLimited(retryAt);

        render(<BackendConnectionBanner />);
        const banner = await screen.findByRole('status');
        expect(banner.textContent).toMatch(/Too many requests — retrying in \d+s/);

        await waitFor(() => {
            expect(screen.queryByRole('status')).toBeNull();
        }, { timeout: 2000 });
    });
});
