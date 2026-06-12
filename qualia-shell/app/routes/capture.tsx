/**
 * /capture — P11-13: phone-friendly ThoughtWeaver capture (BACKLOG sketch).
 *
 * A thought typed here lands in the user's Supabase
 * `thought_weaver_captures` table and appears in desktop ThoughtWeaver on
 * its next load (pullCaptures merge). Instant bucketing reuses the SAME
 * deterministic localCategorize the desktop uses — verbatim text guaranteed.
 *
 * Setup (once per phone): open
 *   /capture?url=<supabase-url>&key=<anon-key>&user=<dwellium-user-id>
 * — the page stores the config in the PHONE's localStorage and works bare
 * from then on. No Dwellium auth shell on purpose: this page must load fast
 * on mobile and work offline-tolerantly (failures keep the text in the box).
 */
import { useEffect, useState } from 'react';
import { localCategorize } from '../../src/components/ThoughtWeaver/localCategorizer';

const CFG_KEY = 'tw-capture-config';

interface PhoneCfg { url: string; key: string; user: string }

function loadCfg(): PhoneCfg | null {
    try {
        const qs = new URLSearchParams(window.location.search);
        const fromQuery = { url: qs.get('url') ?? '', key: qs.get('key') ?? '', user: qs.get('user') ?? '' };
        if (fromQuery.url && fromQuery.key && fromQuery.user) {
            localStorage.setItem(CFG_KEY, JSON.stringify(fromQuery));
            return fromQuery;
        }
        const stored = localStorage.getItem(CFG_KEY);
        if (stored) return JSON.parse(stored);
    } catch { /* private mode */ }
    return null;
}

export default function CaptureRoute() {
    const [cfg, setCfg] = useState<PhoneCfg | null>(null);
    const [text, setText] = useState('');
    const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

    useEffect(() => { setCfg(loadCfg()); }, []);

    const capture = async () => {
        if (!cfg || !text.trim() || status === 'saving') return;
        setStatus('saving');
        const cat = localCategorize(text.trim());
        try {
            const res = await fetch(`${cfg.url.replace(/\/$/, '')}/rest/v1/thought_weaver_captures`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    apikey: cfg.key,
                    Authorization: `Bearer ${cfg.key}`,
                    Prefer: 'resolution=ignore-duplicates',
                },
                body: JSON.stringify({
                    id: `phone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                    user_id: cfg.user,
                    text: text.trim(),
                    filed_to: cat.filed_to,
                    confidence: cat.confidence,
                    destination_name: cat.destination_name,
                    created_at: new Date().toISOString(),
                }),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
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

    if (!cfg) {
        return (
            <div style={s.page}>
                <h1 style={{ fontSize: 20 }}>ThoughtWeaver Capture</h1>
                <p style={{ maxWidth: 480, color: '#999', fontSize: 14, lineHeight: 1.5 }}>
                    Not configured on this device yet. Open this page once with
                    <code> ?url=&lt;supabase-url&gt;&amp;key=&lt;anon-key&gt;&amp;user=&lt;your-user-id&gt;</code> —
                    the settings are then remembered here.
                </p>
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
            {status === 'saved' && <div style={{ color: '#D6FE51' }}>Saved — it's on its way to your desktop.</div>}
            {status === 'error' && <div style={{ color: '#ef4444' }}>Couldn't reach Supabase — your text is still here, try again.</div>}
        </div>
    );
}
