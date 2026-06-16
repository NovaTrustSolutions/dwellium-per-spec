import { CSSProperties, useRef, useCallback, useEffect, ReactNode, useState } from 'react';
import { GripVertical, CornerUpRight } from 'lucide-react';
import { useWindows } from '../../context/WindowContext';
import { useLayout, getRegionRects } from '../../context/LayoutContext';
import { WindowState, RegionRect } from '../../data/types';
import { getIcon } from '../Sidebar/iconMap';
import WindowTagButton from './WindowTagButton';
import WidgetShell, { useWidgetEnhancementFlags, enhancementClasses } from './WidgetShell';
import { useGridLock } from '../../hooks/useGridLock';
import './Window.css';

export interface WindowProps {
    state: WindowState;
    children: ReactNode;
    regionRect?: RegionRect;
    containerStyle?: CSSProperties;
}

export default function Window({ state, children, regionRect, containerStyle }: WindowProps) {
    const { closeWindow, focusWindow, minimizeWindow, maximizeWindow, updateWindowPosition, updateWindowSize, windows, popOutWindow } = useWindows();
    const { computeSnap, setActiveGuides, setInteracting, settings, assignWindowToRegion, clearWindowRegion, setHoveredRegionId, regionAssignments } = useLayout();
    const { locked } = useGridLock();
    const windowRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    // Widget Enhancement Layer flags — classes land on `.window__content`
    // itself (ZERO-DOM contract; see WidgetShell.tsx).
    const weFlags = useWidgetEnhancementFlags();
    const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
    const resizeRef = useRef({ resizing: false, edge: '', startX: 0, startY: 0, origW: 0, origH: 0, origX: 0, origY: 0 });
    const [tearoffActive, setTearoffActive] = useState(false);
    const [tearoffDist, setTearoffDist] = useState(0);
    const tearoffRef = useRef({ dragging: false, startX: 0, startY: 0 });

    // --- Drag with snap + region detection ---
    const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
        if (state.maximized || locked) return;
        e.preventDefault();
        focusWindow(state.id);

        // If region-snapped, use the region rect as the starting position
        const startX = regionRect ? regionRect.x : state.x;
        const startY = regionRect ? regionRect.y : state.y;
        dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: startX, origY: startY };
        setInteracting(true); // enter layout-edit mode → grid/snap guides visible

        // If dragging out of a region, clear the assignment
        let clearedRegion = false;

        const onMove = (ev: MouseEvent) => {
            if (!dragRef.current.dragging) return;
            const dx = ev.clientX - dragRef.current.startX;
            const dy = ev.clientY - dragRef.current.startY;
            // Get desktop dimensions to constrain drag
            const desktop = windowRef.current?.parentElement;
            const desktopW = desktop?.clientWidth || window.innerWidth;
            const desktopH = desktop?.clientHeight || window.innerHeight;

            // Constrain dragging: prevent moving the titlebar completely off-screen
            const rawX = Math.max(-(state.width - 40), Math.min(dragRef.current.origX + dx, desktopW - 40));
            const rawY = Math.max(0, Math.min(dragRef.current.origY + dy, desktopH - 40));

            // If moved more than 20px from start and was in a region, unsnap
            if (!clearedRegion && regionRect && (Math.abs(dx) > 20 || Math.abs(dy) > 20)) {
                clearWindowRegion(state.id);
                clearedRegion = true;
            }

            // Detect hovered region
            const regions = getRegionRects(settings.regionLayout, desktopW, desktopH);
            const cursorX = ev.clientX - (desktop?.getBoundingClientRect().left || 0);
            const cursorY = ev.clientY - (desktop?.getBoundingClientRect().top || 0);
            const hovered = regions.find(r =>
                cursorX >= r.x && cursorX <= r.x + r.w &&
                cursorY >= r.y && cursorY <= r.y + r.h
            );
            setHoveredRegionId(hovered?.id || null);

            const { x: snappedX, y: snappedY, guides } = computeSnap(
                rawX, rawY, state.width, state.height,
                windows, state.id, desktopW, desktopH
            );

            updateWindowPosition(state.id, snappedX, snappedY);
            setActiveGuides(guides);
        };
        const onUp = (ev: MouseEvent) => {
            dragRef.current.dragging = false;
            setActiveGuides([]);
            setInteracting(false); // exit layout-edit mode → grid hidden again
            setHoveredRegionId(null);

            // Check if dropped on a region
            const desktop = windowRef.current?.parentElement;
            const desktopW = desktop?.clientWidth || window.innerWidth;
            const desktopH = desktop?.clientHeight || window.innerHeight;
            const regions = getRegionRects(settings.regionLayout, desktopW, desktopH);
            const cursorX = ev.clientX - (desktop?.getBoundingClientRect().left || 0);
            const cursorY = ev.clientY - (desktop?.getBoundingClientRect().top || 0);
            const droppedRegion = regions.find(r =>
                cursorX >= r.x && cursorX <= r.x + r.w &&
                cursorY >= r.y && cursorY <= r.y + r.h
            );

            if (droppedRegion) {
                // Check if region is occupied — need to handle swap
                const existingIds = regionAssignments[droppedRegion.id] || [];
                const firstExisting = existingIds.find(id => id !== state.id);
                if (firstExisting) {
                    // Swap: move the displaced window (first in the old region) to where incoming was
                    updateWindowPosition(firstExisting, state.x, state.y);
                    updateWindowSize(firstExisting, state.width, state.height);
                }
                assignWindowToRegion(state.id, droppedRegion.id, windows);
            } else if (ev.clientY <= 5) {
                maximizeWindow(state.id);
            }

            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [state.id, state.x, state.y, state.width, state.height, state.maximized, focusWindow, updateWindowPosition, updateWindowSize, computeSnap, setActiveGuides, setInteracting, windows, settings.regionLayout, assignWindowToRegion, clearWindowRegion, setHoveredRegionId, regionAssignments, regionRect, maximizeWindow, locked]);

    // --- Resize ---
    const onResizeMouseDown = useCallback((e: React.MouseEvent, edge: string) => {
        if (state.maximized || locked) return;
        e.preventDefault();
        e.stopPropagation();
        focusWindow(state.id);
        resizeRef.current = {
            resizing: true, edge,
            startX: e.clientX, startY: e.clientY,
            origW: state.width, origH: state.height,
            origX: state.x, origY: state.y
        };
        setInteracting(true); // enter layout-edit mode → grid/snap guides visible

        const onMove = (ev: MouseEvent) => {
            const r = resizeRef.current;
            if (!r.resizing) return;
            const dx = ev.clientX - r.startX;
            const dy = ev.clientY - r.startY;

            let newW = r.origW, newH = r.origH, newX = r.origX, newY = r.origY;

            if (r.edge.includes('e')) newW = Math.max(320, r.origW + dx);
            if (r.edge.includes('s')) newH = Math.max(200, r.origH + dy);
            if (r.edge.includes('w')) {
                newW = Math.max(320, r.origW - dx);
                if (newW > 320) newX = r.origX + dx;
            }
            if (r.edge.includes('n')) {
                newH = Math.max(200, r.origH - dy);
                if (newH > 200) newY = Math.max(0, r.origY + dy);
            }

            updateWindowSize(state.id, newW, newH);
            updateWindowPosition(state.id, newX, newY);
        };
        const onUp = () => {
            resizeRef.current.resizing = false;
            setInteracting(false); // exit layout-edit mode → grid hidden again
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [state, focusWindow, updateWindowSize, updateWindowPosition, setInteracting, locked]);

    // Keyboard close
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                // Handled at desktop level
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // --- Tear-off: drag content handle, release OUTSIDE window → pop out ---
    // IMPORTANT: window.open() MUST be called from a trusted event (mouseup/click),
    // NOT from mousemove (which browsers always block as popup).
    const onTearoffMouseDown = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        tearoffRef.current = { dragging: true, startX: e.clientX, startY: e.clientY };
        setTearoffActive(true);
        setTearoffDist(0);

        const rect = windowRef.current?.getBoundingClientRect();

        const onMove = (ev: MouseEvent) => {
            if (!tearoffRef.current.dragging || !rect) return;
            const dx = ev.clientX - tearoffRef.current.startX;
            const dy = ev.clientY - tearoffRef.current.startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            setTearoffDist(dist);
        };

        // window.open() called from mouseup = trusted user gesture → allowed by browser
        const onUp = (ev: MouseEvent) => {
            if (!rect) {
                tearoffRef.current.dragging = false;
                setTearoffActive(false);
                setTearoffDist(0);
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.body.style.cursor = '';
                return;
            }
            const dx = ev.clientX - tearoffRef.current.startX;
            const dy = ev.clientY - tearoffRef.current.startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const outsideWindow =
                ev.clientX < rect.left - 20 ||
                ev.clientX > rect.right + 20 ||
                ev.clientY < rect.top - 20 ||
                ev.clientY > rect.bottom + 20;

            tearoffRef.current.dragging = false;
            setTearoffActive(false);
            setTearoffDist(0);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';

            // Trigger pop-out if dragged far enough outside (mouseup = trusted event)
            if (outsideWindow && dist > 60) {
                popOutWindow(state.id);
            }
        };

        document.body.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [state.id, popOutWindow]);


    if (state.minimized) return null;

    // Focused = highest zIndex among visible windows (the shell's opt-in
    // escape-to-close only fires for the focused window).
    const isTopWindow = !windows.some(
        (w) => !w.minimized && w.id !== state.id && w.zIndex > state.zIndex,
    );

    // If region-snapped, override position/size from region rect
    const isRegionSnapped = !!regionRect;
    const baseZ = state.zIndex * 10;
    const finalZ = state.maximized ? 100000 + baseZ : baseZ;
    const style = state.maximized
        ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: finalZ }
        : isRegionSnapped
            ? { left: regionRect.x, top: regionRect.y, width: regionRect.w, height: regionRect.h, zIndex: finalZ }
            : { left: state.x, top: state.y, width: state.width, height: state.height, zIndex: finalZ };

    const tearoffProgress = Math.min(tearoffDist / 80, 1); // 0..1

    return (
        <div
            ref={windowRef}
            className={`window ${state.maximized ? 'window--maximized' : ''} ${tearoffActive ? 'window--tearoff' : ''} ${locked ? 'window--locked' : ''}`}
            style={{ ...style, ...containerStyle }}
            onMouseDown={() => focusWindow(state.id)}
        >
            {/* Resize handles */}
            {!state.maximized && !locked && (
                <>
                    <div className="resize-handle resize-n" onMouseDown={e => onResizeMouseDown(e, 'n')} />
                    <div className="resize-handle resize-s" onMouseDown={e => onResizeMouseDown(e, 's')} />
                    <div className="resize-handle resize-e" onMouseDown={e => onResizeMouseDown(e, 'e')} />
                    <div className="resize-handle resize-w" onMouseDown={e => onResizeMouseDown(e, 'w')} />
                    <div className="resize-handle resize-ne" onMouseDown={e => onResizeMouseDown(e, 'ne')} />
                    <div className="resize-handle resize-nw" onMouseDown={e => onResizeMouseDown(e, 'nw')} />
                    <div className="resize-handle resize-se" onMouseDown={e => onResizeMouseDown(e, 'se')} />
                    <div className="resize-handle resize-sw" onMouseDown={e => onResizeMouseDown(e, 'sw')} />
                </>
            )}

            {/* Title bar */}
            <div className="window__titlebar" onMouseDown={onTitleMouseDown} onDoubleClick={() => maximizeWindow(state.id)}>
                {/* Controls — LEFT side (macOS style) */}
                <div className="window__controls">
                    <button className="window__btn window__btn--close" onClick={e => { e.stopPropagation(); closeWindow(state.id); }} title="Close">
                        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" /><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                    <button className="window__btn window__btn--minimize" onClick={e => { e.stopPropagation(); minimizeWindow(state.id); }} title="Minimize">
                        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                    <button className="window__btn window__btn--maximize" onClick={e => { e.stopPropagation(); maximizeWindow(state.id); }} title="Maximize">
                        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                    </button>
                    <button className="window__btn window__btn--popout" onClick={e => { e.stopPropagation(); popOutWindow(state.id); }} title="Pop out">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4">
                            <polyline points="6,1 9,1 9,4" /><line x1="9" y1="1" x2="5" y2="5" />
                            <polyline points="4,2 1,2 1,9 8,9 8,6" />
                        </svg>
                    </button>
                </div>
                <div className="window__titlebar-left">
                    <span className="window__icon" style={{ display: 'inline-flex', alignItems: 'center' }}>{(() => { const Icon = getIcon(state.icon); return Icon ? <Icon size={14} strokeWidth={1.75} /> : state.icon; })()}</span>
                    <span className="window__title">{state.title}</span>
                    {/* Drag-grip — drag into Scribe to insert a markdown reference (Phase D DnD bridge) */}
                    <span
                        className="window__drag-grip"
                        draggable
                        onMouseDown={(e) => e.stopPropagation()}
                        onDragStart={(e) => {
                            const payload = {
                                widgetId: state.id,
                                widgetType: state.component,
                                title: state.title,
                                state: {
                                    icon: state.icon,
                                    component: state.component,
                                },
                            };
                            try {
                                e.dataTransfer.setData('application/x-dwellium-widget', JSON.stringify(payload));
                                e.dataTransfer.setData('text/plain', `${state.title}`);
                                e.dataTransfer.effectAllowed = 'copy';
                            } catch { /* sandboxed */ }
                        }}
                        title="Drag into Scribe to insert a reference to this widget"
                    >
                        <CornerUpRight size={12} aria-hidden="true" />
                    </span>
                    <WindowTagButton source="widget" sourceId={String(state.component)} title={state.title} />
                </div>
                {/* AI loading shimmer bar */}
                {state.isLoading && <div className="window__loading-bar" />}
            </div>

            {/* Content — hosted by WidgetShell so all 48 widgets inherit the
                Widget Enhancement Layer (error boundary, escape-to-close,
                themed scrollbars, focus rings, …). Each improvement is
                flag-gated by widgetEnhancementsStore → reversible at runtime.
                ZERO-DOM CONTRACT: enhancement classes go on
                `.window__content` ITSELF and WidgetShell renders no element —
                the widget root must remain the direct DOM child of
                `.window__content` (23 direct-child selectors in global.css +
                the `:has(>)` flex contracts in Window.css depend on it). */}
            <div
                ref={contentRef}
                className={`window__content ${enhancementClasses(weFlags)}`}
                data-widget-id={String(state.component)}
                data-reduced-motion={weFlags.reducedMotion ? 'true' : 'false'}
            >
                <WidgetShell
                    widgetId={String(state.component)}
                    widgetLabel={state.title}
                    isFocused={isTopWindow}
                    contentRef={contentRef}
                    onRequestClose={() => closeWindow(state.id)}
                >
                    {children}
                </WidgetShell>
            </div>

            {/* Tear-off grip — compact, pinned handle (NOT a persistent chrome
                row). Drag it outside the window to detach into its own window.
                Idle state shows only a Lucide grip + tooltip; the textual
                progress appears transiently while actively tearing off. The
                title-bar "Pop out" button is the primary, always-visible
                affordance. (HARD RULE 3.5: no persistent pop-out banner.) */}
            {!state.maximized && !locked && (
                <div
                    className={`window__tearoff-handle ${tearoffActive ? 'window__tearoff-handle--active' : ''}`}
                    onMouseDown={onTearoffMouseDown}
                    title="Drag outside the window to open it in its own window"
                    aria-hidden="true"
                    style={tearoffActive ? { '--tearoff-progress': tearoffProgress } as React.CSSProperties : undefined}
                >
                    <GripVertical size={12} className="window__tearoff-icon" aria-hidden="true" />
                    {tearoffActive && (
                        <span className="window__tearoff-progress">
                            {tearoffProgress >= 1 ? 'Release' : `${Math.round(tearoffProgress * 100)}%`}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}
