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
import { launchService } from '../../lib/serviceLaunch';
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
                        <button className="onb-btn onb-btn--primary" onClick={() => launchService('open-notebook')} title="Run the Open Notebook Docker command in the Terminal">Launch ▸</button>
                        <button className="onb-btn" onClick={() => { setDraft(url); setEditing(true); }}>Change</button>
                        <button className="onb-btn" onClick={() => setIframeKey(k => k + 1)} title="Reload the embedded app">Reload</button>
                        <button className="onb-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} title="Open in a new window">Open ↗</button>
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
                        <button className="onb-btn onb-btn--primary" onClick={copySnippet}>{copied ? 'Copied' : 'Copy'}</button>
                    </div>
                    <pre className="onb-snippet">{DOCKER_SNIPPET}</pre>
                    <p className="onb-setup-note">
                        Note: if the frame stays blank even when reachable, your instance blocks embedding —
                        use <strong>Open ↗</strong> to launch it in a new window (full app, same data).
                    </p>
                </div>
            )}

            {/* Embedded app OR not-running state */}
            <div className="onb-frame-wrap">
                {reach === 'down' ? (
                    <div className="onb-empty">
                        <div className="onb-empty-icon"></div>
                        <p className="onb-empty-title">Open Notebook isn’t reachable at {url}</p>
                        <p className="onb-empty-sub">Start it with Docker, then Reload. Click <strong>Setup</strong> above for the exact commands.</p>
                        <div className="onb-empty-actions">
                            <button className="onb-btn onb-btn--primary" onClick={() => launchService('open-notebook')} title="Run the Docker command in the Terminal">Launch ▸</button>
                            <button className="onb-btn" onClick={() => setShowSetup(true)}>Show setup</button>
                            <button className="onb-btn" onClick={() => checkReach(url)}>Re-check</button>
                            <button className="onb-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
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
