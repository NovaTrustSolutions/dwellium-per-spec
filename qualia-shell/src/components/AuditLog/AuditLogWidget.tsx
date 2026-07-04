/**
 * AuditLogWidget — full audit-trail holocron (Holocron OS ▸ Apps ▸ Tools).
 *
 * RESTRICTED via capability, not a hardcoded email list: any signed-in
 * account may attempt to load the log; the backend is the real security
 * boundary (`AUDIT_LOG_VIEWER_EMAILS`, plan 033) and returns 403 for anyone
 * not on its allowlist. The widget honors that 403 with an honest
 * "restricted" card instead of duplicating the email list on the frontend
 * (see `auditLogAccess.ts` for the SEPARATE cosmetic catalog-visibility
 * list — that one only affects whether the tile shows up at all).
 *
 * Three views:
 *   · Sessions — who logged in / out, when, from which IP/location
 *     (LOGIN_SUCCESS / LOGIN_FAILED / LOGOUT events). Backend, capability-gated.
 *   · Activity — what each user worked on (every recorded mutation:
 *     action + entity + timestamp + user). Backend, capability-gated.
 *   · My Activity — this device/login's LOCAL app-usage history (plan 038;
 *     `activityLogStore` via `useActivityLog()`) — every widget open/close
 *     plus wired domain events (Terminal commands, Stella messages, Thought
 *     Weaver captures). Available to ANY signed-in user (no backend fetch,
 *     no capability gate — it's the user's own local history).
 *
 * Every row on every tab is expandable (chevron, `aria-expanded`) to reveal
 * its full record — pretty-printed `details` JSON plus the fields not shown
 * in the collapsed row.
 *
 * The two backend tabs require a REAL backend session (quick-access static
 * tokens are rejected by the backend with 401); the widget says so honestly
 * instead of showing an empty list.
 */
import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw, LogIn, Activity, ChevronRight, History } from 'lucide-react';
import { UserContext, getAuthHeaders } from '../../context/UserContext';
import { API_BASE } from '../../config';
import { useActivityLog, type ActivityEntry } from '../../lib/activityLogStore';

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
    location?: string | null;
    createdAt: string;
}

type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; entries: AuditEntry[] }
    | { kind: 'error'; message: string }
    | { kind: 'forbidden' };

type ViewTab = 'sessions' | 'activity' | 'my-activity';

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

function fmtTs(ts: number): string {
    try {
        return new Date(ts).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
        });
    } catch {
        return String(ts);
    }
}

function actionColor(action: string): string {
    if (action === 'LOGIN_SUCCESS') return '#4ade80';
    if (action === 'LOGIN_FAILED') return '#f87171';
    if (action === 'LOGOUT') return '#fbbf24';
    return 'var(--accent)';
}

