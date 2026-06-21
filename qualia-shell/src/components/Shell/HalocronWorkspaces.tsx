/**
 * HalocronWorkspaces — user-created, persistent workspaces inside Holocron OS.
 *
 * Opening a workspace fills the whole app window (portal above the OS shell) with
 * a Zen-style vertical tab rail. Tabs hold Dwellium apps OR web pages. The stage
 * is a NESTABLE 2D tiling tree: any pane can split into columns (↔) or rows (↕),
 * arbitrarily nested, every divider draggable. Drag a tab from the rail onto a
 * pane to fill it, or drag it out (or hit "pop out") to detach — apps into a
 * Dwellium window, websites into a browser tab. Layout + sizes persist per-user.
 */
import {
    Fragment, Suspense, lazy, createElement, useEffect, useMemo, useRef, useState,
    type PointerEvent as ReactPointerEvent, type DragEvent as ReactDragEvent, type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Plus, X, Globe, AppWindow, Columns2, Rows2, ExternalLink, StickyNote } from 'lucide-react';
import { WIDGET_REGISTRY, WINDOW_COMPONENTS } from '../../registry/widgetRegistry';
import { getIcon } from '../Sidebar/iconMap';
import WidgetErrorBoundary from '../Window/WidgetErrorBoundary';
// CloudBrowser is lazy so it splits into its own chunk (plan 008) — a static
// import here would re-pull it into whatever chunk hosts this module, undoing
// the KG/Workspaces lazy split. Only loads when a web pane is actually shown.
const CloudBrowser = lazy(() => import('../CloudBrowser/CloudBrowser'));
import {
    useWorkspaces, saveWorkspaces, workspacesStore, newWorkspaceId, newTabKey, wsTabs,
    type Workspace, type WsTab, type WsTabKind, type WsNode,
} from '../../lib/workspacesStore';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const MIN_WEIGHT = 12;          // smallest a pane can be dragged to (flex weight ≈ %)
const MAX_PANES = 6;            // cap on children at a single split level
const COLUMN_PRESETS = [1, 2, 3, 4] as const;  // quick layouts: 2 = split, 3 = three columns

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

/** Empty pane slot — a `slot:`-prefixed leaf key with no content yet. */
const isSlot = (k: string) => k.startsWith('slot:');
const newSlotKey = () => `slot:${newTabKey()}`;

// ── pure split-tree helpers ───────────────────────────────────────────────
const mkLeaf = (key: string): WsNode => ({ t: 'leaf', key });

function deriveTree(keys: string[], sizes: number[]): WsNode {
    if (keys.length <= 1) return mkLeaf(keys[0] ?? newSlotKey());
    const s = sizes.length === keys.length ? sizes : keys.map(() => 100 / keys.length);
    return { t: 'split', dir: 'row', sizes: s, children: keys.map(mkLeaf) };
}
function nodeAt(root: WsNode, path: number[]): WsNode | null {
    let n: WsNode = root;
    for (const i of path) {
        if (n.t !== 'split' || !n.children[i]) return null;
        n = n.children[i];
    }
    return n;
}
function updateAt(root: WsNode, path: number[], fn: (n: WsNode) => WsNode): WsNode {
    if (path.length === 0) return fn(root);
    if (root.t !== 'split') return root;
    const [i, ...rest] = path;
    return { ...root, children: root.children.map((c, idx) => (idx === i ? updateAt(c, rest, fn) : c)) };
}
function mapLeafKeys(n: WsNode, fn: (k: string) => string): WsNode {
    return n.t === 'leaf' ? { t: 'leaf', key: fn(n.key) } : { ...n, children: n.children.map((c) => mapLeafKeys(c, fn)) };
}
function collectLeafKeys(n: WsNode): string[] {
    return n.t === 'leaf' ? [n.key] : n.children.flatMap(collectLeafKeys);
}
function findLeafPath(n: WsNode, key: string, prefix: number[] = []): number[] | null {
    if (n.t === 'leaf') return n.key === key ? prefix : null;
    for (let i = 0; i < n.children.length; i++) {
        const r = findLeafPath(n.children[i], key, [...prefix, i]);
        if (r) return r;
    }
    return null;
}
/** remove the child at `path`, collapsing a split that's left with one child. */
function removeAt(root: WsNode, path: number[]): WsNode {
    if (path.length === 0) return mkLeaf(newSlotKey());
    const parentPath = path.slice(0, -1);
    const idx = path[path.length - 1];
    return updateAt(root, parentPath, (p) => {
        if (p.t !== 'split') return p;
        const children = p.children.filter((_, i) => i !== idx);
        if (children.length === 1) return children[0];
        return { ...p, children, sizes: children.map(() => 100 / children.length) };
    });
}

