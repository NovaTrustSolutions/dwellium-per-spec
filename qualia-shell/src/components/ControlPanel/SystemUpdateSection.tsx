/**
 * SystemUpdateSection — git-driven app updates from the Settings widget.
 *
 * Polls /api/system/status for current branch/SHA/ahead/behind. The user can:
 *   - Check for updates  → POSTs /api/system/check (git fetch + show incoming list)
 *   - Update now         → POSTs /api/system/apply (git pull + rebuild + restart)
 * While the update is running, polls /api/system/apply/log every 1.5s for live
 * progress and stops polling when state ∈ { done, error }.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../config';
import { getAuthToken } from '../../context/UserContext';

interface StatusResp {
    success: boolean;
    repoRoot?: string;
    branch?: string;
    sha?: string;
    lastCommit?: { hash: string; subject: string; age: string };
    dirty?: boolean;
    behind?: number;
    ahead?: number;
    progress?: {
        state: 'idle' | 'fetching' | 'pulling' | 'installing' | 'building' | 'restarting' | 'done' | 'error';
        message: string;
        startedAt: string | null;
        finishedAt: string | null;
        exitCode: number | null;
    };
    error?: string;
}

interface CheckResp {
    success: boolean;
    behind?: number;
    ahead?: number;
    incomingCommits?: string[];
    error?: string;
}

const STATE_LABELS: Record<string, string> = {
    idle: 'Idle',
    fetching: 'Fetching…',
    pulling: 'Pulling…',
    installing: 'Installing deps…',
    building: 'Building…',
    restarting: 'Restarting…',
    done: 'Up to date',
    error: 'Failed',
};

export default function SystemUpdateSection() {
    const [status, setStatus] = useState<StatusResp | null>(null);
    const [incoming, setIncoming] = useState<string[]>([]);
    const [log, setLog] = useState<string>('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const authFetch = useCallback(async (url: string, init?: RequestInit) => {
        const token = getAuthToken();
        return fetch(url, {
            ...init,
            headers: {
                ...(init?.headers || {}),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'Content-Type': 'application/json',
            },
        });
    }, []);

    const refreshStatus = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/api/system/status`);
            const json = await res.json();
            if (!json.success) {
                setError(json.error || 'Status fetch failed');
                return;
            }
            setStatus(json);
            setError(null);
        } catch (err: any) {
            setError(err?.message || 'Backend unreachable');
        }
    }, [authFetch]);

    const pollLog = useCallback(async () => {
        try {
            const res = await authFetch(`${API_BASE}/api/system/apply/log`);
            const json = await res.json();
            if (json.success) {
                setLog(json.log || '');
                setStatus(prev => prev ? { ...prev, progress: json.progress } : prev);
                if (json.progress && (json.progress.state === 'done' || json.progress.state === 'error')) {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    setBusy(false);
                    void refreshStatus();
                }
            }
        } catch { /* keep polling */ }
    }, [authFetch, refreshStatus]);

    useEffect(() => {
        void refreshStatus();
    }, [refreshStatus]);

    useEffect(() => () => {
        if (pollRef.current) clearInterval(pollRef.current);
    }, []);

    const handleCheck = useCallback(async () => {
        setBusy(true); setError(null);
        try {
            const res = await authFetch(`${API_BASE}/api/system/check`, { method: 'POST' });
            const json: CheckResp = await res.json();
            if (!json.success) {
                setError(json.error || 'Check failed');
                return;
            }
            setIncoming(json.incomingCommits || []);
            await refreshStatus();
        } catch (err: any) {
            setError(err?.message || 'Check failed');
        } finally {
            setBusy(false);
        }
    }, [authFetch, refreshStatus]);

    const handleApply = useCallback(async () => {
        if (!window.confirm('Pull new commits, install dependencies (if needed), rebuild the frontend, and restart the backend?\n\nThis may take 30-90 seconds.')) return;
        setBusy(true); setError(null); setLog('');
        try {
            const res = await authFetch(`${API_BASE}/api/system/apply`, { method: 'POST' });
            const json = await res.json();
            if (!json.success) {
                setError(json.error || 'Apply failed');
                setBusy(false);
                return;
            }
            // Begin polling
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = setInterval(() => { void pollLog(); }, 1500);
            void pollLog();
        } catch (err: any) {
            setError(err?.message || 'Apply failed');
            setBusy(false);
        }
    }, [authFetch, pollLog]);

    const state = status?.progress?.state || 'idle';
    const upToDate = (status?.behind ?? 0) === 0 && !!status;
    const branch = status?.branch || '—';
    const sha = status?.sha || '—';
    const lastCommit = status?.lastCommit;

    return (
        <section className="cp-section">
            <h3 className="cp-section__title">App Updates</h3>

            <div className="cp-update-card">
                <div className="cp-update-card__row">
                    <span className="cp-update-card__label">Branch</span>
                    <span className="cp-update-card__value">{branch}</span>
                </div>
                <div className="cp-update-card__row">
                    <span className="cp-update-card__label">Commit</span>
                    <span className="cp-update-card__value">
                        {sha}
                        {lastCommit?.subject && <span className="cp-update-card__subject"> — {lastCommit.subject}</span>}
                        {lastCommit?.age && <span className="cp-update-card__age"> ({lastCommit.age})</span>}
                    </span>
                </div>
                <div className="cp-update-card__row">
                    <span className="cp-update-card__label">Status</span>
                    <span className="cp-update-card__value">
                        {status === null && 'Loading…'}
                        {status && upToDate && status.progress?.state !== 'done' && <span className="cp-update-pill cp-update-pill--ok">Up to date</span>}
                        {status && !upToDate && <span className="cp-update-pill cp-update-pill--warn">{status.behind} commit{status.behind === 1 ? '' : 's'} behind main</span>}
                        {status?.ahead && status.ahead > 0 ? <span className="cp-update-pill cp-update-pill--info">{status.ahead} ahead</span> : null}
                        {status?.dirty && <span className="cp-update-pill cp-update-pill--warn">working tree dirty</span>}
                    </span>
                </div>
                {status?.progress && status.progress.state !== 'idle' && (
                    <div className="cp-update-card__row">
                        <span className="cp-update-card__label">Update</span>
                        <span className="cp-update-card__value">
                            {STATE_LABELS[state]} — {status.progress.message}
                        </span>
                    </div>
                )}

                <div className="cp-update-card__actions">
                    <button
                        className="cp-btn"
                        onClick={() => void handleCheck()}
                        disabled={busy}
                    >
                        Check for updates
                    </button>
                    <button
                        className="cp-btn cp-btn--primary"
                        onClick={() => void handleApply()}
                        disabled={busy || upToDate || state === 'fetching' || state === 'pulling' || state === 'installing' || state === 'building' || state === 'restarting'}
                        title={upToDate ? 'Nothing to update' : 'Pull, rebuild, restart'}
                    >
                        {busy && state !== 'idle' && state !== 'done' && state !== 'error' ? 'Updating…' : 'Update now'}
                    </button>
                </div>

                {incoming.length > 0 && (
                    <div className="cp-update-incoming">
                        <strong>Incoming commits</strong>
                        <ul>
                            {incoming.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                    </div>
                )}

                {log && (
                    <details className="cp-update-log" open={state === 'error'}>
                        <summary>Build log {state === 'error' && '(error)'}</summary>
                        <pre>{log.split('\n').slice(-40).join('\n')}</pre>
                    </details>
                )}

                {error && (
                    <div className="cp-update-error">
                        {error}
                    </div>
                )}
            </div>
        </section>
    );
}
