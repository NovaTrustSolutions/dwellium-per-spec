import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import StellaAgent from '../components/StellaAgent/StellaAgent';

const mockFetch = vi.fn();
const origFetch = globalThis.fetch;

// Mock scrollIntoView (not implemented in jsdom)
Element.prototype.scrollIntoView = vi.fn();

function json(data: any, ok = true): Response {
    return { ok, status: ok ? 200 : 500, json: async () => data, headers: new Headers() } as Response;
}

describe('StellaAgent', () => {
    beforeEach(() => {
        globalThis.fetch = mockFetch;
        mockFetch.mockReset();
        localStorage.clear();

        // Auto-init on mount (POST /api/stella/init + GET /api/stella/status)
        mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (typeof url !== 'string') return json({ success: false }, false);

            if (url.includes('/stella/init') && opts?.method === 'POST') {
                return json({ success: true });
            }
            if (url.includes('/stella/status')) {
                return json({
                    success: true,
                    data: {
                        status: 'online',
                        liveCheck: { ok: true, version: '1.2.0', ms: 42 },
                        pid: 12345,
                        provider: 'openai',
                        model: 'gpt-4o-mini',
                    },
                });
            }
            if (url.includes('/stella/chat') && opts?.method === 'POST') {
                return json({
                    success: true,
                    data: { text: 'Hello from Stella!' },
                });
            }
            if (url.includes('/stella/skills')) {
                return json({
                    success: true,
                    data: [
                        { name: 'web-search', content: 'Search the web', source: 'builtin', enabled: true },
                        { name: 'code-review', content: 'Review code', source: 'custom', enabled: false },
                    ],
                });
            }
            if (url.includes('/stella/memory')) {
                return json({
                    success: true,
                    data: [
                        { filename: 'context.md', path: '/memory/context.md', size: 1024, created_time: '2026-03-20', modified_time: '2026-03-21' },
                    ],
                });
            }
            if (url.includes('/stella/voice-status')) {
                return json({ success: true, data: { online: false, url: 'http://localhost:3001' } });
            }
            return json({ success: false }, false);
        });
    });

    afterEach(() => {
        globalThis.fetch = origFetch;
    });

    it('renders tab bar with all 5 tabs', async () => {
        render(<StellaAgent />);
        expect(screen.getByText('💬 Chat')).toBeInTheDocument();
        expect(screen.getByText('🧩 Skills')).toBeInTheDocument();
        expect(screen.getByText('📂 Memory')).toBeInTheDocument();
        expect(screen.getByText('🎙️ Voice')).toBeInTheDocument();
        expect(screen.getByText('⚙️ Settings')).toBeInTheDocument();
    });

    it('shows Stella Online after init + status check', async () => {
        render(<StellaAgent />);
        await waitFor(() => {
            expect(screen.getByText(/Stella Online/)).toBeInTheDocument();
        });
    });

    it('shows version and latency when online', async () => {
        render(<StellaAgent />);
        await waitFor(() => {
            expect(screen.getByText('v1.2.0')).toBeInTheDocument();
            expect(screen.getByText('42ms')).toBeInTheDocument();
        });
    });

    it('shows welcome message in chat tab', async () => {
        render(<StellaAgent />);
        expect(screen.getByText(/Stella connected/)).toBeInTheDocument();
    });

    it('sends a message and receives a response', async () => {
        const user = userEvent.setup();
        render(<StellaAgent />);

        await waitFor(() => {
            expect(screen.getByText(/Stella Online/)).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText('Ask Stella anything…');
        await user.type(input, 'Hello');
        await user.click(screen.getByTitle('Send'));

        await waitFor(() => {
            expect(screen.getByText('Hello from Stella!')).toBeInTheDocument();
        });
    });

    it('switches to Skills tab and shows skills', async () => {
        const user = userEvent.setup();
        render(<StellaAgent />);

        await waitFor(() => {
            expect(screen.getByText(/Stella Online/)).toBeInTheDocument();
        });

        await user.click(screen.getByText('🧩 Skills'));

        await waitFor(() => {
            expect(screen.getByText('web-search')).toBeInTheDocument();
            expect(screen.getByText('code-review')).toBeInTheDocument();
        });
    });

    it('switches to Memory tab and shows files', async () => {
        const user = userEvent.setup();
        render(<StellaAgent />);

        await waitFor(() => {
            expect(screen.getByText(/Stella Online/)).toBeInTheDocument();
        });

        await user.click(screen.getByText('📂 Memory'));

        await waitFor(() => {
            expect(screen.getByText(/context\.md/)).toBeInTheDocument();
        });
    });

    it('switches to Settings tab and shows provider config', async () => {
        const user = userEvent.setup();
        render(<StellaAgent />);

        await user.click(screen.getByText('⚙️ Settings'));

        expect(screen.getByText('🔧 Stella Configuration')).toBeInTheDocument();
        expect(screen.getByText('LLM Provider')).toBeInTheDocument();
    });

    it('shows offline banner and retry/initialize buttons when offline', async () => {
        mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (typeof url !== 'string') return json({ success: false }, false);
            if (url.includes('/stella/init')) return json({ success: true });
            if (url.includes('/stella/status')) {
                return json({
                    success: true,
                    data: {
                        status: 'offline',
                        liveCheck: { ok: false },
                    },
                });
            }
            return json({ success: false }, false);
        });

        render(<StellaAgent />);

        await waitFor(() => {
            expect(screen.getByText(/Stella is not running/)).toBeInTheDocument();
        });

        expect(screen.getByText('Retry')).toBeInTheDocument();
        expect(screen.getByText('Initialize')).toBeInTheDocument();
    });
});
