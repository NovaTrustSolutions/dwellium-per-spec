/**
 * PresenterView — wave-2 presenter window for Present mode.
 *
 * `<PresenterHost>` (mounted by InteractiveDocs while presenting) opens a popup
 * (`window.open('', 'idocs-presenter', …)`) and renders `<PresenterPanel>` into
 * it with a second React root; when the popup is blocked it renders the panel
 * inline as a side drawer instead. Main ⇄ presenter sync goes over a
 * `BroadcastChannel('scribe-idocs-presenter')` (fallback: in-memory bus +
 * `storage` event), so the panel is self-contained and could later be served
 * from its own URL:
 *   main      → { type:'state', docId, index }   on every card change
 *   presenter → { type:'nav', delta }            ← / → buttons
 *
 * Panel: current card (title + blocks as plain text), editable presenter notes
 * (live → updateCard), next-card preview, timer, clock, N/N, ← →.
 */
import { useEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { updateCard } from './idocsStore';
import type { Block, Card, IDoc } from './idocTypes';
import './PresenterView.css';

export const PRESENTER_CHANNEL = 'scribe-idocs-presenter';
export type PresenterMsg = { type: 'state'; docId: string; index: number } | { type: 'nav'; delta: number };

// ── transport (BroadcastChannel → in-memory bus + storage event) ──
const localBus = new Set<(m: PresenterMsg) => void>();
export function openPresenterTransport(onMsg: (m: PresenterMsg) => void): { post: (m: PresenterMsg) => void; close: () => void } {
    if (typeof BroadcastChannel !== 'undefined') {
        const ch = new BroadcastChannel(PRESENTER_CHANNEL);
        ch.onmessage = (e: MessageEvent<PresenterMsg>) => { if (e.data && typeof e.data === 'object') onMsg(e.data); };
        return { post: (m) => ch.postMessage(m), close: () => ch.close() };
    }
    // ponytail: fallback for engines without BroadcastChannel — same-context bus + `storage` for other windows.
    localBus.add(onMsg);
    const onStorage = (e: StorageEvent) => { if (e.key === PRESENTER_CHANNEL && e.newValue) { try { onMsg(JSON.parse(e.newValue).m as PresenterMsg); } catch { /* ignore */ } } };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return {
        post: (m) => {
            localBus.forEach((l) => { if (l !== onMsg) l(m); });
            try { localStorage.setItem(PRESENTER_CHANNEL, JSON.stringify({ m, n: Date.now() })); } catch { /* sandboxed */ }
        },
        close: () => { localBus.delete(onMsg); if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage); },
    };
}

// ── helpers ──
export function blockText(b: Block): string {
    switch (b.type) {
        case 'heading': return b.text;
        case 'text': case 'callout': case 'quote': return b.md;
        case 'image': return b.caption || b.alt || '[image]';
        case 'gallery': return `[gallery · ${b.images.length}]`;
        case 'embed': return `[embed] ${b.url}`;
        case 'chart': return `[chart] ${b.title ?? ''}`.trim();
        case 'table': return b.headers.join(' | ');
        case 'accordion': case 'tabs': case 'steps': case 'boxes': return b.items.map((i) => i.title).join(' · ');
        case 'columns': return b.columns.join(' | ');
        case 'button': return `[${b.label}]`;
        case 'code': return b.code;
        case 'timeline': return b.items.map((i) => `${i.date} ${i.title}`).join(' · ');
        case 'quiz': return `Q: ${b.question}`;
        case 'funnel': return b.items.map((i) => i.label).join(' → ');
        case 'math': return b.latex;
        case 'diagram': return '[diagram]';
        case 'qr': return `[qr] ${b.url}`;
        case 'divider': return '―';
        case 'toc': return '[contents]';
    }
}
const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTimer = (s: number) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

// ── panel ──
export interface PresenterPanelProps { doc: IDoc; initialIndex: number; inline?: boolean; onClose?: () => void }

