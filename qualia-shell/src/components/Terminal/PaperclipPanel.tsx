/**
 * PaperclipPanel — embeds Paperclip (paperclipai/paperclip), the open-source
 * agent-orchestration control plane, as a tab inside the Terminal widget.
 *
 * Paperclip is a self-hosted Node.js server + React UI (embedded Postgres) that
 * runs on http://localhost:3100. This panel embeds the running UI in an iframe so
 * it's fully operational in-app. If it isn't running (or the instance blocks
 * embedding), the panel shows a launch/setup guide + an "open in a new window"
 * fallback. The instance URL is configurable and persisted per browser.
 */
import { useState, useEffect, useCallback } from 'react';
import './PaperclipPanel.css';

const LS_URL = 'dwellium-paperclip-url';
const DEFAULT_URL = 'http://localhost:3100';

type Reach = 'checking' | 'up' | 'down';

export default function PaperclipPanel() {
    const [url, setUrl] = useState(DEFAULT_URL);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_URL);
    const [reach, setReach] = useState<Reach>('checking');
    const [iframeKey, setIframeKey] = useState(0);
    const [showSetup, setShowSetup] = useState(false);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        try {
            const saved = localStorage.getItem(LS_URL);
            if (saved) { setUrl(saved); setDraft(saved); }
        } catch { /* ignore */ }
    }, []);

    // Best-effort reachability: no-cors fetch resolves if the server answers,
    // rejects on a connection error (opaque response is fine — we only need "up?").
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

    const copy = async (text: string, tag: string) => {
        try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 2500); } catch { /* ignore */ }
    };

    const dotColor = reach === 'up' ? '#22c55e' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <div className="pc-panel">
            <div className="pc-toolbar">
                <span className="pc-dot" style={{ background: dotColor }} title={dotLabel} />
                {editing ? (
                    <>
                        <input
                            className="pc-url-input"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveUrl(); else if (e.key === 'Escape') { setDraft(url); setEditing(false); } }}
                            placeholder="http://localhost:3100"
                            autoFocus
                        />
                        <button className="pc-btn pc-btn--primary" onClick={saveUrl}>Save</button>
                    </>
                ) : (
                    <>
                        <span className="pc-url" title={url}>{url}</span>
                        <button className="pc-btn" onClick={() => { setDraft(url); setEditing(true); }}>Change</button>
                        <button className="pc-btn" onClick={() => setIframeKey(k => k + 1)} title="Reload the embedded app">Reload</button>
                        <button className="pc-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} title="Open in a new window">Open ↗</button>
                        <button className={`pc-btn ${showSetup ? 'pc-btn--primary' : ''}`} onClick={() => setShowSetup(s => !s)}>Setup</button>
                    </>
                )}
            </div>

            {showSetup && (
                <div className="pc-setup">
                    <p className="pc-setup-lead">
                        Paperclip is a self-hosted Node.js app (server + React UI, embedded Postgres). Run it,
                        then it appears below. Requires <strong>Node.js 20+</strong> and <strong>pnpm 9.15+</strong>.
                    </p>
                    <div className="pc-snippet-head"><span>Quickstart (recommended)</span>
                        <button className="pc-btn pc-btn--primary" onClick={() => copy('npx paperclipai onboard --yes', 'q')}>{copied === 'q' ? 'Copied ✓' : 'Copy'}</button>
                    </div>
                    <pre className="pc-snippet">npx paperclipai onboard --yes</pre>
                    <div className="pc-snippet-head"><span>Or from source</span>
                        <button className="pc-btn pc-btn--primary" onClick={() => copy('git clone https://github.com/paperclipai/paperclip.git\ncd paperclip\npnpm install\npnpm dev', 's')}>{copied === 's' ? 'Copied ✓' : 'Copy'}</button>
                    </div>
                    <pre className="pc-snippet">{`git clone https://github.com/paperclipai/paperclip.git
cd paperclip
pnpm install
pnpm dev`}</pre>
                    <p className="pc-setup-note">
                        Starts the API + UI at <code>http://localhost:3100</code> (~embedded Postgres auto-created).
                        Then hit <strong>Reload</strong>. If the frame stays blank even when reachable, the instance
                        blocks embedding — use <strong>Open ↗</strong> for the full app (same data).
                    </p>
                </div>
            )}

            <div className="pc-frame-wrap">
                {reach === 'down' ? (
                    <div className="pc-empty">
                        <div className="pc-empty-icon">📎</div>
                        <p className="pc-empty-title">Paperclip isn’t reachable at {url}</p>
                        <p className="pc-empty-sub">Start it, then Reload. Click <strong>Setup</strong> above for the exact commands.</p>
                        <div className="pc-empty-actions">
                            <button className="pc-btn pc-btn--primary" onClick={() => setShowSetup(true)}>Show setup</button>
                            <button className="pc-btn" onClick={() => checkReach(url)}>Re-check</button>
                            <button className="pc-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                        </div>
                    </div>
                ) : (
                    <iframe
                        key={iframeKey}
                        className="pc-frame"
                        src={url}
                        title="Paperclip"
                        allow="clipboard-read; clipboard-write"
                    />
                )}
            </div>
        </div>
    );
}
