import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mock react-markdown and remark-gfm (avoid ESM issues in jsdom) ──────
vi.mock('react-markdown', () => ({
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
}));
vi.mock('remark-gfm', () => ({ default: {} }));

import OpenJarvisWidget from '../components/OpenJarvis/OpenJarvis';

const mockFetch = vi.fn();
const origFetch = globalThis.fetch;

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
        render(<OpenJarvisWidget />);
        expect(screen.getByTitle('Open Jarvis (⌘J)')).toBeInTheDocument();
    });

    it('opens panel when pill is clicked', async () => {
        const user = userEvent.setup();
        render(<OpenJarvisWidget />);

        await user.click(screen.getByTitle('Open Jarvis (⌘J)'));

        expect(screen.getByText('Jarvis')).toBeInTheDocument();
    });

    it('shows greeting when panel is open with no messages', async () => {
        const user = userEvent.setup();
        render(<OpenJarvisWidget />);

        await user.click(screen.getByTitle('Open Jarvis (⌘J)'));

        // The greeting says "Good morning/afternoon/evening, Andy"
        const greetingPattern = /Good (morning|afternoon|evening), Andy/;
        await waitFor(() => {
            expect(screen.getByText(greetingPattern)).toBeInTheDocument();
        });
    });

    it('has a textarea for input when panel is open', async () => {
        const user = userEvent.setup();
        render(<OpenJarvisWidget />);

        await user.click(screen.getByTitle('Open Jarvis (⌘J)'));

        expect(screen.getByPlaceholderText(/Message Jarvis/i)).toBeInTheDocument();
    });

    it('persists panel state to localStorage', async () => {
        const user = userEvent.setup();
        render(<OpenJarvisWidget />);

        await user.click(screen.getByTitle('Open Jarvis (⌘J)'));

        expect(localStorage.getItem('dwellium-jarvis-panel')).toBe('open');
    });

    it('restores open state from localStorage', async () => {
        localStorage.setItem('dwellium-jarvis-panel', 'open');
        render(<OpenJarvisWidget />);

        // Should show the panel header (Jarvis title) rather than the pill
        expect(screen.getByText('Jarvis')).toBeInTheDocument();
    });

    it('shows connection status dot', async () => {
        render(<OpenJarvisWidget />);
        // Pill button contains status dot
        const pill = screen.getByTitle('Open Jarvis (⌘J)');
        expect(pill.querySelector('.oj-status-dot')).toBeInTheDocument();
    });
});
