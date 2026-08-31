/**
 * E-Sign full workflow (plan 053) — merged documents list, per-document actions,
 * send flow (template + fileId), and the tenant "Review & sign" prompt.
 *
 * Every backend URL is asserted; the Documenso key never reaches the browser, so
 * the widget only ever talks to /api/esign/* (plus /api/files for the PDF picker).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWidgetMemory } from '../lib/widgetMemory';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ESign from '../components/ESign/ESign';
import TenantSignPrompt from '../components/ESign/TenantSignPrompt';
import { esignPill, mergeEsignRows } from '../components/ESign/esignMerge';
import {
    cancelEnvelope,
    documensoDocumentUrl,
    resendEnvelope,
    sendEnvelope,
    signingUrlFromToken,
} from '../components/ESign/esignApi';

// Deep-link base derived from the SAME env the code reads — a developer's local
// .env (VITE_DOCUMENSO_URL → self-hosted Documenso) must not fail the suite.
const DOCUMENSO_BASE = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_DOCUMENSO_URL || 'https://app.documenso.com').replace(/\/+$/, '');

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

/** Default router: /documents + /envelopes both answer; extra handlers override. */
function stubBackend(handler?: (url: string, init?: RequestInit) => Response | undefined) {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push(`${init?.method || 'GET'} ${u}`);
        const custom = handler?.(u, init);
        if (custom) return custom;
        if (u.includes('/api/esign/documents')) return jsonResponse({ success: true, data: [LOCAL_DOC] });
        if (u.includes('/api/esign/envelopes')) return jsonResponse({ success: true, data: [] });
        return jsonResponse({ success: true, data: [] });
    }));
    return calls;
}

beforeEach(() => { resetWidgetMemory(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('esignMerge', () => {
    it('maps upstream status to a pill, falling back to the Dwellium docStatus machine', () => {
        expect(esignPill('COMPLETED', 'sent')).toBe('COMPLETED');
        expect(esignPill(null, 'draft')).toBe('DRAFT');
        expect(esignPill(null, 'sent')).toBe('PENDING');
        expect(esignPill(null, 'countersigned')).toBe('COMPLETED');
        expect(esignPill(null, '')).toBe('UNKNOWN');
    });

    it('live status wins for matched rows (by externalId, then envelope id); unmatched envelopes become their own rows', () => {
        const rows = mergeEsignRows(
            [LOCAL_DOC, { ...LOCAL_DOC, workitemId: 'wi-2', envelopeId: 'envl_2', title: 'Lease — Riverwood 4A' }],
            [
                { id: 'envl_x', externalId: 'wi-1', status: 'COMPLETED' },
                { id: 'envl_2', status: 'REJECTED' },
                { id: 'envl_solo', title: 'Vendor agreement', status: 'PENDING' },
            ],
        );
        expect(rows).toHaveLength(3);
        expect(rows[0]).toMatchObject({ workitemId: 'wi-1', status: 'COMPLETED', pill: 'COMPLETED', source: 'local' });
        expect(rows[1]).toMatchObject({ workitemId: 'wi-2', pill: 'REJECTED' });
        expect(rows[2]).toMatchObject({ workitemId: '', title: 'Vendor agreement', pill: 'PENDING', source: 'documenso' });
    });
});

describe('esignApi deep links + action URLs', () => {
    it('builds Documenso document + signing deep links (never a bare homepage)', () => {
        expect(documensoDocumentUrl({ documentId: 555 })).toBe(`${DOCUMENSO_BASE}/documents/555`);
        expect(documensoDocumentUrl({ documentId: null, envelopeId: 'envl_9' })).toBe(`${DOCUMENSO_BASE}/documents/envl_9`);
        expect(signingUrlFromToken('tok_1')).toBe(`${DOCUMENSO_BASE}/sign/tok_1`);
    });

    it('cancel/resend/send post to the backend proxy with the right refs', async () => {
        const calls: Array<{ url: string; body: unknown }> = [];
        vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null });
            return jsonResponse({ success: true, data: { envelopeId: 'envl_1', status: 'CANCELLED', resent: true } });
        }));
        await cancelEnvelope({ workitemId: 'wi-1' });
        await resendEnvelope({ envelopeId: 'envl_1' });
        await sendEnvelope({ title: 'T', recipients: [{ email: 'a@example.com' }], templateId: 42 });
        expect(calls.map(c => c.url.replace(/^.*\/api/, '/api'))).toEqual([
            '/api/esign/cancel', '/api/esign/resend', '/api/esign/send',
        ]);
        expect(calls[0].body).toEqual({ workitemId: 'wi-1' });
        expect(calls[2].body).toEqual({ title: 'T', recipients: [{ email: 'a@example.com' }], templateId: 42 });
    });

    it('503 anywhere → needs-setup, network failure → error', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ needsSetup: true }, 503)));
        expect(await cancelEnvelope({ envelopeId: 'e' })).toEqual({ kind: 'needs-setup' });
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        expect((await resendEnvelope({ envelopeId: 'e' })).kind).toBe('error');
    });
});

