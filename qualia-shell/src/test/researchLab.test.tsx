/**
 * ResearchLab widget — playground render, side-by-side run with mocked fetch,
 * verbatim 429 rendering, guard block surfacing, and the honest
 * CORS-blocked badge + disabled chip.
 */
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: {
        get: vi.fn().mockResolvedValue(null),
        put: vi.fn().mockResolvedValue(undefined),
        remove: vi.fn().mockResolvedValue(undefined),
        history: vi.fn(),
    },
}));

import ResearchLab from '../components/ResearchLab/ResearchLab';
import { resetGuardSession } from '../lib/researchLlm/guard';
import { researchKeysUserIdHolder, resetResearchKeys, setResearchKey } from '../lib/researchLlm/researchKeysStore';
import { addLogEntry, researchLogStore, researchLogUserIdHolder, resetResearchLog } from '../lib/researchLlm/researchLogStore';
import { patchWidgetMemory, resetWidgetMemory } from '../lib/widgetMemory';

const okJson = (content: string, usage = { prompt_tokens: 5, completion_tokens: 7 }) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

beforeEach(() => {
    localStorage.clear();
    resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
    researchKeysUserIdHolder.current = null;
    researchLogUserIdHolder.current = null;
    resetResearchKeys();
    resetResearchLog();
    resetGuardSession();
});
afterEach(() => {
    vi.restoreAllMocks();
});

const typePrompt = (text: string) =>
    fireEvent.change(screen.getByLabelText('Research prompt'), { target: { value: text } });

describe('ResearchLab widget', () => {
    it('always shows the sandbox banner and honest empty state', () => {
        render(<ResearchLab />);
        expect(screen.getByText(/Research sandbox — isolated from all property data/)).toBeInTheDocument();
        expect(screen.getByText(/No runs yet/)).toBeInTheDocument();
    });

    it('runs the SAME prompt side-by-side; 429 errors render verbatim with latency', async () => {
        setResearchKey('groq', 'gsk-1');
        setResearchKey('mistral', 'msk-1');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            if (String(url).includes('groq')) return okJson('The capital of France is Paris.');
            return new Response('{"error":{"message":"Rate limit reached, retry in 20s"}}', { status: 429 });
        });
        render(<ResearchLab />);
        typePrompt('capital of France?');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mistral AI' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'llama-3.3-70b-versatile' } });
        fireEvent.change(screen.getByLabelText('Mistral AI model id'), { target: { value: 'open-mistral-7b' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));

        expect(await screen.findByText('The capital of France is Paris.')).toBeInTheDocument();
        // 429 shown honestly, provider's words verbatim
        expect(screen.getByText(/HTTP 429: .*Rate limit reached, retry in 20s/)).toBeInTheDocument();
        // token usage rendered for the successful run (head div mixes nodes → function matcher)
        expect(screen.getByText((_, el) => !!el && el.classList.contains('rl-result-head') && /5→7 tok/.test(el.textContent ?? ''))).toBeInTheDocument();
        // both runs landed in the experiments log
        expect(researchLogStore.getSnapshot()[0].responses).toHaveLength(2);
        expect(researchLogStore.getSnapshot()[0].prompt).toBe('capital of France?');
    });

    it('the outbound guard BLOCKS card-shaped prompts before any chat-completion fetch', () => {
        setResearchKey('groq', 'gsk-1');
        // Selecting a provider now fetches its model list (plan 062 phase 4) —
        // that carries no prompt text, so it's expected here. What must never
        // happen is a /chat/completions call while the guard is blocking.
        const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
        render(<ResearchLab />);
        typePrompt('charge 4111 1111 1111 1111 for the deposit');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(screen.getByRole('alert').textContent).toMatch(/Blocked: .*card-number/);
        expect(spy.mock.calls.some(([url]) => String(url).includes('/chat/completions'))).toBe(false);
    });

    it('a fetch TypeError badges the provider browser-blocked and disables its chip', async () => {
        setResearchKey('cohere', 'ck-1');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        render(<ResearchLab />);
        typePrompt('hello there');
        fireEvent.click(screen.getByRole('button', { name: 'Cohere' }));
        fireEvent.change(screen.getByLabelText('Cohere model id'), { target: { value: 'command-r' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(await screen.findByText(/stopped allowing browser calls/)).toBeInTheDocument();

        // Providers tab: honest regression badge (the shipped set passed the 2026-08-29 CORS audit)
        fireEvent.click(screen.getByRole('tab', { name: /Providers/ }));
        expect(screen.getByText('stopped allowing browser calls')).toBeInTheDocument();

        // Playground: the chip is now selectable-but-disabled
        fireEvent.click(screen.getByRole('tab', { name: 'Playground' }));
        expect(screen.getByRole('button', { name: 'Cohere' })).toBeDisabled();
    });

    it('missing key / missing model produce honest notices instead of a doomed request', () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
        render(<ResearchLab />);
        typePrompt('anything');
        fireEvent.click(screen.getByRole('button', { name: /Groq \(no key\)/ }));
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(screen.getByRole('alert').textContent).toMatch(/No API key set for Groq/);
    });

    it('Providers tab lists the 22 rows (21 keyed + 1 keyless) — excluded providers are simply absent (Ilya 2026-08-29)', () => {
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('tab', { name: /Providers \(22\)/ }));
        expect(screen.getByText('Groq')).toBeInTheDocument();
        expect(screen.queryByText('Cline')).not.toBeInTheDocument();
        expect(screen.queryByText('NVIDIA NIM')).not.toBeInTheDocument();
        expect(screen.queryByText('unusable')).not.toBeInTheDocument();
        expect(screen.getAllByText(/Get key/)).not.toHaveLength(0);
    });

    it('a keyOptional provider (LLM7.io) runs with NO key: chip says "works without a key", model list loads, Run is not gated', async () => {
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            if (String(url).includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'GLM-5.3-Flash' }] }), { status: 200 });
            return okJson('anonymous pong');
        });
        render(<ResearchLab />);
        const chip = screen.getByRole('button', { name: /LLM7\.io/ });
        expect(chip.textContent).toMatch(/key optional/);
        expect(chip.textContent).toMatch(/works without a key/);
        typePrompt('ping');
        fireEvent.click(chip);
        const select = await screen.findByRole('combobox', { name: 'LLM7.io model' });
        fireEvent.change(select, { target: { value: 'GLM-5.3-Flash' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(await screen.findByText('anonymous pong')).toBeInTheDocument();
        expect(screen.queryByText(/No API key set/)).not.toBeInTheDocument();
    });

    it('the keyless Pollinations provider is always-ready: no key input, a model dropdown of both labels, and Run works with zero setup', async () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(okJson('anonymous hello'));
        render(<ResearchLab />);

        // Keys tab: no key input for the keyless provider.
        fireEvent.click(screen.getByRole('tab', { name: 'Keys' }));
        expect(screen.queryByLabelText('Pollinations (free · no key) API key')).not.toBeInTheDocument();

        // Playground: select it — no key was ever set.
        fireEvent.click(screen.getByRole('tab', { name: 'Playground' }));
        typePrompt('hello there');
        fireEvent.click(screen.getByRole('button', { name: /Pollinations/ }));

        // Model picker is a dropdown carrying both verified labels.
        const dropdown = screen.getByLabelText('Pollinations (free · no key) model');
        expect(dropdown.tagName).toBe('SELECT');
        expect(screen.getByRole('option', { name: 'GPT-class · anonymous' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'GPT-OSS-20B reasoning' })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(await screen.findByText('anonymous hello')).toBeInTheDocument();
        // Never nagged for a key.
        expect(screen.queryByText(/No API key set/)).not.toBeInTheDocument();
    });
});

