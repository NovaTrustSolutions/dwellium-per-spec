/**
 * StrataDashboard — plan 055 phase 2 widget-memory round-trip.
 *
 * Seed memory → mount → the remembered module's nav item is active and the
 * remembered search query seeds the GlobalSearch box; click another module →
 * the memory slice updates. An unknown module falls back to overview.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({
            user: { id: 'andy' },
            role: 'god',
            token: 'test-token',
            authFetch: vi.fn(),
            hasMinRole: () => true,
            hasPermission: () => true,
            isAuthenticated: true,
            logout: vi.fn(),
        }),
    };
});

import StrataDashboard from '../components/StrataDashboard/StrataDashboard';
import { patchWidgetMemory, readWidgetMemory, resetWidgetMemory, widgetMemoryUserIdHolder } from '../lib/widgetMemory';

function jsonRes(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
    localStorage.clear();
    widgetMemoryUserIdHolder.current = null;
    resetWidgetMemory(); // v2.72.1 standing convention
    vi.stubGlobal('fetch', vi.fn(async () => jsonRes({ success: true, data: [] })));
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

const activeNavButton = (): HTMLElement | undefined =>
    Array.from(document.querySelectorAll('.s-nav-item')).find(b => b.classList.contains('active')) as HTMLElement | undefined;

describe('StrataDashboard widget memory', () => {
    it('reopens on the remembered module with the remembered search query; clicks update memory', () => {
        patchWidgetMemory('strata-dashboard', {
            activeModule: 'vendors',
            searchQuery: 'woodland leak',
            searchNavTarget: { type: 'vendor', id: 'v-gone-42' },
        });
        render(<StrataDashboard />);
        expect(activeNavButton()?.textContent).toContain('Vendors');
        expect(screen.getByPlaceholderText(/Search/)).toHaveValue('woodland leak');

        fireEvent.click(screen.getByRole('button', { name: /Residents/ }));
        expect(readWidgetMemory('strata-dashboard', { activeModule: 'overview' }).activeModule).toBe('residents');
    });

    it('an unknown remembered module falls back to overview', () => {
        patchWidgetMemory('strata-dashboard', { activeModule: 'module-that-was-removed' });
        render(<StrataDashboard />);
        expect(activeNavButton()?.textContent).toContain('Overview');
    });
});
