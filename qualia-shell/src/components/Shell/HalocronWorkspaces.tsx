/**
 * HalocronWorkspaces — user-created, persistent workspaces inside Holocron OS.
 *
 * Opening a workspace presents it FULL SCREEN (fills the whole app window via a
 * portal above the OS shell) with a Zen-browser-style vertical tab rail on the
 * left. Tabs can be Dwellium apps OR web pages. Multiple tabs can be tiled side
 * by side in a split view whose dividers are draggable — every border is
 * resizable, and the sizes (plus tab list, notes, and active split) persist
 * per-user via workspacesStore, so you return exactly where you left off.
 */
import {
    Fragment, Suspense, createElement, useEffect, useMemo, useRef, useState,
    type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Plus, X, Globe, AppWindow, Columns2, ExternalLink, StickyNote } from 'lucide-react';
import { WIDGET_REGISTRY, WINDOW_COMPONENTS } from '../../registry/widgetRegistry';
import { getIcon } from '../Sidebar/iconMap';
import WidgetErrorBoundary from '../Window/WidgetErrorBoundary';
import {
    useWorkspaces, saveWorkspaces, workspacesStore, newWorkspaceId, newTabKey, wsTabs,
    type Workspace, type WsTab,
} from '../../lib/workspacesStore';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_WEIGHT = 12;          // smallest a split pane can be dragged to (flex weight ≈ %)
const MAX_PANES = 4;            // cap on simultaneously tiled panes

const IS_ELECTRON = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');

const normalizeUrl = (raw: string): string => {
    const s = raw.trim();
    return /^https?:\/\//i.test(s) ? s : `https://${s}`;
};
const hostOf = (url: string): string => { try { return new URL(url).host; } catch { return url; } };

const tabTitle = (t: WsTab): string =>
    t.kind === 'app' ? (WIDGET_REGISTRY[t.ref]?.label ?? t.ref) : (t.title || hostOf(t.ref));
const tabIconOf = (t: WsTab) =>
    t.kind === 'web' ? Globe : (getIcon(WIDGET_REGISTRY[t.ref]?.icon ?? '') ?? AppWindow);

const appIdsFrom = (tabs: WsTab[]): string[] => tabs.filter((t) => t.kind === 'app').map((t) => t.ref);

/** Resolve the live split (which tab keys are tiled, and their flex weights). */
function splitState(ws: Workspace, tabs: WsTab[]): { keys: string[]; sizes: number[] } {
    const valid = new Set(tabs.map((t) => t.key));
    let keys = (ws.splitKeys ?? []).filter((k) => valid.has(k));
    if (keys.length === 0 && tabs.length) {
        keys = [ws.activeAppId && valid.has(ws.activeAppId) ? ws.activeAppId : tabs[0].key];
    }
    const sizes = ws.splitSizes && ws.splitSizes.length === keys.length
        ? ws.splitSizes.slice()
        : keys.map(() => 100 / Math.max(1, keys.length));
    return { keys, sizes };
}

function AppPane({ id }: { id: string }) {
    const meta = WIDGET_REGISTRY[id];
    const C = WINDOW_COMPONENTS[id];
    return (
        <WidgetErrorBoundary widgetLabel={meta?.label ?? id} enabled surfaceErrors>
            <Suspense fallback={<div className="hos-hosted__loading">Igniting {meta?.label ?? id}…</div>}>
                {C ? <C /> : <div className="ws-empty">Unavailable.</div>}
            </Suspense>
        </WidgetErrorBoundary>
    );
}

function WebPane({ url, title }: { url: string; title: string }) {
    // Electron embeds the real site (bypasses X-Frame-Options); on the web build
    // an <iframe> is best-effort — some providers (claude.ai/chatgpt.com/…) refuse
    // embedding, so the pane header carries an "open in new tab" affordance.
    if (IS_ELECTRON) {
        return createElement('webview', { src: url, class: 'wsx-web', style: 'width:100%;height:100%;border:none;', allowpopups: 'true' });
    }
    return (
        <iframe
            className="wsx-web"
            src={url}
            title={title}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
        />
    );
}

