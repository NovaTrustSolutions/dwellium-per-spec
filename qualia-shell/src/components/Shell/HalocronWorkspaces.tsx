/**
 * HalocronWorkspaces — user-created, persistent workspaces inside Holocron OS.
 *
 * Create/name workspaces, add apps, set the split (screen breaks), and a scratch
 * note — all persisted per-user via workspacesStore. Switch away and back and
 * the same apps, layout, and notes restore, so you continue where you left off.
 */
import { Suspense, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { X } from 'lucide-react';
import { WIDGET_REGISTRY, WINDOW_COMPONENTS } from '../../registry/widgetRegistry';
import { getIcon } from '../Sidebar/iconMap';
import WidgetErrorBoundary from '../Window/WidgetErrorBoundary';
import { useWorkspaces, saveWorkspaces, workspacesStore, newWorkspaceId, type Workspace, type Frame } from '../../lib/workspacesStore';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const TAB_DRAG_THRESHOLD = 7;

type CanvasRect = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;
type TabDragState = { wsId: string; appId: string; sx: number; sy: number; rect: CanvasRect; moved: boolean };

export default function HalocronWorkspaces() {
    const workspaces = useWorkspaces();
    const [openId, setOpenId] = useState<string | null>(null);
    const [picking, setPicking] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [expandedAppId, setExpandedAppId] = useState<string | null>(null);

    const open = useMemo(() => workspaces.find((w) => w.id === openId) ?? null, [workspaces, openId]);
    const activeAppId = open?.activeAppId && open.appIds.includes(open.activeAppId) ? open.activeAppId : open?.appIds[0] ?? null;

    useEffect(() => {
        setExpandedAppId(null);
    }, [openId]);

    const persist = (next: Workspace[]) => saveWorkspaces(next);
    const patch = (id: string, p: Partial<Workspace>) =>
        persist(workspaces.map((w) => (w.id === id ? { ...w, ...p, updatedAt: Date.now() } : w)));

    const createWorkspace = () => {
        const name = window.prompt('Name this workspace:', `Workspace ${workspaces.length + 1}`);
        if (!name) return;
        const ws: Workspace = { id: newWorkspaceId(), name, appIds: [], split: 2, layout: 'custom', frames: {}, notes: '', updatedAt: Date.now() };
        persist([...workspaces, ws]);
        setOpenId(ws.id);
    };
    const removeWorkspace = (id: string) => {
        if (!window.confirm('Delete this workspace? Its layout + notes will be lost.')) return;
        persist(workspaces.filter((w) => w.id !== id));
        if (openId === id) setOpenId(null);
    };
    const addApp = (id: string) => { if (open && !open.appIds.includes(id)) patch(open.id, { appIds: [...open.appIds, id] }); setPicking(false); };
    const removeApp = (id: string) => {
        if (open) {
            const appIds = open.appIds.filter((a) => a !== id);
            patch(open.id, { appIds, activeAppId: open.activeAppId === id ? appIds[0] : open.activeAppId });
        }
        if (expandedAppId === id) setExpandedAppId(null);
    };
    const selectApp = (id: string) => { if (open) patch(open.id, { activeAppId: id }); };
    const toggleExpanded = (id: string) => setExpandedAppId((cur) => (cur === id ? null : id));

    // ── Custom layout: drag (header) + resize (corner), positions in % so they
    // stay correct at any size. Persisted live so it survives switches/reloads.
    const canvasRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ wsId: string; appId: string; mode: 'move' | 'resize'; sx: number; sy: number; frame: Frame; rect: DOMRect } | null>(null);
    const tabDragRef = useRef<TabDragState | null>(null);
    const defaultFrame = (i: number): Frame => ({ x: 3 + (i % 3) * 31, y: 3 + Math.floor(i / 3) * 31, w: 44, h: 46 });
    const frameOf = (wsv: Workspace, id: string, i: number): Frame => wsv.frames[id] ?? defaultFrame(i);

    const onPointerMove = (e: PointerEvent) => {
        const d = dragRef.current; if (!d) return;
        const dxp = ((e.clientX - d.sx) / d.rect.width) * 100;
        const dyp = ((e.clientY - d.sy) / d.rect.height) * 100;
        const f: Frame = { ...d.frame };
        if (d.mode === 'move') { f.x = clamp(d.frame.x + dxp, 0, 100 - f.w); f.y = clamp(d.frame.y + dyp, 0, 100 - f.h); }
        else { f.w = clamp(d.frame.w + dxp, 16, 100 - d.frame.x); f.h = clamp(d.frame.h + dyp, 16, 100 - d.frame.y); }
        const list = workspacesStore.getSnapshot();
        saveWorkspaces(list.map((w) => (w.id === d.wsId ? { ...w, frames: { ...w.frames, [d.appId]: f }, updatedAt: Date.now() } : w)));
    };
    const onPointerUp = () => { dragRef.current = null; window.removeEventListener('pointermove', onPointerMove); window.removeEventListener('pointerup', onPointerUp); };
    const startDrag = (e: ReactPointerEvent, id: string, i: number, mode: 'move' | 'resize') => {
        if (!open || !canvasRef.current) return;
        e.preventDefault();
        dragRef.current = { wsId: open.id, appId: id, mode, sx: e.clientX, sy: e.clientY, frame: frameOf(open, id, i), rect: canvasRef.current.getBoundingClientRect() };
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
    };

    const getCanvasRect = (): CanvasRect => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (rect && rect.width > 0 && rect.height > 0) return rect;
        const width = typeof window !== 'undefined' ? window.innerWidth || 1024 : 1024;
        const height = typeof window !== 'undefined' ? window.innerHeight || 768 : 768;
        return { left: 0, top: 0, right: width, bottom: height, width, height };
    };

    const dropAction = (rect: CanvasRect, x: number, y: number): 'window' | 'split' | 'none' => {
        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return 'window';
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const inCenter = Math.abs(x - cx) <= rect.width * 0.24 && Math.abs(y - cy) <= rect.height * 0.24;
        return inCenter ? 'split' : 'none';
    };

    const stopTabDrag = () => {
        window.removeEventListener('pointermove', onTabPointerMove);
        window.removeEventListener('pointerup', onTabPointerUp);
        tabDragRef.current = null;
    };

    const onTabPointerMove = (e: PointerEvent) => {
        const d = tabDragRef.current;
        if (!d) return;
        if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) >= TAB_DRAG_THRESHOLD) d.moved = true;
    };

    const onTabPointerUp = (e: PointerEvent) => {
        const d = tabDragRef.current;
        if (!d) return;
        const action = d.moved ? dropAction(d.rect, e.clientX, e.clientY) : 'none';
        const list = workspacesStore.getSnapshot();
        const ws = list.find((w) => w.id === d.wsId);
        if (!ws) {
            stopTabDrag();
            return;
        }

        if (action === 'window') {
            const meta = WIDGET_REGISTRY[d.appId];
            window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
                detail: { widgetId: d.appId, label: meta?.label ?? d.appId, icon: meta?.icon ?? '' },
            }));
            const appIds = ws.appIds.filter((id) => id !== d.appId);
            saveWorkspaces(list.map((w) => (w.id === d.wsId
                ? { ...w, appIds, activeAppId: w.activeAppId === d.appId ? appIds[0] : w.activeAppId, updatedAt: Date.now() }
                : w)));
            if (expandedAppId === d.appId) setExpandedAppId(null);
        } else if (action === 'split') {
            const split = clamp(ws.appIds.length, 2, 4) as Workspace['split'];
            const appIds = [d.appId, ...ws.appIds.filter((id) => id !== d.appId)];
            saveWorkspaces(list.map((w) => (w.id === d.wsId
                ? { ...w, appIds, layout: 'grid', split, activeAppId: d.appId, updatedAt: Date.now() }
                : w)));
            setExpandedAppId(null);
        } else {
            saveWorkspaces(list.map((w) => (w.id === d.wsId ? { ...w, activeAppId: d.appId, updatedAt: Date.now() } : w)));
        }
        stopTabDrag();
    };

    const startTabDrag = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        tabDragRef.current = { wsId: open.id, appId: id, sx: e.clientX, sy: e.clientY, rect: getCanvasRect(), moved: false };
        window.addEventListener('pointermove', onTabPointerMove);
        window.addEventListener('pointerup', onTabPointerUp);
    };

    const renderPane = (id: string, i: number, floating: boolean) => {
        const meta = WIDGET_REGISTRY[id];
        const C = WINDOW_COMPONENTS[id];
        const f = frameOf(open!, id, i);
        const expanded = expandedAppId === id;
        const style = floating && !expanded ? { left: `${f.x}%`, top: `${f.y}%`, width: `${f.w}%`, height: `${f.h}%` } : undefined;
        return (
            <div
                key={id}
                className={`ws-pane ${floating ? 'ws-pane--float' : ''} ${expanded ? 'ws-pane--expanded' : ''}`}
                style={style}
                data-testid={`workspace-pane-${id}`}
            >
                <div
                    className={`ws-pane__hdr ${floating ? 'ws-pane__hdr--drag' : ''}`}
                    onPointerDown={floating ? (e) => startDrag(e, id, i, 'move') : undefined}
                    onDoubleClick={() => toggleExpanded(id)}
                >
                    <span className="ws-pane__name">{meta?.label ?? id}</span>
                    <button className="ws-pane__x" onPointerDown={(e) => e.stopPropagation()} onClick={() => removeApp(id)} aria-label={`Remove ${meta?.label ?? id}`}><X size={16} /></button>
                </div>
                <div className="ws-pane__body window__content" data-widget-id={id}>
                    <WidgetErrorBoundary widgetLabel={meta?.label ?? id} enabled surfaceErrors>
                        <Suspense fallback={<div className="hos-hosted__loading">Igniting {meta?.label ?? id}…</div>}>
                            {C ? <C /> : <div className="ws-empty">Unavailable.</div>}
                        </Suspense>
                    </WidgetErrorBoundary>
                </div>
                {floating && !expanded && <div className="ws-resize" onPointerDown={(e) => startDrag(e, id, i, 'resize')} title="Drag to resize" />}
            </div>
        );
    };

    // ── workspace list ──
    if (!open) {
        return (
            <>
                <h1 className="hos-h">Workspaces</h1>
                <p className="hos-sub">Build your own — pick apps, set the split, jot notes. Everything persists; switch away and pick up exactly where you left off.</p>
                <div className="hos-grid hos-grid--wide">
                    {workspaces.map((w) => (
                        <div key={w.id} className="hos-card hos-space" onClick={() => setOpenId(w.id)} role="button" tabIndex={0}>
                            <div className="hos-space__name">“{w.name}”</div>
                            <div className="hos-space__w">{w.appIds.length} app{w.appIds.length === 1 ? '' : 's'} · {w.split}-up{w.notes.trim() ? ' · notes' : ''}</div>
                            <button className="ws-del" onClick={(e) => { e.stopPropagation(); removeWorkspace(w.id); }} aria-label={`Delete ${w.name}`}><X size={16} /></button>
                        </div>
                    ))}
                    <button type="button" className="hos-card ws-new" onClick={createWorkspace}>
                        <span className="ws-new__plus">+</span><span>New workspace</span>
                    </button>
                </div>
            </>
        );
    }

    // ── workspace runner ──
    const cols = open.split;
    return (
        <div className="ws-run">
            <div className="ws-run__bar">
                <button className="hos-hosted__back" onClick={() => setOpenId(null)}>← Workspaces</button>
                <span className="hos-hosted__title">{open.name}</span>
                <div className="ws-split">
                    <span className="ws-split__lbl">Layout</span>
                    {[1, 2, 3, 4].map((n) => (
                        <button key={n} className={open.layout === 'grid' && open.split === n ? 'on' : ''} onClick={() => patch(open.id, { layout: 'grid', split: n as 1 | 2 | 3 | 4 })}>{n}</button>
                    ))}
                    <button className={open.layout === 'custom' ? 'on' : ''} onClick={() => patch(open.id, { layout: 'custom' })} title="Free move + resize">Custom</button>
                </div>
                <button className="ws-btn" onClick={() => setShowNotes((s) => !s)}>{showNotes ? 'Hide notes' : 'Notes'}</button>
                <button className="ws-btn ws-btn--accent" onClick={() => setPicking((p) => !p)}>+ Add app</button>
            </div>

            {picking && (
                <div className="ws-picker">
                    {Object.values(WIDGET_REGISTRY).filter((w) => WINDOW_COMPONENTS[w.id]).sort((a, b) => a.label.localeCompare(b.label)).map((w) => {
                        const Icon = getIcon(w.icon);
                        return (
                            <button key={w.id} className="ws-pick" onClick={() => addApp(w.id)}>
                                <span className="ws-pick__icon">{Icon ? <Icon size={15} /> : '◈'}</span>{w.label}
                            </button>
                        );
                    })}
                </div>
            )}

            {showNotes && (
                <textarea className="ws-notes" value={open.notes} placeholder="Scratch notes for this workspace — persists across switches…"
                    onChange={(e) => patch(open.id, { notes: e.target.value })} />
            )}

            {open.appIds.length > 0 && (
                <div className="ws-tabs" role="tablist" aria-label={`${open.name} apps`}>
                    {open.appIds.map((id) => {
                        const meta = WIDGET_REGISTRY[id];
                        const Icon = getIcon(meta?.icon ?? '');
                        const label = meta?.label ?? id;
                        return (
                            <button
                                key={id}
                                type="button"
                                className={`ws-tab ${activeAppId === id ? 'on' : ''}`}
                                aria-label={`${label} tab`}
                                aria-selected={activeAppId === id}
                                onPointerDown={(e) => startTabDrag(e, id)}
                                onDoubleClick={() => toggleExpanded(id)}
                                onClick={() => selectApp(id)}
                            >
                                <span className="ws-tab__icon">{Icon ? <Icon size={13} /> : '◈'}</span>
                                <span className="ws-tab__label">{label}</span>
                            </button>
                        );
                    })}
                </div>
            )}

            {open.layout === 'custom' ? (
                <div className="ws-canvas" ref={canvasRef} data-testid="workspace-free-canvas">
                    {open.appIds.length === 0
                        ? <div className="ws-empty">No apps yet. Click <b>+ Add app</b> to compose this workspace.</div>
                        : open.appIds.map((id, i) => renderPane(id, i, true))}
                </div>
            ) : open.appIds.length === 0 ? (
                <div className="ws-empty">No apps yet. Click <b>+ Add app</b> to compose this workspace.</div>
            ) : (
                <div className="ws-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                    {open.appIds.map((id, i) => renderPane(id, i, false))}
                </div>
            )}
        </div>
    );
}