describe('ESign widget — documents list', () => {
    it('lists merged rows with a status pill and an in-Dwellium Open-in-Documenso action (button, not a tab)', async () => {
        stubBackend(u => (u.includes('/api/esign/envelopes')
            ? jsonResponse({ success: true, data: [{ id: 'envl_1', status: 'COMPLETED' }] })
            : undefined));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        expect(screen.getByText('COMPLETED')).toBeInTheDocument();
        // The primary "open" action embeds inside Dwellium — a button with no href/target, never a new tab.
        const openBtn = screen.getByLabelText('Open Lease — Woodland Parc 2B in Documenso');
        expect(openBtn.tagName).toBe('BUTTON');
        expect(openBtn).not.toHaveAttribute('href');
        expect(openBtn).not.toHaveAttribute('target');
    });

    it('503 → needs-setup card; network failure → error state with Retry', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ needsSetup: true }, 503)));
        const { unmount } = render(<ESign />);
        await waitFor(() => expect(screen.getByText('Connect Documenso')).toBeInTheDocument());
        unmount();

        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Backend unavailable')).toBeInTheDocument());
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('empty list → honest "nothing out for signature" state', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [] })));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Nothing out for signature')).toBeInTheDocument());
    });

    it('Documenso list down but backend up → local rows plus an honest notice', async () => {
        stubBackend(u => (u.includes('/api/esign/envelopes') ? jsonResponse({ error: 'upstream 502' }, 502) : undefined));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        expect(screen.getByText(/Documenso list unavailable/)).toBeInTheDocument();
    });
});