/** Back-compat: old workspaces store splitKeys/splitSizes (flat row). */
function splitState(ws: Workspace, tabs: WsTab[]): { keys: string[]; sizes: number[] } {
    const valid = new Set(tabs.map((t) => t.key));
    let keys = (ws.splitKeys ?? []).filter((k) => valid.has(k) || isSlot(k));
    if (keys.length === 0 && tabs.length) {
        keys = [ws.activeAppId && valid.has(ws.activeAppId) ? ws.activeAppId : tabs[0].key];
    }
    const sizes = ws.splitSizes && ws.splitSizes.length === keys.length
        ? ws.splitSizes.slice()
        : keys.map(() => 100 / Math.max(1, keys.length));
    return { keys, sizes };
}
/** Effective layout tree for a workspace (derives one from legacy splitKeys). */
function effectiveTree(ws: Workspace): WsNode {
    if (ws.splitTree) return ws.splitTree;
    const st = splitState(ws, wsTabs(ws));
    return st.keys.length ? deriveTree(st.keys, st.sizes) : mkLeaf(newSlotKey());
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
    // Electron embeds the real site directly; the web build uses Cloud Browser
    // below because cross-origin iframe embeds are often blocked by providers.
    if (IS_ELECTRON) {
        return createElement('webview', { src: url, class: 'wsx-web', style: 'width:100%;height:100%;border:none;', allowpopups: 'true' });
    }
    // Web build: use the backend Cloud Browser rather than an iframe. Google,
    // YouTube, and other major sites reject iframe embedding; Cloud Browser
    // drives a hosted browser and streams the viewport back into the workspace.
    return (
        <div className="wsx-cloud-browser" aria-label={`${title} cloud browser`}>
            <Suspense fallback={<div className="hos-hosted__loading">Igniting {title}…</div>}>
                <CloudBrowser initialUrl={url} />
            </Suspense>
        </div>
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
    const tree = useMemo<WsNode | null>(() => {
        if (!open) return null;
        if (open.splitTree) return open.splitTree;
        const st = splitState(open, tabs);
        return st.keys.length ? deriveTree(st.keys, st.sizes) : null;
    }, [open, tabs]);
    const tiledKeys = useMemo(() => (tree ? collectLeafKeys(tree) : []), [tree]);
    const leafCount = tiledKeys.length;
    const cols = tree ? (tree.t === 'split' && tree.dir === 'row' ? tree.children.length : 1) : 0;
    const appList = useMemo(
        () => Object.values(WIDGET_REGISTRY).filter((w) => WINDOW_COMPONENTS[w.id]).sort((a, b) => a.label.localeCompare(b.label)),
        [],
    );

    useEffect(() => {
        if (!openId) return;
        setPicking(false); setAddMenu(false);
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenId(null); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [openId]);

    // ── persistence helper (operate on latest snapshot to avoid stale state) ──
    const commit = (id: string, fn: (w: Workspace) => Workspace) => {
        const list = workspacesStore.getSnapshot();
        saveWorkspaces(list.map((w) => (w.id === id ? { ...fn(w), updatedAt: Date.now() } : w)));
    };
    const writeTree = (fn: (t: WsNode) => WsNode, extra?: (w: Workspace) => Partial<Workspace>) => {
        if (!open) return;
        commit(open.id, (w) => ({ ...w, ...(extra ? extra(w) : {}), splitTree: fn(effectiveTree(w)) }));
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

    // ── tab + layout mutations ──
    const addAppTab = (id: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const cur = wsTabs(w);
            const next = cur.some((t) => t.kind === 'app' && t.ref === id) ? cur : [...cur, { key: id, kind: 'app' as const, ref: id }];
            return { ...w, tabs: next, appIds: appIdsFrom(next), splitTree: mkLeaf(id), activeAppId: id };
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
            return { ...w, tabs: next, appIds: appIdsFrom(next), splitTree: mkLeaf(key) };
        });
        setAddMenu(false);
    };
    const focusSingle = (key: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const t = wsTabs(w).find((x) => x.key === key);
            return { ...w, splitTree: mkLeaf(key), activeAppId: t?.kind === 'app' ? t.ref : w.activeAppId };
        });
    };
    /** Rail "add to split" (⊞): toggle a tab in/out of the root row. */
    const toggleSplit = (key: string) => {
        writeTree((t) => {
            const path = findLeafPath(t, key);
            if (path) return removeAt(t, path);
            if (t.t === 'split' && t.dir === 'row' && t.children.length < MAX_PANES) {
                const children = [...t.children, mkLeaf(key)];
                return { ...t, children, sizes: children.map(() => 100 / children.length) };
            }
            return { t: 'split', dir: 'row', sizes: [50, 50], children: [t, mkLeaf(key)] };
        });
    };
    const closeTab = (key: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const remaining = wsTabs(w).filter((t) => t.key !== key);
            const vacated = mapLeafKeys(effectiveTree(w), (k) => (k === key ? newSlotKey() : k));
            return {
                ...w, tabs: remaining, appIds: appIdsFrom(remaining), splitTree: vacated,
                activeAppId: remaining.find((t) => t.kind === 'app')?.ref,
            };
        });
    };
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

    // ── 2D layout ops (paths address panes; dir 'row' = columns, 'col' = rows) ──
    const setColumns = (n: number) => {
        writeTree((t) => {
            const content = collectLeafKeys(t).filter((k) => !isSlot(k));
            const children = Array.from({ length: n }, (_, i) => mkLeaf(content[i] ?? newSlotKey()));
            return { t: 'split', dir: 'row', sizes: children.map(() => 100 / n), children };
        });
    };
    const addPane = () => {
        writeTree((t) => {
            if (t.t === 'split' && t.dir === 'row') {
                if (t.children.length >= MAX_PANES) return t;
                const children = [...t.children, mkLeaf(newSlotKey())];
                return { ...t, children, sizes: children.map(() => 100 / children.length) };
            }
            return { t: 'split', dir: 'row', sizes: [50, 50], children: [t, mkLeaf(newSlotKey())] };
        });
    };
    const splitLeaf = (path: number[], dir: 'row' | 'col') => {
        writeTree((t) => {
            if (path.length === 0) return { t: 'split', dir, sizes: [50, 50], children: [t, mkLeaf(newSlotKey())] };
            const parentPath = path.slice(0, -1);
            const idx = path[path.length - 1];
            const parent = nodeAt(t, parentPath);
            if (parent && parent.t === 'split' && parent.dir === dir && parent.children.length < MAX_PANES) {
                return updateAt(t, parentPath, (p) => {
                    if (p.t !== 'split') return p;
                    const children = [...p.children];
                    children.splice(idx + 1, 0, mkLeaf(newSlotKey()));
                    return { ...p, children, sizes: children.map(() => 100 / children.length) };
                });
            }
            return updateAt(t, path, (leaf) => ({ t: 'split', dir, sizes: [50, 50], children: [leaf, mkLeaf(newSlotKey())] }));
        });
    };
    const removeLeaf = (path: number[]) => writeTree((t) => removeAt(t, path));
    /** Put `key` at `path`, vacating any other pane that showed it (no duplicates). */
    const fillLeaf = (path: number[], key: string) => {
        writeTree((t) => updateAt(mapLeafKeys(t, (k) => (k === key ? newSlotKey() : k)), path, () => mkLeaf(key)));
    };
    const fillWidget = (path: number[], appId: string) => {
        if (!open) return;
        commit(open.id, (w) => {
            const cur = wsTabs(w);
            const existing = cur.find((t) => t.kind === 'app' && t.ref === appId);
            const key = existing ? existing.key : appId;
            const nextTabs = existing ? cur : [...cur, { key: appId, kind: 'app' as const, ref: appId }];
            const cleared = mapLeafKeys(effectiveTree(w), (k) => (k === key ? newSlotKey() : k));
            return { ...w, tabs: nextTabs, appIds: appIdsFrom(nextTabs), splitTree: updateAt(cleared, path, () => mkLeaf(key)) };
        });
    };
    const fillWebsite = (path: number[]) => {
        if (!open) return;
        const url = window.prompt('Add a website — paste a URL (https://…):');
        if (!url) return;
        const norm = normalizeUrl(url);
        const key = newTabKey();
        commit(open.id, (w) => {
            const nextTabs = [...wsTabs(w), { key, kind: 'web' as const, ref: norm, title: hostOf(norm) }];
            return { ...w, tabs: nextTabs, appIds: appIdsFrom(nextTabs), splitTree: updateAt(effectiveTree(w), path, () => mkLeaf(key)) };
        });
    };
    /** Detach a tab OUT of the workspace: app → Dwellium window, website → browser tab. */
    const detach = (key: string) => {
        if (!open) return;
        const t = tabs.find((x) => x.key === key);
        if (!t) return;
        if (t.kind === 'app') {
            const meta = WIDGET_REGISTRY[t.ref];
            try {
                window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
                    detail: { widgetId: t.ref, label: meta?.label ?? t.ref, icon: meta?.icon ?? '' },
                }));
            } catch { /* no-op */ }
        } else {
            try { window.open(t.ref, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ }
        }
        commit(open.id, (w) => {
            const remaining = wsTabs(w).filter((x) => x.key !== key);
            const vacated = mapLeafKeys(effectiveTree(w), (k) => (k === key ? newSlotKey() : k));
            return { ...w, tabs: remaining, appIds: appIdsFrom(remaining), splitTree: vacated, activeAppId: remaining.find((x) => x.kind === 'app')?.ref };
        });
    };

    // ── rail drag state (drag tab → fill a pane, or drop outside → detach) ──
    const dragKeyRef = useRef<string | null>(null);
    const droppedRef = useRef(false);
    const onTabDragStart = (e: ReactDragEvent<HTMLDivElement>, key: string) => {
        dragKeyRef.current = key;
        droppedRef.current = false;
        try { e.dataTransfer.setData('text/plain', key); e.dataTransfer.effectAllowed = 'move'; } catch { /* jsdom */ }
    };
    const onTabDragEnd = () => {
        const dk = dragKeyRef.current;
        const dropped = droppedRef.current;
        dragKeyRef.current = null;
        droppedRef.current = false;
        if (dk && !dropped) detach(dk);   // dropped outside any pane/rail → pop out
    };

    // ── draggable split dividers (resize at any nesting level / axis) ──
    const divRef = useRef<{ id: string; parentPath: number[]; idx: number; dir: 'row' | 'col'; start: number; length: number; sizes: number[] } | null>(null);
    const onDivMove = (e: PointerEvent) => {
        const d = divRef.current; if (!d) return;
        const coord = d.dir === 'row' ? e.clientX : e.clientY;
        const total = d.sizes.reduce((a, b) => a + b, 0) || 1;
        const deltaWeight = ((coord - d.start) / d.length) * total;
        const sizes = d.sizes.slice();
        const pair = sizes[d.idx - 1] + sizes[d.idx];
        const left = clamp(sizes[d.idx - 1] + deltaWeight, MIN_WEIGHT, pair - MIN_WEIGHT);
        sizes[d.idx - 1] = left;
        sizes[d.idx] = pair - left;
        commit(d.id, (w) => ({ ...w, splitTree: updateAt(effectiveTree(w), d.parentPath, (p) => (p.t === 'split' ? { ...p, sizes } : p)) }));
    };
    const onDivUp = () => {
        divRef.current = null;
        window.removeEventListener('pointermove', onDivMove);
        window.removeEventListener('pointerup', onDivUp);
    };
    const startDivider = (e: ReactPointerEvent, parentPath: number[], idx: number, dir: 'row' | 'col') => {
        if (!open || !tree) return;
        e.preventDefault();
        const container = (e.currentTarget as HTMLElement).parentElement;
        const rect = container?.getBoundingClientRect();
        const node = nodeAt(tree, parentPath);
        divRef.current = {
            id: open.id, parentPath, idx, dir,
            start: dir === 'row' ? e.clientX : e.clientY,
            length: (dir === 'row' ? rect?.width : rect?.height) || 1,
            sizes: node && node.t === 'split' ? node.sizes.slice() : [],
        };
        window.addEventListener('pointermove', onDivMove);
        window.addEventListener('pointerup', onDivUp);
    };

    // ── recursive layout renderer ──
    const renderNode = (node: WsNode, path: number[], grow: number): ReactElement => {
        const common = { flexGrow: grow, flexBasis: 0, minWidth: 0, minHeight: 0 } as const;
        if (node.t === 'split') {
            return (
                <div
                    key={path.join('.') || 'root'}
                    className={`wsx-split wsx-split--${node.dir}`}
                    style={{ ...common, display: 'flex', flexDirection: node.dir === 'row' ? 'row' : 'column' }}
                >
                    {node.children.map((child, i) => (
                        <Fragment key={i}>
                            {i > 0 && (
                                <div
                                    className={`wsx-divider wsx-divider--${node.dir}`}
                                    role="separator"
                                    aria-label="Drag to resize panes"
                                    data-testid={`workspace-divider-${[...path, i].join('-')}`}
                                    onPointerDown={(e) => startDivider(e, path, i, node.dir)}
                                />
                            )}
                            {renderNode(child, [...path, i], node.sizes[i] ?? 1)}
                        </Fragment>
                    ))}
                </div>
            );
        }
        const key = node.key;
        const t = tabs.find((x) => x.key === key);
        const title = t ? tabTitle(t) : 'Empty pane';
        return (
            <section
                key={path.join('.') || 'leaf'}
                className="wsx-pane"
                style={common}
                data-testid={`workspace-pane-${key}`}
                onDragOver={(e) => { if (dragKeyRef.current) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); droppedRef.current = true; const dk = dragKeyRef.current; if (dk) fillLeaf(path, dk); }}
            >
                <header className="wsx-pane__hdr">
                    <span className="wsx-pane__title">{title}</span>
                    <span className="wsx-pane__tools">
                        {t && (
                            <button type="button" title="Split into columns" aria-label={`Split ${title} into columns`} onClick={() => splitLeaf(path, 'row')}>
                                <Columns2 size={13} />
                            </button>
                        )}
                        {t && (
                            <button type="button" title="Split into rows" aria-label={`Split ${title} into rows`} onClick={() => splitLeaf(path, 'col')}>
                                <Rows2 size={13} />
                            </button>
                        )}
                        {t && (
                            <button type="button" title="Pop out to a window" aria-label={`Pop ${title} out to a window`} onClick={() => detach(key)}>
                                <ExternalLink size={13} />
                            </button>
                        )}
                        {leafCount > 1 && (
                            <button type="button" title="Remove pane" aria-label={t ? `Remove ${title} from layout` : 'Remove empty pane'} onClick={() => removeLeaf(path)}>
                                <X size={14} />
                            </button>
                        )}
                    </span>
                </header>
                <div className="wsx-pane__body window__content" data-widget-id={t?.kind === 'app' ? t.ref : undefined}>
                    {t ? (
                        t.kind === 'app' ? <AppPane id={t.ref} /> : <WebPane url={t.ref} title={title} />
                    ) : (
                        <div className="wsx-slot" data-testid="workspace-empty-pane">
                            <div className="wsx-slot__hint">Empty pane — drag a tab here, or pick:</div>
                            <select
                                className="wsx-slot__select"
                                defaultValue=""
                                aria-label="Choose a widget for this pane"
                                onChange={(e) => { if (e.target.value) fillWidget(path, e.target.value); }}
                            >
                                <option value="" disabled>Choose a widget…</option>
                                {appList.map((wd) => <option key={wd.id} value={wd.id}>{wd.label}</option>)}
                            </select>
                            <div className="wsx-slot__or">or</div>
                            <button type="button" className="wsx-slot__web" onClick={() => fillWebsite(path)}>
                                <Globe size={14} /> Add a website
                            </button>
                        </div>
                    )}
                </div>
            </section>
        );
    };

    // ── workspace list (not yet opened) ──
    if (!open) {
        return (
            <>
                <h1 className="hos-h">Workspaces</h1>
                <p className="hos-sub">Build your own — apps or websites as tabs, split into 2D tiles, drag tabs between panes or out into windows. Everything persists; open one and it fills the screen, Zen-style.</p>
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
                        const inSplit = tiledKeys.includes(t.key);
                        return (
                            <div
                                key={t.key}
                                role="tab"
                                aria-selected={inSplit}
                                aria-label={`${title} tab`}
                                className={`wsx-tab ${inSplit ? 'on' : ''}`}
                                draggable
                                onDragStart={(e) => onTabDragStart(e, t.key)}
                                onDragEnd={onTabDragEnd}
                                onDragOver={(e) => { if (dragKeyRef.current) e.preventDefault(); }}
                                onDrop={() => { droppedRef.current = true; if (dragKeyRef.current) reorderTabs(dragKeyRef.current, t.key); }}
                                onClick={() => focusSingle(t.key)}
                            >
                                <span className="wsx-tab__icon">{Icon ? <Icon size={15} /> : <AppWindow size={15} />}</span>
                                <span className="wsx-tab__label">{title}</span>
                                <button
                                    type="button"
                                    className="wsx-tab__act"
                                    title={inSplit ? 'Remove from layout' : 'Add to layout'}
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
                    <div className="wsx-layout" role="group" aria-label="Column layout">
                        <span className="wsx-layout__lbl">Layout</span>
                        {COLUMN_PRESETS.map((n) => (
                            <button
                                key={n}
                                type="button"
                                className={`wsx-layout__btn ${cols === n ? 'on' : ''}`}
                                onClick={() => setColumns(n)}
                                aria-label={`${n} column${n > 1 ? 's' : ''}`}
                                title={n === 1 ? 'Single pane' : n === 2 ? 'Split — 2 columns' : n === 3 ? 'Three columns' : `${n} columns`}
                            >{n}</button>
                        ))}
                        <button type="button" className="wsx-layout__btn wsx-layout__add" onClick={addPane} aria-label="Add a column" title="Add a column">+</button>
                    </div>
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

            <main className="wsx-stage">
                {tree ? renderNode(tree, [], 1) : (
                    <div className="ws-empty">No panes yet. Use <b>Layout</b> (2/3 columns) or <b>New tab</b> to add an app or a website.</div>
                )}
            </main>
        </div>
    );

    return typeof document !== 'undefined' ? createPortal(runner, document.body) : runner;
}
