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

// ── Mock xterm.js — the live session renders through it; assert on term.write ──
const mockTerm = vi.hoisted(() => ({
    open: vi.fn(), write: vi.fn(), onData: vi.fn(), clear: vi.fn(),
    dispose: vi.fn(), loadAddon: vi.fn(), focus: vi.fn(), cols: 80, rows: 24,
}));
vi.mock('@xterm/xterm', () => ({ Terminal: class { constructor() { return mockTerm; } } }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit = vi.fn(); } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

import Terminal from '../components/Terminal/Terminal';

function json(data: any, ok = true, status = 200): Response {
    return { ok, status, json: async () => data, headers: new Headers({ 'content-type': 'application/json' }) } as Response;
}

describe('Terminal', () => {
    beforeEach(() => {
        mockAuthFetch.mockReset();
        mockTerm.write.mockClear();
        mockTerm.onData.mockClear();
        mockTerm.clear.mockClear();

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
        // Live output renders through xterm.js now; assert it received the chunk.
        await waitFor(() => {
            expect(mockTerm.write).toHaveBeenCalledWith('$ ');
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
            expect(mockTerm.write).toHaveBeenCalled();
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
            expect(mockTerm.write).toHaveBeenCalled();
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

    it('falls back to an honest offline local shell when the backend is unavailable', async () => {
        mockAuthFetch.mockReset();
        mockAuthFetch.mockImplementation(async (url: string) => {
            if (String(url).includes('/capabilities')) return json({ success: false }, false, 404);
            return json({ success: false, error: 'no backend' }, false, 404);
        });
        const user = userEvent.setup();
        render(<Terminal />);
        // Honest banner instead of a misleading "Terminal ready" dead state.
        await waitFor(() => {
            expect(screen.getByText(/Backend terminal unavailable/i)).toBeInTheDocument();
        });
        // A local command actually runs.
        const input = screen.getByPlaceholderText('Run a command or launch a CLI like claude');
        await user.type(input, 'echo hi there');
        await user.click(screen.getByText('Run'));
        await waitFor(() => {
            expect(screen.getByText(/hi there/)).toBeInTheDocument();
        });
    });

    it('treats a malformed capabilities response (no cwd) as offline, not a crash', async () => {
        // Reproduces the live bug: backend returns success but no data.cwd →
        // old code threw "Cannot read properties of undefined (reading 'cwd')".
        mockAuthFetch.mockReset();
        mockAuthFetch.mockImplementation(async (url: string) => {
            if (String(url).includes('/capabilities')) return json({ success: true }); // success, but NO data
            return json({ success: false }, false, 404);
        });
        render(<Terminal />);
        await waitFor(() => {
            expect(screen.getByText(/Backend terminal unavailable/i)).toBeInTheDocument();
        });
        // The cryptic crash text must NOT appear.
        expect(screen.queryByText(/Cannot read properties/i)).not.toBeInTheDocument();
    });

    it('connects with the REAL flat backend response shape + streams data.output (live fix)', async () => {
        // The backend returns capabilities + sessions FLAT ({ success, shell, cwd,
        // tools } / { success, session }) and output as data.output (a STRING) — not
        // the nested {data:{…}} / chunks[] shape the frontend originally assumed.
        // Before the fix this ALWAYS dropped to the offline shell, so commands never
        // hit the real backend. Now it must connect and stream.
        mockAuthFetch.mockReset();
        mockAuthFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (String(url).includes('/capabilities')) {
                return json({ success: true, shell: '/bin/zsh', cwd: '/Users/test', tools: [{ name: 'git', available: true }] });
            }
            if (String(url).includes('/sessions') && opts?.method === 'POST') {
                return json({ success: true, session: { id: 'sess-flat', shell: '/bin/zsh', cwd: '/Users/test', cols: 80, rows: 24, startedAt: new Date().toISOString(), lastActiveAt: new Date().toISOString(), closedAt: null, exitCode: null } });
            }
            if (String(url).includes('/output')) {
                return json({ success: true, data: { output: 'flat-shell-live\n', cursor: 10, session: null } });
            }
            return json({ success: true });
        });
        render(<Terminal />);
        // Capabilities parsed from the FLAT shape → tools render, and we are NOT offline.
        await waitFor(() => {
            expect(screen.getByText('git')).toBeInTheDocument();
        });
        expect(screen.queryByText(/Backend terminal unavailable/i)).not.toBeInTheDocument();
        // Output streamed via data.output (string) → rendered through xterm.write.
        await waitFor(() => {
            expect(mockTerm.write).toHaveBeenCalledWith('flat-shell-live\n');
        });
    });
});
