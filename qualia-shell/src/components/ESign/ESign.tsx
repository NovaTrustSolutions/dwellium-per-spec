/**
 * ESign — Documenso e-signature widget (plan 047 phase 1; plan 053 full workflow).
 *
 * Documents view: local leases merged with the live Documenso envelope list —
 * status pills DRAFT/PENDING/COMPLETED/REJECTED/CANCELLED, per-document check
 * status / resend / cancel (confirm-gated) / signed-PDF / audit-log actions,
 * per-recipient signing-link copy, and an "Open in Documenso ↗" deep link into
 * the exact document. Send view: pick a template (live template list) OR a PDF
 * from the Dwellium files store, edit recipients (name/email/role/order), send.
 *
 * While the backend has no DOCUMENSO_* env (503) it renders a clean "Connect
 * Documenso" needs-setup card pointing at the Tools hub — nothing here crashes
 * without a live Documenso (gate G2). Andy defaults: lease template preselected
 * (DOCUMENSO_TEMPLATE_LEASE), AstraStrata send message.
 */
import { useCallback, useEffect, useState } from 'react';
import { Copy, Download, ExternalLink, PenLine, Plus, RefreshCw, ScrollText, Send, Trash2, XCircle } from 'lucide-react';
import {
    cancelEnvelope,
    checkEsignStatus,
    documensoAppUrl,
    documensoDocumentUrl,
    downloadAuditLog,
    downloadSignedPdf,
    listDocumensoEnvelopes,
    listEsignDocuments,
    listEsignTemplates,
    listPdfFiles,
    resendEnvelope,
    sendEnvelope,
    signingUrlFromToken,
    type EsignFileRow,
    type EsignRecipient,
    type EsignTemplate,
} from './esignApi';
import { mergeEsignRows, type MergedEsignRow } from './esignMerge';
import { openWidget } from '../../lib/dwelliumCommands';
import './ESign.css';

type ViewState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; rows: MergedEsignRow[]; liveError: string | null };

interface DraftRecipient { name: string; email: string; role: string }

const ANDY_MESSAGE = 'Please review and sign at your earliest convenience. — AstraStrata Management';

