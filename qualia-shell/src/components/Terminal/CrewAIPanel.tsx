/**
 * CrewAIPanel — CrewAI (crewAIInc/crewAI) as a tab inside the Terminal widget.
 *
 * CrewAI is a standalone Python framework + CLI for multi-agent automation
 * (Crews & Flows). It has NO local web UI in the OSS repo — you run it from a
 * shell, which the adjacent Terminal tab provides. So this panel leads with a
 * runnable quickstart (install / scaffold / run), and ALSO offers an optional
 * embed of a CrewAI web UI — the cloud Control Plane (app.crewai.com) by default,
 * or a self-hosted UI if you point the URL at one. URL is persisted per browser.
 */
import { useState, useEffect, useCallback } from 'react';
import './CrewAIPanel.css';

const LS_URL = 'dwellium-crewai-url';
const DEFAULT_URL = 'https://app.crewai.com';

type Reach = 'checking' | 'up' | 'down';

const STEPS: { label: string; cmd: string; tag: string }[] = [
    { label: '1 · Install (uv)', cmd: "uv pip install 'crewai[tools]'", tag: 'i' },
    { label: '2 · Scaffold a crew', cmd: 'crewai create crew my_crew', tag: 's' },
    { label: '3 · Add API keys', cmd: '# edit my_crew/.env → OPENAI_API_KEY=sk-...  (+ SERPER_API_KEY for web tools)', tag: 'e' },
    { label: '4 · Run it', cmd: 'cd my_crew && crewai run', tag: 'r' },
];

export default function CrewAIPanel() {
    const [url, setUrl] = useState(DEFAULT_URL);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(DEFAULT_URL);
    const [reach, setReach] = useState<Reach>('checking');
    const [iframeKey, setIframeKey] = useState(0);
    const [showEmbed, setShowEmbed] = useState(false);
    const [copied, setCopied] = useState('');

    useEffect(() => {
        try {
            const saved = localStorage.getItem(LS_URL);
            if (saved) { setUrl(saved); setDraft(saved); }
        } catch { /* ignore */ }
    }, []);

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

    useEffect(() => { if (showEmbed) checkReach(url); }, [url, iframeKey, showEmbed, checkReach]);

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

    const runInTerminal = (cmd: string) => {
        // Hand the command to the Terminal tab (best-effort; also copies to clipboard).
        try { window.dispatchEvent(new CustomEvent('qualia-terminal-insert', { detail: cmd })); } catch { /* ignore */ }
        copy(cmd, 'run');
    };

    const dotColor = reach === 'up' ? '#34D399' : reach === 'down' ? '#ff6b6b' : '#888';

    return (
        <div className="cr-panel">
            <div className="cr-quickstart">
                <p className="cr-lead">
                    <strong>CrewAI</strong> is a standalone Python framework for multi-agent automation (Crews &amp; Flows).
                    It runs from a shell — use the <strong>Terminal</strong> tab. Requires Python 3.10–3.13.
                </p>
                {STEPS.map(s => (
                    <div key={s.tag} className="cr-step">
                        <div className="cr-step-head">
                            <span>{s.label}</span>
                            <button className="cr-btn cr-btn--primary" onClick={() => copy(s.cmd, s.tag)}>{copied === s.tag ? 'Copied ✓' : 'Copy'}</button>
                        </div>
                        <pre className="cr-snippet">{s.cmd}</pre>
                    </div>
                ))}
                <p className="cr-note">
                    Docs: <a href="https://docs.crewai.com" target="_blank" rel="noopener noreferrer">docs.crewai.com</a>.
                    CrewAI’s only web UI is the cloud <em>Control Plane</em> (observability/monitoring). Embed it below, or
                    point the URL at a self-hosted CrewAI UI.
                </p>
                <button className="cr-btn" onClick={() => setShowEmbed(v => !v)}>{showEmbed ? 'Hide control plane' : 'Show control plane ▾'}</button>
            </div>

            {showEmbed && (
                <>
                    <div className="cr-toolbar">
                        <span className="cr-dot" style={{ background: dotColor }} />
                        {editing ? (
                            <>
                                <input
                                    className="cr-url-input"
                                    value={draft}
                                    onChange={e => setDraft(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveUrl(); else if (e.key === 'Escape') { setDraft(url); setEditing(false); } }}
                                    placeholder="https://app.crewai.com"
                                    autoFocus
                                />
                                <button className="cr-btn cr-btn--primary" onClick={saveUrl}>Save</button>
                            </>
                        ) : (
                            <>
                                <span className="cr-url" title={url}>{url}</span>
                                <button className="cr-btn" onClick={() => { setDraft(url); setEditing(true); }}>Change</button>
                                <button className="cr-btn" onClick={() => setIframeKey(k => k + 1)}>Reload</button>
                                <button className="cr-btn" onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                            </>
                        )}
                    </div>
                    <div className="cr-frame-wrap">
                        <iframe
                            key={iframeKey}
                            className="cr-frame"
                            src={url}
                            title="CrewAI Control Plane"
                            allow="clipboard-read; clipboard-write"
                        />
                    </div>
                    <p className="cr-embed-note">
                        The cloud control plane requires sign-in and may block embedding — if it stays blank, use <strong>Open ↗</strong>.
                    </p>
                </>
            )}
        </div>
    );
}
