/**
 * UpstreamStats — per-user upstream Inbox Zero stats proxy, plan 066 Phase 7.
 * Rendered in the Stats tab below the native StatsTab. Four honest states:
 * not configured (503/`configured:false`) / no key (409/`hasKey:false`) /
 * stats (GET .../stats/response-time + .../stats/by-period?period=week in
 * parallel) / error (502/504/other, with a 502 offering "Replace key").
 * The API key is write-only: the draft input is cleared after every save
 * attempt (success or failure) and never re-appears in state, a toast, or
 * a log line.
 */
import { useCallback, useEffect, useState } from 'react';

type AuthFetch = (url: string, opts?: RequestInit) => Promise<Response>;

interface ResponseTimeSummary {
    medianResponseTime: number;
    averageResponseTime: number;
    within1Hour: number;
}

interface ResponseTimeDistribution {
    lessThan1Hour: number;
    oneToFourHours: number;
    fourTo24Hours: number;
    oneToThreeDays: number;
    threeToSevenDays: number;
    moreThan7Days: number;
}

interface ResponseTimeStats {
    summary: ResponseTimeSummary;
    distribution: ResponseTimeDistribution;
    emailsAnalyzed: number;
    maxEmailsCap: number;
}

interface ByPeriodRow {
    startOfPeriod: string;
    All: number;
    Sent: number;
    Read: number;
    Archived: number;
}

interface ByPeriodStats {
    result: ByPeriodRow[];
}

type ViewState =
    | { kind: 'loading' }
    | { kind: 'not-configured' }
    | { kind: 'no-key' }
    | { kind: 'stats'; responseTime: ResponseTimeStats; byPeriod: ByPeriodStats }
    | { kind: 'error'; message: string; canReplaceKey: boolean };

interface UpstreamStatsProps {
    apiBase: string;
    authFetch: AuthFetch;
}

const DISTRIBUTION_LABELS: Array<[keyof ResponseTimeDistribution, string]> = [
    ['lessThan1Hour', '< 1 hour'],
    ['oneToFourHours', '1–4 hours'],
    ['fourTo24Hours', '4–24 hours'],
    ['oneToThreeDays', '1–3 days'],
    ['threeToSevenDays', '3–7 days'],
    ['moreThan7Days', '7+ days'],
];