// Plan 062 phase 1 — the widget can hang forever: timeout, independent
// results, cancel.
describe('ResearchLab — run loop hardening (plan 062 phase 1)', () => {
    it('results land independently as each provider settles; a not-yet-settled slot shows "waiting…"', async () => {
        setResearchKey('groq', 'gsk-1');
        setResearchKey('mistral', 'msk-1');
        let resolveSlow!: (r: Response) => void;
        const slow = new Promise<Response>(res => { resolveSlow = res; });
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            const u = String(url);
            // Route the model-list probe (fired on chip select, plan 062
            // phase 4) away from the chat-completion fixtures below — it must
            // not share (and double-consume) the `slow` Response body.
            if (u.includes('/models')) return new Response(JSON.stringify({ data: [] }), { status: 200 });
            if (u.includes('groq')) return okJson('fast answer');
            return slow;
        });
        render(<ResearchLab />);
        typePrompt('race the providers');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mistral AI' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm1' } });
        fireEvent.change(screen.getByLabelText('Mistral AI model id'), { target: { value: 'm2' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));

        expect(await screen.findByText('fast answer')).toBeInTheDocument();
        expect(screen.getByText('waiting…')).toBeInTheDocument(); // mistral hasn't settled yet

        await act(async () => {
            resolveSlow(okJson('slow answer'));
            await slow;
        });
        expect(await screen.findByText('slow answer')).toBeInTheDocument();
        expect(screen.queryByText('waiting…')).not.toBeInTheDocument();
    });

    it('the Run button swaps to Cancel while running, and Cancel yields "Cancelled." for the pending run', async () => {
        setResearchKey('groq', 'gsk-1');
        vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            const signal = (init as RequestInit).signal;
            signal?.addEventListener('abort', () => reject(signal.reason ?? new DOMException('aborted', 'AbortError')));
        }));
        render(<ResearchLab />);
        typePrompt('cancel me');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm1' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));

        const cancelBtn = await screen.findByRole('button', { name: /Cancel/ });
        fireEvent.click(cancelBtn);

        expect(await screen.findByText('Cancelled.')).toBeInTheDocument();
        expect(await screen.findByRole('button', { name: /^Run$/ })).toBeInTheDocument();
    });

    it('a provider that never resolves shows "Timed out after 60s." on its own card while another provider\'s answer is already on screen', async () => {
        setResearchKey('groq', 'gsk-1');
        setResearchKey('mistral', 'msk-1');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            if (String(url).includes('groq')) return okJson('fast answer');
            // Simulate the real AbortSignal.timeout() outcome directly rather
            // than waiting 60 real seconds or using vi.useFakeTimers (unsafe
            // with the React 19 scheduler per this repo's CLAUDE.md).
            throw new DOMException('The operation timed out.', 'TimeoutError');
        });
        render(<ResearchLab />);
        typePrompt('one hangs');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mistral AI' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm1' } });
        fireEvent.change(screen.getByLabelText('Mistral AI model id'), { target: { value: 'm2' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));

        expect(await screen.findByText('fast answer')).toBeInTheDocument();
        expect(await screen.findByText('Timed out after 60s.')).toBeInTheDocument();
    });

    it('unmounting mid-run aborts the controller and produces no console errors', async () => {
        setResearchKey('groq', 'gsk-1');
        let aborted = false;
        vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => {
            const signal = (init as RequestInit).signal;
            signal?.addEventListener('abort', () => { aborted = true; reject(signal.reason ?? new DOMException('aborted', 'AbortError')); });
        }));
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { unmount } = render(<ResearchLab />);
        typePrompt('leave mid-flight');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm1' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        await screen.findByRole('button', { name: /Cancel/ });

        unmount();
        await act(async () => { await Promise.resolve(); });

        expect(aborted).toBe(true);
        expect(errorSpy).not.toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});

