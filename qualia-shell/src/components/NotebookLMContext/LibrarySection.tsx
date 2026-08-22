/**
 * LibrarySection — the "Library (ARA reads this)" block of the NotebookLM widget
 * (plan 052). Shows what tools/notebooklm/sync.sh has mirrored into the backend
 * vector store: collections (one per notebook) with counts + last sync, a state
 * pill (never / stale > 8 days / fresh), the embeddings-not-configured warning,
 * the three sync commands, and per-source Remove (UI-initiated DELETE only).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Library, TriangleAlert, X } from 'lucide-react';
import { API_BASE } from '../../config';
import { getAuthToken } from '../../context/UserContext';
import { relativeTime } from '../Scribe/idocs/idocsHistory';

export interface LibraryCollection { name: string; sources: number; lastSyncedAt: string | null }
export interface LibraryStatus {
    embeddingsConfigured: boolean;
    sources: number;
    collections: LibraryCollection[];
    lastSyncedAt: string | null;
}
export interface LibrarySource {
    id: string;
    collection: string;
    sourceId: string;
    notebookId?: string | null;
    notebookTitle?: string | null;
    title: string;
    url?: string | null;
    chars: number;
    chunks: number;
    contentHash?: string | null;
    updatedAt: string;
}

export type SyncState = 'never' | 'stale' | 'fresh';
export const STALE_AFTER_MS = 8 * 24 * 60 * 60 * 1000;

export function syncState(lastSyncedAt: string | null | undefined, now = Date.now()): SyncState {
    if (!lastSyncedAt) return 'never';
    const t = Date.parse(lastSyncedAt);
    if (Number.isNaN(t)) return 'never';
    return now - t > STALE_AFTER_MS ? 'stale' : 'fresh';
}

const STATE_LABEL: Record<SyncState, string> = {
    never: 'Never synced',
    stale: 'Stale — last sync > 8 days',
    fresh: 'Fresh',
};

function authHeaders(): Record<string, string> {
    const token = getAuthToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    const ct = res.headers?.get?.('content-type') || '';
    if (!ct.includes('application/json')) throw new Error(`${path} → HTTP ${res.status} (backend missing the Library routes?)`);
    const json = await res.json();
    if (!res.ok || !json?.success) throw new Error(json?.error || `${path} → HTTP ${res.status}`);
    return json as T;
}

export const SYNC_COMMANDS = ['nlm login -p andy', 'nlm login -p ilya', 'tools/notebooklm/sync.sh'];

export default function LibrarySection() {
    const [status, setStatus] = useState<LibraryStatus | null>(null);
    const [sources, setSources] = useState<LibrarySource[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [open, setOpen] = useState<Record<string, boolean>>({});
    const [removing, setRemoving] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [s, l] = await Promise.all([
                getJson<LibraryStatus>('/api/library/status'),
                getJson<{ sources: LibrarySource[] }>('/api/library/sources'),
            ]);
            setStatus(s);
            setSources(Array.isArray(l.sources) ? l.sources : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Library unavailable');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function remove(src: LibrarySource) {
        if (!window.confirm(`Remove "${src.title}" from the Library? ARA will stop citing it until the next sync re-adds it.`)) return;
        setRemoving(src.id);
        try {
            const res = await fetch(`${API_BASE}/api/library/sources/${encodeURIComponent(src.id)}`, { method: 'DELETE', headers: authHeaders() });
            const json = await res.json().catch(() => ({}));
            if (!res.ok || !json?.success) throw new Error(json?.error || `Remove failed (HTTP ${res.status})`);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Remove failed');
        } finally {
            setRemoving(null);
        }
    }

    const state = syncState(status?.lastSyncedAt);
    // Collections: backend list first (has counts + lastSyncedAt), plus any collection
    // that only appears in the sources list (defensive — the two calls are not atomic).
    const byCollection = new Map<string, LibrarySource[]>();
    for (const s of sources) byCollection.set(s.collection, [...(byCollection.get(s.collection) || []), s]);
    const collections: LibraryCollection[] = [...(status?.collections || [])];
    for (const name of byCollection.keys()) {
        if (!collections.some(c => c.name === name)) {
            const list = byCollection.get(name) || [];
            collections.push({ name, sources: list.length, lastSyncedAt: list.map(s => s.updatedAt).sort().pop() || null });
        }
    }

    return (
        <section className="nlm-library" aria-label="Library">
            <div className="nlm-library-head">
                <Library size={14} aria-hidden />
                <h4 className="nlm-how-title" style={{ margin: 0 }}>Library (ARA reads this)</h4>
                {!loading && !error && (
                    <span className={`nlm-badge nlm-library-pill nlm-library-pill--${state}`}>{STATE_LABEL[state]}</span>
                )}
            </div>
            <p className="nlm-library-sub">
                A mirror of your NotebookLM sources (contracts, housing law, requirements) in Dwellium&rsquo;s vector store. ARA searches it on every question and cites sources by title.
            </p>

            {loading ? (
                <div className="nlm-loading"><span className="nlm-spinner" /> Loading library…</div>
            ) : error ? (
                <div className="nlm-toast nlm-toast--error" role="alert">
                    <span><TriangleAlert size={14} aria-hidden /> Library unavailable: {error}</span>
                    <button className="nlm-toast-close" onClick={() => void load()}>Retry</button>
                </div>
            ) : (
                <>
                    {status && !status.embeddingsConfigured && (
                        <div className="nlm-toast nlm-toast--error" role="alert">
                            <span><TriangleAlert size={14} aria-hidden /> Embeddings not configured on the backend (no OPENAI_API_KEY) — syncs are rejected and ARA cannot search the Library.</span>
                        </div>
                    )}
                    <div className="nlm-library-summary">
                        <strong>{status?.sources ?? sources.length}</strong> source{(status?.sources ?? sources.length) === 1 ? '' : 's'} in{' '}
                        <strong>{collections.length}</strong> collection{collections.length === 1 ? '' : 's'}
                        {status?.lastSyncedAt && <> · last sync {relativeTime(Date.parse(status.lastSyncedAt))}</>}
                    </div>

                    {collections.length === 0 ? (
                        <div className="nlm-library-empty">
                            Nothing synced yet — log in to NotebookLM with <code>nlm</code> and run <code>tools/notebooklm/sync.sh</code> (see &ldquo;How to sync&rdquo; below).
                        </div>
                    ) : (
                        <ul className="nlm-library-collections">
                            {collections.map(c => {
                                const list = byCollection.get(c.name) || [];
                                const isOpen = !!open[c.name];
                                return (
                                    <li key={c.name} className="nlm-library-collection">
                                        <button
                                            type="button"
                                            className="nlm-library-collection-toggle"
                                            aria-expanded={isOpen}
                                            onClick={() => setOpen(prev => ({ ...prev, [c.name]: !isOpen }))}
                                        >
                                            {isOpen ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
                                            <span className="nlm-library-collection-name">{c.name}</span>
                                            <span className="nlm-library-collection-meta">
                                                {c.sources} source{c.sources === 1 ? '' : 's'}
                                                {c.lastSyncedAt ? ` · synced ${relativeTime(Date.parse(c.lastSyncedAt))}` : ''}
                                            </span>
                                        </button>
                                        {isOpen && (
                                            <ul className="nlm-library-sources">
                                                {list.length === 0 && <li className="nlm-library-source nlm-library-source--empty">No sources listed for this collection.</li>}
                                                {list.map(s => (
                                                    <li key={s.id} className="nlm-library-source">
                                                        <span className="nlm-library-source-title" title={s.url || s.title}>{s.title}</span>
                                                        <span className="nlm-library-source-meta">{s.chars.toLocaleString()} chars · {s.chunks} chunk{s.chunks === 1 ? '' : 's'}</span>
                                                        <button
                                                            type="button"
                                                            className="nlm-remove"
                                                            onClick={() => void remove(s)}
                                                            disabled={removing === s.id}
                                                            aria-label={`Remove ${s.title} from the Library`}
                                                            title="Remove from the Library"
                                                        >
                                                            {removing === s.id ? '…' : <X size={14} aria-hidden />}
                                                        </button>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </>
            )}

            <details className="nlm-library-howto">
                <summary>How to sync</summary>
                <p>On a Mac with your Google session (once per account, then whenever auth expires):</p>
                <pre>{SYNC_COMMANDS.join('\n')}</pre>
                <p>Full setup, weekly schedule and troubleshooting: <code>tools/notebooklm/README.md</code>.</p>
            </details>
        </section>
    );
}
