/**
 * GraphifyView — KG arc 2026-06-12 (Ilya): the graphify-backed knowledge
 * graph over the user's One Save knowledge (Honcho memories + dreams,
 * ThoughtWeaver captures, CoPaw, Wiki, Hermes learning, tags, tasks, …).
 *
 * Embeds graphify's OWN self-contained interactive viewer (graph.html —
 * click nodes, filter, search: the full feature set the repo ships) via a
 * sandboxed srcdoc iframe fetched with auth headers. Adds Rebuild
 * (corpus re-export + `graphify update`, status-polled) and the CLI's
 * query surface (query / explain / affected / path) as a query bar.
 *
 * Backend: /api/knowledge-graph/* (knowledgeGraphService; graphify CLI
 * from github.com/safishamsi/graphify, MIT).
 */
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { UserContext, getAuthHeaders } from '../../context/UserContext';
import { API_BASE } from '../../config';
import './GraphifyView.css';

interface KgStatus {
    built: boolean;
    building: boolean;
    nodes: number;
    edges: number;
    corpusFiles: number;
    builtAt: string | null;
    lastError: string | null;
}

type QueryMode = 'query' | 'explain' | 'affected' | 'path';

const MODE_LABELS: Record<QueryMode, string> = {
    query: 'Ask', explain: 'Explain', affected: 'Affected by', path: 'Path A→B',
};

const DAY_MS = 24 * 60 * 60 * 1000;

function ageInDays(builtAt: string): number {
    return Math.floor((Date.now() - new Date(builtAt).getTime()) / DAY_MS);
}

function ageLabel(days: number): string {
    if (days <= 0) return 'today';
    if (days === 1) return '1 day ago';
    return `${days} days ago`;
}

function builtAtLabel(builtAt: string): string {
    const days = ageInDays(builtAt);
    if (Number.isNaN(days)) return '';
    const dateStr = new Date(builtAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return `built ${dateStr} (${ageLabel(days)})`;
}

async function kgFetch(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${API_BASE}/api/knowledge-graph${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers ?? {}) },
    });
}

