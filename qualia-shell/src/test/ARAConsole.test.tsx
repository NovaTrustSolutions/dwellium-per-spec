import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, beforeEach, afterEach, expect } from 'vitest';

const authFetch = vi.fn();

// LLM-fallback (gap A1) controls. Default: no active LLM → existing tests and
// the no-LLM failure path are unaffected. The fallback test flips `llmActive`.
let llmActive = false;
const callLlmMock = vi.fn();

vi.mock('../lib/llmClient', () => ({
    hasActiveLlm: () => llmActive,
    callLlm: (...args: any[]) => callLlmMock(...args),
    LlmError: class LlmError extends Error {},
}));

// 046-A3: the offline fallback streams when araPrefs.streamTokens (default ON).
const streamLlmMock = vi.fn();
vi.mock('../lib/llmStream', () => ({
    streamLlm: (...args: any[]) => streamLlmMock(...args),
    STREAMING_AVAILABLE: true,
}));

// 046-A2: real runDailyGlance/throttle, injectable assembler (null = silent).
const assembleGlanceMock = vi.fn(async (): Promise<string | null> => null);
vi.mock('../lib/araDailyGlance', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../lib/araDailyGlance')>();
    return {
        ...actual,
        runDailyGlance: (uid: string | null, post: (c: string) => void) => actual.runDailyGlance(uid, post, assembleGlanceMock),
    };
});

// Per-test switch: when true, the backend /chat endpoint throws (offline).
let chatShouldThrow = false;

vi.mock('../context/UserContext', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../context/UserContext')>();
    return {
        ...actual,
        useUser: () => ({
            authFetch,
            isAuthenticated: true,
        }),
    };
});

vi.mock('../context/HierarchyContext', () => ({
    useHierarchy: () => ({
        selectedId: 'riverwood',
        getSelectedItem: () => ({ id: 'riverwood', name: 'Riverwood', type: 'project' }),
        getBreadcrumb: () => [
            { id: 'portfolio', name: 'Portfolio', type: 'domain' },
            { id: 'riverwood', name: 'Riverwood', type: 'project' },
        ],
    }),
}));

import ARAConsole from '../components/ARAConsole/ARAConsole';
import { backendStatusStore } from '../lib/backendStatusStore';
import { araPrefsStore } from '../lib/araPrefsStore';
import { resetAraGlance } from '../lib/araDailyGlance';

async function* offlineStream() {
    yield { delta: 'Offline ', text: 'Offline ', done: false };
    yield { delta: 'LLM reply.', text: 'Offline LLM reply.', done: false };
    yield { delta: '', text: 'Offline LLM reply.', done: true };
    return 'Offline LLM reply.';
}

function sseBody(chunks: string[]): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    return new ReadableStream({
        start(c) {
            for (const ch of chunks) c.enqueue(enc.encode(ch));
            c.close();
        },
    });
}

function jsonResponse(data: any, ok = true, status = 200): Response {
    return {
        ok,
        status,
        json: async () => data,
        headers: new Headers(),
    } as Response;
}

