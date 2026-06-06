/**
 * PlacementOverlay — the click-on-canvas capture layer for PDFGear.
 *
 * Sits transparently over the rendered page canvas. In `point` mode a single
 * click yields a PDF-space point; in `rect` mode a click-drag yields a
 * normalized PDF-space rectangle (with a live marquee preview). Coordinate
 * projection is delegated to the live pdfjs viewport (passed via ref) so it is
 * always correct for the current zoom + rotation; the screen→bitmap scaling and
 * rect assembly come from the unit-tested coords.ts helpers.
 *
 * Esc cancels. Fully keyboard-announced via an aria-live instruction banner.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { cssToCanvasPixel, canvasPointToPdf, canvasRectToPdfRect, type ViewportLike, type Point } from './coords';
import type { PdfRect } from './pdfOps';

export interface PlacementOverlayProps {
    active: boolean;
    mode: 'point' | 'rect';
    hint: string;
    canvasRef: MutableRefObject<HTMLCanvasElement | null>;
    viewportRef: MutableRefObject<ViewportLike | null>;
    onPoint?: (p: Point) => void;
    onRect?: (r: PdfRect) => void;
    onCancel: () => void;
}

interface ScreenRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export default function PlacementOverlay({
    active,
    mode,
    hint,
    canvasRef,
    viewportRef,
    onPoint,
    onRect,
    onCancel,
}: PlacementOverlayProps) {
    const overlayRef = useRef<HTMLDivElement>(null);
    const startRef = useRef<{ clientX: number; clientY: number } | null>(null);
    const [marquee, setMarquee] = useState<ScreenRect | null>(null);

    // Esc cancels placement.
    useEffect(() => {
        if (!active) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [active, onCancel]);

    const bitmapPoint = useCallback(
        (clientX: number, clientY: number): Point | null => {
            const canvas = canvasRef.current;
            if (!canvas) return null;
            const rect = canvas.getBoundingClientRect();
            return cssToCanvasPixel(clientX, clientY, rect, canvas.width, canvas.height);
        },
        [canvasRef],
    );

    const handlePointerDown = useCallback(
        (e: React.PointerEvent) => {
            if (!active) return;
            e.preventDefault();
            const vp = viewportRef.current;
            if (!vp) return;
            if (mode === 'point') {
                const bp = bitmapPoint(e.clientX, e.clientY);
                if (bp) onPoint?.(canvasPointToPdf(bp, vp));
                onCancel(); // single-shot
                return;
            }
            startRef.current = { clientX: e.clientX, clientY: e.clientY };
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        },
        [active, mode, bitmapPoint, onPoint, onCancel, viewportRef],
    );

    const handlePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!active || mode !== 'rect' || !startRef.current) return;
            const host = overlayRef.current?.getBoundingClientRect();
            if (!host) return;
            const sx = startRef.current.clientX - host.left;
            const sy = startRef.current.clientY - host.top;
            const cx = e.clientX - host.left;
            const cy = e.clientY - host.top;
            setMarquee({
                left: Math.min(sx, cx),
                top: Math.min(sy, cy),
                width: Math.abs(cx - sx),
                height: Math.abs(cy - sy),
            });
        },
        [active, mode],
    );

    const handlePointerUp = useCallback(
        (e: React.PointerEvent) => {
            if (!active || mode !== 'rect' || !startRef.current) return;
            const vp = viewportRef.current;
            const a = bitmapPoint(startRef.current.clientX, startRef.current.clientY);
            const b = bitmapPoint(e.clientX, e.clientY);
            startRef.current = null;
            setMarquee(null);
            if (vp && a && b && (Math.abs(a.x - b.x) > 2 || Math.abs(a.y - b.y) > 2)) {
                onRect?.(canvasRectToPdfRect(a, b, vp));
            }
            onCancel();
        },
        [active, mode, bitmapPoint, onRect, onCancel, viewportRef],
    );

    if (!active) return null;

    return (
        <div
            ref={overlayRef}
            className={`pdfg-place pdfg-place--${mode}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            role="application"
            aria-label={hint}
        >
            <div className="pdfg-place__hint" role="status" aria-live="polite">
                {hint} <kbd>Esc</kbd> to cancel
            </div>
            {marquee && (
                <div
                    className="pdfg-place__marquee"
                    style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }}
                />
            )}
        </div>
    );
}
