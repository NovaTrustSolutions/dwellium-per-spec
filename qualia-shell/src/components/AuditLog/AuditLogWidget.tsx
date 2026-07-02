/**
 * AuditLogWidget — full audit-trail holocron (Holocron OS ▸ Apps ▸ Tools).
 *
 * RESTRICTED: renders ONLY for Andy's login (andy@dwellium.com) — enforced
 * both here (hard gate, defense in depth) and in the Holocron OS Apps catalog
 * (registry `restrictedToEmails`). Everyone else sees an honest "restricted"
 * card, never the data.
 *
 * Two views over the backend audit log (`GET /api/dwellium/audit`, written
 * automatically by the audit middleware + auth routes):
 *   · Sessions — who logged in / out, when, from which IP (LOGIN_SUCCESS /
 *     LOGIN_FAILED / LOGOUT events).
 *   · Activity — what each user worked on (every recorded mutation:
 *     action + entity + timestamp + user).
 *
 * Requires a REAL backend session (quick-access static tokens are rejected by
 * the backend); the widget says so honestly instead of showing an empty list.
 */
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw, LogIn, Activity } from 'lucide-react';
import { UserContext, getAuthHeaders } from '../../context/UserContext';
import { API_BASE } from '../../config';

const ALLOWED_EMAILS = ['andy@dwellium.com'];

interface AuditEntry {
    id: number;
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
    ipAddress?: string;
    createdAt: string;
}

type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; entries: AuditEntry[] }
    | { kind: 'error'; message: string };

const SESSION_ACTIONS = new Set(['LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT']);

function fmtTime(iso: string): string {
    try {
        const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
        return d.toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    } catch {
        return iso;
    }
}

function actionColor(action: string): string {
    if (action === 'LOGIN_SUCCESS') return '#4ade80';
    if (action === 'LOGIN_FAILED') return '#f87171';
    if (action === 'LOGOUT') return '#fbbf24';
    return 'var(--accent)';
}

