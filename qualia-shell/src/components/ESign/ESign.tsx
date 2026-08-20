/**
 * ESign — plan 047 phase 1: Documenso e-signature widget.
 *
 * Lists leases sent for e-signature (via the backend proxy /api/esign) with
 * per-recipient status chips. While the backend has no DOCUMENSO_* env (503)
 * it renders a clean "Connect Documenso" needs-setup card pointing at the
 * Tools hub — nothing here crashes without a live Documenso (gate G2).
 * When VITE_DOCUMENSO_URL is set, an "Open Documenso ↗" link appears.
 */
import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, PenLine, RefreshCw } from 'lucide-react';
import { listEsignDocuments, type EsignDocument } from './esignApi';
import { openWidget } from '../../lib/dwelliumCommands';
import './ESign.css';

type ViewState =
    | { kind: 'loading' }
    | { kind: 'needs-setup' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; documents: EsignDocument[] };

export default function ESign() {
    const [state, setState] = useState<ViewState>({ kind: 'loading' });

    const refresh = useCallback(async () => {
        setState({ kind: 'loading' });
        const r = await listEsignDocuments();
        setState(
            r.kind === 'ok'
                ? { kind: 'ok', documents: r.documents }
                : r.kind === 'needs-setup'
                    ? { kind: 'needs-setup' }
                    : { kind: 'error', message: r.message },
        );
    }, []);

    useEffect(() => { void refresh(); }, [refresh]);

    const documensoUrl = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_DOCUMENSO_URL;

    return (
        <div className="esign">
            <div className="esign__head">
                <h2 className="esign__title"><PenLine size={16} aria-hidden /> E-Sign</h2>
                <div className="esign__head-actions">
                    {documensoUrl && (
                        <a className="esign__link" href={documensoUrl} target="_blank" rel="noreferrer">
                            Open Documenso <ExternalLink size={12} aria-hidden />
                        </a>
                    )}
                    <button className="esign__btn esign__btn--ghost" onClick={() => void refresh()} aria-label="Refresh e-sign documents">
                        <RefreshCw size={14} aria-hidden />
                    </button>
                </div>
            </div>

            {state.kind === 'loading' && <p className="esign__muted">Loading sent documents…</p>}

            {state.kind === 'needs-setup' && (
                <div className="esign__empty" data-state="needs-setup">
                    <PenLine size={28} aria-hidden />
                    <h3>Connect Documenso</h3>
                    <p>
                        E-Sign sends leases, renewals and vendor agreements for signature through a
                        self-hosted Documenso. The backend isn&apos;t connected yet — once the
                        DOCUMENSO_* env is set it flips to Ready automatically.
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

            {state.kind === 'ok' && state.documents.length === 0 && (
                <div className="esign__empty" data-state="none-sent">
                    <h3>Nothing out for signature</h3>
                    <p>Approve a lease in Strata → Leasing, then use &ldquo;Send for e-signature&rdquo;.</p>
                    <button className="esign__btn" onClick={() => openWidget('strata-dashboard')}>Open Strata</button>
                </div>
            )}

            {state.kind === 'ok' && state.documents.length > 0 && (
                <table className="esign__table">
                    <thead>
                        <tr><th>Document</th><th>Recipients</th><th>Status</th><th>Sent</th></tr>
                    </thead>
                    <tbody>
                        {state.documents.map(doc => (
                            <tr key={doc.envelopeId} data-doc-status={doc.docStatus}>
                                <td className="esign__doc-title">{doc.title}</td>
                                <td>
                                    {doc.recipients.length === 0
                                        ? <span className="esign__muted">—</span>
                                        : doc.recipients.map(r => (
                                            <span key={r.email} className="esign__chip" title={r.status || r.role || 'signer'}>{r.email}</span>
                                        ))}
                                </td>
                                <td><span className={`esign__status esign__status--${doc.docStatus}`}>{doc.docStatus.replace(/_/g, ' ')}</span></td>
                                <td className="esign__muted">{doc.sentAt ? new Date(doc.sentAt).toLocaleDateString() : '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