// Plan 062 phase 2 — stop lying on three surfaces: CORS verdicts persist in
// widgetMemory (not component state), a stale verdict expires, and the 5th
// chip no longer does nothing silently.
describe('ResearchLab — honest surfaces (plan 062 phase 2)', () => {
    it('a blocked CORS verdict persists across unmount + remount (widgetMemory-backed, not component state)', async () => {
        setResearchKey('cohere', 'ck-1');
        vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
        const { unmount } = render(<ResearchLab />);
        typePrompt('hello there');
        fireEvent.click(screen.getByRole('button', { name: 'Cohere' }));
        fireEvent.change(screen.getByLabelText('Cohere model id'), { target: { value: 'command-r' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        await screen.findByText(/stopped allowing browser calls/);
        unmount();

        render(<ResearchLab />);
        expect(screen.getByRole('button', { name: 'Cohere' })).toBeDisabled();
    });

    it('a CORS verdict older than 7 days is re-offered instead of blocklisted forever', () => {
        const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
        patchWidgetMemory('research-lab', { cors: { mistral: { status: 'blocked', checkedAt: eightDaysAgo } } });
        render(<ResearchLab />);
        expect(screen.getByRole('button', { name: /^Mistral AI/ })).not.toBeDisabled();
    });

    it('a CORS verdict inside the 7-day window still blocks the chip', () => {
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        patchWidgetMemory('research-lab', { cors: { mistral: { status: 'blocked', checkedAt: oneDayAgo } } });
        render(<ResearchLab />);
        expect(screen.getByRole('button', { name: /^Mistral AI/ })).toBeDisabled();
    });

    it('the 5th provider chip raises a notice instead of silently doing nothing', () => {
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status: 200 }));
        render(<ResearchLab />);
        const names = [/^Pollinations/, /^ModelScope/, /^Google Gemini/, /^LLM7\.io/, /^OVHcloud/];
        for (const n of names.slice(0, 4)) fireEvent.click(screen.getByRole('button', { name: n }));
        fireEvent.click(screen.getByRole('button', { name: names[4] }));
        expect(screen.getByRole('alert').textContent).toMatch(/Pick at most 4 providers — deselect one first\./);
    });
});