export default function GraphifyView() {
    // Raw context read (not useUser()) per test-resilience convention.
    useContext(UserContext);
    const [status, setStatus] = useState<KgStatus | null>(null);
    const [viewerHtml, setViewerHtml] = useState<string | null>(null);
    const [building, setBuilding] = useState(false);
    const [query, setQuery] = useState('');
    const [queryB, setQueryB] = useState('');
    const [mode, setMode] = useState<QueryMode>('query');
    const [answer, setAnswer] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [statusError, setStatusError] = useState(false);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const loadStatus = useCallback(async (): Promise<KgStatus | null> => {
        try {
            const res = await kgFetch('/status');
            const json = await res.json();
            if (json?.success) {
                setStatusError(false);
                setStatus(json.data);
                return json.data as KgStatus;
            }
            setStatusError(true);
        } catch {
            // backend down — global banner handles the broader messaging; we
            // still surface a local line so "Not built yet" doesn't mislead.
            setStatusError(true);
        }
        return null;
    }, []);

    const loadViewer = useCallback(async () => {
        try {
            const res = await kgFetch('/view');
            if (res.ok) setViewerHtml(await res.text());
        } catch { /* not built yet */ }
    }, []);

    // Set on every mount (StrictMode re-runs the effect), cleared on unmount.
    const aliveRef = useRef(false);
    useEffect(() => {
        aliveRef.current = true;
        void loadStatus().then(s => { if (s?.built) void loadViewer(); });
        return () => {
            aliveRef.current = false;
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
        };
    }, [loadStatus, loadViewer]);

    const rebuild = useCallback(async () => {
        setError(null);
        setBuilding(true);
        try {
            const res = await kgFetch('/rebuild', { method: 'POST' });
            const json = await res.json();
            if (!json?.success) throw new Error(json?.error ?? 'rebuild failed');
            // Unmounted while the POST was in flight (account switch / closed) — the
            // cleanup already ran, so an interval started now would never be cleared.
            if (!aliveRef.current) return;
            pollRef.current = setInterval(async () => {
                const s = await loadStatus();
                if (s && !s.building) {
                    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
                    setBuilding(false);
                    if (s.lastError) setError(s.lastError);
                    else void loadViewer();
                }
            }, 2000);
        } catch (e) {
            setBuilding(false);
            setError((e as Error).message);
        }
    }, [loadStatus, loadViewer]);

    const runQuery = useCallback(async () => {
        const q = query.trim();
        if (!q || busy) return;
        setBusy(true);
        setAnswer(null);
        setError(null);
        try {
            const res = await kgFetch('/query', {
                method: 'POST',
                body: JSON.stringify({ mode, q, ...(mode === 'path' ? { q2: queryB.trim() } : {}) }),
            });
            const json = await res.json();
            if (!json?.success) throw new Error(json?.error ?? 'query failed');
            setAnswer(String(json.data?.answer ?? '').trim() || '(no matches)');
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [query, queryB, mode, busy]);

    const isBuilding = building || !!status?.building;
    const ageDays = status?.builtAt ? ageInDays(status.builtAt) : null;
    const isStale = !!(status?.built && !isBuilding && ageDays !== null && ageDays > 7);

    return (
        <div className="gfy">
            <div className="gfy__bar">
                <div className="gfy__stats">
                    {status?.built
                        ? <>{status.nodes} nodes · {status.edges} edges · {status.corpusFiles} sources{status.builtAt && builtAtLabel(status.builtAt) ? ` · ${builtAtLabel(status.builtAt)}` : ''}</>
                        : statusError ? "Couldn't reach the knowledge-graph service." : 'Not built yet'}
                </div>
                <button
                    className={`gfy__btn${isStale ? ' gfy__btn--primary' : ''}`}
                    onClick={() => void rebuild()}
                    disabled={isBuilding}
                    title="Re-export your memories, captures, notes and tasks into a private corpus and rebuild the graph (does not change your data)"
                >
                    <RefreshCw size={13} className={isBuilding ? 'gfy__spin' : undefined} aria-hidden />
                    {isBuilding ? 'Building…' : 'Rebuild'}
                </button>
            </div>

            {isStale && ageDays !== null && (
                <div className="gfy__notice" role="status">
                    Your graph is {ageDays} days old — Rebuild to include what you've added since.
                </div>
            )}

            <div className="gfy__queryrow">
                <select className="gfy__mode" value={mode} onChange={e => setMode(e.target.value as QueryMode)} aria-label="Query mode">
                    {(Object.keys(MODE_LABELS) as QueryMode[]).map(m => <option key={m} value={m}>{MODE_LABELS[m]}</option>)}
                </select>
                <input
                    className="gfy__input"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') void runQuery(); }}
                    placeholder={mode === 'path' ? 'From node…' : 'e.g. what connects the roof estimate to the vendor?'}
                    aria-label="Graph question"
                />
                {mode === 'path' && (
                    <input
                        className="gfy__input gfy__input--b"
                        value={queryB}
                        onChange={e => setQueryB(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void runQuery(); }}
                        placeholder="To node…"
                        aria-label="Path target node"
                    />
                )}
                <button className="gfy__btn" onClick={() => void runQuery()} disabled={busy || !query.trim()}>
                    <Search size={13} aria-hidden /> {busy ? '…' : 'Query'}
                </button>
            </div>

            {error && <div className="gfy__error" role="alert">{error}</div>}
            {answer && (
                <div className="gfy__answer-wrap">
                    <pre className="gfy__answer">{answer}</pre>
                    <button className="gfy__answer-close" onClick={() => setAnswer(null)} aria-label="Close answer">×</button>
                </div>
            )}

            <div className="gfy__viewer">
                {viewerHtml ? (
                    <iframe
                        className="gfy__frame"
                        title="Knowledge graph viewer (graphify)"
                        sandbox="allow-scripts"
                        srcDoc={viewerHtml}
                    />
                ) : (
                    <div className="gfy__empty">
                        {isBuilding
                            ? 'Building your graph…'
                            : 'No graph yet. Hit Rebuild to turn your memories, captures, notes, and tasks into an explorable graph.'}
                    </div>
                )}
            </div>
        </div>
    );
}