export default function AuditLogWidget() {
    // Raw context (repo convention) — degrades gracefully without a provider.
    const userCtx = useContext(UserContext);
    const email = userCtx?.user?.email?.trim().toLowerCase() ?? '';
    const allowed = ALLOWED_EMAILS.includes(email);

    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [view, setView] = useState<'sessions' | 'activity'>('sessions');
    const [query, setQuery] = useState('');

    const load = useCallback(async () => {
        setState({ kind: 'loading' });
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/audit?limit=500`, { headers: getAuthHeaders() });
            if (res.status === 401 || res.status === 403) {
                setState({ kind: 'error', message: 'The backend rejected this session. Sign in with a real account (Google) — quick-access logins cannot read the server-side audit log.' });
                return;
            }
            if (!res.ok) {
                setState({ kind: 'error', message: `Backend returned ${res.status}.` });
                return;
            }
            const json = await res.json().catch(() => null) as { success?: boolean; entries?: AuditEntry[] } | null;
            if (!json?.success || !Array.isArray(json.entries)) {
                setState({ kind: 'error', message: 'Malformed audit response.' });
                return;
            }
            setState({ kind: 'ready', entries: json.entries });
        } catch {
            setState({ kind: 'error', message: 'Backend unreachable — the audit log lives on the server.' });
        }
    }, []);

    useEffect(() => { if (allowed) void load(); }, [allowed, load]);

    const visible = useMemo(() => {
        if (state.kind !== 'ready') return [];
        const base = state.entries.filter((e) =>
            view === 'sessions' ? SESSION_ACTIONS.has(e.action) : !SESSION_ACTIONS.has(e.action));
        const q = query.trim().toLowerCase();
        if (!q) return base;
        return base.filter((e) =>
            [e.userName, e.userId, e.action, e.entityType, e.entityId, e.ipAddress]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q)));
    }, [state, view, query]);

    if (!allowed) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32, fontFamily: 'Inter, -apple-system, sans-serif' }}>
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', maxWidth: 380 }}>
                    <ScrollText size={28} style={{ opacity: 0.5 }} aria-hidden />
                    <h3 style={{ margin: '12px 0 6px', color: 'var(--text-secondary, #b9c0cc)', fontSize: 16 }}>Audit Log is restricted</h3>
                    <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                        This holocron is only available on Andy&apos;s login.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 12, fontFamily: 'Inter, -apple-system, sans-serif', boxSizing: 'border-box' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <ScrollText size={17} aria-hidden style={{ color: 'var(--accent)' }} />
                <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary, #e5e9f0)' }}>Audit Log</h2>
                <div role="tablist" aria-label="Audit views" style={{ display: 'flex', gap: 6, marginLeft: 8 }}>
                    <button role="tab" aria-selected={view === 'sessions'} type="button" onClick={() => setView('sessions')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '5px 11px',
                            borderRadius: 7, cursor: 'pointer',
                            border: '1px solid var(--border, #333)',
                            background: view === 'sessions' ? 'var(--accent)' : 'transparent',
                            color: view === 'sessions' ? '#0c0c0c' : 'var(--text-tertiary)',
                        }}>
                        <LogIn size={12} aria-hidden /> Sessions
                    </button>
                    <button role="tab" aria-selected={view === 'activity'} type="button" onClick={() => setView('activity')}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '5px 11px',
                            borderRadius: 7, cursor: 'pointer',
                            border: '1px solid var(--border, #333)',
                            background: view === 'activity' ? 'var(--accent)' : 'transparent',
                            color: view === 'activity' ? '#0c0c0c' : 'var(--text-tertiary)',
                        }}>
                        <Activity size={12} aria-hidden /> Activity
                    </button>
                </div>
                <button type="button" onClick={() => void load()} aria-label="Refresh audit log"
                    style={{
                        marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
                        background: 'transparent', border: '1px solid var(--border, #333)',
                        borderRadius: 6, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-tertiary)',
                    }}>
                    <RefreshCw size={13} aria-hidden />
                </button>
            </header>

            <label style={{ display: 'block' }}>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Filter audit entries</span>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by user, action, entity, or IP…"
                    style={{
                        width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 12px',
                        borderRadius: 8, border: '1px solid var(--border, #333)',
                        background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary, #e5e9f0)',
                    }}
                />
            </label>

            {state.kind === 'loading' && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading audit entries…</p>}
            {state.kind === 'error' && <p role="status" style={{ fontSize: 13, color: 'var(--warning, #e2b93d)' }}>{state.message}</p>}
            {state.kind === 'ready' && visible.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    {view === 'sessions' ? 'No login/logout events recorded yet.' : 'No activity recorded yet.'}
                </p>
            )}

            {state.kind === 'ready' && visible.length > 0 && (
                <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                <th style={{ padding: '6px 8px' }}>Time</th>
                                <th style={{ padding: '6px 8px' }}>User</th>
                                <th style={{ padding: '6px 8px' }}>{view === 'sessions' ? 'Event' : 'Action'}</th>
                                {view === 'activity' && <th style={{ padding: '6px 8px' }}>Worked on</th>}
                                <th style={{ padding: '6px 8px' }}>IP / Location</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((e) => (
                                <tr key={e.id} style={{ borderTop: '1px solid var(--border, #26262a)' }}>
                                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                                        {fmtTime(e.createdAt)}
                                    </td>
                                    <td style={{ padding: '7px 8px', color: 'var(--text-secondary, #b9c0cc)' }}>
                                        {e.userName || e.userId}
                                        <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}> · {e.userRole}</span>
                                    </td>
                                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', color: actionColor(e.action) }}>{e.action}</td>
                                    {view === 'activity' && (
                                        <td style={{ padding: '7px 8px', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260, color: 'var(--text-secondary, #b9c0cc)' }}>
                                            {e.entityType ?? '—'}{e.entityId ? ` · ${e.entityId}` : ''}
                                        </td>
                                    )}
                                    <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                                        {e.ipAddress || '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
