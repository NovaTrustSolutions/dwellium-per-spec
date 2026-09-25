/**
 * TokenSaver widget (DEV-only) — stale snapshot marker, honest error states,
 * delegation bar hidden at 0, and an accessible ring label.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TokenSaver from '../components/TokenSaver/TokenSaver';

const DAY = 24 * 60 * 60 * 1000;

const stats = (generatedAt: string) => ({
    generated_at: generatedAt,
    skill: { name: 'token-saver', active: true },
    totals: {
        model_calls: 10,
        fresh_input_tokens: 100,
        cache_read_tokens: 800,
        cache_creation_tokens: 100,
        billed_input_equivalent: 300,
    },
    savings: {
        cache_reuse_tokens_saved: 720,
        delegation_tokens_offloaded: 0,
        estimated_usd_saved: 1.5,
        baseline_note: 'Estimates.',
        confidence: 'measured',
    },
});

const respond = (body: string, ok = true) =>
    vi.fn(async () => ({ ok, status: ok ? 200 : 404, text: async () => body }));

afterEach(() => vi.unstubAllGlobals());

describe('TokenSaver', () => {
    it('fetches the absolute path and renders "as of", ring aria-label, no delegation bar at 0', async () => {
        const fetchMock = respond(JSON.stringify(stats(new Date(Date.now() - DAY).toISOString())));
        vi.stubGlobal('fetch', fetchMock);
        render(<TokenSaver />);

        expect(await screen.findByText(/^as of /)).toBeInTheDocument();
        expect(fetchMock).toHaveBeenCalledWith('/token-saver-stats.json', expect.anything());
        expect(screen.queryByText('stale')).toBeNull();
        // 800 cached of 1000 total input tokens
        expect(screen.getByRole('img', { name: '80% of input served from cache' })).toBeInTheDocument();
        expect(screen.getByRole('meter', { name: 'Prompt-cache reuse' })).toHaveAttribute('aria-valuenow', '720');
        expect(screen.queryByRole('meter', { name: 'Worker tokens (delegated)' })).toBeNull();
    });

    it('marks a snapshot older than 7 days as stale', async () => {
        vi.stubGlobal('fetch', respond(JSON.stringify(stats(new Date(Date.now() - 8 * DAY).toISOString()))));
        render(<TokenSaver />);
        expect(await screen.findByText('stale')).toBeInTheDocument();
    });

    it('null JSON is an error state with Retry, not an infinite loader; Retry refetches', async () => {
        const fetchMock = respond('null');
        vi.stubGlobal('fetch', fetchMock);
        render(<TokenSaver />);

        expect(await screen.findByText(/malformed/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /retry/i }));
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    });

    it('an HTML fallback page (missing file) reads as "not found", not malformed', async () => {
        vi.stubGlobal('fetch', respond('<!doctype html><html></html>'));
        render(<TokenSaver />);
        expect(await screen.findByText(/not found/)).toBeInTheDocument();
    });
});