export function PresenterPanel({ doc, initialIndex, inline, onClose }: PresenterPanelProps) {
    const [index, setIndex] = useState(initialIndex);
    const [running, setRunning] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [clock, setClock] = useState(() => new Date());
    const transport = useRef<ReturnType<typeof openPresenterTransport> | null>(null);
    useEffect(() => {
        const t = openPresenterTransport((m) => { if (m.type === 'state' && m.docId === doc.id) setIndex(m.index); });
        transport.current = t;
        return () => { t.close(); transport.current = null; };
    }, [doc.id]);
    useEffect(() => { setIndex(initialIndex); }, [initialIndex]);
    useEffect(() => {
        const id = setInterval(() => { setClock(new Date()); if (running) setElapsed((s) => s + 1); }, 1000);
        return () => clearInterval(id);
    }, [running]);
    const n = doc.cards.length;
    const i = Math.max(0, Math.min(index, n - 1));
    const card: Card | undefined = doc.cards[i];
    const next: Card | undefined = doc.cards[i + 1];
    const nav = (delta: number) => { transport.current?.post({ type: 'nav', delta }); setIndex((x) => Math.max(0, Math.min(x + delta, n - 1))); };
    return (
        <div className={`scribe-idocs-pv${inline ? ' scribe-idocs-pv--inline' : ''}`} data-testid="idoc-presenter" role="region" aria-label="Presenter view">
            <div className="scribe-idocs-pv__bar">
                <strong className="scribe-idocs-pv__title">{doc.title}</strong>
                <span className="scribe-idocs-pv__count" data-testid="idoc-presenter-count">{n ? i + 1 : 0} / {n}</span>
                <span className="scribe-idocs-pv__spacer" />
                <span className="scribe-idocs-pv__timer" data-testid="idoc-presenter-timer">{fmtTimer(elapsed)}</span>
                <button type="button" onClick={() => setRunning((r) => !r)} aria-pressed={running}>{running ? 'Pause' : 'Start'}</button>
                <button type="button" onClick={() => { setRunning(false); setElapsed(0); }}>Reset</button>
                <span className="scribe-idocs-pv__clock" aria-label="Clock">{clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                {onClose && <button type="button" onClick={onClose} aria-label="Close presenter view">✕</button>}
            </div>
            <div className="scribe-idocs-pv__grid">
                <section className="scribe-idocs-pv__current" aria-label="Current card">
                    <h2>{card?.title || `Card ${i + 1}`}</h2>
                    <ul>{(card?.blocks ?? []).map((b) => <li key={b.id}><small>{b.type}</small> {blockText(b)}</li>)}</ul>
                </section>
                <section className="scribe-idocs-pv__notes" aria-label="Presenter notes">
                    <h3>Notes</h3>
                    <textarea value={card?.notes ?? ''} onChange={(e) => { if (card) updateCard(doc.id, card.id, { notes: e.target.value || undefined }); }} placeholder="Presenter notes for this card…" aria-label="Presenter notes (live)" disabled={!card} />
                </section>
                <section className="scribe-idocs-pv__next" aria-label="Next card">
                    <h3>Next</h3>
                    {next ? <><strong>{next.title || `Card ${i + 2}`}</strong><ul>{next.blocks.slice(0, 4).map((b) => <li key={b.id}>{blockText(b).slice(0, 80)}</li>)}</ul></> : <small>End of deck</small>}
                </section>
            </div>
            <div className="scribe-idocs-pv__nav">
                <button type="button" onClick={() => nav(-1)} disabled={i <= 0} aria-label="Previous card">←</button>
                <button type="button" onClick={() => nav(1)} disabled={i >= n - 1} aria-label="Next card">→</button>
            </div>
        </div>
    );
}

// ── host (main window side) ──
export interface PresenterHostProps { doc: IDoc; index: number; onIndex: (i: number) => void; onClose: () => void }

/** Copy the app's stylesheets + theme classes into a popup document so tokens resolve there. */
function primePopup(popup: Window, title: string): HTMLElement {
    const d = popup.document;
    d.title = `Presenter — ${title}`;
    d.documentElement.className = document.documentElement.className;
    d.body.className = document.body.className;
    document.querySelectorAll('link[rel="stylesheet"], style').forEach((el) => {
        const clone = d.importNode(el, true) as HTMLLinkElement | HTMLStyleElement;
        if (clone.tagName === 'LINK') (clone as HTMLLinkElement).href = (el as HTMLLinkElement).href; // absolute — the popup is about:blank
        d.head.appendChild(clone);
    });
    const mount = d.createElement('div');
    d.body.appendChild(mount);
    return mount;
}

export default function PresenterHost({ doc, index, onIndex, onClose }: PresenterHostProps) {
    const [inline, setInline] = useState(false);
    const popupRef = useRef<{ win: Window; root: Root } | null>(null);
    const latest = useRef({ index, onIndex, onClose });
    latest.current = { index, onIndex, onClose };

    // main-side transport: broadcast state; apply nav
    const transport = useRef<ReturnType<typeof openPresenterTransport> | null>(null);
    useEffect(() => {
        const t = openPresenterTransport((m) => {
            if (m.type === 'nav') { const { index: cur, onIndex: set } = latest.current; set(Math.max(0, Math.min(cur + m.delta, doc.cards.length - 1))); }
        });
        transport.current = t;
        return () => { t.close(); transport.current = null; };
    }, [doc.cards.length]);
    useEffect(() => { transport.current?.post({ type: 'state', docId: doc.id, index }); }, [doc.id, index]);

    // open popup once (SSR-guarded); blocked → inline drawer
    useEffect(() => {
        if (typeof window === 'undefined') return;
        let win: Window | null = null;
        try { win = window.open('', 'idocs-presenter', 'popup,width=900,height=600'); } catch { win = null; }
        if (!win) { setInline(true); return; }
        const root = createRoot(primePopup(win, doc.title));
        popupRef.current = { win, root };
        const onGone = () => { popupRef.current = null; latest.current.onClose(); };
        win.addEventListener('pagehide', onGone);
        return () => {
            win.removeEventListener('pagehide', onGone);
            popupRef.current = null;
            try { root.unmount(); } catch { /* popup already gone */ }
            try { win.close(); } catch { /* ignore */ }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    // re-render the popup root whenever doc/index change (same JS context; state still flows over the channel)
    useEffect(() => {
        popupRef.current?.root.render(<PresenterPanel doc={doc} initialIndex={index} />);
    }, [doc, index]);

    if (!inline) return null;
    return <PresenterPanel doc={doc} initialIndex={index} inline onClose={onClose} />;
}