export default function ESign() {
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const [view, setView] = useState<'list' | 'send'>('list');
    const [notice, setNotice] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    // ── Send-flow state ──
    const [templates, setTemplates] = useState<EsignTemplate[]>([]);
    const [leaseTemplateId, setLeaseTemplateId] = useState<number | null>(null);
    const [files, setFiles] = useState<EsignFileRow[]>([]);
    const [mode, setMode] = useState<'template' | 'file'>('template');
    const [templateId, setTemplateId] = useState<string>('');
    const [fileId, setFileId] = useState<string>('');
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState(ANDY_MESSAGE);
    const [recipients, setRecipients] = useState<DraftRecipient[]>([{ name: '', email: '', role: 'SIGNER' }]);
    const [sentRecipients, setSentRecipients] = useState<EsignRecipient[] | null>(null);

    const refresh = useCallback(async () => {
        setState({ kind: 'loading' });
        const [local, live] = await Promise.all([listEsignDocuments(), listDocumensoEnvelopes()]);
        if (local.kind === 'needs-setup' || live.kind === 'needs-setup') { setState({ kind: 'needs-setup' }); return; }
        if (local.kind === 'error') { setState({ kind: 'error', message: local.message }); return; }
        // Documenso itself unreachable but the backend is fine → show local rows honestly.
        const liveRows = live.kind === 'ok' ? live.data : [];
        const liveError = live.kind === 'error' ? live.message : null;
        setState({ kind: 'ok', rows: mergeEsignRows(local.documents, liveRows), liveError });
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const openSendView = useCallback(async () => {
        setView('send');
        setSentRecipients(null);
        const [tpl, pdfs] = await Promise.all([listEsignTemplates(), listPdfFiles()]);
        if (tpl.kind === 'ok') {
            setTemplates(tpl.data.templates);
            setLeaseTemplateId(tpl.data.leaseTemplateId);
            // Andy default: the GA lease template (DOCUMENSO_TEMPLATE_LEASE) preselected.
            const preferred = tpl.data.leaseTemplateId ?? tpl.data.templates[0]?.id;
            if (preferred !== undefined && preferred !== null) setTemplateId(String(preferred));
            if (tpl.data.templates.length === 0) setMode('file');
        } else {
            setTemplates([]);
            setMode('file');
        }
        setFiles(pdfs.kind === 'ok' ? pdfs.data : []);
    }, []);

    const updateRecipient = (i: number, patch: Partial<DraftRecipient>) =>
        setRecipients(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

    const submitSend = async () => {
        const wanted = recipients.filter(r => r.email.includes('@'));
        if (wanted.length === 0) { setNotice('Add at least one recipient email.'); return; }
        if (mode === 'template' && !templateId) { setNotice('Pick a template.'); return; }
        if (mode === 'file' && !fileId) { setNotice('Pick a PDF from the files store.'); return; }
        setBusy('send');
        const r = await sendEnvelope({
            title: title.trim() || 'Document from Dwellium',
            recipients: wanted,
            ...(mode === 'template' ? { templateId: Number(templateId) } : { fileId }),
            message,
        });
        setBusy(null);
        if (r.kind === 'ok') {
            setNotice('Sent for signature.');
            setSentRecipients(Array.isArray(r.data.recipients) ? r.data.recipients : []);
            void refresh();
        } else if (r.kind === 'needs-setup') {
            setState({ kind: 'needs-setup' });
        } else {
            setNotice(r.message);
        }
    };

    const runAction = async (key: string, fn: () => Promise<{ kind: string; message?: string }>, okText: string) => {
        setBusy(key);
        const r = await fn();
        setBusy(null);
        if (r.kind === 'ok') setNotice(okText);
        else if (r.kind === 'needs-setup') setState({ kind: 'needs-setup' });
        else setNotice(r.message || 'Action failed');
    };

    const onCheckStatus = (row: MergedEsignRow) =>
        runAction(`status:${row.workitemId}`, async () => {
            const r = await checkEsignStatus(row.workitemId);
            if (r.kind === 'ok') await refresh();
            return r;
        }, 'Status refreshed from Documenso.');

    const onResend = (row: MergedEsignRow) =>
        runAction(`resend:${row.envelopeId || row.workitemId}`, () =>
            resendEnvelope(row.workitemId ? { workitemId: row.workitemId } : { envelopeId: row.envelopeId || undefined }),
        'Signing emails re-sent.');

    const onCancel = (row: MergedEsignRow) => {
        if (!window.confirm(`Cancel signing for “${row.title}”? Recipients can no longer sign.`)) return;
        void runAction(`cancel:${row.envelopeId || row.workitemId}`, async () => {
            const r = await cancelEnvelope(row.workitemId ? { workitemId: row.workitemId } : { envelopeId: row.envelopeId || undefined });
            if (r.kind === 'ok') await refresh();
            return r;
        }, 'Envelope cancelled.');
    };

    const onSignedPdf = (row: MergedEsignRow) =>
        runAction(`signed:${row.workitemId}`, () => downloadSignedPdf(row.workitemId, row.title), 'Signed PDF downloaded.');

    const onAuditLog = (row: MergedEsignRow) =>
        runAction(`audit:${row.envelopeId || row.workitemId}`, () =>
            downloadAuditLog(row.workitemId ? { workitemId: row.workitemId } : { envelopeId: row.envelopeId || undefined }, row.title),
        'Audit log downloaded.');

    const copySigningLink = async (token: string) => {
        try {
            await navigator.clipboard.writeText(signingUrlFromToken(token));
            setNotice('Signing link copied.');
        } catch {
            setNotice(signingUrlFromToken(token));
        }
    };

    return (
        <div className="esign">
            <div className="esign__head">
                <h2 className="esign__title"><PenLine size={16} aria-hidden /> E-Sign</h2>
                <div className="esign__head-actions">
                    <a className="esign__link" href={documensoAppUrl()} target="_blank" rel="noreferrer">
                        Open Documenso <ExternalLink size={12} aria-hidden />
                    </a>
                    {state.kind === 'ok' && view === 'list' && (
                        <button className="esign__btn" onClick={() => void openSendView()}>
                            <Plus size={12} aria-hidden /> New send
                        </button>
                    )}
                    {view === 'send' && (
                        <button className="esign__btn esign__btn--ghost" onClick={() => { setView('list'); void refresh(); }}>
                            Back to documents
                        </button>
                    )}
                    <button className="esign__btn esign__btn--ghost" onClick={() => void refresh()} aria-label="Refresh e-sign documents">
                        <RefreshCw size={14} aria-hidden />
                    </button>
                </div>
            </div>

            {notice && <p className="esign__notice" role="status">{notice}</p>}

            {state.kind === 'loading' && <p className="esign__muted">Loading sent documents…</p>}

            {state.kind === 'needs-setup' && (
                <div className="esign__empty" data-state="needs-setup">
                    <PenLine size={28} aria-hidden />
                    <h3>Connect Documenso</h3>
                    <p>
                        E-Sign sends leases, renewals and vendor agreements for signature through
                        Documenso. The backend isn&apos;t connected yet — once the DOCUMENSO_* env
                        is set it flips to Ready automatically. See tools/documenso/README.md.
                    </p>
                    <button className="esign__btn" onClick={() => openWidget('tools-hub')}>Open Tools hub</button>
                </div>
            )}

            {state.kind === 'error' && (
                <div className="esign__empty" data-state="error">
                    <h3>Backend unavailable</h3>
                    <p>{state.message}</p>
                    <button className="esign__btn" onClick={() => void refresh()}>Retry</button>
                </div>
            )}

            {state.kind === 'ok' && view === 'send' && (
                <div className="esign__send" data-state="send">
                    <h3 className="esign__subtitle">New send</h3>
                    <div className="esign__field-row">
                        <label className="esign__label" htmlFor="esign-mode">Source</label>
                        <select id="esign-mode" className="esign__input" value={mode} onChange={e => setMode(e.target.value as 'template' | 'file')}>
                            <option value="template">Documenso template</option>
                            <option value="file">PDF from Dwellium files</option>
                        </select>
                    </div>
                    {mode === 'template' && (
                        <div className="esign__field-row">
                            <label className="esign__label" htmlFor="esign-template">Template</label>
                            <select id="esign-template" className="esign__input" value={templateId} onChange={e => setTemplateId(e.target.value)}>
                                <option value="">— pick a template —</option>
                                {templates.map(t => (
                                    <option key={t.id} value={String(t.id)}>
                                        {t.title || `Template ${t.id}`}{leaseTemplateId === t.id ? ' (lease default)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {mode === 'file' && (
                        <div className="esign__field-row">
                            <label className="esign__label" htmlFor="esign-file">PDF</label>
                            <select id="esign-file" className="esign__input" value={fileId} onChange={e => setFileId(e.target.value)}>
                                <option value="">— pick a PDF from the files store —</option>
                                {files.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="esign__field-row">
                        <label className="esign__label" htmlFor="esign-title">Title</label>
                        <input id="esign-title" className="esign__input" value={title} onChange={e => setTitle(e.target.value)}
                            placeholder="Lease — Woodland Parc Townhomes #101" />
                    </div>
                    <div className="esign__field-row">
                        <label className="esign__label" htmlFor="esign-message">Message</label>
                        <input id="esign-message" className="esign__input" value={message} onChange={e => setMessage(e.target.value)} />
                    </div>

                    <h4 className="esign__subtitle">Recipients (signing order = row order)</h4>
                    {recipients.map((r, i) => (
                        // ponytail: index key is correct here — rows ARE positional (signing order).
                        <div className="esign__recipient-row" key={`recipient-${i}`}>
                            <span className="esign__order">{i + 1}.</span>
                            <input className="esign__input" aria-label={`Recipient ${i + 1} name`} placeholder="Name"
                                value={r.name} onChange={e => updateRecipient(i, { name: e.target.value })} />
                            <input className="esign__input" aria-label={`Recipient ${i + 1} email`} placeholder="email@example.com"
                                value={r.email} onChange={e => updateRecipient(i, { email: e.target.value })} />
                            <select className="esign__input" aria-label={`Recipient ${i + 1} role`}
                                value={r.role} onChange={e => updateRecipient(i, { role: e.target.value })}>
                                <option value="SIGNER">Signer</option>
                                <option value="APPROVER">Approver</option>
                                <option value="CC">CC</option>
                                <option value="VIEWER">Viewer</option>
                            </select>
                            <button className="esign__btn esign__btn--ghost" aria-label={`Remove recipient ${i + 1}`}
                                onClick={() => setRecipients(rs => rs.filter((_, j) => j !== i))} disabled={recipients.length === 1}>
                                <Trash2 size={13} aria-hidden />
                            </button>
                        </div>
                    ))}
                    <div className="esign__send-actions">
                        <button className="esign__btn esign__btn--ghost" onClick={() => setRecipients(rs => [...rs, { name: '', email: '', role: 'SIGNER' }])}>
                            <Plus size={12} aria-hidden /> Add recipient
                        </button>
                        <button className="esign__btn" onClick={() => void submitSend()} disabled={busy === 'send'}>
                            <Send size={12} aria-hidden /> {busy === 'send' ? 'Sending…' : 'Send for signature'}
                        </button>
                    </div>

                    {sentRecipients && (
                        <div className="esign__sent-panel" data-state="sent">
                            <h4 className="esign__subtitle">Sent — signing links</h4>
                            {sentRecipients.length === 0 && <p className="esign__muted">Recipients will receive Documenso email invitations.</p>}
                            {sentRecipients.map(r => (
                                <div className="esign__sent-row" key={r.email}>
                                    <span className="esign__chip">{r.email}</span>
                                    {r.token && (
                                        <button className="esign__btn esign__btn--ghost" onClick={() => void copySigningLink(r.token!)}
                                            aria-label={`Copy signing link for ${r.email}`}>
                                            <Copy size={12} aria-hidden /> Copy signing link
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {state.kind === 'ok' && view === 'list' && state.liveError && (
                <p className="esign__muted" data-state="live-error">Documenso list unavailable ({state.liveError}) — showing Dwellium records.</p>
            )}

            {state.kind === 'ok' && view === 'list' && state.rows.length === 0 && (
                <div className="esign__empty" data-state="none-sent">
                    <h3>Nothing out for signature</h3>
                    <p>Approve a lease in Strata → Leasing and use &ldquo;Send for e-signature&rdquo;, or send any PDF with New send.</p>
                    <button className="esign__btn" onClick={() => openWidget('strata-dashboard')}>Open Strata</button>
                </div>
            )}

            {state.kind === 'ok' && view === 'list' && state.rows.length > 0 && (
                <table className="esign__table">
                    <thead>
                        <tr><th>Document</th><th>Recipients</th><th>Status</th><th>Sent</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                        {state.rows.map(row => {
                            const key = row.workitemId || String(row.envelopeId);
                            const completed = row.pill === 'COMPLETED' || ['signed', 'countersigned'].includes(row.docStatus);
                            return (
                                <tr key={key} data-doc-status={row.docStatus || row.pill.toLowerCase()}>
                                    <td className="esign__doc-title">
                                        {row.title}
                                        {row.source === 'documenso' && <span className="esign__muted"> (Documenso)</span>}
                                    </td>
                                    <td>
                                        {row.recipients.length === 0
                                            ? <span className="esign__muted">—</span>
                                            : row.recipients.map(r => r.token
                                                ? (
                                                    <button key={r.email} className="esign__chip esign__chip--copy" title="Copy signing link"
                                                        aria-label={`Copy signing link for ${r.email}`}
                                                        onClick={() => void copySigningLink(r.token!)}>
                                                        {r.email} <Copy size={10} aria-hidden />
                                                    </button>
                                                )
                                                : <span key={r.email} className="esign__chip" title={r.status || r.signingStatus || r.role || 'signer'}>{r.email}</span>)}
                                    </td>
                                    <td><span className={`esign__status esign__status--${row.pill.toLowerCase()}`}>{row.pill}</span></td>
                                    <td className="esign__muted">{row.sentAt ? new Date(row.sentAt).toLocaleDateString() : '—'}</td>
                                    <td className="esign__actions">
                                        {row.workitemId && (
                                            <button className="esign__btn esign__btn--ghost" aria-label={`Check status of ${row.title}`}
                                                disabled={busy === `status:${row.workitemId}`} onClick={() => void onCheckStatus(row)}>
                                                <RefreshCw size={12} aria-hidden />
                                            </button>
                                        )}
                                        {(row.workitemId || row.envelopeId) && !completed && row.pill !== 'CANCELLED' && (
                                            <button className="esign__btn esign__btn--ghost" aria-label={`Resend ${row.title}`}
                                                onClick={() => void onResend(row)}>
                                                <Send size={12} aria-hidden />
                                            </button>
                                        )}
                                        {(row.workitemId || row.envelopeId) && !completed && row.pill !== 'CANCELLED' && (
                                            <button className="esign__btn esign__btn--ghost esign__btn--danger" aria-label={`Cancel ${row.title}`}
                                                onClick={() => onCancel(row)}>
                                                <XCircle size={12} aria-hidden />
                                            </button>
                                        )}
                                        {row.workitemId && completed && (
                                            <button className="esign__btn esign__btn--ghost" aria-label={`Download signed PDF of ${row.title}`}
                                                onClick={() => void onSignedPdf(row)}>
                                                <Download size={12} aria-hidden />
                                            </button>
                                        )}
                                        {(row.workitemId || row.envelopeId) && (
                                            <button className="esign__btn esign__btn--ghost" aria-label={`Download audit log of ${row.title}`}
                                                onClick={() => void onAuditLog(row)}>
                                                <ScrollText size={12} aria-hidden />
                                            </button>
                                        )}
                                        <a className="esign__link" href={documensoDocumentUrl(row)} target="_blank" rel="noreferrer"
                                            aria-label={`Open ${row.title} in Documenso`}>
                                            <ExternalLink size={12} aria-hidden />
                                        </a>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
}