describe('ESign widget — per-document actions', () => {
    it('check status hits /status?live=1 then refreshes the list', async () => {
        const calls = stubBackend(u => (u.includes('/status') ? jsonResponse({ success: true, data: { docStatus: 'signed', esign: {} } }) : undefined));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Check status of Lease — Woodland Parc 2B'));
        await waitFor(() => expect(screen.getByText('Status refreshed from Documenso.')).toBeInTheDocument());
        expect(calls.some(c => c.includes('/api/esign/leases/wi-1/status?live=1'))).toBe(true);
    });

    it('resend posts /resend with the workitem id', async () => {
        const calls = stubBackend(u => (u.includes('/resend') ? jsonResponse({ success: true, data: { resent: true } }) : undefined));
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Resend Lease — Woodland Parc 2B'));
        await waitFor(() => expect(screen.getByText('Signing emails re-sent.')).toBeInTheDocument());
        expect(calls.some(c => c === 'POST http://localhost:3000/api/esign/resend' || c.endsWith('/api/esign/resend'))).toBe(true);
    });

    it('cancel is confirm-gated — declining never calls the backend', async () => {
        const calls = stubBackend(u => (u.includes('/cancel') ? jsonResponse({ success: true, data: { status: 'CANCELLED' } }) : undefined));
        const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Cancel Lease — Woodland Parc 2B'));
        expect(confirmSpy).toHaveBeenCalled();
        expect(calls.some(c => c.includes('/api/esign/cancel'))).toBe(false);

        confirmSpy.mockReturnValue(true);
        fireEvent.click(screen.getByLabelText('Cancel Lease — Woodland Parc 2B'));
        await waitFor(() => expect(calls.some(c => c.includes('/api/esign/cancel'))).toBe(true));
    });

    it('completed documents expose signed-PDF + audit-log downloads', async () => {
        const created: string[] = [];
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
        const calls = stubBackend(u => {
            if (u.includes('/api/esign/documents')) return jsonResponse({ success: true, data: [{ ...LOCAL_DOC, docStatus: 'countersigned' }] });
            if (u.includes('signed-pdf') || u.includes('audit-log')) {
                created.push(u);
                return { ok: true, status: 200, blob: async () => new Blob(['%PDF']) } as unknown as Response;
            }
            return undefined;
        });
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Download signed PDF of Lease — Woodland Parc 2B'));
        await waitFor(() => expect(screen.getByText('Signed PDF downloaded.')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Download audit log of Lease — Woodland Parc 2B'));
        await waitFor(() => expect(screen.getByText('Audit log downloaded.')).toBeInTheDocument());
        expect(created.some(u => u.includes('/api/esign/leases/wi-1/signed-pdf'))).toBe(true);
        expect(created.some(u => u.includes('/api/esign/audit-log?workitemId=wi-1'))).toBe(true);
        expect(calls.length).toBeGreaterThan(0);
    });

    it('copies a per-recipient signing link when the API returned a token', async () => {
        const writeText = vi.fn(async () => undefined);
        Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
        stubBackend();
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Copy signing link for tenant@example.com'));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${DOCUMENSO_BASE}/sign/tok_1`));
    });
});

describe('ESign widget — send flow', () => {
    /** Open the send view with a template list + a PDF file list. */
    async function openSend() {
        const calls = stubBackend(u => {
            if (u.includes('/api/esign/templates')) {
                return jsonResponse({ success: true, data: [{ id: 42, title: 'GA Residential Lease' }, { id: 43, title: 'Renewal' }], leaseTemplateId: 42 });
            }
            if (u.includes('/api/files')) {
                return jsonResponse({ success: true, data: [{ id: 'file-1', name: 'lease.pdf', type: 'pdf' }, { id: 'file-2', name: 'notes.txt', type: 'text' }] });
            }
            if (u.includes('/api/esign/send')) return jsonResponse({ success: true, data: { envelopeId: 'envl_new', recipients: [{ email: 'a@example.com', token: 'tok_new' }] } });
            return undefined;
        });
        render(<ESign />);
        await waitFor(() => expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /New send/ }));
        await waitFor(() => expect(screen.getByRole('heading', { name: 'New send' })).toBeInTheDocument());
        return calls;
    }

    it('template flow: Andy lease template preselected, recipients editable, POST /send carries templateId', async () => {
        const calls = await openSend();
        const templateSelect = screen.getByLabelText('Template') as HTMLSelectElement;
        expect(templateSelect.value).toBe('42'); // DOCUMENSO_TEMPLATE_LEASE default
        expect(within(templateSelect).getByText(/GA Residential Lease \(lease default\)/)).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Recipient 1 email'), { target: { value: 'a@example.com' } });
        fireEvent.change(screen.getByLabelText('Recipient 1 name'), { target: { value: 'Andy Tenant' } });
        fireEvent.click(screen.getByRole('button', { name: /Add recipient/ }));
        fireEvent.change(screen.getByLabelText('Recipient 2 email'), { target: { value: 'b@example.com' } });
        fireEvent.change(screen.getByLabelText('Recipient 2 role'), { target: { value: 'CC' } });
        fireEvent.click(screen.getByRole('button', { name: /Send for signature/ }));

        await waitFor(() => expect(screen.getByText('Sent for signature.')).toBeInTheDocument());
        const sendCall = (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls
            .find(([u]) => String(u).includes('/api/esign/send'));
        expect(sendCall).toBeTruthy();
        expect(JSON.parse(String(sendCall![1].body))).toMatchObject({
            templateId: 42,
            recipients: [
                { name: 'Andy Tenant', email: 'a@example.com', role: 'SIGNER' },
                { email: 'b@example.com', role: 'CC' },
            ],
        });
        // sent panel offers the per-recipient signing link
        expect(screen.getByLabelText('Copy signing link for a@example.com')).toBeInTheDocument();
        expect(calls.some(c => c.includes('/api/esign/templates'))).toBe(true);
    });

    it('fileId flow: the picker lists only PDFs from the Dwellium files store and POSTs fileId', async () => {
        await openSend();
        fireEvent.change(screen.getByLabelText('Source'), { target: { value: 'file' } });
        const fileSelect = await screen.findByLabelText('PDF');
        expect(within(fileSelect).getByText('lease.pdf')).toBeInTheDocument();
        expect(within(fileSelect).queryByText('notes.txt')).toBeNull();

        fireEvent.change(fileSelect, { target: { value: 'file-1' } });
        fireEvent.change(screen.getByLabelText('Recipient 1 email'), { target: { value: 'a@example.com' } });
        fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Parking addendum' } });
        fireEvent.click(screen.getByRole('button', { name: /Send for signature/ }));

        await waitFor(() => expect(screen.getByText('Sent for signature.')).toBeInTheDocument());
        const sendCall = (globalThis.fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls
            .find(([u]) => String(u).includes('/api/esign/send'));
        const body = JSON.parse(String(sendCall![1].body));
        expect(body).toMatchObject({ fileId: 'file-1', title: 'Parking addendum' });
        expect(body.templateId).toBeUndefined();
    });

    it('refuses to send without a recipient email', async () => {
        await openSend();
        fireEvent.click(screen.getByRole('button', { name: /Send for signature/ }));
        await waitFor(() => expect(screen.getByText('Add at least one recipient email.')).toBeInTheDocument());
    });
});

describe('TenantSignPrompt', () => {
    it('renders "Review & sign" with the Documenso signing URL when a token exists for this resident', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
            success: true,
            data: [{ workitemId: 'wi-1', title: 'Lease — Woodland Parc 2B', docStatus: 'sent', status: null, signingUrl: 'https://app.documenso.com/sign/tok_mine' }],
        })));
        render(<TenantSignPrompt />);
        const link = await screen.findByRole('link', { name: /Review & sign/ });
        expect(link).toHaveAttribute('href', 'https://app.documenso.com/sign/tok_mine');
        expect(screen.getByText('Lease — Woodland Parc 2B')).toBeInTheDocument();
    });

    it('renders nothing when there is nothing to sign, or when Documenso is unconfigured', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ success: true, data: [] })));
        const { container, unmount } = render(<TenantSignPrompt />);
        await waitFor(() => expect(container.firstChild).toBeNull());
        unmount();

        vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ needsSetup: true }, 503)));
        const { container: c2 } = render(<TenantSignPrompt />);
        await waitFor(() => expect(c2.firstChild).toBeNull());
    });
});
