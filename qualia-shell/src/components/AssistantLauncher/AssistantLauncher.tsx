/**
 * AssistantLauncher — the bottom-right AI launcher.
 *
 * Click the bubble → a selector menu pops up to invoke one of four assistants:
 *   • Antigravity (Gemini chat)   • ARA (agent console)
 *   • Inbox Zero (AI email triage) • Stella (voice + tools agent)
 *
 * Each hosts its REAL component, so it's fully functional like its widget
 * counterpart. The panel is draggable + resizable. "Minimize" sends the active
 * assistant to the background (collapses to the bubble) while keeping it mounted
 * and running — click the bubble to bring it back. Opened assistants stay mounted
 * so they keep running and preserve state when you switch between them.
 */
import React, { useState, useEffect, useRef, useCallback, Suspense, lazy } from 'react';
import { Sparkles, Bot, Inbox, Star, Minus, X, LayoutGrid } from 'lucide-react';
import AntigravityChat from './AntigravityChat';
import './AssistantLauncher.css';

const ARAConsole = lazy(() => import('../ARAConsole/ARAConsole'));
const StellaAgent = lazy(() => import('../StellaAgent/StellaAgent'));
const InboxZero = lazy(() => import('../InboxZero/InboxZero'));

type AssistantKey = 'antigravity' | 'ara' | 'inbox-zero' | 'stella';

interface AssistantMeta {
    key: AssistantKey;
    name: string;
    tagline: string;
    accent: string;
    Icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const ASSISTANTS: AssistantMeta[] = [
    { key: 'antigravity', name: 'Antigravity', tagline: 'Gemini · workspace-aware', accent: '#8B5CF6', Icon: Sparkles },
    { key: 'ara', name: 'ARA', tagline: 'Dwellium agent console', accent: '#22D3EE', Icon: Bot },
    { key: 'inbox-zero', name: 'Inbox Zero', tagline: 'AI email triage', accent: '#22c55e', Icon: Inbox },
    { key: 'stella', name: 'Stella', tagline: 'Voice + tools agent', accent: '#F472B6', Icon: Star },
];
const META: Record<AssistantKey, AssistantMeta> = Object.fromEntries(ASSISTANTS.map(a => [a.key, a])) as Record<AssistantKey, AssistantMeta>;

const STATE_KEY = 'dwellium:assistantLauncher';

// ── Error boundary so one assistant crashing never takes down the launcher ──
class AssistantBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null }> {
    state = { error: null as Error | null };
    static getDerivedStateFromError(error: Error) { return { error }; }
    render() {
        if (this.state.error) {
            return (
                <div className="al-error">
                    <p><strong>{this.props.name}</strong> hit an error.</p>
                    <pre>{this.state.error.message}</pre>
                    <button onClick={() => this.setState({ error: null })}>Retry</button>
                </div>
            );
        }
        return this.props.children;
    }
}

function renderAssistant(key: AssistantKey): React.ReactNode {
    switch (key) {
        case 'antigravity': return <AntigravityChat />;
        case 'ara': return <ARAConsole />;
        case 'inbox-zero': return <InboxZero />;
        case 'stella': return <StellaAgent />;
    }
}