// upstream responseTimeMins is minutes (apps/web/utils/stats/response-time/calculate.ts).
function formatMinutes(mins: number): string {
    if (mins < 60) return `${mins} m`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h} h` : `${h} h ${m} m`;
}

export default function UpstreamStats({ apiBase, authFetch }: UpstreamStatsProps) {
    const API = `${apiBase}/upstream`;
    const [state, setState] = useState<ViewState>({ kind: 'loading' });
    const [keyDraft, setKeyDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const loadStats = useCallback(async () => {
        try {
            const [rtRes, bpRes] = await Promise.all([
                authFetch(`${API}/stats/response-time`),
                authFetch(`${API}/stats/by-period?period=week`),
            ]);
            const failing = !rtRes.ok ? rtRes : !bpRes.ok ? bpRes : null;
            if (failing) {
                const body = await failing.json().catch(() => ({}));
                setState({
                    kind: 'error',
                    message: body.error || `Upstream stats request failed (${failing.status})`,
                    // "Never treat these as auth failures" — 502 here only ever means the upstream
                    // key was rejected or the proxy failed, so it's the one status worth a
                    // dedicated "Replace key" escape hatch back to state 2.
                    canReplaceKey: failing.status === 502,
                });
                return;
            }
            // Every /api/inbox route answers { success, data } — unwrap it (the stats are in .data).
            const [rtBody, bpBody] = await Promise.all([rtRes.json(), bpRes.json()]);
            const bad = rtBody?.success === false ? rtBody : bpBody?.success === false ? bpBody : null;
            if (bad || !rtBody?.data || !bpBody?.data) {
                setState({ kind: 'error', message: bad?.error || 'Upstream stats response was empty', canReplaceKey: false });
                return;
            }
            setState({ kind: 'stats', responseTime: rtBody.data, byPeriod: bpBody.data });
        } catch (e: any) {
            setState({ kind: 'error', message: e?.message || 'Network error', canReplaceKey: false });
        }
    }, [API, authFetch]);

    const loadStatus = useCallback(async () => {
        setState({ kind: 'loading' });
        try {
            const res = await authFetch(`${API}/status`);
            if (!res.ok) {
                if (res.status === 503) { setState({ kind: 'not-configured' }); return; }
                if (res.status === 409) { setState({ kind: 'no-key' }); return; }
                const body = await res.json().catch(() => ({}));
                setState({ kind: 'error', message: body.error || `Could not check upstream status (${res.status})`, canReplaceKey: false });
                return;
            }
            const body = await res.json().catch(() => ({}));
            if (body.success === false) {
                setState({ kind: 'error', message: body.error || 'Could not check upstream status', canReplaceKey: false });
                return;
            }
            const data = body.data ?? {};
            if (!data.configured) { setState({ kind: 'not-configured' }); return; }
            if (!data.hasKey) { setState({ kind: 'no-key' }); return; }
            await loadStats();
        } catch (e: any) {
            setState({ kind: 'error', message: e?.message || 'Network error', canReplaceKey: false });
        }
    }, [API, authFetch, loadStats]);

    useEffect(() => { loadStatus(); }, [loadStatus]);

    const handleSaveKey = async () => {
        const apiKey = keyDraft;
        setSaving(true);
        setSaveError(null);
        try {
            const res = await authFetch(`${API}/key`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey }),
            });
            setKeyDraft(''); // write-only: clear on success AND failure, never echo it back
            if (res.ok) {
                await loadStatus();
            } else {
                const body = await res.json().catch(() => ({}));
                setSaveError(body.error || `Could not save the key (${res.status})`);
            }
        } catch (e: any) {
            setKeyDraft('');
            setSaveError(e?.message || 'Network error');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveKey = async () => {
        if (!window.confirm('Remove the saved Inbox Zero API key?')) return;
        try {
            const res = await authFetch(`${API}/key`, { method: 'DELETE' });
            const body = await res.json().catch(() => ({}));
            if (res.ok && body.success !== false) setState({ kind: 'no-key' });
            // A failed remove must be visible — the key is still stored.
            else window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Could not remove the key: ${body.error || res.status}` }));
        } catch {
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Could not remove the key: network error' }));
        }
    };

    if (state.kind === 'loading') {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading upstream stats…</div>;
    }

    if (state.kind === 'not-configured') {
        return (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '1.25rem' }}>
                <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.9rem' }}>
                    Upstream Inbox Zero isn't connected on this server.
                </p>
                <p style={{ margin: '0.4rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
                    An admin sets INBOX_ZERO_API_URL to a self-hosted Inbox Zero with its external API enabled.
                </p>
            </div>
        );
    }

    if (state.kind === 'no-key') {
        return (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '1.25rem' }}>
                <p style={{ margin: '0 0 0.75rem 0', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    Paste an API key from your own Inbox Zero account (Inbox Zero → Settings → API keys). It is stored
                    encrypted on the server and never shown again.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '220px' }}>
                        <label htmlFor="upstream-api-key" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                            Inbox Zero API key
                        </label>
                        <input
                            id="upstream-api-key"
                            type="password"
                            autoComplete="off"
                            value={keyDraft}
                            onChange={e => setKeyDraft(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}
                        />
                    </div>
                    <button className="btn-primary" onClick={handleSaveKey} disabled={saving || keyDraft.length === 0}>
                        {saving ? 'Saving…' : 'Save'}
                    </button>
                </div>
                {saveError && <p style={{ margin: '0.5rem 0 0 0', color: 'var(--text-primary)', fontSize: '0.78rem' }}>{saveError}</p>}
            </div>
        );
    }

    if (state.kind === 'error') {
        return (
            <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '1.25rem' }}>
                <p style={{ margin: 0, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{state.message}</p>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
                    <button className="btn-secondary" onClick={loadStatus}>Retry</button>
                    {state.canReplaceKey && (
                        <button className="btn-primary" onClick={() => setState({ kind: 'no-key' })}>Replace key</button>
                    )}
                </div>
            </div>
        );
    }

    // state.kind === 'stats'
    const { summary, distribution, emailsAnalyzed, maxEmailsCap } = state.responseTime;
    const distTotal = Object.values(distribution).reduce((a, b) => a + b, 0) || 1;
    const rows = state.byPeriod.result.slice(-8);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: 'var(--accent-text)' }}>{formatMinutes(summary.medianResponseTime)}</div>
                    <div className="iz-metric__label">Median response time</div>
                </div>
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: 'var(--accent-text)' }}>{formatMinutes(summary.averageResponseTime)}</div>
                    <div className="iz-metric__label">Average response time</div>
                </div>
                <div className="iz-metric">
                    <div className="iz-metric__value" style={{ color: 'var(--accent-text)' }}>{summary.within1Hour}%</div>
                    <div className="iz-metric__label">Within 1 hour</div>
                </div>
            </div>

            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {emailsAnalyzed} emails analyzed{emailsAnalyzed >= maxEmailsCap ? ` (capped at ${maxEmailsCap})` : ''}
            </p>

            <div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Response time distribution</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {DISTRIBUTION_LABELS.map(([key, label]) => (
                        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem' }}>
                            <span style={{ width: '90px', flexShrink: 0, color: 'var(--text-secondary)' }}>{label}</span>
                            <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-surface-elevated)', overflow: 'hidden' }}>
                                <div style={{ width: `${(distribution[key] / distTotal) * 100}%`, height: '100%', background: 'var(--accent-text)' }} />
                            </div>
                            <span style={{ width: '28px', textAlign: 'right', color: 'var(--text-primary)' }}>{distribution[key]}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div>
                <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>By period (last {rows.length})</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                            <th style={{ textAlign: 'left', padding: '0.35rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Period</th>
                            <th style={{ textAlign: 'right', padding: '0.35rem', color: 'var(--text-secondary)', fontWeight: 600 }}>All</th>
                            <th style={{ textAlign: 'right', padding: '0.35rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Sent</th>
                            <th style={{ textAlign: 'right', padding: '0.35rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Read</th>
                            <th style={{ textAlign: 'right', padding: '0.35rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Archived</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(row => (
                            <tr key={row.startOfPeriod} style={{ borderBottom: '1px solid var(--border-default)' }}>
                                <td style={{ padding: '0.35rem', color: 'var(--text-primary)' }}>{new Date(row.startOfPeriod).toLocaleDateString()}</td>
                                <td style={{ padding: '0.35rem', textAlign: 'right', color: 'var(--text-primary)' }}>{row.All}</td>
                                <td style={{ padding: '0.35rem', textAlign: 'right', color: 'var(--text-primary)' }}>{row.Sent}</td>
                                <td style={{ padding: '0.35rem', textAlign: 'right', color: 'var(--text-primary)' }}>{row.Read}</td>
                                <td style={{ padding: '0.35rem', textAlign: 'right', color: 'var(--text-primary)' }}>{row.Archived}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div>
                <button className="btn-secondary" onClick={handleRemoveKey}>Remove key</button>
            </div>
        </div>
    );
}
