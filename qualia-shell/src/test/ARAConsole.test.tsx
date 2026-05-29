import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, beforeEach, expect } from 'vitest';

const authFetch = vi.fn();

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
                        icon: '📋',
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

    it('shows context sources and diagnostics for ARA replies', async () => {
        const user = userEvent.setup();
        render(<ARAConsole />);

        const textbox = await screen.findByPlaceholderText('Message ARA (Chief of Staff)');
        await user.type(textbox, 'What should I do next?');
        await user.click(screen.getByRole('button', { name: '➤' }));

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

        const textbox = await screen.findByPlaceholderText('Message ARA (Chief of Staff)');
        await user.type(textbox, 'Create follow-up tasks');
        await user.click(screen.getByRole('button', { name: '➤' }));
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
        localStorage.setItem('dwellium-ara-session-chief-of-staff', JSON.stringify({
            sessionId: 'session-restored',
            lastRequest: null,
            messages: [{
                id: 'msg-restored',
                role: 'assistant',
                content: 'Restored conversation reply.',
                timestamp: Date.now(),
                mode: 'chief-of-staff',
            }],
        }));

        render(<ARAConsole />);

        expect(await screen.findByText('Restored conversation reply.')).toBeInTheDocument();
    });
});