// Plan 062 phase 3 — History keeps the answers it already stores.
describe('ResearchLab — History keeps its answers (plan 062 phase 3)', () => {
    it('a logged entry expands via its chevron to show the stored answer text and latency', () => {
        addLogEntry({
            prompt: 'compare them',
            systemPreset: 'blank',
            responses: [{ providerId: 'groq', model: 'llama-3.3-70b-versatile', text: 'stored answer text', latencyMs: 842 }],
        });
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('tab', { name: 'History' }));
        expect(screen.queryByText('stored answer text')).not.toBeInTheDocument(); // collapsed by default

        fireEvent.click(screen.getByRole('button', { name: /Expand log entry/ }));
        expect(screen.getByText('stored answer text')).toBeInTheDocument();
        expect(screen.getByText((_, el) => !!el && el.classList.contains('rl-result-head') && /842 ms/.test(el.textContent ?? ''))).toBeInTheDocument();
    });

    it('Re-run loads the entry\'s prompt + preset into the Playground and switches tabs', () => {
        addLogEntry({ prompt: 'the old prompt', systemPreset: 'drafter', responses: [{ providerId: 'groq', model: 'm', text: 'x', latencyMs: 5 }] });
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('tab', { name: 'History' }));
        fireEvent.click(screen.getByRole('button', { name: 'Re-run this prompt' }));

        expect(screen.getByRole('tab', { name: 'Playground' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByLabelText('Research prompt')).toHaveValue('the old prompt');
        expect(screen.getByLabelText('System preset')).toHaveValue('drafter');
    });
});

// Plan 062 phase 4 — real model pickers instead of typing ids from memory.
describe('ResearchLab — real model pickers (plan 062 phase 4)', () => {
    it('a provider whose /models returns ids renders a select, sorted alphabetically', async () => {
        setResearchKey('groq', 'gsk-1');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'c-model' }, { id: 'a-model' }, { id: 'b-model' }] }), { status: 200 }));
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));

        const select = await screen.findByLabelText('Groq model');
        expect(select.tagName).toBe('SELECT');
        // Scoped to this provider's own select — the page also has the
        // unrelated System-preset <select> with its own <option>s.
        const optionTexts = within(select).getAllByRole('option').map(o => o.textContent);
        expect(optionTexts).toEqual(['a-model', 'b-model', 'c-model']);
    });

    // Regression (found live 2026-09-19): main.tsx renders under StrictMode,
    // whose dev double-invoke ran the unmount cleanup once and left
    // unmountedRef stuck at true — every post-await state update (model list
    // AND run results) was silently skipped. RTL alone never double-mounts.
    it('under StrictMode the model list still lands and a run still renders (unmountedRef resets on re-mount)', async () => {
        setResearchKey('groq', 'gsk-1');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            if (String(url).includes('/models')) return new Response(JSON.stringify({ data: [{ id: 'llama-x' }] }), { status: 200 });
            return okJson('strict answer');
        });
        render(<StrictMode><ResearchLab /></StrictMode>);
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        // findByRole('combobox') — the free-text INPUT carries the same label until the list lands.
        const select = await screen.findByRole('combobox', { name: 'Groq model' });
        fireEvent.change(select, { target: { value: 'llama-x' } });
        typePrompt('strict?');
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(await screen.findByText('strict answer')).toBeInTheDocument();
    });

    it('a selection restored from widget memory fetches its model list on mount', async () => {
        setResearchKey('groq', 'gsk-1');
        patchWidgetMemory('research-lab', { selected: { groq: '' } });
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'restored-model' }] }), { status: 200 }));
        render(<ResearchLab />);
        const select = await screen.findByRole('combobox', { name: 'Groq model' });
        expect(within(select).getAllByRole('option').map(o => o.textContent)).toEqual(['restored-model']);
    });

    it('a provider whose /models 404s still renders the free-text input', async () => {
        setResearchKey('mistral', 'msk-1');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('button', { name: 'Mistral AI' }));

        await waitFor(() => expect(screen.getByLabelText('Mistral AI model id').tagName).toBe('INPUT'));
    });

    it('"type a model id instead" swaps a populated dropdown for the free-text input', async () => {
        setResearchKey('groq', 'gsk-1');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'm1' }] }), { status: 200 }));
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        expect((await screen.findByLabelText('Groq model')).tagName).toBe('SELECT');

        fireEvent.click(screen.getByRole('button', { name: 'type a model id instead' }));
        expect(screen.getByLabelText('Groq model id').tagName).toBe('INPUT');
    });

    it('the keyless Pollinations fixed menu is untouched — selecting it fires no /models fetch', () => {
        const spy = vi.spyOn(globalThis, 'fetch');
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('button', { name: /Pollinations/ }));
        expect(spy).not.toHaveBeenCalled();
        expect(screen.getByLabelText('Pollinations (free · no key) model').tagName).toBe('SELECT');
    });

    it('remembers the last-used model per provider: deselect + reselect prefills the remembered pick', async () => {
        setResearchKey('groq', 'gsk-1');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), { status: 200 }));
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        const select = await screen.findByLabelText('Groq model');
        fireEvent.change(select, { target: { value: 'model-b' } });

        fireEvent.click(screen.getByRole('button', { name: 'Groq' })); // deselect
        fireEvent.click(screen.getByRole('button', { name: 'Groq' })); // reselect

        expect(await screen.findByLabelText('Groq model')).toHaveValue('model-b');
    });
});
