import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import FactCheckLog from '../components/FactCheckLog/FactCheckLog';

/**
 * Fact Check must say what actually failed. Rendered without a UserProvider
 * the widget reads the anonymous integrations namespace (no active LLM), so
 * these cases exercise the "no provider" wording plus each backend outcome.
 */

const okLog = { ok: true, status: 200, json: async () => ({ success: true, data: { entries: [] } }) };

function mockFetch(onCheck: () => Promise<unknown>) {
    const fn = vi.fn(async (url: string, _init?: RequestInit) => {
        if (String(url).endsWith('/log')) return okLog;
        return onCheck();
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    return fn;
}

async function submitClaim(text: string) {
    const input = await screen.findByPlaceholderText('Paste a claim to fact-check…');
    fireEvent.change(input, { target: { value: text } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // The explanation renders only when the entry is expanded: click the new row.
    fireEvent.click(await screen.findByText(text));
}

describe('FactCheckLog failure wording', () => {
    const realFetch = globalThis.fetch;
    beforeEach(() => { localStorage.clear(); });
    afterEach(() => { globalThis.fetch = realFetch; vi.restoreAllMocks(); });

    it('names the missing provider AND the network failure, never a bare "No LLM configured"', async () => {
        mockFetch(() => Promise.reject(new Error('Failed to fetch')));
        render(<FactCheckLog />);
        await submitClaim('Water boils at 100 C at sea level');
        const entry = await screen.findByText(/No LLM provider is active/);
        expect(entry.textContent).toMatch(/backend unreachable \(Failed to fetch\)/);
        expect(screen.queryByText(/No LLM configured and backend offline/)).toBeNull();
    });

    it('reports a non-JSON backend answer with its status (a proxy timeout page, for example)', async () => {
        mockFetch(async () => ({ ok: false, status: 504, json: async () => { throw new SyntaxError('Unexpected token <'); } }));
        render(<FactCheckLog />);
        await submitClaim('The Eiffel Tower is in Paris');
        const entry = await screen.findByText(/non-JSON body \(HTTP 504\)/);
        expect(entry).toBeTruthy();
    });

    it('sends the session token on the backend fallback', async () => {
        localStorage.setItem('dwellium-auth-token', 'jwt-test');
        const fn = mockFetch(async () => ({ ok: false, status: 401, json: async () => ({ success: false, error: 'Authentication required' }) }));
        render(<FactCheckLog />);
        await submitClaim('Claim needing auth');
        await waitFor(() => expect(fn.mock.calls.some(c => !String(c[0]).endsWith('/log'))).toBe(true));
        const call = fn.mock.calls.find(c => !String(c[0]).endsWith('/log'))!;
        const headers = (call[1] as RequestInit).headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer jwt-test');
        expect(await screen.findByText(/backend answered HTTP 401, Authentication required/)).toBeTruthy();
    });
});
