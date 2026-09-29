/**
 * DocViewer — pointer-driven annotation placement (P1 item 10, P2 item 11
 * module split). Owns the in-progress-draw state (isDrawing/drawStart/
 * currentPath) and the four pointer handlers wired to the overlay canvas;
 * everything it needs from the rest of DocViewer (tool config, the live
 * viewport, committing a finished Annotation, opening the signature modal)
 * comes in as explicit options/callbacks — no new global state.
 *
 * `isDrawing`/`drawStart`/`currentPath` are returned (not just consumed
 * internally) because DocViewer's `renderOverlay` also needs them, to draw
 * the freehand 'draw' tool's live in-progress stroke via
 * `annotationOverlay.ts`.
 */
import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Annotation, Point, ShapeType, StampType, ToolMode } from './docViewerTypes';
import { STAMP_COLORS } from './docViewerTypes';
import { normalizeSignatureStrokes, hitTestAnnotation, translateAnnotation } from './annotationModel';
import * as pdfCoords from './pdfCoords';
import type { ViewportLike } from './pdfCoords';

// Width (annotation-space units) a placed signature is scaled to.
const SIGNATURE_TARGET_WIDTH = 160;
// 16a: minimum PDF-space movement before a select-tool pointer-down-then-move
// counts as a drag (and pushes ONE undo step) rather than a plain click that
// only changes selection.
const DRAG_THRESHOLD = 1;

type LiveViewport = ViewportLike & { width?: number; height?: number; scale?: number };

export interface UseAnnotationPointerToolOptions {
    overlayRef: RefObject<HTMLCanvasElement | null>;
    viewportRef: RefObject<LiveViewport | null>;
    rootRef: RefObject<HTMLDivElement | null>;
    activeTool: ToolMode;
    currentPage: number;
    drawColor: string;
    drawSize: number;
    selectedShape: ShapeType;
    selectedStamp: StampType;
    signatureStrokes: Point[][];
    /** Redraws committed annotations — called mid-drag for the highlight/
     * shape live preview (see handlePointerMove) before this hook paints the
     * ephemeral shape directly on top. */
    renderOverlay: () => void;
    /** Pushes undo history, marks the doc dirty, and commits the Annotation
     * — owned by DocViewer since it's shared with page-manipulation ops. */
    addAnnotation: (ann: Annotation) => void;
    showToast: (msg: string) => void;
    /** No signature drawn yet — open the signature modal. */
    onNeedSignature: () => void;
    /** 16a: the Select tool's annotations to hit-test are the CURRENT page's
     * only — pass the already-filtered list. */
    pageAnnotations: Annotation[];
    /** Selects (or, with null, deselects) an annotation by id. */
    onSelectAnnotation: (id: string | null) => void;
    /** Pushes ONE undo step, called exactly once at the start of an actual
     * drag (after DRAG_THRESHOLD is crossed) — a plain click-to-select never
     * pushes history. */
    onBeginMove: () => void;
    /** Replaces one annotation in place while dragging — NOT undoable itself
     * (onBeginMove already captured the pre-drag state once). */
    onMoveAnnotation: (id: string, next: Annotation) => void;
    /** P2 item 13 (a11y): 'text' tool pointer-up no longer opens a
     * window.prompt() — it hands the placement point (viewport + PDF space)
     * back to DocViewer, which owns an inline, ref-focused text field and
     * commits the Annotation itself once the user confirms (fontSize/
     * drawColor already live there). */
    onRequestTextInput: (screenPos: Point, pdfPos: Point, rotation: number) => void;
}

export interface UseAnnotationPointerTool {
    isDrawing: boolean;
    drawStart: Point | null;
    currentPath: Point[];
    handlePointerDown: (e: React.PointerEvent) => void;
    handlePointerMove: (e: React.PointerEvent) => void;
    handlePointerUp: (e: React.PointerEvent) => void;
    handlePointerCancel: (e: React.PointerEvent) => void;
    /** R5 (adversarial review): stops an in-progress Select-tool drag —
     * releases pointer capture and clears the drag ref so a SUBSEQUENT
     * pointermove (the physical pointer may still be down) is a no-op
     * instead of continuing to move the annotation with no visible
     * selection outline. A no-op when no drag is in progress. Called from
     * DocViewer's Escape handler alongside deselecting. */
    cancelSelectDrag: () => void;
}

