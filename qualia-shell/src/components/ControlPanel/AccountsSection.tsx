/**
 * AccountsSection — god-only local-account administration (Control Panel).
 *
 * The Architect (any `god` user) can set/replace each local account's sign-in
 * password and enable/disable accounts. Edits persist via the localAccounts
 * override store and take effect on the next sign-in. A lockout guard prevents
 * disabling the last enabled god account.
 *
 * Local-first: passwords are stored unencrypted on this device (same posture
 * as the original hardcoded roster) — a gate, not hardened security.
 */
import { useState } from 'react';
import { ShieldCheck, Check } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import {
    useEffectiveAccounts,
    setAccountPassword,
    setAccountEnabled,
    isPasswordSet,
    ROLE_LABELS,
    type LocalAccount,
} from '../Auth/localAccounts';

const MIN_PW = 4;

export default function AccountsSection() {
    const { user } = useUser();
    const accounts = useEffectiveAccounts();
    const [drafts, setDrafts] = useState<Record<string, string>>({});
    const [savedId, setSavedId] = useState<string | null>(null);

    // God-only surface.
    if (user?.role !== 'god') return null;

    const enabledGodCount = accounts.filter(a => a.role === 'god' && a.enabled).length;

    const savePassword = (id: string) => {
        const pw = (drafts[id] ?? '').trim();
        if (pw.length < MIN_PW) return;
        setAccountPassword(id, pw);
        setDrafts(d => ({ ...d, [id]: '' }));
        setSavedId(id);
        setTimeout(() => setSavedId(s => (s === id ? null : s)), 2000);
    };

    const toggleEnabled = (a: LocalAccount, lastGod: boolean) => {
        if (lastGod) return; // never disable the last enabled god account
        setAccountEnabled(a.id, !a.enabled);
    };

    return (
        <section className="cp-section">
            <h3 className="cp-section__title"><ShieldCheck size={15} aria-hidden /> Accounts</h3>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary, #808080)', lineHeight: 1.5, margin: '0 0 12px' }}>
                God-only. Set local sign-in passwords and enable/disable accounts. Local-first — stored on this device, not hardened security.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {accounts.map(a => {
                    const lastGod = a.enabled && a.role === 'god' && enabledGodCount <= 1;
                    const draft = drafts[a.id] ?? '';
                    return (
                        <div key={a.id} style={{
                            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
                            padding: 12, borderRadius: 10,
                            border: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                            background: 'var(--surface-2, rgba(255,255,255,0.03))',
                        }}>
                            {/* Identity */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 180, flex: 1 }}>
                                <span style={{
                                    width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                                    display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700,
                                    color: '#0c0c0c', background: a.color,
                                }}>{a.initials}</span>
                                <div style={{ lineHeight: 1.3 }}>
                                    <strong style={{ color: 'var(--text-primary)' }}>{a.name}</strong>{' '}
                                    <span style={{ fontSize: 11, color: 'var(--text-tertiary, #808080)' }}>{ROLE_LABELS[a.role] ?? a.role}</span>
                                    <div style={{ fontSize: 11, color: 'var(--text-tertiary, #808080)' }}>{a.email}</div>
                                </div>
                            </div>

                            {/* Status + enable toggle */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{
                                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                                    color: isPasswordSet(a) ? '#22c55e' : '#f59e0b',
                                    background: isPasswordSet(a) ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                                }}>{isPasswordSet(a) ? 'Password set' : 'No password'}</span>
                                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-secondary)', cursor: lastGod ? 'not-allowed' : 'pointer' }}
                                    title={lastGod ? 'Cannot disable the last enabled god account' : undefined}>
                                    <input type="checkbox" checked={a.enabled} disabled={lastGod} onChange={() => toggleEnabled(a, lastGod)} />
                                    {a.enabled ? 'Enabled' : 'Disabled'}
                                </label>
                            </div>

                            {/* Change password */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <input
                                    type="password"
                                    placeholder="New password"
                                    aria-label={`New password for ${a.name}`}
                                    value={draft}
                                    onChange={e => setDrafts(d => ({ ...d, [a.id]: e.target.value }))}
                                    onKeyDown={e => { if (e.key === 'Enter') savePassword(a.id); }}
                                    style={{
                                        fontSize: 12, padding: '6px 9px', borderRadius: 7,
                                        border: '1px solid var(--border-color, #333)', background: 'transparent',
                                        color: 'var(--text-primary)', width: 150,
                                    }}
                                />
                                <button
                                    className="cp-btn"
                                    onClick={() => savePassword(a.id)}
                                    disabled={draft.trim().length < MIN_PW}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: 5,
                                        fontSize: 12, padding: '6px 10px', borderRadius: 7, cursor: 'pointer',
                                        border: '1px solid var(--border-color, #333)', background: 'transparent',
                                        color: 'var(--text-primary)', opacity: draft.trim().length < MIN_PW ? 0.5 : 1,
                                    }}
                                >
                                    {savedId === a.id ? <><Check size={13} aria-hidden /> Saved</> : 'Set password'}
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
