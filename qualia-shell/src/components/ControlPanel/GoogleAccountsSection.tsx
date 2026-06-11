/**
 * GoogleAccountsSection — connect MULTIPLE Google accounts (Gmail + Calendar).
 *
 * The backend owns the OAuth tokens; this UI lists connected accounts, starts a
 * connect (opens the consent popup), disconnects, and toggles an account on/off.
 * When the backend multi-account routes aren't present yet, it shows a clear
 * "apply the backend patch" note instead of breaking (see
 * Docs/Google_MultiAccount_Backend.md).
 */
import { useCallback, useEffect, useState } from 'react';
import { useIntegrations } from '../../hooks/useIntegrations';
import {
    listGoogleAccounts,
    startGoogleAuth,
    disconnectGoogleAccount,
    setGoogleAccountEnabled,
    openAuthPopup,
} from '../../lib/googleAccounts';
import type { GoogleAccount } from '../../types/integrations';

const fmtDate = (ms?: number) => (ms ? new Date(ms).toLocaleDateString() : '');

export default function GoogleAccountsSection() {
    const { integrations, update } = useIntegrations();
    const cached = integrations.google.accounts ?? [];
    const [live, setLive] = useState<GoogleAccount[] | null>(null);
    const [available, setAvailable] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setBusy(true);
        setError(null);
        const r = await listGoogleAccounts();
        setAvailable(r.available);
        if (r.available) {
            setLive(r.accounts);
            update(b => ({ ...b, google: { ...b.google, accounts: r.accounts } }));
        } else {
            setError(r.error ?? null);
        }
        setBusy(false);
    }, [update]);

    useEffect(() => { void refresh(); /* on mount */ }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const accounts = available ? (live ?? []) : cached;

    const connect = async (scopes: Array<'gmail' | 'calendar'>) => {
        setBusy(true);
        setError(null);
        const r = await startGoogleAuth(scopes);
        if (r.url) {
            await openAuthPopup(r.url);
            await refresh();
        } else {
            setAvailable(false);
            setError(r.error ?? 'Could not start Google sign-in.');
            setBusy(false);
        }
    };

    const disconnect = async (id: string) => {
        setBusy(true);
        await disconnectGoogleAccount(id);
        await refresh();
    };

    const toggle = async (acc: GoogleAccount) => {
        const next = accounts.map(a => (a.id === acc.id ? { ...a, enabled: !a.enabled } : a));
        setLive(next);
        update(b => ({ ...b, google: { ...b.google, accounts: next } }));
        await setGoogleAccountEnabled(acc.id, !acc.enabled);
    };

    const badge = (label: string, on: boolean) => (
        <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
            border: `1px solid ${on ? 'var(--accent, #6366f1)' : 'var(--border-default, rgba(255,255,255,0.15))'}`,
            color: on ? 'var(--accent, #818cf8)' : 'var(--text-tertiary, #888)',
            background: on ? 'color-mix(in srgb, var(--accent, #6366f1) 12%, transparent)' : 'transparent',
        }}>{label}</span>
    );

    const btn: React.CSSProperties = {
        padding: '7px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
        background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 12.5, fontWeight: 700,
    };
    const ghostBtn: React.CSSProperties = {
        padding: '5px 11px', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600,
        background: 'transparent', color: 'var(--text-secondary, #aaa)',
        border: '1px solid var(--border-default, rgba(255,255,255,0.16))',
    };

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">Google Accounts — Gmail + Calendar</h3>
            <div className="cp-field">
                <label className="cp-label">
                    Connect one or more Google accounts. Each grants Gmail + Calendar; the app reads mail and events from every enabled account.
                </label>

                {available === false && (
                    <div style={{
                        margin: '8px 0', padding: '10px 12px', borderRadius: 9, fontSize: 12.5,
                        background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.3)', color: '#fde68a',
                    }}>
                        Multi-account connect needs the backend OAuth routes. Apply the backend patch
                        (<code>Docs/Google_MultiAccount_Backend.md</code>) and set up a Google Cloud OAuth app.
                        {error ? <div style={{ marginTop: 4, opacity: 0.85 }}>{error}</div> : null}
                    </div>
                )}

                {accounts.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
                        {accounts.map(acc => (
                            <div key={acc.id} style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9,
                                border: '1px solid var(--border-default, rgba(255,255,255,0.1))',
                                background: acc.enabled ? 'rgba(255,255,255,0.02)' : 'transparent', opacity: acc.enabled ? 1 : 0.6,
                            }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{acc.email || acc.id}</div>
                                    <div style={{ display: 'flex', gap: 5, marginTop: 4, alignItems: 'center' }}>
                                        {badge('Gmail', acc.scopes.includes('gmail'))}
                                        {badge('Calendar', acc.scopes.includes('calendar'))}
                                        {acc.connectedAt ? <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>· since {fmtDate(acc.connectedAt)}</span> : null}
                                    </div>
                                </div>
                                <button style={ghostBtn} onClick={() => void toggle(acc)} disabled={busy}>
                                    {acc.enabled ? 'Disable' : 'Enable'}
                                </button>
                                <button style={{ ...ghostBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)' }} onClick={() => void disconnect(acc.id)} disabled={busy}>
                                    Disconnect
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {available !== false && accounts.length === 0 && !busy && (
                    <div style={{ margin: '8px 0', fontSize: 12.5, color: 'var(--text-tertiary, #888)' }}>
                        No Google accounts connected yet.
                    </div>
                )}

                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={btn} onClick={() => void connect(['gmail', 'calendar'])} disabled={busy}>
                        {busy ? 'Working…' : '+ Connect a Google account'}
                    </button>
                    <button style={ghostBtn} onClick={() => void refresh()} disabled={busy}>Re-check</button>
                </div>
            </div>
        </section>
    );
}
