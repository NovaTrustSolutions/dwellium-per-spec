import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockAuthFetch = vi.fn();

vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({ authFetch: mockAuthFetch, isAuthenticated: true }),
    };
});

vi.mock('../config', () => ({
    API_BASE: 'http://localhost:3000',
}));

// Spy-able AnamAdapter mock — captures every instance so tests can assert
// connect()/disconnect() were called with the right args.
const adapterInstances: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    mute: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
    talk: ReturnType<typeof vi.fn>;
    onStateChange: ReturnType<typeof vi.fn>;
    _emit?: (state: string, detail?: string) => void;
}> = [];

vi.mock('../components/AvatarHarness/AnamAdapter', () => {
    class MockAnamAdapter {
        connect = vi.fn(async (_token: string, _videoId: string) => {
            this._emit?.('connected');
        });
        disconnect = vi.fn(async () => {
            this._emit?.('idle');
        });
        mute = vi.fn();
        interrupt = vi.fn();
        talk = vi.fn(async () => {});
        _listeners: Array<(state: string, detail?: string) => void> = [];
        onStateChange = vi.fn((cb: (state: string, detail?: string) => void) => {
            this._listeners.push(cb);
            return () => {
                this._listeners = this._listeners.filter((l) => l !== cb);
            };
        });
        _emit(state: string, detail?: string) {
            for (const cb of this._listeners) cb(state, detail);
        }
        constructor() {
            adapterInstances.push(this as any);
        }
    }
    return { AnamAdapter: MockAnamAdapter };
});

import AvatarHarness from '../components/AvatarHarness/AvatarHarness';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as Response;
}

describe('AvatarHarness', () => {
    beforeEach(() => {
        mockAuthFetch.mockReset();
        adapterInstances.length = 0;
    });

    afterEach(() => {
        cleanup();
    });

    it('renders the setup CTA when the backend reports unconfigured', async () => {
        mockAuthFetch.mockImplementation(async (url: string) => {
            if (String(url).endsWith('/api/avatar/health')) {
                return jsonResponse({ success: true, data: { configured: false } });
            }
            return jsonResponse({ success: false, error: 'unexpected' }, 500);
        });

        render(<AvatarHarness agentId="ara" />);

        await waitFor(() => {
            expect(screen.getByText(/not configured on the backend/i)).toBeInTheDocument();
        });
        // No "Start avatar" control should render in the unconfigured state.
        expect(screen.queryByText(/start avatar/i)).not.toBeInTheDocument();
    });

    it('when configured, clicking Start invokes the connect flow with the given agentId', async () => {
        mockAuthFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (String(url).endsWith('/api/avatar/health')) {
                return jsonResponse({ success: true, data: { configured: true } });
            }
            if (String(url).endsWith('/api/avatar/session-token') && opts?.method === 'POST') {
                const body = JSON.parse(String(opts.body));
                expect(body.agentId).toBe('ara');
                return jsonResponse({ success: true, data: { sessionToken: 'mock-token-123' } });
            }
            return jsonResponse({ success: false, error: 'unexpected' }, 500);
        });

        render(<AvatarHarness agentId="ara" />);

        const startBtn = await screen.findByText(/start avatar/i);
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(adapterInstances.length).toBe(1);
        });
        expect(adapterInstances[0].connect).toHaveBeenCalledWith('mock-token-123', 'avatar-harness-video-ara');

        // The mock adapter emits 'connected' synchronously inside connect(),
        // so the harness should reflect the live state.
        await waitFor(() => {
            expect(screen.getByLabelText(/stop avatar session/i)).toBeInTheDocument();
        });
    });

    it('calls disconnect() on unmount (teardown safety)', async () => {
        mockAuthFetch.mockImplementation(async (url: string) => {
            if (String(url).endsWith('/api/avatar/health')) {
                return jsonResponse({ success: true, data: { configured: true } });
            }
            if (String(url).endsWith('/api/avatar/session-token')) {
                return jsonResponse({ success: true, data: { sessionToken: 'mock-token-456' } });
            }
            return jsonResponse({ success: false, error: 'unexpected' }, 500);
        });

        const { unmount } = render(<AvatarHarness agentId="ara" />);
        const startBtn = await screen.findByText(/start avatar/i);
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(adapterInstances.length).toBe(1);
        });

        unmount();

        await waitFor(() => {
            expect(adapterInstances[0].disconnect).toHaveBeenCalled();
        });
    });

    it('blocks avatar creation in the setup panel without the consent checkbox', async () => {
        mockAuthFetch.mockImplementation(async (url: string) => {
            if (String(url).endsWith('/api/avatar/health')) {
                return jsonResponse({ success: true, data: { configured: true } });
            }
            if (String(url).match(/\/api\/avatar\/profiles\//)) {
                return jsonResponse({ success: true, data: null });
            }
            if (String(url).endsWith('/api/avatar/options')) {
                return jsonResponse({ success: true, data: { avatars: [], voices: [] } });
            }
            return jsonResponse({ success: false, error: 'unexpected' }, 500);
        });

        render(<AvatarHarness agentId="ara" />);

        const setupBtn = await screen.findByLabelText(/avatar setup/i);
        fireEvent.click(setupBtn);

        const createBtn = await screen.findByText(/create avatar/i);
        // No photo selected AND no consent -> disabled.
        expect(createBtn.closest('button')).toBeDisabled();

        // Even checking consent alone (no photo) must not enable creation.
        const consentCheckbox = screen.getByRole('checkbox');
        fireEvent.click(consentCheckbox);
        expect(createBtn.closest('button')).toBeDisabled();
    });
});
