import { CSSProperties, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useWindows } from '../../context/WindowContext';
import { useLayout, getRegionRects } from '../../context/LayoutContext';
import { WindowState, RegionRect } from '../../data/types';
import './Window.css';

export interface WindowProps {
    state: WindowState;
    children: ReactNode;
    regionRect?: RegionRect;
    containerStyle?: CSSProperties;
}

export default function Window({ state, children, regionRect, containerStyle }: WindowProps) {
    const { closeWindow, focusWindow, minimizeWindow, maximizeWindow, updateWindowPosition, updateWindowSize, windows } = useWindows();
    const { computeSnap, setActiveGuides, settings, assignWindowToRegion, clearWindowRegion, setHoveredRegionId, regionAssignments } = useLayout();
    const windowRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
    const resizeRef = useRef({ resizing: false, edge: '', startX: 0, startY: 0, origW: 0, origH: 0, origX: 0, origY: 0 });

    // --- Drag with snap + region detection ---
    const onTitleMouseDown = useCallback((e: React.MouseEvent) => {
        if (state.maximized) return;
        e.preventDefault();
        focusWindow(state.id);

        // If region-snapped, use the region rect as the starting position
        const startX = regionRect ? regionRect.x : state.x;
        const startY = regionRect ? regionRect.y : state.y;
        dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, origX: startX, origY: startY };

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
    }, [state.id, state.x, state.y, state.width, state.height, state.maximized, focusWindow, updateWindowPosition, updateWindowSize, computeSnap, setActiveGuides, windows, settings.regionLayout, assignWindowToRegion, clearWindowRegion, setHoveredRegionId, regionAssignments, regionRect, maximizeWindow]);

    // --- Resize ---
    const onResizeMouseDown = useCallback((e: React.MouseEvent, edge: string) => {
        if (state.maximized) return;
        e.preventDefault();
        e.stopPropagation();
        focusWindow(state.id);
        resizeRef.current = {
            resizing: true, edge,
            startX: e.clientX, startY: e.clientY,
            origW: state.width, origH: state.height,
            origX: state.x, origY: state.y
        };

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
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [state, focusWindow, updateWindowSize, updateWindowPosition]);

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

    if (state.minimized) return null;

    // If region-snapped, override position/size from region rect
    const isRegionSnapped = !!regionRect;
    const style = state.maximized
        ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: state.zIndex }
        : isRegionSnapped
            ? { left: regionRect.x, top: regionRect.y, width: regionRect.w, height: regionRect.h, zIndex: state.zIndex }
            : { left: state.x, top: state.y, width: state.width, height: state.height, zIndex: state.zIndex };

    return (
        <div
            ref={windowRef}
            className={`window ${state.maximized ? 'window--maximized' : ''}`}
            style={{ ...style, ...containerStyle }}
            onMouseDown={() => focusWindow(state.id)}
        >
            {/* Resize handles */}
            {!state.maximized && (
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
                <div className="window__titlebar-left">
                    <span className="window__icon">{state.icon}</span>
                    <span className="window__title">{state.title}</span>
                </div>
                <div className="window__controls">
                    <button className="window__btn window__btn--minimize" onClick={e => { e.stopPropagation(); minimizeWindow(state.id); }} title="Minimize">
                        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                    <button className="window__btn window__btn--maximize" onClick={e => { e.stopPropagation(); maximizeWindow(state.id); }} title="Maximize">
                        <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="1.2" /></svg>
                    </button>
                    <button className="window__btn window__btn--close" onClick={e => { e.stopPropagation(); closeWindow(state.id); }} title="Close">
                        <svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" /><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" /></svg>
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="window__content">
                {children}
            </div>
        </div>
    );
}
