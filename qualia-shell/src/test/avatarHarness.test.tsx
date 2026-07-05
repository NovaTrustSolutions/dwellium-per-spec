import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Fake, obviously-not-real key constant — never a live secret. Tests assert
// the REQUEST SHAPE (Authorization header + URL), not the key's cleartext
// value beyond this test constant.
const FAKE_ANAM_KEY = 'test-anam-key-not-real';

// avatarHarness reads the vault via useIntegrations() — mock it directly so
// these tests don't need a UserProvider or a real localStorage vault.
// EMPTY vault by default (plan 042: local mode must reach 'live' with an
// EMPTY vault) — individual Anam-path tests opt IN to a configured key.
const mockIntegrations = {
    integrations: {
        llm: { active: null },
        google: {},
        search: { active: null },
        tests: {},
        anam: { apiKey: '', enabled: false },
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

// Spy-able LocalPhotoAvatarAdapter mock — the harness-level tests only care
// that AvatarHarness wires connect/disconnect/talk correctly for the local
// path; the adapter's OWN canvas/landmark/speech behavior is covered in
// localAvatarAdapter.test.ts (plan 042 Step 5).
const localAdapterInstances: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    mute: ReturnType<typeof vi.fn>;
    interrupt: ReturnType<typeof vi.fn>;
    talk: ReturnType<typeof vi.fn>;
    onStateChange: ReturnType<typeof vi.fn>;
    startListening: ReturnType<typeof vi.fn>;
    stopListening: ReturnType<typeof vi.fn>;
    selectedVoiceURI: string | null;
    _emit?: (state: string, detail?: string) => void;
}> = [];

vi.mock('../components/AvatarHarness/LocalPhotoAvatarAdapter', () => {
    class MockLocalPhotoAvatarAdapter {
        selectedVoiceURI: string | null = null;
        connect = vi.fn(async (_profile: unknown, _canvas: unknown) => {
            this._emit?.('connected');
        });
        disconnect = vi.fn(async () => {
            this._emit?.('idle');
        });
        mute = vi.fn();
        interrupt = vi.fn();
        talk = vi.fn(async () => {});
        startListening = vi.fn(() => true);
        stopListening = vi.fn();
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
            localAdapterInstances.push(this as any);
        }
    }
    return { LocalPhotoAvatarAdapter: MockLocalPhotoAvatarAdapter };
});

// avatarProfilesStore is per-user localStorage — reset between tests so a
// stale profile from one test doesn't leak into the next.
import { avatarProfilesStore, useAvatarProfile } from '../lib/avatarProfilesStore';
import { avatarProfilesUserIdHolder } from '../lib/perUserIdentity';
import { renderHook, act } from '@testing-library/react';

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

/** Seed a profile directly in the store — bypasses the setup panel UI for tests that only need a pre-existing profile shape. */
function seedProfile(agentId: string, patch: Partial<{
    provider: 'local' | 'anam';
    photoDataUrl: string | null;
    browserVoiceURI: string | null;
    avatarId: string | null;
    voiceId: string | null;
}>) {
    const { result } = renderHook(() => useAvatarProfile(agentId));
    act(() => {
        result.current.save({
            provider: patch.provider ?? 'local',
            photoDataUrl: patch.photoDataUrl ?? null,
            browserVoiceURI: patch.browserVoiceURI ?? null,
            avatarId: patch.avatarId ?? null,
            voiceId: patch.voiceId ?? null,
            displayName: null,
            systemPrompt: null,
        });
    });
}