/** Chevron button toggling an expanded row's `aria-expanded` state. */
function ExpandToggle({ expanded, onToggle, label }: { expanded: boolean; onToggle: () => void; label: string }) {
    return (
        <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${label}` : `Expand ${label}`}
            onClick={onToggle}
            style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 20, height: 20, background: 'transparent', border: 'none',
                cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0,
                transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.12s ease',
            }}
        >
            <ChevronRight size={14} aria-hidden />
        </button>
    );
}

/** Pretty-printed JSON block shared by both expanded-row shapes. */
function DetailsJson({ details }: { details?: Record<string, unknown> }) {
    if (!details || Object.keys(details).length === 0) {
        return <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>No additional details recorded.</p>;
    }
    return (
        <pre style={{
            margin: 0, fontSize: 11.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            fontFamily: "'JetBrains Mono','Fira Code',monospace", color: 'var(--text-secondary, #b9c0cc)',
            background: 'rgba(0,0,0,0.25)', borderRadius: 6, padding: '8px 10px',
        }}>
            {JSON.stringify(details, null, 2)}
        </pre>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
            <span style={{ color: 'var(--text-tertiary)', minWidth: 90 }}>{label}</span>
            <span style={{ color: 'var(--text-secondary, #b9c0cc)', fontFamily: "'JetBrains Mono','Fira Code',monospace" }}>{value}</span>
        </div>
    );
}

export default function AuditLogWidget() {
    // Raw context (repo convention) — degrades gracefully without a provider.
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;
    const signedIn = userId !== null;

    const [state, setState] = useState<LoadState>({ kind: 'loading' });
    const [view, setView] = useState<ViewTab>('sessions');
    const [query, setQuery] = useState('');
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // "My Activity" — LOCAL per-login store, no fetch, available to any
    // signed-in user (usePerUserIdentity() is called inside useActivityLog()).
    const myActivity = useActivityLog();

    const toggleExpanded = useCallback((key: string) => {
        setExpandedIds((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    }, []);

    const load = useCallback(async () => {
        setState({ kind: 'loading' });
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/audit?limit=500`, { headers: getAuthHeaders() });
            if (res.status === 403) {
                setState({ kind: 'forbidden' });
                return;
            }
            if (res.status === 401) {
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

    // Only the two BACKEND tabs need the capability-gated fetch; "My Activity"
    // never fetches (local store only), so this effect is unaffected by that tab.
    useEffect(() => { if (signedIn) void load(); }, [userId, signedIn, load]);

    const visible = useMemo(() => {
        if (state.kind !== 'ready') return [];
        const base = state.entries.filter((e) =>
            view === 'sessions' ? SESSION_ACTIONS.has(e.action) : !SESSION_ACTIONS.has(e.action));
        const q = query.trim().toLowerCase();
        if (!q) return base;
        return base.filter((e) =>
            [e.userName, e.userId, e.action, e.entityType, e.entityId, e.ipAddress, e.location]
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q)));
    }, [state, view, query]);

    const visibleActivity = useMemo(() => {
        // newest-first is already the store's storage order.
        const q = query.trim().toLowerCase();
        if (!q) return myActivity;
        return myActivity.filter((e: ActivityEntry) =>
            [e.widgetId, e.widgetLabel, e.action, e.details ? JSON.stringify(e.details) : '']
                .filter(Boolean)
                .some((v) => String(v).toLowerCase().includes(q)));
    }, [myActivity, query]);

    if (!signedIn) {
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

    // Only the two backend-sourced tabs are ever blocked by the capability
    // gate; "My Activity" is local and always renders for any signed-in user.
    const backendForbidden = state.kind === 'forbidden' && view !== 'my-activity';

    const tabsHeader = (
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
            <button role="tab" aria-selected={view === 'my-activity'} type="button" onClick={() => setView('my-activity')}
                style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, padding: '5px 11px',
                    borderRadius: 7, cursor: 'pointer',
                    border: '1px solid var(--border, #333)',
                    background: view === 'my-activity' ? 'var(--accent)' : 'transparent',
                    color: view === 'my-activity' ? '#0c0c0c' : 'var(--text-tertiary)',
                }}>
                <History size={12} aria-hidden /> My Activity
            </button>
        </div>
    );

    if (backendForbidden) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 12, fontFamily: 'Inter, -apple-system, sans-serif', boxSizing: 'border-box' }}>
                <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <ScrollText size={17} aria-hidden style={{ color: 'var(--accent)' }} />
                    <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary, #e5e9f0)' }}>Audit Log</h2>
                    {tabsHeader}
                </header>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                    <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', maxWidth: 380 }}>
                        <ScrollText size={28} style={{ opacity: 0.5 }} aria-hidden />
                        <h3 style={{ margin: '12px 0 6px', color: 'var(--text-secondary, #b9c0cc)', fontSize: 16 }}>Audit Log is restricted</h3>
                        <p style={{ fontSize: 13, lineHeight: 1.6, margin: 0 }}>
                            This account isn&apos;t on the audit-log viewer list (backend AUDIT_LOG_VIEWER_EMAILS).
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: 16, gap: 12, fontFamily: 'Inter, -apple-system, sans-serif', boxSizing: 'border-box' }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <ScrollText size={17} aria-hidden style={{ color: 'var(--accent)' }} />
                <h2 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary, #e5e9f0)' }}>Audit Log</h2>
                {tabsHeader}
                {view !== 'my-activity' && (
                    <button type="button" onClick={() => void load()} aria-label="Refresh audit log"
                        style={{
                            marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
                            background: 'transparent', border: '1px solid var(--border, #333)',
                            borderRadius: 6, padding: '5px 9px', cursor: 'pointer', color: 'var(--text-tertiary)',
                        }}>
                        <RefreshCw size={13} aria-hidden />
                    </button>
                )}
            </header>

            <label style={{ display: 'block' }}>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Filter audit entries</span>
                <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={view === 'my-activity' ? 'Filter by app, action, or details…' : 'Filter by user, action, entity, or IP…'}
                    style={{
                        width: '100%', boxSizing: 'border-box', fontSize: 13, padding: '8px 12px',
                        borderRadius: 8, border: '1px solid var(--border, #333)',
                        background: 'rgba(0,0,0,0.3)', color: 'var(--text-primary, #e5e9f0)',
                    }}
                />
            </label>

            {view === 'my-activity' ? (
                visibleActivity.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No activity recorded on this login yet.</p>
                ) : (
                    <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--text-tertiary)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <th style={{ padding: '6px 8px', width: 24 }} aria-hidden />
                                    <th style={{ padding: '6px 8px' }}>Time</th>
                                    <th style={{ padding: '6px 8px' }}>App</th>
                                    <th style={{ padding: '6px 8px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleActivity.map((e: ActivityEntry) => {
                                    const expanded = expandedIds.has(e.id);
                                    return (
                                        <Fragment key={e.id}>
                                            <tr style={{ borderTop: '1px solid var(--border, #26262a)' }}>
                                                <td style={{ padding: '7px 8px' }}>
                                                    <ExpandToggle expanded={expanded} onToggle={() => toggleExpanded(e.id)} label={`row for ${e.widgetLabel} ${e.action}`} />
                                                </td>
                                                <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                                                    {fmtTs(e.ts)}
                                                </td>
                                                <td style={{ padding: '7px 8px', color: 'var(--text-secondary, #b9c0cc)' }}>{e.widgetLabel}</td>
                                                <td style={{ padding: '7px 8px', whiteSpace: 'nowrap', color: 'var(--accent)' }}>{e.action}</td>
                                            </tr>
                                            {expanded && (
                                                <tr>
                                                    <td colSpan={4} style={{ padding: '4px 8px 12px 34px', background: 'rgba(255,255,255,0.02)' }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                            <DetailRow label="Widget id" value={e.widgetId} />
                                                            <DetailRow label="Entry id" value={e.id} />
                                                            <DetailRow label="Timestamp" value={new Date(e.ts).toISOString()} />
                                                            <DetailsJson details={e.details} />
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )
            ) : (
                <>
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
                                        <th style={{ padding: '6px 8px', width: 24 }} aria-hidden />
                                        <th style={{ padding: '6px 8px' }}>Time</th>
                                        <th style={{ padding: '6px 8px' }}>User</th>
                                        <th style={{ padding: '6px 8px' }}>{view === 'sessions' ? 'Event' : 'Action'}</th>
                                        {view === 'activity' && <th style={{ padding: '6px 8px' }}>Worked on</th>}
                                        <th style={{ padding: '6px 8px' }}>IP / Location</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((e) => {
                                        const expanded = expandedIds.has(String(e.id));
                                        return (
                                            <Fragment key={e.id}>
                                                <tr style={{ borderTop: '1px solid var(--border, #26262a)' }}>
                                                    <td style={{ padding: '7px 8px' }}>
                                                        <ExpandToggle expanded={expanded} onToggle={() => toggleExpanded(String(e.id))} label={`row for ${e.userName || e.userId} ${e.action}`} />
                                                    </td>
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
                                                        {e.location
                                                            ? (
                                                                <>
                                                                    {e.location}
                                                                    {e.ipAddress && <span style={{ opacity: 0.6 }}> · {e.ipAddress}</span>}
                                                                </>
                                                            )
                                                            : (e.ipAddress || '—')}
                                                    </td>
                                                </tr>
                                                {expanded && (
                                                    <tr>
                                                        <td colSpan={view === 'activity' ? 6 : 5} style={{ padding: '4px 8px 12px 34px', background: 'rgba(255,255,255,0.02)' }}>
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                                <DetailRow label="User id" value={e.userId} />
                                                                <DetailRow label="Role" value={e.userRole} />
                                                                {e.entityType && <DetailRow label="Entity type" value={e.entityType} />}
                                                                {e.entityId && <DetailRow label="Entity id" value={e.entityId} />}
                                                                {e.ipAddress && <DetailRow label="IP" value={e.ipAddress} />}
                                                                {e.location && <DetailRow label="Location" value={e.location} />}
                                                                <DetailRow label="Timestamp" value={new Date(e.createdAt.includes('T') ? e.createdAt : `${e.createdAt.replace(' ', 'T')}Z`).toISOString()} />
                                                                <DetailsJson details={e.details} />
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
