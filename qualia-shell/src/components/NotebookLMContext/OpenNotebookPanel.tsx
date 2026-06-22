/**
 * OpenNotebookPanel — embeds Open Notebook (lfnovo/open-notebook), the open-source
 * NotebookLM alternative, as a tab inside the NotebookLM widget.
 *
 * Open Notebook is a self-hosted Docker app (Python + FastAPI + Next.js + SurrealDB).
 * It runs its web UI on :8502 and a REST API on :5055. This panel embeds the running
 * web UI in an iframe so it's fully functional in-app. If it isn't running (or the
 * instance blocks embedding), the panel shows a launch/setup guide + an "open in a
 * new window" fallback. The instance URL is configurable and persisted per browser.
 */
import { useState, useEffect, useCallback } from 'react';
import { Book, Check, ExternalLink, Play, RefreshCw } from 'lucide-react';
import { launchService } from '../../lib/serviceLaunch';
import { listNotebooks, listSources, type OpenNotebook } from '../../lib/openNotebookClient';
import './OpenNotebookPanel.css';

const LS_URL = 'dwellium-open-notebook-url';
const DEFAULT_URL = 'http://localhost:8502';

const DOCKER_SNIPPET = `services:
  surrealdb:
    image: surrealdb/surrealdb:v2
    command: start --user root --pass root rocksdb:/mydata/mydatabase.db
    user: root
    ports: ["8000:8000"]
    volumes: ["./surreal_data:/mydata"]
    restart: always
  open_notebook:
    image: lfnovo/open_notebook:v1-latest
    ports: ["8502:8502", "5055:5055"]
    environment:
      - OPEN_NOTEBOOK_ENCRYPTION_KEY=change-me-to-a-secret
      - SURREAL_URL=ws://surrealdb:8000/rpc
      - SURREAL_USER=root
      - SURREAL_PASSWORD=root
      - SURREAL_NAMESPACE=open_notebook
      - SURREAL_DATABASE=open_notebook
    volumes: ["./notebook_data:/app/data"]
    depends_on: [surrealdb]
    restart: always`;

type Reach = 'checking' | 'up' | 'down';

