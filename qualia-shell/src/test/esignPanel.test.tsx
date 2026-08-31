/**
 * Embedded Documenso panel (in-Dwellium e-sign).
 *
 * "Open in Documenso" opens the Documenso web UI INSIDE Dwellium — never a new
 * tab — with the PhotoVault reachability gate: env unset → "Connect Documenso"
 * setup card, self-host → embedded iframe, cloud host → honest note + tab fallback.
 * The iframe is sandboxed permissively enough for a full Next.js app to sign.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ESign from '../components/ESign/ESign';
import { resetWidgetMemory } from '../lib/widgetMemory';

const SELF_HOST = { VITE_DOCUMENSO_URL: 'http://127.0.0.1:3140' };
const CLOUD = { VITE_DOCUMENSO_URL: 'https://app.documenso.com' };

function jsonResponse(body: unknown, status = 200): Response {
    return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const LOCAL_DOC = {
    workitemId: 'wi-1',
    title: 'Lease — Woodland Parc 2B',
    docStatus: 'sent',
    envelopeId: 'envl_1',
    documentId: 555,
    status: null,
    recipients: [{ email: 'tenant@example.com', token: 'tok_1' }],
    sentAt: '2026-08-20T00:00:00.000Z',
};

/** /documents + /envelopes answer; the no-cors reachability ping to the base resolves too. */
function stubBackend(handler?: (url: string, init?: RequestInit) => Response | undefined) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push(`${init?.method || 'GET'} ${u}`);
        const custom = handler?.(u, init);
        if (custom) return custom;
        if (u.includes('/api/esign/documents')) return jsonResponse({ success: true, data: [LOCAL_DOC] });
        if (u.includes('/api/esign/envelopes')) return jsonResponse({ success: true, data: [] });
        return jsonResponse({ success: true, data: [] }); // reachability ping + anything else
    }));
    return calls;
}

beforeEach(() => { resetWidgetMemory(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function openPanelViaHeader(env: Record<string, string | undefined>) {
    render(<ESign env={env} />);
    await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Open Documenso' }));
}

describe('ESign — embedded Documenso panel', () => {
    it('"Open Documenso" switches to the panel and embeds the self-host at the app root (no new tab)', async () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
        stubBackend();
        await openPanelViaHeader(SELF_HOST);
        const frame = await screen.findByTitle('Documenso e-signature');
        expect(frame).toHaveAttribute('src', 'http://127.0.0.1:3140');
        expect(openSpy).not.toHaveBeenCalled(); // in-Dwellium, never a tab
    });

    it('iframe sandbox is permissive enough to sign (allow-forms + allow-same-origin + scripts)', async () => {
        stubBackend();
        await openPanelViaHeader(SELF_HOST);
        const frame = await screen.findByTitle('Documenso e-signature');
        const sandbox = frame.getAttribute('sandbox') || '';
        expect(sandbox).toContain('allow-same-origin');
        expect(sandbox).toContain('allow-forms');
        expect(sandbox).toContain('allow-scripts');
        expect(sandbox).toContain('allow-popups');
    });

    it('per-document "Open in Documenso" is a button that points the frame at the doc path — never window.open', async () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
        stubBackend();
        render(<ESign env={SELF_HOST} />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        const rowBtn = screen.getByLabelText('Open Lease — Woodland Parc 2B in Documenso');
        expect(rowBtn.tagName).toBe('BUTTON');
        fireEvent.click(rowBtn);
        const frame = await screen.findByTitle('Documenso e-signature');
        expect(frame).toHaveAttribute('src', 'http://127.0.0.1:3140/documents/555');
        expect(openSpy).not.toHaveBeenCalled();
    });

    it('"Review & sign here" loads the recipient signing URL in the embedded frame', async () => {
        stubBackend(u => {
            if (u.includes('/api/esign/templates')) return jsonResponse({ success: true, data: [{ id: 42, title: 'GA Lease' }], leaseTemplateId: 42 });
            if (u.includes('/api/files')) return jsonResponse({ success: true, data: [] });
            if (u.includes('/api/esign/send')) return jsonResponse({ success: true, data: { envelopeId: 'envl_new', recipients: [{ email: 'a@example.com', token: 'tok_new' }] } });
            return undefined;
        });
        render(<ESign env={SELF_HOST} />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /New send/ }));
        await waitFor(() => expect(screen.getByRole('heading', { name: 'New send' })).toBeInTheDocument());
        fireEvent.change(screen.getByLabelText('Recipient 1 email'), { target: { value: 'a@example.com' } });
        fireEvent.click(screen.getByRole('button', { name: /Send for signature/ }));
        await waitFor(() => expect(screen.getByText('Sent for signature.')).toBeInTheDocument());

        fireEvent.click(screen.getByLabelText('Review and sign a@example.com here'));
        const frame = await screen.findByTitle('Documenso e-signature');
        expect(frame).toHaveAttribute('src', 'http://127.0.0.1:3140/sign/tok_new');
    });

    it('env unset → "Connect Documenso" setup card, not a blank frame', async () => {
        const opened: string[] = [];
        const onOpen = (e: Event) => opened.push(String((e as CustomEvent<{ widgetId: string }>).detail?.widgetId));
        window.addEventListener('dwellium:open-widget', onOpen);
        stubBackend();
        await openPanelViaHeader({}); // no VITE_DOCUMENSO_URL
        expect(await screen.findByText('Connect Documenso')).toBeInTheDocument();
        expect(screen.queryByTitle('Documenso e-signature')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Open Tools hub' }));
        expect(opened).toEqual(['tools-hub']);
        window.removeEventListener('dwellium:open-widget', onOpen);
    });

    it('unreachable self-host → retry card, not a blank frame', async () => {
        stubBackend(u => {
            if (u.includes('127.0.0.1:3140')) throw new Error('connection refused'); // reachability ping fails
            return undefined;
        });
        await openPanelViaHeader(SELF_HOST);
        expect(await screen.findByText('Documenso isn’t reachable')).toBeInTheDocument();
        expect(screen.queryByTitle('Documenso e-signature')).toBeNull();
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('cloud host (app.documenso.com) → honest note + tab fallback (no embed)', async () => {
        const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
        stubBackend();
        await openPanelViaHeader(CLOUD);
        expect(await screen.findByText(/hosted Documenso can’t be embedded/)).toBeInTheDocument();
        expect(screen.queryByTitle('Documenso e-signature')).toBeNull();
        const panel = screen.getByText(/hosted Documenso can’t be embedded/).closest('.esign__empty') as HTMLElement;
        fireEvent.click(within(panel).getByRole('button', { name: /Open Documenso/ }));
        expect(openSpy).toHaveBeenCalledWith('https://app.documenso.com', '_blank', 'noopener,noreferrer');
    });
});
