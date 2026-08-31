/**
 * ESign widget + esignApi client (plan 047 phase 1).
 *
 * Backend 503 (DOCUMENSO_* env unset — gate G2) → typed needs-setup result and
 * a "Connect Documenso" card whose button opens the Tools hub; 200 → sent-
 * document list with status chips; network failure → error state with Retry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ESign from '../components/ESign/ESign';
import { listEsignDocuments, sendForEsign } from '../components/ESign/esignApi';
import { resetWidgetMemory } from '../lib/widgetMemory';

function jsonResponse(body: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
    } as unknown as Response;
}

const opened: string[] = [];
const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));

beforeEach(() => {
    resetWidgetMemory(); // plan 055 phase 2 — v2.72.1 standing convention
    localStorage.clear();
    opened.length = 0;
    window.addEventListener('dwellium:open-widget', onOpen);
});
afterEach(() => {
    window.removeEventListener('dwellium:open-widget', onOpen);
    vi.unstubAllGlobals();
});

describe('esignApi', () => {
    it('503 → needs-setup (both list and send)', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        expect(await listEsignDocuments()).toEqual({ kind: 'needs-setup' });
        expect(await sendForEsign('wi-1')).toEqual({ kind: 'needs-setup' });
    });

    it('200 → documents array; send returns the envelope id', async () => {
        const doc = { workitemId: 'wi-1', title: 'Lease — 2B', docStatus: 'sent', envelopeId: 'env_1', recipients: [], sentAt: null };
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) =>
            String(url).endsWith('/send')
                ? jsonResponse({ success: true, data: { envelopeId: 'env_9' } })
                : jsonResponse({ success: true, data: [doc] })));
        expect(await listEsignDocuments()).toEqual({ kind: 'ok', documents: [doc] });
        expect(await sendForEsign('wi-1')).toEqual({ kind: 'ok', envelopeId: 'env_9' });
    });

    it('non-ok surfaces the backend error; network failure → Backend unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, error: 'approve the document first' }, 400)));
        expect(await sendForEsign('wi-1')).toEqual({ kind: 'error', message: 'approve the document first' });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect(await listEsignDocuments()).toEqual({ kind: 'error', message: 'Backend unreachable' });
    });
});

describe('ESign widget', () => {
    it('renders the needs-setup card on 503; its button opens the Tools hub', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: false, needsSetup: true }, 503)));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Connect Documenso')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
    });

    it('renders the sent-document list with recipient + status chips on 200', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: true,
            data: [{ workitemId: 'wi-1', title: 'Lease — Unit 2B', docStatus: 'sent', envelopeId: 'env_1', recipients: [{ email: 'tenant@example.com' }], sentAt: '2026-08-20T00:00:00.000Z' }],
        })));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Unit 2B')).toBeInTheDocument());
        expect(screen.getByText('tenant@example.com')).toBeInTheDocument();
        // plan 053: the pill is the upstream Documenso status; docStatus 'sent' → PENDING.
        expect(screen.getByText('PENDING')).toBeInTheDocument();
    });

    it('renders the error state with Retry when the backend is unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });
});
