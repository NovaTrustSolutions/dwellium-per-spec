/**
 * /capture — Phase 2 (plan 067): phone-friendly ThoughtWeaver capture.
 *
 * Sign in to Dwellium once on this phone — no Supabase, no per-device
 * config. A thought typed here posts to the signed-in user's own inbox
 * (`POST /api/thought-weaver/inbox`); desktop ThoughtWeaver imports each
 * item once by id on its next load. Failures keep the text in the box.
 */
import { useEffect, useState } from 'react';
import { API_BASE } from '../../src/config';
import { getAuthToken } from '../../src/context/UserContext';

// Legacy per-device config (held a Supabase anon key) — removed on load, never stored again.
const LEGACY_CFG_KEY = 'tw-capture-config';

export default function CaptureRoute() {
    // null until mounted: the token lives in localStorage, and this route is
    // server-rendered locally (react-router.config ssr) — reading it during
    // render would mismatch hydration.
    const [signedIn, setSignedIn] = useState<boolean | null>(null);
    const [sessionLost, setSessionLost] = useState(false);
    const [text, setText] = useState('');
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
    const [filedTo, setFiledTo] = useState<string | null>(null);

    useEffect(() => {
        setSignedIn(!!getAuthToken());
        try {
            const qs = new URLSearchParams(window.location.search);
            if (qs.has('url') || qs.has('key') || qs.has('user')) {
                window.history.replaceState(null, '', window.location.pathname);
            }
            localStorage.removeItem(LEGACY_CFG_KEY);
        } catch { /* private mode */ }
    }, []);

    const capture = async () => {
        if (!text.trim() || status === 'saving') return;
        setStatus('saving');
        try {
            const res = await fetch(`${API_BASE}/api/thought-weaver/inbox`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text.trim() }),
            });
            if (res.status === 401 || res.status === 403) {
                setSessionLost(true); // keep the form and the text on screen
                setStatus('idle');
                return;
            }
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setSessionLost(false);
            setFiledTo(json?.data?.filed_to ?? null);
            setText('');
            setStatus('saved');
            setTimeout(() => setStatus('idle'), 1800);
        } catch {
            setStatus('error'); // text stays in the box — nothing lost
        }
    };

    const s: Record<string, React.CSSProperties> = {
        page: { minHeight: '100dvh', background: '#0c0c0c', color: '#e8e8e8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'system-ui, sans-serif', gap: 14 },
        ta: { width: '100%', maxWidth: 480, minHeight: 160, fontSize: 16, padding: 14, borderRadius: 12, border: '1px solid #333', background: '#161616', color: 'inherit', resize: 'vertical' },
        btn: { width: '100%', maxWidth: 480, padding: '14px 0', fontSize: 16, fontWeight: 600, borderRadius: 12, border: 'none', background: '#D6FE51', color: '#0c0c0c', cursor: 'pointer' },
    };

    if (signedIn === null) return <div style={s.page} />;

    if (!signedIn) {
        return (
            <div style={s.page}>
                <h1 style={{ fontSize: 20 }}>ThoughtWeaver Capture</h1>
                <p style={{ maxWidth: 480, color: '#999', fontSize: 14, lineHeight: 1.5 }}>
                    Sign in to Dwellium on this phone first.
                </p>
                <a href="/" style={{ color: '#D6FE51' }}>Go to sign in</a>
            </div>
        );
    }

    return (
        <div style={s.page}>
            <h1 style={{ fontSize: 20 }}>💭 Capture a thought</h1>
            <textarea
                style={s.ta}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="What's on your mind? It'll appear in ThoughtWeaver on your desktop."
                aria-label="Thought text"
                autoFocus
            />
            <button style={s.btn} onClick={capture} disabled={!text.trim() || status === 'saving'}>
                {status === 'saving' ? 'Saving…' : 'Capture'}
            </button>
            <div aria-live="polite">
                {status === 'saved' && <span style={{ color: '#D6FE51' }}>Filed to {filedTo ?? 'your inbox'}.</span>}
                {status === 'error' && <span style={{ color: '#ef4444' }}>Couldn't save — your text is still here, try again.</span>}
                {sessionLost && (
                    <span style={{ color: '#ef4444' }}>
                        Your session ended — <a href="/" target="_blank" rel="noopener" style={{ color: '#D6FE51' }}>sign in again</a>, then tap Capture. Your text is still here.
                    </span>
                )}
            </div>
        </div>
    );
}
