/**
 * LangFlowPanel — embeds LangFlow (langflow-ai/langflow), the visual builder for
 * LangChain-powered agents/workflows, as a tab inside the Terminal widget.
 *
 * LangFlow is a self-hosted Python app that runs its visual builder at
 * http://localhost:7860. This panel embeds the running UI in an iframe so it's
 * fully operational in-app. LangChain itself is a Python *library* (no UI to
 * embed) — it's operational under LangFlow once installed in LangFlow's env, and
 * usable directly from the Terminal tab. The setup guide covers both, including
 * installing the NovaTrustSolutions/langchain fork.
 *
 * If LangFlow isn't running (or the instance blocks embedding), the panel shows a
 * launch/setup guide + an "open in a new window" fallback. URL is configurable +
 * persisted per browser.
 */
import { useState, useEffect, useCallback } from 'react';
import './LangFlowPanel.css';

const LS_URL = 'dwellium-langflow-url';
const DEFAULT_URL = 'http://localhost:7860';

const FORK_INSTALL = 'pip install "git+https://github.com/NovaTrustSolutions/langchain.git#subdirectory=libs/langchain"';

type Reach = 'checking' | 'up' | 'down';

export default function LangFlowPanel() {
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
    // rejects on a connection error.
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

    const dotColor = reach === 'up' ? '#34D399' : reach === 'down' ? '#ff6b6b' : '#888';
    const dotLabel = reach === 'up' ? 'Reachable' : reach === 'down' ? 'Not reachable' : 'Checking…';

    return (
        <div className="lf-panel">
            <div className="lf-toolbar">
                <span className="lf-dot" style={{ background: dotColor }} title={dotLabel} />
                {editing ? (
                    <>
                        <input
                            className="lf-url-input"
                            value={draft}
                            onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveUrl(); else if (e.key === 'Escape') { setDraft(url); setEditing(false); } }}
                            placeholder="http://localhost:7860"
                            autoFocus
                        />
                        <button className="lf-btn lf-btn--primary" onClick={saveUrl}>Save</button>
                    </>
                ) : (
                    <>
                        <span className="lf-url" title={url}>{url}</span>
                        <button className="lf-btn" onClick={() => { setDraft(url); setEditing(true); }}>Change</button>
                        <button className="lf-btn" onClick={() => setIframeKey(k => k + 1)} title="Reload the embedded app">Reload</button>
                        <button className="lf-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')} title="Open in a new window">Open ↗</button>
                        <button className={`lf-btn ${showSetup ? 'lf-btn--primary' : ''}`} onClick={() => setShowSetup(s => !s)}>Setup</button>
                    </>
                )}
            </div>

            {showSetup && (
                <div className="lf-setup">
                    <p className="lf-setup-lead">
                        LangFlow is a self-hosted Python app (visual builder for LangChain flows). Run it, then it
                        appears below. <strong>LangChain</strong> is a Python library — no UI to embed; it’s operational
                        <em> under</em> LangFlow (and from the Terminal tab). Requires Python 3.10–3.13.
                    </p>

                    <div className="lf-snippet-head"><span>1 · Run LangFlow (uv, recommended)</span>
                        <button className="lf-btn lf-btn--primary" onClick={() => copy('uv pip install langflow -U\nuv run langflow run', 'uv')}>{copied === 'uv' ? 'Copied ✓' : 'Copy'}</button>
                    </div>
                    <pre className="lf-snippet">{`uv pip install langflow -U
uv run langflow run     # serves at http://localhost:7860`}</pre>

                    <div className="lf-snippet-head"><span>or · Docker</span>
                        <button className="lf-btn lf-btn--primary" onClick={() => copy('docker run -p 7860:7860 langflowai/langflow:latest', 'd')}>{copied === 'd' ? 'Copied ✓' : 'Copy'}</button>
                    </div>
                    <pre className="lf-snippet">docker run -p 7860:7860 langflowai/langflow:latest</pre>

                    <div className="lf-snippet-head"><span>2 · Use your LangChain fork (into LangFlow’s env)</span>
                        <button className="lf-btn lf-btn--primary" onClick={() => copy(FORK_INSTALL, 'lc')}>{copied === 'lc' ? 'Copied ✓' : 'Copy'}</button>
                    </div>
                    <pre className="lf-snippet">{FORK_INSTALL}</pre>

                    <p className="lf-setup-note">
                        Install the fork into the <em>same</em> environment LangFlow runs in so its flows run on your
                        LangChain. Then hit <strong>Reload</strong>. If the frame stays blank even when reachable, the
                        instance blocks embedding — use <strong>Open ↗</strong> for the full app (same data).
                    </p>
                </div>
            )}

            <div className="lf-frame-wrap">
                {reach === 'down' ? (
                    <div className="lf-empty">
                        <div className="lf-empty-icon">🔗</div>
                        <p className="lf-empty-title">LangFlow isn’t reachable at {url}</p>
                        <p className="lf-empty-sub">Start it, then Reload. Click <strong>Setup</strong> above for the exact commands (LangFlow + your LangChain fork).</p>
                        <div className="lf-empty-actions">
                            <button className="lf-btn lf-btn--primary" onClick={() => setShowSetup(true)}>Show setup</button>
                            <button className="lf-btn" onClick={() => checkReach(url)}>Re-check</button>
                            <button className="lf-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                        </div>
                    </div>
                ) : (
                    <iframe
                        key={iframeKey}
                        className="lf-frame"
                        src={url}
                        title="LangFlow"
                        allow="clipboard-read; clipboard-write"
                    />
                )}
            </div>
        </div>
    );
}
