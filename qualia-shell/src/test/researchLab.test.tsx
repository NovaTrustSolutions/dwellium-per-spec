/**
 * ResearchLab widget — playground render, side-by-side run with mocked fetch,
 * verbatim 429 rendering, guard block surfacing, and the honest
 * CORS-blocked badge + disabled chip.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

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
import { researchLogStore, researchLogUserIdHolder, resetResearchLog } from '../lib/researchLlm/researchLogStore';

const okJson = (content: string, usage = { prompt_tokens: 5, completion_tokens: 7 }) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });

beforeEach(() => {
    localStorage.clear();
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

    it('the outbound guard BLOCKS card-shaped prompts before any fetch', () => {
        setResearchKey('groq', 'gsk-1');
        const spy = vi.spyOn(globalThis, 'fetch');
        render(<ResearchLab />);
        typePrompt('charge 4111 1111 1111 1111 for the deposit');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(screen.getByRole('alert').textContent).toMatch(/Blocked: .*card-number/);
        expect(spy).not.toHaveBeenCalled();
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
        render(<ResearchLab />);
        typePrompt('anything');
        fireEvent.click(screen.getByRole('button', { name: /Groq \(no key\)/ }));
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));
        expect(screen.getByRole('alert').textContent).toMatch(/No API key set for Groq/);
    });

    it('Providers tab lists the 21 browser-verified rows — excluded providers are simply absent (Ilya 2026-08-29)', () => {
        render(<ResearchLab />);
        fireEvent.click(screen.getByRole('tab', { name: /Providers \(21\)/ }));
        expect(screen.getByText('Groq')).toBeInTheDocument();
        expect(screen.queryByText('Cline')).not.toBeInTheDocument();
        expect(screen.queryByText('NVIDIA NIM')).not.toBeInTheDocument();
        expect(screen.queryByText('unusable')).not.toBeInTheDocument();
        expect(screen.getAllByText(/Get key/)).not.toHaveLength(0);
    });
});