describe('ARAConsole', () => {
    beforeEach(() => {
        authFetch.mockReset();
        llmActive = false;
        chatShouldThrow = false;
        callLlmMock.mockReset();
        streamLlmMock.mockReset();
        streamLlmMock.mockImplementation(() => offlineStream());
        assembleGlanceMock.mockReset();
        assembleGlanceMock.mockResolvedValue(null);
        araPrefsStore.reset();
        resetAraGlance();
        localStorage.clear();
        localStorage.setItem('dwellium-ara-tts', 'false');
        Element.prototype.scrollIntoView = vi.fn();
        Object.defineProperty(window, 'speechSynthesis', {
            value: {
                cancel: vi.fn(),
                getVoices: vi.fn(() => []),
                speak: vi.fn(),
            },
            configurable: true,
        });
        globalThis.Audio = vi.fn().mockImplementation(() => ({
            play: vi.fn().mockResolvedValue(undefined),
            pause: vi.fn(),
            onended: null,
            onerror: null,
        })) as any;

        authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (url.endsWith('/voice/clones')) {
                return jsonResponse({ success: true, data: [{ id: 'default', path: null }] });
            }
            if (url.endsWith('/voice/status')) {
                return jsonResponse({
                    success: true,
                    data: {
                        tts: { provider: 'openai-tts', available: true, fallbacks: ['openai-tts', 'chatterbox'] },
                        stt: { provider: 'whisper', available: true },
                    },
                });
            }
            if (url.endsWith('/modes')) {
                return jsonResponse({
                    success: true,
                    data: [{
                        id: 'chief-of-staff',
                        name: 'Chief of Staff',
                        icon: 'clipboard-list',
                        shortDescription: 'Execution partner',
                        lens: 'The execution lens',
                        logic: 'Tactical',
                        voice: 'Clear and direct',
                        forbiddenBehavior: 'None',
                        bestFor: 'Operations',
                        entityGuardianRequired: false,
                    }],
                });
            }
            if (url.endsWith('/observability')) {
                return jsonResponse({
                    success: true,
                    data: {
                        totalChats: 8,
                        avgLatencyMs: 180,
                        providerFailures: 0,
                        modeUsage: { 'chief-of-staff': 8 },
                        recentFailures: [],
                        lastChat: {
                            mode: 'chief-of-staff',
                            providerUsed: 'gpt-4o-mini',
                            latencyMs: 120,
                            contextSourceCount: 2,
                        },
                    },
                });
            }
            if (url.endsWith('/chat')) {
                if (chatShouldThrow) {
                    throw new Error('Backend unreachable. Is the server running on port 3000?');
                }
                return jsonResponse({
                    success: true,
                    data: {
                        content: 'I can help with that.',
                        mode: 'chief-of-staff',
                        entityGuardianActive: false,
                        contextSources: [
                            { name: 'Inbox', type: 'inbox', itemCount: 2, snippet: '2 items' },
                            { name: 'ruVector', type: 'ruVector', itemCount: 3, snippet: '3 semantic matches' },
                        ],
                        observability: {
                            latencyMs: 120,
                            contextBuildMs: 16,
                            providerUsed: 'gpt-4o-mini',
                            retryCount: 0,
                            tokensUsed: 240,
                        },
                    },
                });
            }
            if (url.endsWith('/chat/to-note')) {
                return jsonResponse({ success: true, data: { id: 'note-1' } });
            }
            if (url.endsWith('/chat/to-workitem')) {
                return jsonResponse({ success: true, data: { id: 'wi-1' } }, true, 201);
            }
            if (url.endsWith('/speak')) {
                return {
                    ok: true,
                    status: 200,
                    headers: new Headers({
                        'content-type': 'audio/mpeg',
                        'x-audio-provider': 'openai-tts',
                    }),
                    blob: async () => new Blob(['voice'], { type: 'audio/mpeg' }),
                } as Response;
            }
            if (url.includes('/session/')) {
                return jsonResponse({ success: true });
            }
            throw new Error(`Unhandled authFetch URL: ${url} ${(opts?.method || 'GET')}`);
        });
    });

    afterEach(() => {
        backendStatusStore.reset();
        vi.useRealTimers();
    });

    // plan 046 S1c — missing-key banner above the composer. No key (llmClient
    // mock → hasActiveLlm false) + backend offline ⇒ 'unavailable' ⇒ CTA shown;
    // default 'backend-only' stays silent (ARA tries the backend first).
    it('shows the AI-unavailable banner with "Open API Keys" above the composer when offline + no key', async () => {
        render(<ARAConsole />);
        await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        expect(screen.queryByRole('button', { name: 'Open API Keys' })).toBeNull();

        act(() => { backendStatusStore.markOffline('Backend unreachable'); });

        expect(await screen.findByRole('button', { name: 'Open API Keys' })).toBeInTheDocument();
        expect(screen.getByText(/No AI key configured and the backend is unreachable/)).toBeInTheDocument();
    });

    it('shows context sources and diagnostics for ARA replies', async () => {
        const user = userEvent.setup();
        render(<ARAConsole />);

        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'What should I do next?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));

        await screen.findByText('I can help with that.');
        expect(await screen.findByText('Inbox · 2')).toBeInTheDocument();
        expect(screen.getByText('Latency 120ms')).toBeInTheDocument();
        expect(screen.getByText('Pinned context: Portfolio > Riverwood')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Details' }));

        expect(await screen.findByText('Request diagnostics')).toBeInTheDocument();
        expect(screen.getAllByText('GPT-4o mini').length).toBeGreaterThan(0);
        expect(screen.getByText('3 items · 3 semantic matches')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Show observability' }));
        expect(await screen.findByText('Total chats')).toBeInTheDocument();
        expect(screen.getByText('8')).toBeInTheDocument();

        const chatCall = authFetch.mock.calls.find((call: any[]) => String(call[0]).includes('/chat'));
        expect(chatCall).toBeTruthy();
        const chatPayload = JSON.parse((chatCall?.[1] as RequestInit).body as string);
        expect(chatPayload.workspaceContext.name).toBe('Riverwood');
    });

    it('creates notes and workitems from the conversation action panel', async () => {
        const user = userEvent.setup();
        render(<ARAConsole />);

        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'Create follow-up tasks');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText('I can help with that.');

        await user.click(screen.getByRole('button', { name: 'Save As Note' }));
        const noteInput = await screen.findByLabelText('Note subject');
        await user.clear(noteInput);
        await user.type(noteInput, 'ARA handoff');
        await user.click(screen.getByRole('button', { name: 'Save Note' }));
        expect(await screen.findByText('Saved note note-1')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Create Workitem' }));
        const workitemInput = await screen.findByLabelText('Workitem title');
        await user.clear(workitemInput);
        await user.type(workitemInput, 'Call vendor about leak');
        await user.selectOptions(screen.getByLabelText('Workitem priority'), 'high');
        await user.click(screen.getAllByRole('button', { name: 'Create Workitem' })[1]);

        expect(await screen.findByText('Created workitem wi-1')).toBeInTheDocument();

        await waitFor(() => {
            expect(authFetch).toHaveBeenCalledWith(expect.stringContaining('/chat/to-note'), expect.objectContaining({
                method: 'POST',
            }));
            expect(authFetch).toHaveBeenCalledWith(expect.stringContaining('/chat/to-workitem'), expect.objectContaining({
                method: 'POST',
            }));
        });

        const workitemCall = authFetch.mock.calls.find((call: any[]) => String(call[0]).includes('/chat/to-workitem'));
        expect(workitemCall).toBeTruthy();
        const workitemPayload = JSON.parse((workitemCall?.[1] as RequestInit).body as string);
        expect(workitemPayload.type).toBe('task');
        expect(workitemPayload.domain).toBe('operations');
        expect(workitemPayload.history.length).toBeGreaterThan(0);
    });

    it('restores the saved conversation for the active mode from local storage', async () => {
        localStorage.setItem('dwellium-ara-session-executive-assistant', JSON.stringify({
            sessionId: 'session-restored',
            lastRequest: null,
            messages: [{
                id: 'msg-restored',
                role: 'assistant',
                content: 'Restored conversation reply.',
                timestamp: Date.now(),
                mode: 'executive-assistant',
            }],
        }));

        render(<ARAConsole />);

        expect(await screen.findByText('Restored conversation reply.')).toBeInTheDocument();
    });

    it('surfaces a failure banner when the backend chat call fails and no LLM is configured', async () => {
        chatShouldThrow = true;
        const user = userEvent.setup();
        render(<ARAConsole />);

        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'What should I do next?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));

        // Error banner + humanized inline assistant message; no LLM fallback attempted.
        expect(await screen.findByText(/Last request failed:/)).toBeInTheDocument();
        expect(await screen.findByText(/I hit a snag — Backend unreachable/)).toBeInTheDocument();
        expect(callLlmMock).not.toHaveBeenCalled();
    });

    it('falls back to the personal LLM key when the backend chat call fails (gap A1) — streamed (046-A3)', async () => {
        chatShouldThrow = true;
        llmActive = true;
        const user = userEvent.setup();
        render(<ARAConsole />);

        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'What should I do next?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));

        // LLM reply shown; success status confirms the offline route; no error banner.
        expect(await screen.findByText('Offline LLM reply.')).toBeInTheDocument();
        expect(await screen.findByText(/Backend offline — answered via your/)).toBeInTheDocument();
        expect(screen.queryByText(/Last request failed:/)).not.toBeInTheDocument();
        expect(streamLlmMock).toHaveBeenCalledTimes(1);
        expect(callLlmMock).not.toHaveBeenCalled();
        // Exactly one assistant bubble for the streamed reply (placeholder finalized in place).
        expect(screen.getAllByText('Offline LLM reply.')).toHaveLength(1);
    });

    it('offline fallback uses single-shot callLlm when streamTokens is OFF', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Offline LLM reply.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);

        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'What should I do next?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));

        expect(await screen.findByText('Offline LLM reply.')).toBeInTheDocument();
        expect(callLlmMock).toHaveBeenCalledTimes(1);
        expect(streamLlmMock).not.toHaveBeenCalled();
    });

    // ── 046-A1: starter prompts ──────────────────────────────────────────
    it('shows starter chips when empty; clicking one sends it and the chips go away', async () => {
        const user = userEvent.setup();
        render(<ARAConsole />);

        const chip = await screen.findByRole('button', { name: 'What should I focus on today?' });
        expect(screen.getByRole('group', { name: 'Suggested prompts' })).toBeInTheDocument();
        await user.click(chip);

        await screen.findByText('I can help with that.');
        const chatCall = authFetch.mock.calls.find((call: any[]) => String(call[0]).endsWith('/chat'));
        expect(chatCall).toBeTruthy();
        const payload = JSON.parse((chatCall?.[1] as RequestInit).body as string);
        expect(payload.message).toContain('What should I focus on today?');
        expect(screen.queryByRole('group', { name: 'Suggested prompts' })).not.toBeInTheDocument();
    });

    // ── 046-A2: today at a glance ────────────────────────────────────────
    it('posts the daily glance on mount once per day (no second glance same day)', async () => {
        assembleGlanceMock.mockResolvedValue('**Today at a glance — 1 thing worth doing**\n1. 2 leases need attention');
        const first = render(<ARAConsole />);
        expect(await screen.findByText(/Today at a glance/)).toBeInTheDocument();
        expect(assembleGlanceMock).toHaveBeenCalledTimes(1);
        first.unmount();

        // Same day, fresh mount: throttled — assembler not consulted again, glance
        // appears only via the restored session (exactly one bubble).
        render(<ARAConsole />);
        await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await waitFor(() => expect(screen.getAllByText(/Today at a glance/)).toHaveLength(1));
        expect(assembleGlanceMock).toHaveBeenCalledTimes(1);
    });

    it('stays silent when the glance assembler has nothing to say', async () => {
        render(<ARAConsole />);
        await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await waitFor(() => expect(assembleGlanceMock).toHaveBeenCalledTimes(1));
        expect(screen.queryByText(/Today at a glance/)).not.toBeInTheDocument();
    });

    // ── 046-A4: backend SSE ──────────────────────────────────────────────
    it('streams /chat/stream deltas into one bubble, then finalizes with the done payload', async () => {
        const base = authFetch.getMockImplementation()!;
        authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (url.endsWith('/chat/stream')) {
                expect(new Headers(opts?.headers).get('Accept')).toBe('text/event-stream');
                return {
                    ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream' }),
                    body: sseBody([
                        'data: {"delta":"Streamed "}\n\n',
                        'data: {"delta":"answer."}\n\nevent: done\ndata: {"content":"Streamed answer.","mode":"chief-of-staff","entityGuardianActive":false,"contextSources":[],"observability":{"latencyMs":77,"contextBuildMs":1,"providerUsed":"gpt-4o-mini","retryCount":0}}\n\n',
                    ]),
                } as unknown as Response;
            }
            return base(url, opts);
        });
        const user = userEvent.setup();
        render(<ARAConsole />);
        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'Stream please');
        await user.click(screen.getByRole('button', { name: 'Send message' }));

        expect(await screen.findByText('Streamed answer.')).toBeInTheDocument();
        expect(await screen.findByText('Latency 77ms')).toBeInTheDocument();
        expect(screen.getAllByText('Streamed answer.')).toHaveLength(1);
        expect(authFetch.mock.calls.some((c: any[]) => String(c[0]).endsWith('/chat'))).toBe(false);
    });

    it('falls back to the JSON /chat path when /chat/stream is 404 (older backend)', async () => {
        const base = authFetch.getMockImplementation()!;
        authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
            if (url.endsWith('/chat/stream')) return jsonResponse({ success: false, error: 'Not found' }, false, 404);
            return base(url, opts);
        });
        const user = userEvent.setup();
        render(<ARAConsole />);
        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        await user.type(textbox, 'Hello');
        await user.click(screen.getByRole('button', { name: 'Send message' }));

        expect(await screen.findByText('I can help with that.')).toBeInTheDocument();
        expect(authFetch.mock.calls.some((c: any[]) => String(c[0]).endsWith('/chat'))).toBe(true);
    });

    it('exposes accessible names on icon-only control-bar buttons (Cycle 9 a11y)', async () => {
        render(<ARAConsole />);

        // Wait for the input bar to render (modes resolved).
        await screen.findByPlaceholderText('Message ARA (Executive Assistant)');

        // The send button previously had NO accessible name (bare arrow glyph).
        expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Start voice input' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Clear conversation' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Voice settings' })).toBeInTheDocument();
        // TTS seeded off in beforeEach → "Enable auto-read replies".
        expect(screen.getByRole('button', { name: 'Enable auto-read replies' })).toBeInTheDocument();
    });

    it('retries the lens catalog after a transient modes fetch failure', async () => {
        vi.useFakeTimers();
        let modeCalls = 0;

        authFetch.mockImplementation(async (url: string) => {
            if (url.endsWith('/voice/clones')) {
                return jsonResponse({ success: true, data: [{ id: 'default', path: null }] });
            }
            if (url.endsWith('/voice/status')) {
                return jsonResponse({ success: true, data: { tts: { provider: 'openai-tts', available: true }, stt: { provider: 'whisper', available: true } } });
            }
            if (url.endsWith('/modes')) {
                modeCalls += 1;
                if (modeCalls === 1) throw new Error('Tunnel unavailable');
                return jsonResponse({
                    success: true,
                    data: [
                        {
                            id: 'executive-assistant',
                            name: 'Executive Assistant',
                            icon: 'clipboard-list',
                            shortDescription: 'Default lens',
                            lens: 'The coordination lens',
                            logic: 'Coordinate',
                            voice: 'Warm',
                            forbiddenBehavior: 'None',
                            bestFor: 'Operations',
                            entityGuardianRequired: false,
                        },
                        {
                            id: 'lead-counsel',
                            name: 'Lead Counsel',
                            icon: 'scale',
                            shortDescription: 'Legal lens',
                            lens: 'The liability lens',
                            logic: 'Analyze liability',
                            voice: 'Precise',
                            forbiddenBehavior: 'None',
                            bestFor: 'Legal review',
                            entityGuardianRequired: true,
                        },
                    ],
                });
            }
            if (url.endsWith('/observability')) {
                return jsonResponse({ success: true, data: {} });
            }
            throw new Error(`Unhandled authFetch URL: ${url}`);
        });

        render(<ARAConsole />);

        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByPlaceholderText('Message ARA (Executive Assistant)')).toBeInTheDocument();
        expect(modeCalls).toBe(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });

        expect(modeCalls).toBeGreaterThanOrEqual(2);
        fireEvent.click(screen.getByRole('button', { name: 'Personas' }));
        // Backend modes merge over the built-in lens catalog, so the count reflects
        // the full set (built-ins + any backend-only lenses), not just the 2 mocked.
        expect(screen.getByText(/^\d+ lenses$/)).toBeInTheDocument();
        expect(screen.getByText('Lead Counsel')).toBeInTheDocument();
    });
});