export default function HalocronWorkspaces() {
    const workspaces = useWorkspaces();
    const [openId, setOpenId] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const [addMenu, setAddMenu] = useState(false);
    const [showNotes, setShowNotes] = useState(false);

    const open = useMemo(() => workspaces.find((w) => w.id === openId) ?? null, [workspaces, openId]);
    const tabs = useMemo(() => (open ? wsTabs(open) : []), [open]);
    const { keys, sizes } = useMemo(() => (open ? splitState(open, tabs) : { keys: [], sizes: [] }), [open, tabs]);
    const appList = useMemo(
        () => Object.values(WIDGET_REGISTRY).filter((w) => WINDOW_COMPONENTS[w.id]).sort((a, b) => a.label.localeCompare(b.label)),
        [],
    );

    // Esc exits the fullscreen runner; reset transient panels when switching spaces.
    useEffect(() => {
        if (!openId) return;
        setPicking(false); setAddMenu(false);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [openId]);

    // ── persistence helpers (operate on the latest snapshot to avoid stale state) ──
    const commit = (id: string, fn: (w: Workspace) => Workspace) => {
        const list = workspacesStore.getSnapshot();
        saveWorkspaces(list.map((w) => (w.id === id ? { ...fn(w), updatedAt: Date.now() } : w)));
    };

    const createWorkspace = () => {
        const name = window.prompt('Name this workspace:', `Workspace ${workspaces.length + 1}`);
        if (!name) return;
        const ws: Workspace = {
            id: newWorkspaceId(), name, appIds: [], split: 1, layout: 'grid', frames: {},
            notes: '', updatedAt: Date.now(), tabs: [], splitKeys: [], splitSizes: [],
        };
        saveWorkspaces([...workspaces, ws]);
        setOpenId(ws.id);
    };
    const removeWorkspace = (id: string) => {
        if (!window.confirm('Delete this workspace? Its tabs, layout + notes will be lost.')) return;
        saveWorkspaces(workspaces.filter((w) => w.id !== id));
        if (openId === id) setOpenId(null);
    };

    // ── tab mutations ──
    const addAppTab = (id: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const cur = wsTabs(w);
            if (cur.some((t) => t.kind === 'app' && t.ref === id)) {
                return { ...w, splitKeys: [id], splitSizes: [100], activeAppId: id };
            }
            const next = [...cur, { key: id, kind: 'app' as const, ref: id }];
            return { ...w, tabs: next, appIds: appIdsFrom(next), splitKeys: [id], splitSizes: [100], activeAppId: id };
        });
        setPicking(false); setAddMenu(false);
    };
    const addWebPrompt = () => {
        if (!open) return;
        const url = window.prompt('Open a web page — paste a URL (https://…):');
        if (!url) return;
        const norm = normalizeUrl(url);
        const key = newTabKey();
        commit(open.id, (w) => {
            const next = [...wsTabs(w), { key, kind: 'web' as const, ref: norm, title: hostOf(norm) }];
            return { ...w, tabs: next, appIds: appIdsFrom(next), splitKeys: [key], splitSizes: [100] };
        });
        setAddMenu(false);
    };
    const focusSingle = (key: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const t = wsTabs(w).find((x) => x.key === key);
            return { ...w, splitKeys: [key], splitSizes: [100], activeAppId: t?.kind === 'app' ? t.ref : w.activeAppId };
        });
    };
    const toggleSplit = (key: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const cur = wsTabs(w);
            const st = splitState(w, cur);
            if (st.keys.includes(key)) {
                if (st.keys.length === 1) return w;                       // never drop the last pane
                const idx = st.keys.indexOf(key);
                const nk = st.keys.filter((k) => k !== key);
                const ns = st.sizes.filter((_, i) => i !== idx);
                const tot = ns.reduce((a, b) => a + b, 0) || 1;
                return { ...w, splitKeys: nk, splitSizes: ns.map((s) => (s / tot) * 100) };
            }
            if (st.keys.length >= MAX_PANES) return w;                    // cap tiled panes
            const nk = [...st.keys, key];
            return { ...w, splitKeys: nk, splitSizes: nk.map(() => 100 / nk.length) };
        });
    };
    const closeTab = (key: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const remaining = wsTabs(w).filter((t) => t.key !== key);
            const st = splitState(w, wsTabs(w));
            let nk = st.keys.filter((k) => k !== key);
            let ns = st.sizes.filter((_, i) => st.keys[i] !== key);
            if (nk.length === 0 && remaining.length) { nk = [remaining[0].key]; ns = [100]; }
            else if (nk.length) { const tot = ns.reduce((a, b) => a + b, 0) || 1; ns = ns.map((s) => (s / tot) * 100); }
            return {
                ...w, tabs: remaining, appIds: appIdsFrom(remaining), splitKeys: nk, splitSizes: ns,
                activeAppId: remaining.find((t) => t.kind === 'app')?.ref,
            };
        });
    };
    const reorderRef = useRef<string | null>(null);
    const reorderTabs = (fromKey: string, toKey: string) => {
        if (!open || fromKey === toKey) return;
        commit(open.id, (w) => {
            const next = wsTabs(w).slice();
            const fi = next.findIndex((t) => t.key === fromKey);
            const ti = next.findIndex((t) => t.key === toKey);
            if (fi < 0 || ti < 0) return w;
            const [moved] = next.splice(fi, 1);
            next.splice(ti, 0, moved);
            return { ...w, tabs: next, appIds: appIdsFrom(next) };
        });
    };

    // ── draggable split dividers (resize every border) ──
    const stageRef = useRef<HTMLDivElement>(null);
    const divRef = useRef<{ id: string; idx: number; startX: number; width: number; sizes: number[] } | null>(null);
    const onDivMove = (e: PointerEvent) => {
        const d = divRef.current; if (!d) return;
        const deltaPct = ((e.clientX - d.startX) / d.width) * 100;
        const pair = d.sizes[d.idx - 1] + d.sizes[d.idx];
        const left = clamp(d.sizes[d.idx - 1] + deltaPct, MIN_WEIGHT, pair - MIN_WEIGHT);
        const next = d.sizes.slice();
        next[d.idx - 1] = left;
        next[d.idx] = pair - left;
        commit(d.id, (w) => ({ ...w, splitSizes: next }));
    };
    const onDivUp = () => {
        divRef.current = null;
        window.removeEventListener('pointermove', onDivMove);
        window.removeEventListener('pointerup', onDivUp);
    };
    const startDivider = (e: ReactPointerEvent, idx: number) => {
        if (!open || !stageRef.current) return;
        e.preventDefault();
        divRef.current = { id: open.id, idx, startX: e.clientX, width: stageRef.current.getBoundingClientRect().width || 1, sizes: sizes.slice() };
        window.addEventListener('pointermove', onDivMove);
        window.addEventListener('pointerup', onDivUp);
    };

    // ── workspace list (not yet opened) ──
    if (!open) {
        return (
            <>
                <h1 className="hos-h">Workspaces</h1>
                <p className="hos-sub">Build your own — add apps or web pages as tabs, split &amp; resize them, jot notes. Everything persists; open one and it fills the screen, Zen-style.</p>
                <div className="hos-grid hos-grid--wide">
                    {workspaces.map((w) => {
                        const t = wsTabs(w);
                        return (
                            <div key={w.id} className="hos-card hos-space" onClick={() => setOpenId(w.id)} role="button" tabIndex={0}>
                                <div className="hos-space__name">“{w.name}”</div>
                                <div className="hos-space__w">{t.length} tab{t.length === 1 ? '' : 's'}{w.notes.trim() ? ' · notes' : ''}</div>
                                <button className="ws-del" onClick={(e) => { e.stopPropagation(); removeWorkspace(w.id); }} aria-label={`Delete ${w.name}`}><X size={16} /></button>
                            </div>
                        );
                    })}
                    <button type="button" className="hos-card ws-new" onClick={createWorkspace}>
                        <span className="ws-new__plus">+</span><span>New workspace</span>
                    </button>
                </div>
            </>
        );
    }

    // ── fullscreen runner (portaled above the OS shell) ──
    const runner = (
        <div className="wsx" role="dialog" aria-label={`${open.name} workspace`} data-testid="workspace-fullscreen">
            <aside className="wsx-rail">
                <div className="wsx-rail__top">
                    <button className="wsx-exit" onClick={() => setOpenId(null)} aria-label="Exit workspace" title="Exit (Esc)"><ArrowLeft size={16} /></button>
                    <span className="wsx-rail__name" title={open.name}>{open.name}</span>
                </div>

                <div className="wsx-tabs" role="tablist" aria-label={`${open.name} tabs`}>
                    {tabs.map((t) => {
                        const Icon = tabIconOf(t);
                        const title = tabTitle(t);
                        const inSplit = keys.includes(t.key);
                        return (
                            <div
                                key={t.key}
                                role="tab"
                                aria-selected={inSplit}
                                aria-label={`${title} tab`}
                                className={`wsx-tab ${inSplit ? 'on' : ''}`}
                                draggable
                                onDragStart={() => { reorderRef.current = t.key; }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={() => { if (reorderRef.current) reorderTabs(reorderRef.current, t.key); reorderRef.current = null; }}
                                onClick={() => focusSingle(t.key)}
                            >
                                <span className="wsx-tab__icon">{Icon ? <Icon size={15} /> : <AppWindow size={15} />}</span>
                                <span className="wsx-tab__label">{title}</span>
                                <button
                                    type="button"
                                    className="wsx-tab__act"
                                    title={inSplit ? 'Remove from split' : 'Add to split'}
                                    aria-label={inSplit ? `Remove ${title} from split` : `Add ${title} to split`}
                                    onClick={(e) => { e.stopPropagation(); toggleSplit(t.key); }}
                                ><Columns2 size={13} /></button>
                                <button
                                    type="button"
                                    className="wsx-tab__x"
                                    title="Close tab"
                                    aria-label={`Close ${title}`}
                                    onClick={(e) => { e.stopPropagation(); closeTab(t.key); }}
                                ><X size={14} /></button>
                            </div>
                        );
                    })}
                    {tabs.length === 0 && <div className="wsx-tabs__empty">No tabs yet.</div>}
                </div>

                <div className="wsx-rail__bottom">
                    {addMenu ? (
                        <div className="wsx-addmenu">
                            <button type="button" onClick={() => { setAddMenu(false); setPicking(true); }}><AppWindow size={14} /> App</button>
                            <button type="button" onClick={addWebPrompt}><Globe size={14} /> Web page</button>
                        </div>
                    ) : (
                        <button type="button" className="wsx-add" onClick={() => setAddMenu(true)}><Plus size={15} /> New tab</button>
                    )}
                    <button type="button" className="wsx-note-toggle" onClick={() => setShowNotes((s) => !s)}>
                        <StickyNote size={14} /> {showNotes ? 'Hide notes' : 'Notes'}
                    </button>
                    {showNotes && (
                        <textarea
                            className="wsx-notes"
                            value={open.notes}
                            placeholder="Scratch notes — persists across switches…"
                            onChange={(e) => commit(open.id, (w) => ({ ...w, notes: e.target.value }))}
                        />
                    )}
                </div>
            </aside>

            {picking && (
                <div className="wsx-picker" role="dialog" aria-label="Add an app">
                    <div className="wsx-picker__hd">
                        <span>Add an app</span>
                        <button type="button" onClick={() => setPicking(false)} aria-label="Close app picker"><X size={16} /></button>
                    </div>
                    <div className="wsx-picker__grid">
                        {appList.map((w) => {
                            const Icon = getIcon(w.icon);
                            return (
                                <button key={w.id} type="button" className="wsx-pick" onClick={() => addAppTab(w.id)}>
                                    <span className="wsx-pick__icon">{Icon ? <Icon size={16} /> : <AppWindow size={16} />}</span>{w.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <main className="wsx-stage" ref={stageRef}>
                {keys.length === 0 ? (
                    <div className="ws-empty">No tabs yet. Click <b>New tab</b> to add an app or a web page.</div>
                ) : keys.map((key, i) => {
                    const t = tabs.find((x) => x.key === key);
                    if (!t) return null;
                    const title = tabTitle(t);
                    return (
                        <Fragment key={key}>
                            {i > 0 && (
                                <div
                                    className="wsx-divider"
                                    role="separator"
                                    aria-label="Drag to resize panes"
                                    data-testid={`workspace-divider-${i}`}
                                    onPointerDown={(e) => startDivider(e, i)}
                                />
                            )}
                            <section
                                className="wsx-pane"
                                style={{ flexGrow: sizes[i], flexBasis: 0, minWidth: 0 }}
                                data-testid={`workspace-pane-${key}`}
                            >
                                <header className="wsx-pane__hdr">
                                    <span className="wsx-pane__title">{title}</span>
                                    <span className="wsx-pane__tools">
                                        {t.kind === 'web' && (
                                            <button
                                                type="button"
                                                title="Open in new tab"
                                                aria-label={`Open ${title} in a new browser tab`}
                                                onClick={() => { try { window.open(t.ref, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ } }}
                                            ><ExternalLink size={13} /></button>
                                        )}
                                        {keys.length > 1 && (
                                            <button
                                                type="button"
                                                title="Remove from split"
                                                aria-label={`Remove ${title} from split`}
                                                onClick={() => toggleSplit(key)}
                                            ><X size={14} /></button>
                                        )}
                                    </span>
                                </header>
                                <div className="wsx-pane__body window__content" data-widget-id={t.kind === 'app' ? t.ref : undefined}>
                                    {t.kind === 'app' ? <AppPane id={t.ref} /> : <WebPane url={t.ref} title={title} />}
                                </div>
                            </section>
                        </Fragment>
                    );
                })}
            </main>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(runner, document.body) : runner;
}
