import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mock react-markdown and remark-gfm (avoid ESM issues in jsdom) ──────
vi.mock('react-markdown', () => ({
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: {} }));

import OpenJarvisWidget from '../components/OpenJarvis/OpenJarvis';
import { UserContext } from '../context/UserContext';

const mockFetch = vi.fn();
const origFetch = globalThis.fetch;
const GOOGLE_USER_CONTEXT = {
    user: {
        id: 'google-user-1',
        email: 'ilya@gmail.com',
        name: 'Ilya',
        role: 'god',
        assignedProperties: [],
        active: true,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
    },
} as any;

function renderWidget() {
    return render(
        <UserContext.Provider value={GOOGLE_USER_CONTEXT}>
            <OpenJarvisWidget />
        </UserContext.Provider>,
    );
}

describe('OpenJarvisWidget', () => {
    beforeEach(() => {
        globalThis.fetch = mockFetch;
        mockFetch.mockReset();
        localStorage.clear();
        // Prevent health check from erroring
        mockFetch.mockImplementation(async (url: string) => {
            if (typeof url === 'string' && url.includes('/health')) {
                return { ok: true, status: 200, json: async () => ({ status: 'ok' }) } as Response;
            }
            throw new Error(`Unmocked: ${url}`);
        });
    });

    afterEach(() => {
        globalThis.fetch = origFetch;
    });

    it('renders the floating pill button when closed', () => {
        renderWidget();
        expect(screen.getByTitle('Open Antigravity (⌘J)')).toBeInTheDocument();
    });

    it('opens panel when pill is clicked', async () => {
        const user = userEvent.setup();
        renderWidget();

        await user.click(screen.getByTitle('Open Antigravity (⌘J)'));

        expect(screen.getByText('Antigravity')).toBeInTheDocument();
    });

    it('shows greeting when panel is open with no messages', async () => {
        const user = userEvent.setup();
        renderWidget();

        await user.click(screen.getByTitle('Open Antigravity (⌘J)'));

        const greetingPattern = /Good (morning|afternoon|evening), Ilya/;
        await waitFor(() => {
            expect(screen.getByText(greetingPattern)).toBeInTheDocument();
        });
    });

    it('has a textarea for input when panel is open', async () => {
        const user = userEvent.setup();
        renderWidget();

        await user.click(screen.getByTitle('Open Antigravity (⌘J)'));

        expect(screen.getByPlaceholderText(/Ask Antigravity/i)).toBeInTheDocument();
    });

    it('persists panel state to localStorage', async () => {
        const user = userEvent.setup();
        renderWidget();

        await user.click(screen.getByTitle('Open Antigravity (⌘J)'));

        expect(localStorage.getItem('dwellium-jarvis-panel')).toBe('open');
    });

    it('restores open state from localStorage', async () => {
        localStorage.setItem('dwellium-jarvis-panel', 'open');
        renderWidget();

        // Should show the panel header (Antigravity title) rather than the pill
        expect(screen.getByText('Antigravity')).toBeInTheDocument();
    });

    it('shows connection status dot', async () => {
        renderWidget();
        // Pill button contains status dot
        const pill = screen.getByTitle('Open Antigravity (⌘J)');
        expect(pill.querySelector('.oj-status-dot')).toBeInTheDocument();
    });
});