export default function OpenNotebookPanel() {
    const [url, setUrl] = useState(DEFAULT_URL);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_URL);
    const [reach, setReach] = useState<Reach>('checking');
    const [iframeKey, setIframeKey] = useState(0);
    const [showSetup, setShowSetup] = useState(false);
    const [copied, setCopied] = useState(false);

    // Notebooks list (populated from the REST API on :5055 when reachable). This
    // is purely ADDITIVE — the iframe path below is unchanged and still works
    // when the API fetch fails (fail-soft: we just render nothing extra).
    const [notebooks, setNotebooks] = useState<OpenNotebook[]>([]);
    const [nbLoading, setNbLoading] = useState(false);
    const [nbLoaded, setNbLoaded] = useState(false);   // a fetch has completed (drives the empty state)
    const [nbFailed, setNbFailed] = useState(false);   // last fetch failed → hide the section entirely
    const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
    const [listRefresh, setListRefresh] = useState(0);

    // Hydrate persisted URL (effect = SSR-safe)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(LS_URL);
            if (saved) { setUrl(saved); setDraft(saved); }
        } catch { /* ignore */ }
    }, []);

    // Best-effort reachability: a no-cors fetch resolves if the server answers,
    // rejects on a network/connection error. (Opaque response = can't read it,
    // but "did it respond" is all we need for the status dot.)
    const checkReach = useCallback(async (target: string) => {
        setReach('checking');
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 4000);
            await fetch(target, { mode: 'no-cors', signal: ctrl.signal });
            clearTimeout(t);
            setReach('up');
        } catch {
            setReach('down');
        }
    }, []);

    useEffect(() => { checkReach(url); }, [url, iframeKey, checkReach]);

    // Fetch the notebooks list whenever the instance is reachable (and on manual
    // refresh / URL change). Fail-soft: any error hides the section and leaves the
    // iframe as the sole surface. AbortController cancels an in-flight fetch on
    // cleanup (unmount, URL change, or a newer refresh superseding this one).
    useEffect(() => {
        if (reach !== 'up') {
            // Drop any stale list when the instance goes away.
            setNotebooks([]); setNbLoaded(false); setNbFailed(false); setSourceCounts({});
            return;
        }
        const ctrl = new AbortController();
        let cancelled = false;
        setNbLoading(true); setNbFailed(false);
        (async () => {
            const res = await listNotebooks(ctrl.signal);
            if (cancelled) return;
            if (res.ok) {
                setNotebooks(res.notebooks);
                setNbFailed(false);
                // Best-effort source counts — never blocks the list, never throws.
                const counts: Record<string, number> = {};
                await Promise.all(
                    res.notebooks
                        .filter(nb => nb.id)
                        .map(async nb => {
                            const s = await listSources(nb.id, ctrl.signal);
                            if (s.ok) counts[nb.id] = s.sources.length;
                        }),
                );
                if (!cancelled) setSourceCounts(counts);
            } else {
                // Fail-soft: keep the existing iframe, surface nothing extra.
                setNotebooks([]); setNbFailed(true);
            }
            if (!cancelled) { setNbLoaded(true); setNbLoading(false); }
        })();
        return () => { cancelled = true; ctrl.abort(); };
    }, [reach, url, listRefresh]);

    const saveUrl = () => {
        const v = draft.trim().replace(/\/$/, '');
        if (!v) return;
        setUrl(v);
        try { localStorage.setItem(LS_URL, v); } catch { /* ignore */ }
        setEditing(false);
        setIframeKey(k => k + 1);
    };

    const copySnippet = async () => {
        try { await navigator.clipboard.writeText(DOCKER_SNIPPET); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* ignore */ }
    };

    const dotColor = reach === 'up' ? '#22c55e' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <div className="onb-panel">
            {/* Toolbar */}
            <div className="onb-toolbar">
                <span className="onb-dot" style={{ background: dotColor }} title={dotLabel} />
                {editing ? (
                    <>
                        <input
                            className="onb-url-input"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveUrl(); else if (e.key === 'Escape') { setDraft(url); setEditing(false); } }}
                            placeholder="http://localhost:8502"
                            autoFocus
                        />
                        <button className="onb-btn onb-btn--primary" onClick={saveUrl}>Save</button>
                    </>
                ) : (
                    <>
                        <span className="onb-url" title={url}>{url}</span>
                        <button className="onb-btn onb-btn--primary" onClick={() => launchService('open-notebook')} title="Run the Open Notebook Docker command in the Terminal">Launch <Play size={12} aria-hidden style={{ verticalAlign: 'middle' }} /></button>
                        <button className="onb-btn" onClick={() => { setDraft(url); setEditing(true); }}>Change</button>
                        <button className="onb-btn" onClick={() => setIframeKey(k => k + 1)} title="Reload the embedded app">Reload</button>
                        <button className="onb-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} title="Open in a new window">Open <ExternalLink size={12} aria-hidden style={{ verticalAlign: 'middle' }} /></button>
                        <button className={`onb-btn ${showSetup ? 'onb-btn--primary' : ''}`} onClick={() => setShowSetup(s => !s)}>Setup</button>
                    </>
                )}
            </div>

            {/* Setup guide (collapsible) */}
            {showSetup && (
                <div className="onb-setup">
                    <p className="onb-setup-lead">
                        Open Notebook is a self-hosted app. Run it with Docker, then it appears below.
                        Requires <a href="https://www.docker.com/products/docker-desktop/" target="_blank" rel="noopener noreferrer">Docker Desktop</a>.
                    </p>
                    <ol className="onb-steps">
                        <li>Save the compose file below as <code>docker-compose.yml</code> (set a real encryption key).</li>
                        <li>Run <code>docker compose up -d</code> in that folder.</li>
                        <li>Wait ~20s, then hit <strong>Reload</strong>. Add an AI provider key in Open Notebook’s Settings.</li>
                    </ol>
                    <div className="onb-snippet-head">
                        <span>docker-compose.yml</span>
                        <button className="onb-btn onb-btn--primary" onClick={copySnippet}>{copied ? <><Check size={12} aria-hidden style={{ verticalAlign: 'middle' }} /> Copied</> : 'Copy'}</button>
                    </div>
                    <pre className="onb-snippet">{DOCKER_SNIPPET}</pre>
                    <p className="onb-setup-note">
                        Note: if the frame stays blank even when reachable, your instance blocks embedding —
                        use <strong>Open <ExternalLink size={11} aria-hidden style={{ verticalAlign: 'middle' }} /></strong> to launch it in a new window (full app, same data).
                    </p>
                </div>
            )}

            {/* Notebooks list (above the iframe) — only when reachable + the
                last fetch succeeded. Fail-soft: on fetch failure this whole
                block is skipped and the iframe stands alone. */}
            {reach === 'up' && !nbFailed && (
                <div className="onb-notebooks">
                    <div className="onb-nb-head">
                        <span className="onb-nb-title">Notebooks</span>
                        {nbLoading && <span className="onb-nb-count">Loading…</span>}
                        {!nbLoading && nbLoaded && <span className="onb-nb-count">{notebooks.length}</span>}
                        <button
                            className="onb-btn onb-nb-refresh"
                            onClick={() => setListRefresh(n => n + 1)}
                            disabled={nbLoading}
                            title="Refresh notebooks"
                            aria-label="Refresh notebooks"
                        >
                            <RefreshCw size={13} aria-hidden style={{ verticalAlign: 'middle' }} />
                        </button>
                    </div>

                    {!nbLoading && nbLoaded && notebooks.length === 0 && (
                        <p className="onb-nb-empty">No notebooks yet — create one in the app below.</p>
                    )}

                    {notebooks.length > 0 && (
                        <ul className="onb-nb-list">
                            {notebooks.map((nb, i) => {
                                const count = sourceCounts[nb.id];
                                return (
                                    <li className="onb-nb-row" key={nb.id || `nb-${i}`}>
                                        <div className="onb-nb-info">
                                            <span className="onb-nb-name">{nb.name}</span>
                                            {nb.description && <span className="onb-nb-desc">{nb.description}</span>}
                                            {typeof count === 'number' && (
                                                <span className="onb-nb-meta">{count} {count === 1 ? 'source' : 'sources'}</span>
                                            )}
                                        </div>
                                        {/* Opens the instance WEB UI (the :8502 `url`) in a new tab.
                                            ponytail: a per-notebook deep-link (e.g. `${url}/?notebook=${nb.id}`)
                                            could replace this once the Open Notebook UI route is confirmed. */}
                                        <button
                                            className="onb-btn onb-btn--primary onb-nb-open"
                                            onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
                                            aria-label={`Open ${nb.name} in Open Notebook`}
                                        >
                                            Open <ExternalLink size={11} aria-hidden style={{ verticalAlign: 'middle' }} />
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}

            {/* Embedded app OR not-running state */}
            <div className="onb-frame-wrap">
                {reach === 'down' ? (
                    <div className="onb-empty">
                        <div className="onb-empty-icon"><Book size={32} aria-hidden /></div>
                        <p className="onb-empty-title">Open Notebook isn’t reachable at {url}</p>
                        <p className="onb-empty-sub">Start it with Docker, then Reload. Click <strong>Setup</strong> above for the exact commands.</p>
                        <div className="onb-empty-actions">
                            <button className="onb-btn onb-btn--primary" onClick={() => launchService('open-notebook')} title="Run the Docker command in the Terminal">Launch <Play size={12} aria-hidden style={{ verticalAlign: 'middle' }} /></button>
                            <button className="onb-btn" onClick={() => setShowSetup(true)}>Show setup</button>
                            <button className="onb-btn" onClick={() => checkReach(url)}>Re-check</button>
                            <button className="onb-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open <ExternalLink size={12} aria-hidden style={{ verticalAlign: 'middle' }} /></button>
                        </div>
                    </div>
                ) : (
                    <iframe
                        key={iframeKey}
                        className="onb-frame"
                        src={url}
                        title="Open Notebook"
                        allow="clipboard-read; clipboard-write; microphone; camera"
                    />
                )}
            </div>
        </div>
    );
}
