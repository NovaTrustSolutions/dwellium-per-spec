/**
 * DocViewer — "Draw Your Signature" modal (P2 item 11 module split).
 *
 * `strokes` is lifted to the parent (DocViewer) as controlled state — it's
 * still needed there at placement time (handlePointerUp's 'signature'
 * branch, after this modal has closed), so it can't live only inside this
 * component. Everything else (the drawing canvas, its pointer handlers, the
 * per-stroke-in-progress refs) is local — no reason for DocViewer to know
 * about them.
 */
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Point } from './docViewerTypes';
import { useFocusTrap } from '../../hooks/useA11y';

export interface SignatureModalProps {
    open: boolean;
    strokes: Point[][];
    onStrokesChange: (strokes: Point[][]) => void;
    onClose: () => void;
    /** Called once validation (non-empty strokes) has passed. */
    onConfirmed: () => void;
    showToast: (msg: string) => void;
}

export default function SignatureModal({ open, strokes, onStrokesChange, onClose, onConfirmed, showToast }: SignatureModalProps) {
    const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const sigDrawingRef = useRef(false);
    const sigCurrentStroke = useRef<Point[]>([]);
    // R6 (adversarial review of P1 item 10): same single-active-pointer guard
    // as the main overlay canvas.
    const sigPointerIdRef = useRef<number | null>(null);

    const capturePointer = (e: React.PointerEvent) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported (e.g. jsdom) */ }
    };
    const releasePointer = (e: React.PointerEvent) => {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not supported */ }
    };

    // P1 item 10: the canvas's CSS width is `100%` of the modal body while
    // its bitmap is a fixed 480x200 — they're rarely equal, so pointer
    // offsets must be scaled by canvas.width / rect.width (bitmap px per CSS
    // px), not used as raw CSS-pixel offsets, or ink lands offset from the
    // cursor.
    const sigPointerPos = (canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }): Point => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };

    const handleSigPointerDown = (e: React.PointerEvent) => {
        if (sigPointerIdRef.current !== null) return; // already drawing with another contact
        const canvas = sigCanvasRef.current;
        if (!canvas) return;
        sigPointerIdRef.current = e.pointerId;
        capturePointer(e);
        sigDrawingRef.current = true;
        sigCurrentStroke.current = [sigPointerPos(canvas, e)];
    };

    const handleSigPointerMove = (e: React.PointerEvent) => {
        if (e.pointerId !== sigPointerIdRef.current) return;
        if (!sigDrawingRef.current) return;
        const canvas = sigCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const pt = sigPointerPos(canvas, e);
        const prev = sigCurrentStroke.current;
        if (prev.length > 0) {
            ctx.strokeStyle = '#1a1a2e';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(prev[prev.length - 1].x, prev[prev.length - 1].y);
            ctx.lineTo(pt.x, pt.y);
            ctx.stroke();
        }
        sigCurrentStroke.current.push(pt);
    };

    const handleSigPointerUp = (e: React.PointerEvent) => {
        if (e.pointerId !== sigPointerIdRef.current) return;
        sigPointerIdRef.current = null;
        releasePointer(e);
        // Take the stroke BEFORE clearing the ref: the functional updater may run later (at
        // render time), and reading sigCurrentStroke.current there stored an EMPTY stroke —
        // the signature showed "placed" but drew nothing and baked nothing.
        const stroke = sigCurrentStroke.current;
        sigCurrentStroke.current = [];
        if (sigDrawingRef.current && stroke.length > 1) {
            onStrokesChange([...strokes, stroke]);
        }
        sigDrawingRef.current = false;
    };

    const clearSignature = () => {
        onStrokesChange([]);
        const canvas = sigCanvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const confirmSignature = () => {
        if (strokes.length === 0) {
            showToast('Please draw your signature first');
            return;
        }
        onConfirmed();
    };

    // P2 item 13 (a11y): role="dialog" + aria-modal, focus moves in on open
    // and Tab is trapped inside (useFocusTrap — also restores focus to
    // whatever was focused before the modal opened, i.e. the Sign button,
    // once it closes), and Escape closes it.
    const dialogRef = useFocusTrap<HTMLDivElement>(open);
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [open, onClose]);

    if (!open) return null;

    return (
        // Scrim click closes (only when the click lands on the scrim itself,
        // not something inside the card bubbling up — no separate
        // stopPropagation needed on the card below); role="presentation"
        // keeps this out of jsx-a11y's interactive-element rules, same
        // pattern as ShortcutSheet's scrim.
        <div className="dv-modal-overlay" role="presentation" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="dv-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="dv-signature-modal-title">
                <div className="dv-modal__header">
                    <h3 id="dv-signature-modal-title">Draw Your Signature</h3>
                    <button className="dv-modal__close" onClick={onClose} aria-label="Close signature dialog"><X size={16} /></button>
                </div>
                <div className="dv-modal__body">
                    <canvas
                        ref={sigCanvasRef}
                        width={480}
                        height={200}
                        className="dv-sig-canvas"
                        onPointerDown={handleSigPointerDown}
                        onPointerMove={handleSigPointerMove}
                        onPointerUp={handleSigPointerUp}
                        onPointerCancel={handleSigPointerUp}
                    />
                    <div className="dv-sig-hint">Draw your signature above</div>
                </div>
                <div className="dv-modal__footer">
                    <button className="dv-modal-btn dv-modal-btn--ghost" onClick={clearSignature}>Clear</button>
                    <button className="dv-modal-btn dv-modal-btn--primary" onClick={confirmSignature}>
                        Use Signature
                    </button>
                </div>
            </div>
        </div>
    );
}
