/**
 * TenantSignPrompt — "Review & sign" links for the tenant lease view (plan 053).
 *
 * Fetches GET /api/esign/my-signing (the backend matches esign recipients to
 * the session email and returns only the caller's own signing tokens). Renders
 * nothing while there is nothing to sign, while Documenso is unconfigured, or
 * on error — the tenant portal never shows setup noise.
 */
import { useEffect, useState } from 'react';
import { PenLine } from 'lucide-react';
import { listMySigning, type MySigningRow } from './esignApi';

export default function TenantSignPrompt() {
    const [rows, setRows] = useState<MySigningRow[]>([]);

    useEffect(() => {
        let cancelled = false;
        void listMySigning().then(r => {
            if (!cancelled && r.kind === 'ok') setRows(r.data);
        });
        return () => { cancelled = true; };
    }, []);

    if (rows.length === 0) return null;

    return (
        <div className="tp-card esign-tenant-prompt" data-testid="tenant-sign-prompt">
            <h3><PenLine size={16} aria-hidden /> Signature requested</h3>
            {rows.map(row => (
                <div key={row.workitemId} className="esign-tenant-prompt__row">
                    <span>{row.title}</span>
                    <a className="tp-quick-btn" href={row.signingUrl} target="_blank" rel="noreferrer">
                        Review &amp; sign
                    </a>
                </div>
            ))}
        </div>
    );
}