export default function AssistantLauncher() {
    const [activeKey, setActiveKey] = useState<AssistantKey | null>(null);
    const [opened, setOpened] = useState<AssistantKey[]>([]);
    const [menuOpen, setMenuOpen] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const [pos, setPos] = useState({ x: 0, y: 0 });
    const [size, setSize] = useState({ w: 460, h: 640 });
    const [ready, setReady] = useState(false);

    const panelRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef({ on: false, sx: 0, sy: 0, ox: 0, oy: 0 });
    const resizeRef = useRef({ on: false, sx: 0, sy: 0, ow: 0, oh: 0 });

    // Hydrate persisted layout/state (effect → SSR-safe)
    useEffect(() => {
        let p = { x: window.innerWidth - size.w - 24, y: 72 };
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (raw) {
                const s = JSON.parse(raw);
                if (s.pos && typeof s.pos.x === 'number') p = s.pos;
                if (s.size && typeof s.size.w === 'number') setSize(s.size);
                if (Array.isArray(s.opened)) setOpened(s.opened.filter((k: string) => k in META));
                if (s.activeKey && s.activeKey in META) setActiveKey(s.activeKey);
                if (typeof s.minimized === 'boolean') setMinimized(s.minimized);
            }
        } catch { /* ignore */ }
        // clamp into viewport
        p = { x: Math.max(0, Math.min(p.x, window.innerWidth - 120)), y: Math.max(0, Math.min(p.y, window.innerHeight - 120)) };
        setPos(p);
        setReady(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist
    useEffect(() => {
        if (!ready) return;
        try { localStorage.setItem(STATE_KEY, JSON.stringify({ pos, size, opened, activeKey, minimized })); } catch { /* ignore */ }
    }, [ready, pos, size, opened, activeKey, minimized]);

    const openAssistant = useCallback((key: AssistantKey) => {
        setOpened(prev => (prev.includes(key) ? prev : [...prev, key]));
        setActiveKey(key);
        setMinimized(false);
        setMenuOpen(false);
    }, []);

    const closeActive = useCallback(() => {
        if (!activeKey) return;
        setOpened(prev => {
            const next = prev.filter(k => k !== activeKey);
            setActiveKey(next.length ? next[next.length - 1] : null);
            return next;
        });
    }, [activeKey]);

    // ── Drag ──
    const startDrag = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button')) return; // don't drag from a control
        dragRef.current = { on: true, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
        const onMove = (ev: MouseEvent) => {
            if (!dragRef.current.on) return;
            const nx = dragRef.current.ox + (ev.clientX - dragRef.current.sx);
            const ny = dragRef.current.oy + (ev.clientY - dragRef.current.sy);
            setPos({
                x: Math.max(0, Math.min(nx, window.innerWidth - 120)),
                y: Math.max(0, Math.min(ny, window.innerHeight - 80)),
            });
        };
        const onUp = () => { dragRef.current.on = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [pos]);

    // ── Resize ──
    const startResize = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        resizeRef.current = { on: true, sx: e.clientX, sy: e.clientY, ow: size.w, oh: size.h };
        const onMove = (ev: MouseEvent) => {
            if (!resizeRef.current.on) return;
            setSize({
                w: Math.max(360, Math.min(880, resizeRef.current.ow + (ev.clientX - resizeRef.current.sx))),
                h: Math.max(400, Math.min(window.innerHeight - 40, resizeRef.current.oh + (ev.clientY - resizeRef.current.sy))),
            });
        };
        const onUp = () => { resizeRef.current.on = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [size]);

    if (!ready) return null;

    const active = activeKey ? META[activeKey] : null;
    const panelVisible = !!activeKey && !minimized;

    return (
        <>
            {/* ── Panel — mounted once any assistant is opened; hidden (kept running) when minimized ── */}
            {opened.length > 0 && (
                <div
                    ref={panelRef}
                    className="al-panel"
                    style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, display: panelVisible ? 'flex' : 'none', '--al-accent': active?.accent } as React.CSSProperties}
                >
                    <div className="al-header" onMouseDown={startDrag}>
                        <div className="al-header-id">
                            {active && <active.Icon size={16} strokeWidth={2} />}
                            <div className="al-header-text">
                                <span className="al-header-name">{active?.name}</span>
                                <span className="al-header-tagline">{active?.tagline}</span>
                            </div>
                        </div>
                        {/* quick-switch pills */}
                        <div className="al-switch">
                            {ASSISTANTS.map(a => (
                                <button
                                    key={a.key}
                                    className={`al-switch-pill ${a.key === activeKey ? 'al-switch-pill--active' : ''}`}
                                    style={{ '--al-accent': a.accent } as React.CSSProperties}
                                    onClick={() => openAssistant(a.key)}
                                    title={a.name}
                                    aria-label={a.name}
                                >
                                    <a.Icon size={14} strokeWidth={2} />
                                    {opened.includes(a.key) && a.key !== activeKey && <span className="al-running-dot" />}
                                </button>
                            ))}
                        </div>
                        <div className="al-header-actions">
                            <button className="al-icon-btn" onClick={() => setMinimized(true)} title="Send to background (keeps running)" aria-label="Minimize to background"><Minus size={15} /></button>
                            <button className="al-icon-btn" onClick={closeActive} title="Close this assistant" aria-label="Close assistant"><X size={15} /></button>
                        </div>
                    </div>

                    <div className="al-body">
                        {opened.map(key => (
                            <div key={key} className="al-host" style={{ display: key === activeKey ? 'flex' : 'none' }}>
                                <AssistantBoundary name={META[key].name}>
                                    <Suspense fallback={<div className="al-loading">Loading {META[key].name}…</div>}>
                                        {renderAssistant(key)}
                                    </Suspense>
                                </AssistantBoundary>
                            </div>
                        ))}
                    </div>

                    <div className="al-resize" onMouseDown={startResize} title="Resize" />
                </div>
            )}

            {/* ── FAB + selector menu — shown when nothing is in the foreground ── */}
            {!panelVisible && (
                <div className="al-fab-wrap">
                    {menuOpen && (
                        <div className="al-menu" role="menu" aria-label="Choose an AI assistant">
                            <div className="al-menu-title">AI Assistants</div>
                            {ASSISTANTS.map(a => (
                                <button
                                    key={a.key}
                                    className="al-menu-item"
                                    style={{ '--al-accent': a.accent } as React.CSSProperties}
                                    onClick={() => openAssistant(a.key)}
                                    role="menuitem"
                                >
                                    <span className="al-menu-icon"><a.Icon size={18} strokeWidth={2} /></span>
                                    <span className="al-menu-text">
                                        <span className="al-menu-name">{a.name}</span>
                                        <span className="al-menu-tagline">{a.tagline}</span>
                                    </span>
                                    {opened.includes(a.key) && <span className="al-menu-running" title="Running">●</span>}
                                </button>
                            ))}
                        </div>
                    )}
                    <button
                        className={`al-fab ${menuOpen ? 'al-fab--open' : ''}`}
                        onClick={() => setMenuOpen(v => !v)}
                        title="AI Assistants"
                        aria-label="Open AI assistant menu"
                        aria-expanded={menuOpen}
                        style={active ? ({ '--al-accent': active.accent } as React.CSSProperties) : undefined}
                    >
                        {minimized && active ? <active.Icon size={22} strokeWidth={2} /> : <LayoutGrid size={22} strokeWidth={2} />}
                        {minimized && opened.length > 0 && <span className="al-fab-badge">{opened.length}</span>}
                    </button>
                </div>
            )}
        </>
    );
}
