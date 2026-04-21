import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock UserContext with correct relative path from test file ───────────
vi.mock('../context/UserContext', () => ({
    useUser: () => ({ authFetch: mockAuthFetch, isAuthenticated: true }),
}));

// ── Mock config ─────────────────────────────────────────────────────────
vi.mock('../config', () => ({
    API_BASE: 'http://localhost:3000',
}));

const mockAuthFetch = vi.fn();

// Mock ResizeObserver
class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
}
globalThis.ResizeObserver = MockResizeObserver as any;

import Terminal from '../components/Terminal/Terminal';

function json(data: any, ok = true, status = 200): Response {
    return { ok, status, json: async () => data, headers: new Headers() } as Response;
}

describe('Terminal', () => {
    beforeEach(() => {
        mockAuthFetch.mockReset();

        // Capabilities + session creation
        mockAuthFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (url.includes('/capabilities')) {
                return json({
                    success: true,
                    data: {
                        shell: '/bin/zsh',
                        cwd: '/Users/test',
                        tools: [
                            { name: 'node', available: true },
                            { name: 'git', available: true },
                        ],
                    },
                });
            }
            if (url.includes('/sessions') && opts?.method === 'POST') {
                return json({
                    success: true,
                    data: {
                        session: {
                            id: 'sess-1',
                            shell: '/bin/zsh',
                            cwd: '/Users/test',
                            cols: 80,
                            rows: 24,
                            startedAt: new Date().toISOString(),
                            lastActiveAt: new Date().toISOString(),
                            closedAt: null,
                            exitCode: null,
                        },
                        nextCursor: 0,
                        chunks: [{ data: '$ ' }],
                    },
                });
            }
            if (url.includes('/output')) {
                return json({ success: true, data: { chunks: [], nextCursor: 0, session: null } });
            }
            if (url.includes('/input') && opts?.method === 'POST') {
                return json({ success: true });
            }
            if (url.includes('/signal') && opts?.method === 'POST') {
                return json({ success: true });
            }
            if (url.includes('/resize') && opts?.method === 'POST') {
                return json({ success: true });
            }
            if (opts?.method === 'DELETE') {
                return json({ success: true });
            }
            return json({ success: false, error: 'Unknown endpoint' }, false, 404);
        });
    });

    it('renders header with terminal title', async () => {
        render(<Terminal />);
        expect(screen.getByText('Workspace Terminal')).toBeInTheDocument();
    });

    it('shows initial output from session creation', async () => {
        render(<Terminal />);
        await waitFor(() => {
            expect(screen.getByText(/\$/)).toBeInTheDocument();
        });
    });

    it('shows tools from capabilities', async () => {
        render(<Terminal />);
        await waitFor(() => {
            expect(screen.getByText('node')).toBeInTheDocument();
            expect(screen.getByText('git')).toBeInTheDocument();
        });
    });

    it('has Restart and Focus buttons', async () => {
        render(<Terminal />);
        expect(screen.getByText('Restart')).toBeInTheDocument();
        expect(screen.getByText('Focus')).toBeInTheDocument();
    });

    it('has signal buttons (Ctrl+C, Ctrl+D)', async () => {
        render(<Terminal />);
        expect(screen.getByText('Ctrl+C')).toBeInTheDocument();
        expect(screen.getByText('Ctrl+D')).toBeInTheDocument();
    });

    it('sends command via the command input form', async () => {
        const user = userEvent.setup();
        render(<Terminal />);

        // Wait for session to be created
        await waitFor(() => {
            expect(screen.getByText(/\$/)).toBeInTheDocument();
        });

        const commandInput = screen.getByPlaceholderText('Run a command or launch a CLI like claude');
        await user.type(commandInput, 'ls -la');
        await user.click(screen.getByText('Run'));

        await waitFor(() => {
            const inputCall = mockAuthFetch.mock.calls.find(
                (call: any[]) => String(call[0]).includes('/input') && call[1]?.method === 'POST'
            );
            expect(inputCall).toBeTruthy();
            const body = JSON.parse(inputCall![1].body);
            expect(body.input).toContain('ls -la');
        });
    });

    it('sends SIGINT when Ctrl+C button is clicked', async () => {
        const user = userEvent.setup();
        render(<Terminal />);

        await waitFor(() => {
            expect(screen.getByText(/\$/)).toBeInTheDocument();
        });

        await user.click(screen.getByText('Ctrl+C'));

        await waitFor(() => {
            const signalCall = mockAuthFetch.mock.calls.find(
                (call: any[]) => String(call[0]).includes('/signal') && call[1]?.method === 'POST'
            );
            expect(signalCall).toBeTruthy();
            const body = JSON.parse(signalCall![1].body);
            expect(body.signal).toBe('SIGINT');
        });
    });
});
