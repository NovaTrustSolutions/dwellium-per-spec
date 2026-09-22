/**
 * TenantSignPrompt — "Review & sign" links for the tenant lease view (plan 053).
 *
 * Fetches GET /api/esign/my-signing (the backend matches esign recipients to
 * the session email and returns only the caller's own signing tokens). Renders
 * nothing while there is nothing to sign or while Documenso is unconfigured —
 * the tenant portal never shows setup noise. A fetch ERROR is different: a lease
 * may be waiting, so it says so quietly and offers a retry.
 */
import { useCallback, useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { listMySigning, type MySigningRow } from './esignApi';

export default function TenantSignPrompt() {
    const [rows, setRows] = useState<MySigningRow[]>([]);
    const [failed, setFailed] = useState(false);

    const load = useCallback(async (): Promise<void> => {
        const r = await listMySigning();
        if (r.kind === 'ok') { setRows(r.data); setFailed(false); return; }
        // needs-setup stays silent; only a real failure is worth telling the tenant about.
        setFailed(r.kind === 'error');
    }, []);

    useEffect(() => { void load(); }, [load]);

    if (rows.length === 0 && !failed) return null;

    if (rows.length === 0) {
        return (
            <div className="tp-card esign-tenant-prompt" data-testid="tenant-sign-prompt-error">
                <p role="status">
                    We couldn&apos;t check whether anything is waiting for your signature.{' '}
                    <button className="tp-quick-btn" onClick={() => void load()}>Try again</button>
                </p>
            </div>
        );
    }

    return (
        <div className="tp-card esign-tenant-prompt" data-testid="tenant-sign-prompt">
            <h3><PenLine size={16} aria-hidden /> Signature requested</h3>
            {rows.map(row => (
                <div key={row.workitemId} className="esign-tenant-prompt__row">
                    <span>{row.title}</span>
                    <a className="tp-quick-btn" href={row.signingUrl} target="_blank" rel="noreferrer"
                        aria-label={`Review & sign ${row.title} (opens in a new tab)`}>
                        Review &amp; sign
                    </a>
                </div>
            ))}
        </div>
    );
}
