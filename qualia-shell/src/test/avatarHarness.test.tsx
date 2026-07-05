import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Fake, obviously-not-real key constant — never a live secret. Tests assert
// the REQUEST SHAPE (Authorization header + URL), not the key's cleartext
// value beyond this test constant.
const FAKE_ANAM_KEY = 'test-anam-key-not-real';

// avatarHarness reads the vault via useIntegrations() — mock it directly so
// these tests don't need a UserProvider or a real localStorage vault.
const mockIntegrations = {
    integrations: {
        llm: { active: null },
        google: {},
        search: { active: null },
        tests: {},
        anam: { apiKey: FAKE_ANAM_KEY, enabled: true },
    },
    update: vi.fn(),
    replace: vi.fn(),
    clear: vi.fn(),
    removeSecret: vi.fn(),
};

vi.mock('../hooks/useIntegrations', () => ({
    useIntegrations: () => mockIntegrations,
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

// avatarProfilesStore is per-user localStorage — reset between tests so a
// stale profile from one test doesn't leak into the next.
import { avatarProfilesStore } from '../lib/avatarProfilesStore';
import { avatarProfilesUserIdHolder } from '../lib/perUserIdentity';

import AvatarHarness from '../components/AvatarHarness/AvatarHarness';

const mockFetch = vi.fn();
const origFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => body,
        text: async () => JSON.stringify(body),
    } as Response;
}

describe('AvatarHarness (plan 041 — backendless / browser-direct Anam)', () => {
    beforeEach(() => {
        globalThis.fetch = mockFetch;
        mockFetch.mockReset();
        adapterInstances.length = 0;
        localStorage.clear();
        avatarProfilesUserIdHolder.current = null;
        avatarProfilesStore.reset();
        mockIntegrations.integrations.anam = { apiKey: FAKE_ANAM_KEY, enabled: true };
    });

    afterEach(() => {
        globalThis.fetch = origFetch;
        cleanup();
    });

    it('renders the vault CTA when no Anam key is configured (no network call)', async () => {
        mockIntegrations.integrations.anam = { apiKey: '', enabled: false };

        render(<AvatarHarness agentId="ara" />);

        await waitFor(() => {
            expect(screen.getByText(/Add your Anam Avatar Engine API key/i)).toBeInTheDocument();
        });
        expect(screen.getByText(/Open Settings/i)).toBeInTheDocument();
        // No "Start avatar" control should render in the unconfigured state.
        expect(screen.queryByText(/start avatar/i)).not.toBeInTheDocument();
        // getConfigured() is a pure vault check — must not have hit the network.
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('the CTA button dispatches dwellium:open-widget to open the Control Panel', async () => {
        mockIntegrations.integrations.anam = { apiKey: '', enabled: false };
        const listener = vi.fn();
        window.addEventListener('dwellium:open-widget', listener);

        render(<AvatarHarness agentId="ara" />);
        const cta = await screen.findByText(/Open Settings/i);
        fireEvent.click(cta);

        expect(listener).toHaveBeenCalledTimes(1);
        const evt = listener.mock.calls[0][0] as CustomEvent;
        expect(evt.detail).toEqual({ widgetId: 'control-panel', label: 'Settings' });
        window.removeEventListener('dwellium:open-widget', listener);
    });

    it('when a vault key is configured, clicking Start calls Anam session-token directly with Authorization: Bearer <key>', async () => {
        mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            const urlStr = String(url);
            if (urlStr === 'https://api.anam.ai/v1/auth/session-token' && opts?.method === 'POST') {
                // Assert TARGET + header shape, not the key's cleartext beyond the
                // test constant declared at the top of this file.
                const headers = opts.headers as Record<string, string>;
                expect(headers.Authorization).toBe(`Bearer ${FAKE_ANAM_KEY}`);
                const body = JSON.parse(String(opts.body));
                expect(body.personaConfig.personaId).toBe('ara');
                return jsonResponse({ sessionToken: 'mock-token-123' });
            }
            throw new Error(`unexpected fetch: ${urlStr}`);
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
        mockFetch.mockImplementation(async (url: string) => {
            if (String(url) === 'https://api.anam.ai/v1/auth/session-token') {
                return jsonResponse({ sessionToken: 'mock-token-456' });
            }
            throw new Error(`unexpected fetch: ${url}`);
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

    it('surfaces a friendly error (not the raw key) when Anam returns a non-2xx', async () => {
        mockFetch.mockImplementation(async (url: string) => {
            if (String(url) === 'https://api.anam.ai/v1/auth/session-token') {
                return jsonResponse({ message: 'Invalid API key' }, 401);
            }
            throw new Error(`unexpected fetch: ${url}`);
        });

        render(<AvatarHarness agentId="ara" />);
        const startBtn = await screen.findByText(/start avatar/i);
        fireEvent.click(startBtn);

        await waitFor(() => {
            expect(screen.getByText(/Invalid API key/i)).toBeInTheDocument();
        });
        // The vault key itself must never appear in the rendered error.
        expect(screen.queryByText(new RegExp(FAKE_ANAM_KEY))).not.toBeInTheDocument();
    });

    it('blocks avatar creation in the setup panel without the consent checkbox', async () => {
        mockFetch.mockImplementation(async (url: string) => {
            const urlStr = String(url);
            if (urlStr === 'https://api.anam.ai/v1/avatars' || urlStr === 'https://api.anam.ai/v1/voices') {
                return jsonResponse({ data: [] });
            }
            throw new Error(`unexpected fetch: ${urlStr}`);
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