describe('AvatarHarness (plan 042 — keyless local default / Anam optional upgrade)', () => {
    beforeEach(() => {
        globalThis.fetch = mockFetch;
        mockFetch.mockReset();
        adapterInstances.length = 0;
        localAdapterInstances.length = 0;
        localStorage.clear();
        avatarProfilesUserIdHolder.current = null;
        avatarProfilesStore.reset();
        mockIntegrations.integrations.anam = { apiKey: '', enabled: false };
        mockIntegrations.integrations.llm = { active: null } as any;
    });

    afterEach(() => {
        globalThis.fetch = origFetch;
        cleanup();
    });

    describe('local provider (default, keyless)', () => {
        it('shows the "add a photo" CTA when no photo has been saved yet — no Anam mention anywhere', async () => {
            render(<AvatarHarness agentId="ara" />);

            await waitFor(() => {
                expect(screen.getByText(/Upload a photo to bring this agent's avatar to life/i)).toBeInTheDocument();
            });
            expect(screen.getByText(/Add a photo/i)).toBeInTheDocument();
            // The whole point of the keyless flow: no Anam mention anywhere in the DOM.
            expect(screen.queryByText(/anam/i)).not.toBeInTheDocument();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('reaches "live" with an EMPTY vault once a photo-bearing profile exists (test-pinned: the "no key" requirement)', async () => {
            // Explicitly empty vault — no Anam key, no LLM key. This is the
            // exact scenario the plan requires: local mode must animate with
            // zero configured keys of any kind.
            mockIntegrations.integrations.anam = { apiKey: '', enabled: false };
            mockIntegrations.integrations.llm = { active: null } as any;
            seedProfile('ara', { provider: 'local', photoDataUrl: 'data:image/jpeg;base64,AAAA' });

            render(<AvatarHarness agentId="ara" />);

            await waitFor(() => {
                expect(localAdapterInstances.length).toBe(1);
            });
            expect(localAdapterInstances[0].connect).toHaveBeenCalled();

            await waitFor(() => {
                expect(screen.getByLabelText(/stop avatar session/i)).toBeInTheDocument();
            });
            // No network call anywhere in the local path.
            expect(mockFetch).not.toHaveBeenCalled();
            // Still no Anam mention once live.
            expect(screen.queryByText(/anam/i)).not.toBeInTheDocument();
        });

        it('calls disconnect() on unmount for the local adapter (teardown safety)', async () => {
            seedProfile('ara', { provider: 'local', photoDataUrl: 'data:image/jpeg;base64,AAAA' });

            const { unmount } = render(<AvatarHarness agentId="ara" />);

            await waitFor(() => {
                expect(localAdapterInstances.length).toBe(1);
            });

            unmount();

            await waitFor(() => {
                expect(localAdapterInstances[0].disconnect).toHaveBeenCalled();
            });
        });

        it('speaks the fixed no-LLM-key fallback line via talk() while still animating when no LLM is configured', async () => {
            mockIntegrations.integrations.llm = { active: null } as any;
            seedProfile('ara', { provider: 'local', photoDataUrl: 'data:image/jpeg;base64,AAAA' });

            render(<AvatarHarness agentId="ara" />);
            await waitFor(() => expect(localAdapterInstances.length).toBe(1));
            await waitFor(() => expect(screen.getByLabelText(/stop avatar session/i)).toBeInTheDocument());

            const input = screen.getByLabelText(/message the avatar/i);
            fireEvent.change(input, { target: { value: 'hello there' } });
            fireEvent.keyDown(input, { key: 'Enter' });

            await waitFor(() => {
                expect(localAdapterInstances[0].talk).toHaveBeenCalled();
            });
            const spokenText = localAdapterInstances[0].talk.mock.calls[0][0] as string;
            expect(spokenText.toLowerCase()).toMatch(/settings|connect/);
            // The avatar must still be "live" — no LLM key never tears down the session.
            expect(screen.getByLabelText(/stop avatar session/i)).toBeInTheDocument();
        });
    });

    describe('anam provider (opt-in only, requires a vault key)', () => {
        beforeEach(() => {
            mockIntegrations.integrations.anam = { apiKey: FAKE_ANAM_KEY, enabled: true };
        });

        it('renders the vault CTA when no Anam key is configured for an anam-provider profile (no network call)', async () => {
            mockIntegrations.integrations.anam = { apiKey: '', enabled: false };
            seedProfile('ara', { provider: 'anam', avatarId: 'existing-avatar' });

            render(<AvatarHarness agentId="ara" />);

            await waitFor(() => {
                expect(screen.getByText(/Add your Anam Avatar Engine API key/i)).toBeInTheDocument();
            });
            expect(screen.getByText(/Open Settings/i)).toBeInTheDocument();
            expect(screen.queryByText(/start avatar/i)).not.toBeInTheDocument();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it('the CTA button dispatches dwellium:open-widget to open the Control Panel', async () => {
            mockIntegrations.integrations.anam = { apiKey: '', enabled: false };
            seedProfile('ara', { provider: 'anam', avatarId: 'existing-avatar' });
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
            seedProfile('ara', { provider: 'anam', avatarId: 'existing-avatar' });
            mockFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
                const urlStr = String(url);
                if (urlStr === 'https://api.anam.ai/v1/auth/session-token' && opts?.method === 'POST') {
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

            await waitFor(() => {
                expect(screen.getByLabelText(/stop avatar session/i)).toBeInTheDocument();
            });
        });

        it('calls disconnect() on unmount (teardown safety)', async () => {
            seedProfile('ara', { provider: 'anam', avatarId: 'existing-avatar' });
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
            seedProfile('ara', { provider: 'anam', avatarId: 'existing-avatar' });
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
            expect(screen.queryByText(new RegExp(FAKE_ANAM_KEY))).not.toBeInTheDocument();
        });
    });

    describe('setup panel — provider gating', () => {
        it('does not show a provider picker (and never mentions Anam) when no Anam key exists', async () => {
            render(<AvatarHarness agentId="ara" />);

            const addPhotoBtn = await screen.findByText(/Add a photo/i);
            fireEvent.click(addPhotoBtn);

            await screen.findByText(/Avatar setup — ara/i);
            expect(screen.queryByLabelText(/provider/i)).not.toBeInTheDocument();
            expect(screen.queryByText(/anam/i)).not.toBeInTheDocument();
        });

        it('blocks Anam avatar creation in the setup panel without the consent checkbox (when Anam is available)', async () => {
            mockIntegrations.integrations.anam = { apiKey: FAKE_ANAM_KEY, enabled: true };
            seedProfile('ara', { provider: 'anam', avatarId: null });
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
            expect(createBtn.closest('button')).toBeDisabled();

            const consentCheckbox = screen.getByRole('checkbox');
            fireEvent.click(consentCheckbox);
            expect(createBtn.closest('button')).toBeDisabled();
        });
    });
});
