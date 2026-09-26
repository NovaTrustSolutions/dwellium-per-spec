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
    applyModelPreference: (llm: unknown) => llm,
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
import { hermesLearningStore, relevantPastRuns } from '../components/HonchoHermesPanel/hermesLearningStore';
import { artifactStore } from '../lib/artifactStore';
import { resetAraGlance } from '../lib/araDailyGlance';
import { flushWidgetMemory, patchWidgetMemory, readWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';
import { sessionRestoreStore, type SessionSnapshot } from '../lib/sessionRestoreStore';
import { resetResumeChip } from '../components/ARAConsole/araResumeContext';
import { getCmn, resetCmnForTests } from '../lib/memoryGraphRag/shared';
import { RECALL_HEADING } from '../lib/memoryGraphRag/recall';
import { UserContext } from '../context/UserContext';
import { setPerUserIdentity } from '../lib/perUserIdentity';

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
        resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
        localStorage.clear();
        resetCmnForTests(); // plan 058 — Cognitive Memory Network per-user singleton
        araPrefsStore.set('ttsEnabled', false);
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

    // Plan 055 phase 2 — the unsent composer draft restores per mode.
    it('restores the remembered composer draft and remembers typing (flush on blur)', async () => {
        patchWidgetMemory('ara-console', { drafts: { 'executive-assistant': 'ask about the Woodland Parc lease' } });
        const user = userEvent.setup();
        render(<ARAConsole />);
        const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
        expect(textbox).toHaveValue('ask about the Woodland Parc lease');

        await user.clear(textbox);
        await user.type(textbox, 'new unsent thought');
        fireEvent.blur(textbox);
        flushWidgetMemory();
        expect(readWidgetMemory('ara-console', { drafts: {} as Record<string, string> }).drafts['executive-assistant'])
            .toBe('new unsent thought');
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

    // ── Swarm C item 1: "Thin context" notice is backend-origin-only ─────
    describe('Thin context notice (origin-gated)', () => {
        it('shows no notice (and no Pin context button) for a browser-key reply', async () => {
            chatShouldThrow = true;
            llmActive = true;
            const user = userEvent.setup();
            render(<ARAConsole />);

            const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            await user.type(textbox, 'What should I do next?');
            await user.click(screen.getByRole('button', { name: 'Send message' }));

            await screen.findByText('Offline LLM reply.');
            expect(screen.queryByText(/Thin context/)).not.toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Pin context' })).toBeNull();
        });

        it('shows the notice with a Pin context button for a backend reply with 0 sources', async () => {
            const base = authFetch.getMockImplementation()!;
            authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
                if (url.endsWith('/chat')) {
                    return jsonResponse({
                        success: true,
                        data: {
                            content: 'Thin answer.',
                            mode: 'chief-of-staff',
                            entityGuardianActive: false,
                            contextSources: [],
                            observability: { latencyMs: 50, contextBuildMs: 5, providerUsed: 'gpt-4o-mini', retryCount: 0 },
                        },
                    });
                }
                return base(url, opts);
            });
            const user = userEvent.setup();
            render(<ARAConsole />);

            const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            await user.type(textbox, 'What should I do next?');
            await user.click(screen.getByRole('button', { name: 'Send message' }));

            await screen.findByText('Thin answer.');
            expect(await screen.findByText(/Thin context/)).toBeInTheDocument();
            expect(screen.getByRole('button', { name: 'Pin context' })).toBeInTheDocument();
        });

        it('shows no notice for a backend reply with 2 sources totalling 3 items', async () => {
            const base = authFetch.getMockImplementation()!;
            authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
                if (url.endsWith('/chat')) {
                    return jsonResponse({
                        success: true,
                        data: {
                            content: 'Well-grounded answer.',
                            mode: 'chief-of-staff',
                            entityGuardianActive: false,
                            contextSources: [
                                { name: 'Inbox', type: 'inbox', itemCount: 1, snippet: '1 item' },
                                { name: 'ruVector', type: 'ruVector', itemCount: 2, snippet: '2 semantic matches' },
                            ],
                            observability: { latencyMs: 90, contextBuildMs: 8, providerUsed: 'gpt-4o-mini', retryCount: 0 },
                        },
                    });
                }
                return base(url, opts);
            });
            const user = userEvent.setup();
            render(<ARAConsole />);

            const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            await user.type(textbox, 'What should I do next?');
            await user.click(screen.getByRole('button', { name: 'Send message' }));

            await screen.findByText('Well-grounded answer.');
            expect(screen.queryByText(/Thin context/)).not.toBeInTheDocument();
        });
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

    it('renders underscores inside words literally, keeps _real italics_, and leaves code spans alone', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Quota metric generate_content_free_tier_requests hit; see _the docs_ and `org_01abc` on `on_demand`.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'What happened?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        const line = (await screen.findByText(/Quota metric/)).closest('.ara-line') as HTMLElement;
        expect(line.textContent).toContain('generate_content_free_tier_requests');
        expect([...line.querySelectorAll('em')].map(e => e.textContent)).toEqual(['the docs']);
        expect([...line.querySelectorAll('code')].map(c => c.textContent)).toEqual(['org_01abc', 'on_demand']);
    });

    it('Save As Note pre-fills a subject that keeps underscores inside words and hyphens', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Noted.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'Fix user_id_map follow-up for 2026-09-24');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText('Noted.');
        await user.click(screen.getByRole('button', { name: /Save As Note/i }));
        expect((screen.getByLabelText('Note subject') as HTMLInputElement).value).toBe('ARA Note — Fix user_id_map follow-up for 2026-09-24');
    });

    it('reads identifiers aloud as words (user_id_map → "user id map")', async () => {
        araPrefsStore.set('streamTokens', false);
        araPrefsStore.set('ttsEnabled', true);
        const spoken: string[] = [];
        vi.stubGlobal('SpeechSynthesisUtterance', class { rate = 1; pitch = 1; volume = 1; voice = null; onend = null; onerror = null; constructor(public text: string) { spoken.push(text); } });
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Check user_id_map and **generate_content_free_tier_requests** now.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'What next?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText(/Check user_id_map/);
        const readButtons = screen.getAllByRole('button', { name: 'Read message aloud' });
        await user.click(readButtons[readButtons.length - 1]); // the reply's own "Read aloud"
        await waitFor(() => expect(spoken.some(t => /user id map/.test(t))).toBe(true));
        const said = spoken.find(t => /user id map/.test(t))!;
        expect(said).toContain('generate content free tier requests');
        expect(said).not.toMatch(/userid|useridmap/);
    });

    it('pauses between lines without doubling punctuation (Done.. / 。.) — the same rule as Stella', async () => {
        araPrefsStore.set('streamTokens', false);
        araPrefsStore.set('ttsEnabled', true);
        const spoken: string[] = [];
        vi.stubGlobal('SpeechSynthesisUtterance', class { rate = 1; pitch = 1; volume = 1; voice = null; onend = null; onerror = null; constructor(public text: string) { spoken.push(text); } });
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Done.\n请参阅文档。\nNext step', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'What next?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText(/请参阅文档/);
        const readButtons = screen.getAllByRole('button', { name: 'Read message aloud' });
        await user.click(readButtons[readButtons.length - 1]);
        await waitFor(() => expect(spoken.some(t => /请参阅文档/.test(t))).toBe(true));
        // No added periods; a punctuated line keeps its break (chunkForTts splits there), the unpunctuated end needs none.
        expect(spoken.find(t => /请参阅文档/.test(t))).toBe('Done.\n请参阅文档。\nNext step');
    });

    it('renders a fenced code block as one code block, with nothing formatted inside', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Run this:\n```bash\nfind . -name "*.tsx" | grep **bold** _x_\nls -la\n```\nDone.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'How do I list files?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText('Done.');
        const pre = document.querySelector('.ara-message-body pre.ara-code-block') as HTMLElement;
        expect(pre).not.toBeNull();
        expect(pre.textContent).toBe('find . -name "*.tsx" | grep **bold** _x_\nls -la');
        expect(pre.querySelector('em, strong')).toBeNull();
        expect(document.body.textContent).not.toContain('```');
    });

    it('a line starting with inline ```code``` is not a fence — nothing after it is swallowed', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: 'Run:\n```npm install``` then restart.\nAfter that, you are done.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'Setup?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        const after = await screen.findByText('After that, you are done.');
        expect(after.closest('pre')).toBeNull();
        expect(document.querySelector('.ara-message-body pre.ara-code-block')).toBeNull();
        expect(document.body.textContent).toContain('then restart.');
    });

    it('a fence indented inside a numbered list renders without the list indent', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: '1. Install:\n   ```bash\n   npm i\n   ```\n2. Run it.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'Steps?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText(/Run it\./);
        expect(document.querySelector('.ara-message-body pre.ara-code-block')?.textContent).toBe('npm i');
    });

    it('a fence indented 4 spaces under a bullet renders as a code block', async () => {
        araPrefsStore.set('streamTokens', false);
        chatShouldThrow = true;
        llmActive = true;
        callLlmMock.mockResolvedValue({ text: '- Install:\n    ```bash\n    npm i\n    ```\n- Done here.', provider: 'anthropic', model: 'claude' });
        const user = userEvent.setup();
        render(<ARAConsole />);
        await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'Install?');
        await user.click(screen.getByRole('button', { name: 'Send message' }));
        await screen.findByText(/Done here\./);
        expect(document.querySelector('.ara-message-body pre.ara-code-block')?.textContent).toBe('npm i');
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

    // ── plan 058: Cognitive Memory Network recall folded into the offline
    // LLM fallback's systemPrompt (recall.ts contract) ────────────────────
    describe('Cognitive Memory Network recall (plan 058)', () => {
        it('includes the recall block in the offline systemPrompt when the network has relevant memory', async () => {
            await getCmn(null).ingest([
                { sourceId: 'note:1', sourceKind: 'upload', title: 'Boiler', text: 'Acme Heating serviced the boiler at Maple Street and recommends a new valve.' },
            ], 'test');
            araPrefsStore.set('streamTokens', false);
            chatShouldThrow = true;
            llmActive = true;
            callLlmMock.mockResolvedValue({ text: 'Offline LLM reply.', provider: 'anthropic', model: 'claude' });
            const user = userEvent.setup();
            render(<ARAConsole />);

            const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            await user.type(textbox, 'Who serviced the boiler?');
            await user.click(screen.getByRole('button', { name: 'Send message' }));

            expect(await screen.findByText('Offline LLM reply.')).toBeInTheDocument();
            expect(callLlmMock).toHaveBeenCalledTimes(1);
            const [llmReq] = callLlmMock.mock.calls[0];
            expect(llmReq.systemPrompt).toContain(RECALL_HEADING);
            expect(llmReq.systemPrompt).toContain('Acme Heating');
        });

        it('leaves the offline systemPrompt without a recall block when no memory was seeded', async () => {
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
            const [llmReq] = callLlmMock.mock.calls[0];
            expect(llmReq.systemPrompt).not.toContain(RECALL_HEADING);
        });
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

    // ── Plan 055 phase 4: "last working on" chip + resume starter ─────────
    describe('resume flow (055-P4)', () => {
        const GUEST_KEY = 'dwellium_session_restore_guest';

        function seedSession(topComponent = 'scribe', topTitle = 'Scribe'): void {
            const snap: SessionSnapshot = {
                version: 1,
                classic: [{
                    component: topComponent, title: topTitle, icon: 'pen-line',
                    x: 0, y: 0, width: 800, height: 600, zIndex: 9, minimized: false, groupId: null,
                }],
                halocron: { tabs: [], active: null },
                fluid: { tabs: [], active: null },
                savedAt: Date.now(),
            };
            localStorage.setItem(GUEST_KEY, JSON.stringify(snap));
            sessionRestoreStore.reset();
        }

        beforeEach(() => {
            sessionRestoreStore.reset(); // re-read the (cleared) localStorage
            resetResumeChip();
        });

        it('renders the chip from seeded stores with the doc basename ONLY (never the path)', async () => {
            seedSession();
            patchWidgetMemory('scribe', { activeFilepath: '/very/private/full/path/WoodlandLease.md' });
            const { container } = render(<ARAConsole />);
            await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            const chip = container.querySelector('.ara-resume-chip')!;
            expect(chip).not.toBeNull();
            expect(chip.textContent).toContain('WoodlandLease.md');
            expect(chip.textContent).toContain('Scribe');
            expect(chip.textContent).not.toContain('/very/private/full/path');
        });

        it('renders no chip and no resume starter when nothing is restored', async () => {
            const { container } = render(<ARAConsole />);
            await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            expect(container.querySelector('.ara-resume-chip')).toBeNull();
            expect(screen.queryByRole('button', { name: 'Pick up where I left off' })).toBeNull();
        });

        it('dismiss hides the chip and persists for the session (remount stays hidden)', async () => {
            seedSession('notepad', 'Notepad');
            const user = userEvent.setup();
            const first = render(<ARAConsole />);
            await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            await user.click(screen.getByRole('button', { name: 'Dismiss resume suggestion' }));
            expect(first.container.querySelector('.ara-resume-chip')).toBeNull();
            first.unmount();

            const second = render(<ARAConsole />);
            await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            expect(second.container.querySelector('.ara-resume-chip')).toBeNull();
        });

        it('the resume starter inserts the exact grounded prompt into the composer (not auto-sent)', async () => {
            seedSession();
            patchWidgetMemory('scribe', { activeFilepath: '/docs/WoodlandLease.md' });
            const user = userEvent.setup();
            render(<ARAConsole />);
            const textbox = await screen.findByPlaceholderText('Message ARA (Executive Assistant)');
            await user.click(screen.getByRole('button', { name: 'Pick up where I left off' }));
            expect(textbox).toHaveValue('I was last working on WoodlandLease.md in Scribe. Give me a quick re-orientation: what this document is, and suggest the next 2–3 concrete actions to continue.');
            // Not auto-sent: no user message posted yet.
            expect(document.querySelector('.ara-message--user')).toBeNull();
        });
    });


    describe('ARA — a spawned agent answer has no Sources, so it gets a 👍 (and is reused only after one)', () => {
        beforeEach(() => {
            localStorage.clear();
            hermesLearningStore.reset();
            callLlmMock.mockReset();
            araPrefsStore.set('ttsEnabled', false);
            Element.prototype.scrollIntoView = vi.fn();
            llmActive = true;
            callLlmMock.mockResolvedValue({ text: 'The lease renews on March 1.', provider: 'anthropic', model: 'x' });
        });

        it('solo spawn: the answer says it was not fact-checked, and 👍 makes it reusable', async () => {
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on when does the lease renew');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/The lease renews on March 1\./);
            expect(await screen.findByText(/not fact-checked \(no Sources\).*agents will reuse it/i)).toBeInTheDocument();

            const rec = hermesLearningStore.getSnapshot().find(r => r.prompt === 'when does the lease renew')!;
            expect(rec).toMatchObject({ outcome: 'fail', unchecked: true });
            expect(relevantPastRuns(rec.prompt, 3).map(r => r.id)).not.toContain(rec.id);
            await user.click(await screen.findByRole('button', { name: 'Rate this answer up' }));
            expect(hermesLearningStore.getSnapshot().find(r => r.id === rec.id)?.rating).toBe(1);
            expect(relevantPastRuns(rec.prompt, 3).map(r => r.id)).toContain(rec.id);
        });

        it('a direct team spawn gets the note and a 👍 for the team run', async () => {
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'spawn research squad on lease renewals');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            expect(await screen.findByText(/not fact-checked \(no Sources\)/i, undefined, { timeout: 4000 })).toBeInTheDocument();
            const rec = hermesLearningStore.getSnapshot().find(r => r.prompt === 'lease renewals')!;
            expect(rec).toMatchObject({ outcome: 'fail', unchecked: true });
            await user.click(await screen.findByRole('button', { name: 'Rate this answer up' }));
            expect(hermesLearningStore.getSnapshot().find(r => r.id === rec.id)?.rating).toBe(1);
        });

        it('direct solo spawn that got no answer: says it failed, saves no artifact, never announces "has finished"', async () => {
            araPrefsStore.set('ttsEnabled', true);
            vi.stubGlobal('SpeechSynthesisUtterance', class { rate = 1; pitch = 1; volume = 1; voice = null; onend = null; onerror = null; constructor(public text: string) {} }); // jsdom has none
            callLlmMock.mockResolvedValue({ text: '', provider: 'anthropic', model: 'x' });
            const user = userEvent.setup();
            render(<ARAConsole />);
            (artifactStore as unknown as { reset?: () => void }).reset?.(); // earlier tests saved the same text; the store skips duplicates
            const artifactsBefore = artifactStore.getSnapshot().length;
            const speakCalls = () => (window.speechSynthesis.cancel as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
            const spokenBefore = speakCalls();
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on when does the lease renew');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Researcher failed:/);
            expect(document.body.textContent).toMatch(/Researcher failed: No response from the model/);
            expect(artifactStore.getSnapshot().length).toBe(artifactsBefore);
            expect(speakCalls()).toBe(spokenBefore);
        });

        it('direct solo spawn that answered (control): saves the artifact and announces it', async () => {
            araPrefsStore.set('ttsEnabled', true);
            vi.stubGlobal('SpeechSynthesisUtterance', class { rate = 1; pitch = 1; volume = 1; voice = null; onend = null; onerror = null; constructor(public text: string) {} }); // jsdom has none
            const user = userEvent.setup();
            render(<ARAConsole />);
            (artifactStore as unknown as { reset?: () => void }).reset?.(); // earlier tests saved the same text; the store skips duplicates
            const artifactsBefore = artifactStore.getSnapshot().length;
            const speakCalls = () => (window.speechSynthesis.cancel as unknown as { mock: { calls: unknown[] } }).mock.calls.length;
            const spokenBefore = speakCalls();
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on when does the lease renew');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/The lease renews on March 1\./);
            await waitFor(() => expect(speakCalls()).toBeGreaterThan(spokenBefore));
            expect(artifactStore.getSnapshot().length).toBe(artifactsBefore + 1);
            expect(document.body.textContent).not.toMatch(/failed:/);
        });

        it('direct spawn whose provider errored shows the provider\'s message, not its raw JSON', async () => {
            callLlmMock.mockRejectedValue(Object.assign(new Error('[custom] {"error":{"message":"Model \'x\' is currently unavailable.","type":"invalid_request_error"}}'), { status: 400 }));
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on when does the lease renew');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Researcher failed:/);
            expect(document.body.textContent).toMatch(/Researcher failed: \[custom\] 400 Model 'x' is currently unavailable\./);
            expect(document.body.textContent).not.toMatch(/invalid_request_error|\{"error"/);
        });

        it('the "taking on:" header shows a goal with underscores and code cleanly (no stray _ or *)', async () => {
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on check user_id_map and `on_demand`');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            const header = (await screen.findByText(/taking on:/)).closest('.ara-line') as HTMLElement;
            expect(header.textContent).toBe('Researcher taking on: check user_id_map and on_demand');
            expect(header.querySelector('em')?.textContent).toBe('check user_id_map and on_demand');
            expect(header.querySelector('em code')?.textContent).toBe('on_demand');
        });

        it('the "taking on:" header shows a goal containing * cleanly', async () => {
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on find all *.tsx files');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            const header = (await screen.findByText(/taking on:/)).closest('.ara-line') as HTMLElement;
            expect(header.textContent).toBe('Researcher taking on: find all *.tsx files');
            expect(header.querySelector('em')?.textContent).toBe('find all *.tsx files');
        });

        it('direct team spawn where no member answered says the team failed and saves nothing', async () => {
            callLlmMock.mockResolvedValue({ text: '', provider: 'anthropic', model: 'x' });
            (artifactStore as unknown as { reset?: () => void }).reset?.();
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'spawn research squad on lease renewals');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Research Squad failed:/, undefined, { timeout: 4000 });
            expect(document.body.textContent).toMatch(/Research Squad failed: No team member produced a result/);
            expect(artifactStore.getSnapshot()).toHaveLength(0);
            expect(screen.queryByRole('button', { name: 'Rate this answer up' })).toBeNull();
        });

        it('direct team spawn whose merge step failed says "Finished with problems" instead of a clean finish', async () => {
            callLlmMock.mockImplementation(async (req: { prompt?: string }) => {
                if (String(req.prompt ?? '').includes('Merge these into one')) throw new Error('[anthropic] 529 Overloaded');
                return { text: 'Member answer about renewals.', provider: 'anthropic', model: 'x' };
            });
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'spawn research squad on lease renewals');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Finished with problems:/, undefined, { timeout: 4000 });
            expect(document.body.textContent).toMatch(/Finished with problems: Merge step failed/);
        });

        it('a spawn that produced no answer gets no 👍 and no note', async () => {
            callLlmMock.mockResolvedValue({ text: '', provider: 'anthropic', model: 'x' });
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'solo researcher on when does the lease renew');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/No output — the model returned nothing\.|No response from the model/);
            expect(screen.queryByRole('button', { name: 'Rate this answer up' })).toBeNull();
            expect(screen.queryByText(/not fact-checked/i)).toBeNull();
        });

        it('a spawn step that hit a provider error shows the provider\'s message, not its raw JSON', async () => {
            callLlmMock.mockRejectedValue(Object.assign(new Error('[custom] {"error":{"message":"Model \'x\' is currently unavailable.","type":"invalid_request_error"}}'), { status: 400 }));
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'calculate 2+2 then solo researcher on lease renewals');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Finished with hiccups/, undefined, { timeout: 6000 });
            expect(document.body.textContent).toMatch(/Step 2 — failed: \[custom\] 400 Model 'x' is currently unavailable\./);
            expect(document.body.textContent).not.toMatch(/invalid_request_error|\{"error"/);
            expect(document.body.textContent).toMatch(/Finished with hiccups — 1 step failed/);
        });

        it('a chain that ends in a failed spawn does not say "All done"', async () => {
            callLlmMock.mockResolvedValue({ text: '', provider: 'anthropic', model: 'x' });
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'calculate 2+2 then solo researcher on lease renewals');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Finished with hiccups|All done\./, undefined, { timeout: 6000 });
            expect(document.body.textContent).toMatch(/Finished with hiccups/);
            expect(document.body.textContent).not.toMatch(/All done\./);
        });

        it('a chain whose spawn step got no answer marks that step failed, ends with hiccups, and does not pipe the error on', async () => {
            callLlmMock.mockResolvedValue({ text: '', provider: 'anthropic', model: 'x' }); // the model returns nothing
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'calculate 2+2 then solo researcher on lease renewals then calculate the result + 10');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/Finished with hiccups/, undefined, { timeout: 6000 });
            const chainText = document.body.textContent ?? '';
            expect(chainText).toMatch(/Step 1 — 2\+2 = 4/);            // a good step is not labelled failed
            expect(chainText).not.toMatch(/Step 1 — failed/);
            expect(chainText).toMatch(/Step 2 — failed/);
            expect(chainText).not.toMatch(/All done\./);
            // step 3's "the result" meant the failed spawn's answer — so it fails too, and never
            // computes on the error text or on step 1's older result
            const step3 = chainText.slice(chainText.indexOf('Step 3'));
            expect(step3).toMatch(/^Step 3 — failed/);
            expect(step3).not.toMatch(/No response from the model/);
            expect(step3).not.toMatch(/= 14/);
            expect(chainText).toMatch(/Finished with hiccups — 2 steps failed/);
            expect(screen.queryByRole('button', { name: 'Rate this answer up' })).toBeNull();
        });

        it('a chain with two spawn steps gets no 👍 (one pair of buttons cannot rate two answers)', async () => {
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'calculate 2+2 then solo researcher on lease renewals then solo data analyst on rent roll');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/All done\.|Finished with hiccups/, undefined, { timeout: 6000 });
            const recs = hermesLearningStore.getSnapshot().filter(r => r.prompt === 'lease renewals' || r.prompt === 'rent roll');
            expect(recs).toHaveLength(2);
            expect(screen.queryByRole('button', { name: 'Rate this answer up' })).toBeNull();
        });

        it('a chain with exactly one spawn step gets a 👍 for that run', async () => {
            const user = userEvent.setup();
            render(<ARAConsole />);
            await user.type(await screen.findByPlaceholderText('Message ARA (Executive Assistant)'), 'calculate 2+2 then spawn research squad on lease renewals');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await screen.findByText(/All done\.|Finished with hiccups/, undefined, { timeout: 4000 });
            const rec = hermesLearningStore.getSnapshot().find(r => r.prompt === 'lease renewals')!;
            expect(rec).toMatchObject({ outcome: 'fail', unchecked: true });
            await user.click(await screen.findByRole('button', { name: 'Rate this answer up' }));
            expect(hermesLearningStore.getSnapshot().find(r => r.id === rec.id)?.rating).toBe(1);
        });
    });
    // Owner-race guard: ARA holds no per-user state of its own, but its replies write into the
    // signed-in user's Hermes log. A reply that lands after an account switch must be dropped,
    // never written into the next account's log.
    describe('owner-race guard — an account switch mid-request drops ARA writes', () => {
        const asUser = (uid: string) => (
            <UserContext.Provider value={{ user: { id: uid } } as any}><ARAConsole /></UserContext.Provider>
        );
        const flush = () => act(async () => { await new Promise(r => setTimeout(r, 60)); });
        beforeEach(() => {
            hermesLearningStore.reset();
            callLlmMock.mockReset();
            setPerUserIdentity('user-a'); // ARA's prefs are per-user: quiet user-a's before it mounts
            araPrefsStore.set('ttsEnabled', false);
            araPrefsStore.set('streamTokens', false);
            Element.prototype.scrollIntoView = vi.fn();
        });
        afterEach(() => setPerUserIdentity(null));

        const quickChat = async (switchMidRequest: boolean) => {
            const base = authFetch.getMockImplementation()!;
            let release!: () => void;
            const gate = new Promise<void>(r => { release = r; });
            authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
                if (url.endsWith('/chat')) await gate;
                return base(url, opts);
            });
            const user = userEvent.setup();
            const { rerender } = render(asUser('user-a'));
            await user.type(await screen.findByPlaceholderText(/Message ARA/), 'summarize my week');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await waitFor(() => expect(authFetch.mock.calls.some((c: any[]) => String(c[0]).endsWith('/chat'))).toBe(true));
            if (switchMidRequest) rerender(asUser('user-b'));
            release();
            await flush();
        };

        it('quick chat: the backend reply lands after the switch → no Hermes record, no reply shown', async () => {
            await quickChat(true);
            expect(hermesLearningStore.getSnapshot()).toEqual([]);
            expect(screen.queryByText('I can help with that.')).toBeNull();
        });

        it('control: quick chat with no switch records the exchange', async () => {
            await quickChat(false);
            expect(hermesLearningStore.getSnapshot().map(r => r.prompt)).toContain('summarize my week');
        });

        it('quick chat: the backend fails after the switch → no LLM fallback answer on the old key', async () => {
            llmActive = true;
            const base = authFetch.getMockImplementation()!;
            let release!: () => void;
            const gate = new Promise<void>(r => { release = r; });
            authFetch.mockImplementation(async (url: string, opts?: RequestInit) => {
                if (url.endsWith('/chat')) { await gate; throw new Error('Backend unreachable'); }
                return base(url, opts);
            });
            const user = userEvent.setup();
            const { rerender } = render(asUser('user-a'));
            await user.type(await screen.findByPlaceholderText(/Message ARA/), 'what is on my plate this week?');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await waitFor(() => expect(authFetch.mock.calls.some((c: any[]) => String(c[0]).endsWith('/chat'))).toBe(true));
            rerender(asUser('user-b'));
            release();
            await flush();
            expect(callLlmMock.mock.calls.some(([req]: any[]) => /backend is offline/.test(req?.systemPrompt ?? ''))).toBe(false);
            expect(hermesLearningStore.getSnapshot()).toEqual([]);
        });

        it('control: the backend fails with no switch → the LLM fallback answers', async () => {
            llmActive = true;
            chatShouldThrow = true;
            callLlmMock.mockResolvedValue({ text: 'Fallback answer.', provider: 'anthropic', model: 'x' });
            const user = userEvent.setup();
            render(asUser('user-a'));
            await user.type(await screen.findByPlaceholderText(/Message ARA/), 'what is on my plate this week?');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            expect(await screen.findByText('Fallback answer.')).toBeInTheDocument();
        });

        it('solo spawn: the persona answers after the switch → no Hermes record', async () => {
            llmActive = true;
            let answer!: (v: unknown) => void;
            callLlmMock.mockReturnValue(new Promise(r => { answer = r; }));
            const user = userEvent.setup();
            const { rerender } = render(asUser('user-a'));
            await user.type(await screen.findByPlaceholderText(/Message ARA/), 'solo researcher on when does the lease renew');
            await user.click(screen.getByRole('button', { name: 'Send message' }));
            await waitFor(() => expect(callLlmMock).toHaveBeenCalled());
            rerender(asUser('user-b'));
            answer({ text: 'The lease renews on March 1.', provider: 'anthropic', model: 'x' });
            await flush();
            expect(hermesLearningStore.getSnapshot()).toEqual([]);
            expect(screen.getByText(/account changed during this run/i)).toBeInTheDocument(); // not a stuck "working…"
        });
    });
});
