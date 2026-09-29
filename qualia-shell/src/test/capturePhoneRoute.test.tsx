/**
 * /capture phone route (plan 067 phase 2 contract).
 *
 * No Supabase: legacy ?url=&key=&user= params + the 'tw-capture-config'
 * localStorage entry (held a Supabase anon key) are stripped/removed on
 * load and never stored again. Capture uses the normal Dwellium session
 * (dwellium-auth-token) and posts { text } to /api/thought-weaver/inbox.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import CaptureRoute from '../../app/routes/capture';

vi.mock('../config', () => ({
    API_BASE: 'http://api.test',
}));

const TOKEN_KEY = 'dwellium-auth-token';
const LEGACY_CFG_KEY = 'tw-capture-config';

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, '', '/capture');
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('CaptureRoute — no Supabase, legacy config removed', () => {
    it('strips legacy ?url=&key=&user= params and removes the legacy localStorage key, without storing them', () => {
        localStorage.setItem(LEGACY_CFG_KEY, JSON.stringify({ url: 'https://x.supabase.co', key: 'anon-key', user: 'u1' }));
        window.history.replaceState(null, '', '/capture?url=https%3A%2F%2Fx.supabase.co&key=anon-key&user=u1');

        render(<CaptureRoute />);

        expect(window.location.search).toBe('');
        expect(window.location.pathname).toBe('/capture');
        expect(localStorage.getItem(LEGACY_CFG_KEY)).toBeNull();
    });

    it('with no session token: shows the sign-in message and never calls fetch', () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal('fetch', fetchSpy);

        render(<CaptureRoute />);

        expect(screen.getByText('Sign in to Dwellium on this phone first.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Go to sign in' })).toHaveAttribute('href', '/');
        expect(screen.queryByLabelText('Thought text')).toBeNull();
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

describe('CaptureRoute — signed-in capture', () => {
    beforeEach(() => {
        localStorage.setItem(TOKEN_KEY, 'real-session-token');
    });

    it('posts { text } to API_BASE/api/thought-weaver/inbox and shows the returned bucket on success', async () => {
        const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit) =>
            jsonResponse(200, { success: true, data: { id: 'inbox-1', text: 'buy milk', filed_to: 'Ideas', confidence: 0.9, destination_name: null, createdAt: '2026-09-25T00:00:00Z' } }),
        );
        vi.stubGlobal('fetch', fetchSpy);

        render(<CaptureRoute />);
        const textarea = screen.getByLabelText('Thought text') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'buy milk' } });
        fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

        await waitFor(() => expect(screen.getByText('Filed to Ideas.')).toBeInTheDocument());
        expect(textarea.value).toBe(''); // box cleared on success

        // mutation check: exact URL + method + body, no Supabase/key leakage
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0];
        expect(url).toBe('http://api.test/api/thought-weaver/inbox');
        expect(init).toMatchObject({ method: 'POST' });
        expect(JSON.parse(init!.body as string)).toEqual({ text: 'buy milk' });
        expect(String(url)).not.toMatch(/key=/);
        expect(String(url)).not.toMatch(/supabase/i);
    });

    it('401 response: keeps the form and the typed text, and links to sign in', async () => {
        const fetchSpy = vi.fn(async () => jsonResponse(401, { success: false }));
        vi.stubGlobal('fetch', fetchSpy);

        render(<CaptureRoute />);
        const textarea = screen.getByLabelText('Thought text') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'kept thought' } });
        fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

        await waitFor(() => expect(screen.getByRole('link', { name: 'sign in again' })).toBeInTheDocument());
        expect((screen.getByLabelText('Thought text') as HTMLTextAreaElement).value).toBe('kept thought');
    });

    it('network error: text stays in the box and an error is shown ("nothing lost")', async () => {
        const fetchSpy = vi.fn(async () => { throw new Error('network down'); });
        vi.stubGlobal('fetch', fetchSpy);

        render(<CaptureRoute />);
        const textarea = screen.getByLabelText('Thought text') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'do not lose me' } });
        fireEvent.click(screen.getByRole('button', { name: 'Capture' }));

        await waitFor(() => expect(screen.getByText(/Couldn't save/)).toBeInTheDocument());
        expect(textarea.value).toBe('do not lose me');
    });
});