export function useAnnotationPointerTool(opts: UseAnnotationPointerToolOptions): UseAnnotationPointerTool {
    const {
        overlayRef, viewportRef, rootRef, activeTool, currentPage,
        drawColor, drawSize, selectedShape, selectedStamp, signatureStrokes,
        renderOverlay, addAnnotation, showToast, onNeedSignature, onRequestTextInput,
        pageAnnotations, onSelectAnnotation, onBeginMove, onMoveAnnotation,
    } = opts;

    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<Point | null>(null);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);

    // 16a: drag state for the Select tool — a ref (not state), since it's
    // written/read entirely inside the pointer-event sequence and never
    // needs to trigger a re-render itself (onMoveAnnotation's setAnnotations
    // call already does that).
    const dragRef = useRef<{ id: string; original: Annotation; startPdf: Point; moved: boolean } | null>(null);

    // R6 (adversarial review of P1 item 10): only ONE pointer contact drives
    // the overlay at a time. Without this, a second concurrent touch (e.g. a
    // palm graze — more likely now that `touch-action: none` suppresses the
    // browser's own touch-scroll rejection) writes its coordinates into the
    // SAME isDrawing/drawStart/currentPath state as the first, corrupting or
    // duplicating the in-progress annotation.
    const activePointerIdRef = useRef<number | null>(null);

    const capturePointer = (e: React.PointerEvent) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported (e.g. jsdom) */ }
    };
    const releasePointer = (e: React.PointerEvent) => {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not supported */ }
    };

    // Screen -> viewport-space (CSS pixel, top-left origin, y-down): a ratio
    // of the overlay's ACTUAL rendered CSS size to the viewport's own
    // width/height, not a `zoom * 1.5` division — decoupled from that magic
    // constant (P1 item 6) and correct even if the browser visually scales
    // the canvas down (e.g. a narrow container).
    const getCanvasCoords = useCallback((e: { clientX: number; clientY: number }): Point => {
        const overlay = overlayRef.current;
        if (!overlay) return { x: 0, y: 0 };
        const rect = overlay.getBoundingClientRect();
        const viewport = viewportRef.current;
        const cssWidth = viewport?.width ?? rect.width;
        const cssHeight = viewport?.height ?? rect.height;
        const scaleX = rect.width > 0 ? cssWidth / rect.width : 1;
        const scaleY = rect.height > 0 ? cssHeight / rect.height : 1;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }, [overlayRef, viewportRef]);

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        // R5 (adversarial review of P1 item 9): clicking this canvas doesn't
        // natively focus it (a plain <canvas> isn't focusable), so the
        // browser drops focus to <body> — the rootRef keydown listener never
        // sees a SUBSEQUENT Cmd+Z at all (its target is <body>, outside the
        // viewer subtree, so it never bubbles in). Reclaiming focus onto the
        // (tabIndex=-1, programmatically-focusable) viewer root on every
        // pointer interaction keeps Cmd+Z working right after a draw.
        rootRef.current?.focus({ preventScroll: true });
        if (activePointerIdRef.current !== null) return; // a pointer is already active — ignore a second contact
        if (activeTool === 'editText') return;

        if (activeTool === 'select') {
            const viewport = viewportRef.current;
            if (!viewport) return;
            activePointerIdRef.current = e.pointerId;
            capturePointer(e);
            const pos = getCanvasCoords(e);
            const pdfPos = pdfCoords.viewportToPdf(viewport, pos.x, pos.y);
            const hit = hitTestAnnotation(pageAnnotations, pdfPos, viewport.rotation ?? 0);
            onSelectAnnotation(hit?.id ?? null);
            dragRef.current = hit ? { id: hit.id, original: hit, startPdf: pdfPos, moved: false } : null;
            return;
        }

        activePointerIdRef.current = e.pointerId;
        capturePointer(e);
        const pos = getCanvasCoords(e);
        setIsDrawing(true);
        setDrawStart(pos);

        if (activeTool === 'draw') {
            setCurrentPath([pos]);
        }
    }, [rootRef, activeTool, getCanvasCoords, viewportRef, pageAnnotations, onSelectAnnotation]);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;

        if (activeTool === 'select') {
            const drag = dragRef.current;
            const viewport = viewportRef.current;
            if (!drag || !viewport) return;
            const pos = getCanvasCoords(e);
            const pdfPos = pdfCoords.viewportToPdf(viewport, pos.x, pos.y);
            const dx = pdfPos.x - drag.startPdf.x;
            const dy = pdfPos.y - drag.startPdf.y;
            if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            if (!drag.moved) {
                drag.moved = true;
                onBeginMove();
            }
            onMoveAnnotation(drag.id, translateAnnotation(drag.original, dx, dy));
            return;
        }

        if (!isDrawing || !drawStart) return;
        const pos = getCanvasCoords(e);

        if (activeTool === 'draw') {
            setCurrentPath(prev => [...prev, pos]);
        } else if (activeTool === 'highlight' || activeTool === 'shape') {
            // Live preview via overlay re-render — POSITION is still
            // viewport-space, no conversion needed. Stroke width/arrowhead
            // length DO still need * (viewport.scale ?? 1) — same as
            // renderOverlay's committed 'shape'/'draw' cases (R3, adversarial
            // review of P1 item 6) — or the live preview is a different
            // thickness than what gets committed on pointer-up.
            const overlay = overlayRef.current;
            if (!overlay) return;
            const ctx = overlay.getContext('2d');
            if (!ctx) return;
            renderOverlay();
            const vscale = viewportRef.current?.scale ?? 1;
            const x = Math.min(drawStart.x, pos.x);
            const y = Math.min(drawStart.y, pos.y);
            const w = Math.abs(pos.x - drawStart.x);
            const h = Math.abs(pos.y - drawStart.y);

            if (activeTool === 'highlight') {
                ctx.fillStyle = drawColor;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(x, y, w, h);
                ctx.globalAlpha = 1;
            } else {
                ctx.strokeStyle = drawColor;
                ctx.lineWidth = drawSize * vscale;
                if (selectedShape === 'rectangle') {
                    ctx.strokeRect(x, y, w, h);
                } else if (selectedShape === 'circle') {
                    const cx = x + w / 2;
                    const cy = y + h / 2;
                    ctx.beginPath();
                    ctx.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (selectedShape === 'line' || selectedShape === 'arrow') {
                    ctx.beginPath();
                    ctx.moveTo(drawStart.x, drawStart.y);
                    ctx.lineTo(pos.x, pos.y);
                    ctx.stroke();
                    if (selectedShape === 'arrow') {
                        const angle = Math.atan2(pos.y - drawStart.y, pos.x - drawStart.x);
                        const headLen = 12 * vscale;
                        ctx.beginPath();
                        ctx.moveTo(pos.x, pos.y);
                        ctx.lineTo(pos.x - headLen * Math.cos(angle - Math.PI / 6), pos.y - headLen * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(pos.x, pos.y);
                        ctx.lineTo(pos.x - headLen * Math.cos(angle + Math.PI / 6), pos.y - headLen * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();
                    }
                }
            }
        }
    }, [isDrawing, drawStart, activeTool, getCanvasCoords, overlayRef, viewportRef, renderOverlay, drawColor, drawSize, selectedShape, onBeginMove, onMoveAnnotation]);

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        activePointerIdRef.current = null;
        releasePointer(e);

        if (activeTool === 'select') {
            dragRef.current = null;
            return;
        }

        if (!isDrawing || !drawStart) {
            setIsDrawing(false);
            return;
        }
        const pos = getCanvasCoords(e);
        // P1 item 6: convert the viewport-space geometry just captured into
        // PDF user space with the live viewport, ONCE, right here at commit
        // — everything downstream (overlay render, bake) works in PDF space.
        const viewport = viewportRef.current;

        if (activeTool === 'text' && viewport) {
            // P2 item 13 (a11y): hand placement off to DocViewer's inline
            // ref-focused text field instead of window.prompt() — it builds
            // and commits the Annotation itself (fontSize/drawColor live
            // there), so nothing is added here.
            onRequestTextInput(pos, pdfCoords.viewportToPdf(viewport, pos.x, pos.y), viewport.rotation ?? 0);
        } else if (activeTool === 'highlight' && viewport) {
            const rx = Math.min(drawStart.x, pos.x);
            const ry = Math.min(drawStart.y, pos.y);
            const rw = Math.abs(pos.x - drawStart.x);
            const rh = Math.abs(pos.y - drawStart.y);
            if (rw > 2 && rh > 2) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'highlight',
                    page: currentPage,
                    color: drawColor,
                    opacity: 0.3,
                    rect: pdfCoords.viewportRectToPdfRect(viewport, { x: rx, y: ry, w: rw, h: rh }),
                });
            }
        } else if (activeTool === 'draw' && viewport) {
            if (currentPath.length > 1) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'draw',
                    page: currentPage,
                    color: drawColor,
                    opacity: 1,
                    points: currentPath.map(p => pdfCoords.viewportToPdf(viewport, p.x, p.y)),
                    lineWidth: drawSize,
                });
            }
            setCurrentPath([]);
        } else if (activeTool === 'shape' && viewport) {
            const rx = Math.min(drawStart.x, pos.x);
            const ry = Math.min(drawStart.y, pos.y);
            const rw = pos.x - drawStart.x;
            const rh = pos.y - drawStart.y;
            if (Math.abs(rw) > 2 || Math.abs(rh) > 2) {
                // Line/arrow encode direction via (x,y) -> (x+w,y+h) — the
                // rect is deliberately NOT normalized to abs(w)/abs(h) for
                // those, and pdfCoords.viewportRectToPdfRect is a 2-point
                // (not 4-corner) conversion, so it preserves that direction.
                const viewportRect = selectedShape === 'line' || selectedShape === 'arrow'
                    ? { x: drawStart.x, y: drawStart.y, w: rw, h: rh }
                    : { x: rx, y: ry, w: Math.abs(rw), h: Math.abs(rh) };
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'shape',
                    page: currentPage,
                    color: drawColor,
                    opacity: 1,
                    shapeType: selectedShape,
                    rect: pdfCoords.viewportRectToPdfRect(viewport, viewportRect),
                    lineWidth: drawSize,
                });
            }
        } else if (activeTool === 'stamp' && viewport) {
            addAnnotation({
                id: crypto.randomUUID(),
                type: 'stamp',
                page: currentPage,
                color: STAMP_COLORS[selectedStamp],
                opacity: 0.85,
                stampType: selectedStamp,
                position: pdfCoords.viewportToPdf(viewport, pos.x, pos.y),
                rotation: viewport.rotation ?? 0,
            });
        } else if (activeTool === 'signature') {
            if (signatureStrokes.length > 0 && viewport) {
                // normalizeSignatureStrokes works in viewport-space (the
                // signature reads at a consistent SCREEN size regardless of
                // zoom); convert its output to PDF space here at placement
                // (plan P1 item 6: "convert each point into PDF space at
                // placement"), same as every other annotation type.
                const { strokes: normalizedStrokes, rect } = normalizeSignatureStrokes(
                    signatureStrokes,
                    { x: pos.x, y: pos.y, width: SIGNATURE_TARGET_WIDTH },
                );
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'signature',
                    page: currentPage,
                    color: '#1a1a2e',
                    opacity: 1,
                    position: pdfCoords.viewportToPdf(viewport, pos.x, pos.y),
                    rect: pdfCoords.viewportRectToPdfRect(viewport, rect),
                    signatureData: normalizedStrokes.map(stroke => stroke.map(p => pdfCoords.viewportToPdf(viewport, p.x, p.y))),
                });
                showToast('Signature placed');
            } else if (signatureStrokes.length === 0) {
                showToast('Draw a signature first');
                onNeedSignature();
            }
        }

        setIsDrawing(false);
        setDrawStart(null);
    }, [
        isDrawing, drawStart, getCanvasCoords, viewportRef, activeTool, currentPage,
        drawColor, currentPath, drawSize, selectedShape, selectedStamp,
        signatureStrokes, addAnnotation, showToast, onNeedSignature, onRequestTextInput,
    ]);

    const handlePointerCancel = useCallback((e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        activePointerIdRef.current = null;
        releasePointer(e);
        // 16a: a cancelled drag leaves the annotation at its last dragged
        // position (the undo step onBeginMove already pushed covers it —
        // same "no revert, use Undo" behavior as the draw tool's own cancel
        // path below, which doesn't restore currentPath either).
        dragRef.current = null;
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentPath([]);
    }, []);

    // R5: release capture via the overlay element directly (no PointerEvent
    // is available here — Escape is a keyboard event) using the pointerId
    // the drag started with, then clear the refs so handlePointerMove's
    // `e.pointerId !== activePointerIdRef.current` guard makes the next move
    // (the physical pointer may still be down) a no-op.
    const cancelSelectDrag = useCallback(() => {
        if (!dragRef.current) return;
        const overlay = overlayRef.current;
        const pointerId = activePointerIdRef.current;
        if (overlay && pointerId !== null) {
            try { overlay.releasePointerCapture(pointerId); } catch { /* not supported / already released */ }
        }
        dragRef.current = null;
        activePointerIdRef.current = null;
    }, [overlayRef]);

    return { isDrawing, drawStart, currentPath, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, cancelSelectDrag };
}
