/**
 * AuditLogSection — per-user audit trail viewer (Control Panel).
 *
 * Reads the backend audit log (`GET /api/dwellium/audit`) that the audit
 * middleware writes automatically for every One Save mutation (`/api/objects`)
 * — i.e. every workspace / knowledge-graph / API-key / hierarchy save lands
 * here under the acting user's id and name. This section shows the CURRENT
 * user's actions so "is my stuff actually being saved under my name?" has a
 * visible, verifiable answer (F-016 follow-up).
 *
 * Requires a REAL backend session: with a dead/static session the backend
 * answers 401 and the section says so honestly instead of pretending.
 */
import { useCallback, useContext, useEffect, useState } from 'react';
import { ScrollText, RefreshCw } from 'lucide-react';
import { UserContext, getAuthHeaders } from '../../context/UserContext';
import { API_BASE } from '../../config';

interface AuditEntry {
    id: number;
    userId: string;
    userName: string;
    userRole: string;
    action: string;
    entityType?: string;
    entityId?: string;
    details?: Record<string, unknown>;
    createdAt: string;
}

type LoadState =
    | { kind: 'loading' }
    | { kind: 'ready'; entries: AuditEntry[] }
    | { kind: 'error'; message: string };

function fmtTime(iso: string): string {
    try {
        const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
        return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return iso;
    }
}

export default function AuditLogSection() {
    // Raw context (repo convention) — degrades gracefully when no provider.
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;
    const [state, setState] = useState<LoadState>({ kind: 'loading' });

    const load = useCallback(async () => {
        if (!userId) {
            setState({ kind: 'error', message: 'Sign in to see your audit log.' });
            return;
        }
        setState({ kind: 'loading' });
        try {
            const res = await fetch(
                `${API_BASE}/api/dwellium/audit?user_id=${encodeURIComponent(userId)}&limit=100`,
                { headers: getAuthHeaders() },
            );
            if (res.status === 401 || res.status === 403) {
                setState({ kind: 'error', message: 'Your session is not accepted by the backend — sign in again to record and view account activity.' });
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
            setState({ kind: 'error', message: 'Backend unreachable — audit log lives on the server.' });
        }
    }, [userId]);

    useEffect(() => { void load(); }, [load]);

    return (
        <section className="cp-section">
            <h3 className="cp-section__title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ScrollText size={15} aria-hidden /> Audit Log
                <button
                    type="button"
                    onClick={() => void load()}
                    aria-label="Refresh audit log"
                    style={{
                        marginLeft: 'auto', display: 'inline-flex', alignItems: 'center',
                        background: 'transparent', border: '1px solid var(--border, #333)',
                        borderRadius: 6, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-tertiary)',
                    }}
                >
                    <RefreshCw size={13} aria-hidden />
                </button>
            </h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13, marginTop: 0, lineHeight: 1.6 }}>
                Every save made under your account — workspaces, knowledge graph, API keys, layouts —
                recorded server-side with a timestamp. If actions you just took are missing here,
                they are NOT being persisted to your account.
            </p>

            {state.kind === 'loading' && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Loading audit entries…</p>
            )}

            {state.kind === 'error' && (
                <p role="status" style={{ fontSize: 13, color: 'var(--warning, #e2b93d)' }}>{state.message}</p>
            )}

            {state.kind === 'ready' && state.entries.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
                    No recorded actions yet for this account.
                </p>
            )}

            {state.kind === 'ready' && state.entries.length > 0 && (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {state.entries.map((e) => (
                        <li
                            key={e.id}
                            style={{
                                display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 12.5,
                                padding: '7px 10px', borderRadius: 7,
                                background: 'rgba(0,0,0,0.28)', border: '1px solid var(--border, #2a2a2a)',
                            }}
                        >
                            <span style={{ color: 'var(--text-tertiary)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono','Fira Code',monospace", fontSize: 11 }}>
                                {fmtTime(e.createdAt)}
                            </span>
                            <span style={{ color: 'var(--accent)', whiteSpace: 'nowrap' }}>{e.action}</span>
                            <span style={{ color: 'var(--text-secondary, #b9c0cc)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {e.entityType ?? ''}{e.entityId ? ` · ${e.entityId}` : ''}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
