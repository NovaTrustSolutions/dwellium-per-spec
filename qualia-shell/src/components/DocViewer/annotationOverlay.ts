/**
 * DocViewer — pure canvas drawing for the annotation overlay (P2 item 11
 * module split, pulled out of DocViewer.tsx's `renderOverlay`). No React, no
 * refs of its own — takes an already-cleared/DPR-scaled 2D context plus the
 * exact bits of component state the original inline function closed over,
 * and draws. See DocViewer.tsx's `renderOverlay` for the DPR/clear setup
 * this is called from.
 *
 * P1 item 6: committed annotations are stored in PDF user space and
 * converted to viewport (CSS-pixel) space with the SAME live viewport
 * pdfBake will (conceptually) invert — pdfCoords.ts is the one place that
 * math lives. The in-progress preview (isDrawing) is still tracked in
 * viewport space directly (nothing to convert, not yet an Annotation), so it
 * draws with no scaling at all.
 */
import type { Annotation, Point, ToolMode } from './docViewerTypes';
import { STAMP_COLORS } from './docViewerTypes';
import * as pdfCoords from './pdfCoords';
import type { ViewportLike } from './pdfCoords';

export interface OverlayViewport extends ViewportLike {
    scale?: number;
}

export interface DrawAnnotationOverlayParams {
    /** Already filtered to the current page. */
    pageAnnotations: Annotation[];
    viewport: OverlayViewport | null;
    /** In-progress freehand draw preview (not yet a committed Annotation). */
    isDrawing: boolean;
    drawStart: Point | null;
    activeTool: ToolMode;
    currentPath: Point[];
    drawColor: string;
    drawSize: number;
}

export function drawAnnotationOverlay(ctx: CanvasRenderingContext2D, params: DrawAnnotationOverlayParams): void {
    const { pageAnnotations, viewport, isDrawing, drawStart, activeTool, currentPath, drawColor, drawSize } = params;

    // R3 (adversarial review of P1 item 6): converting ANN POSITIONS through
    // pdfCoords already accounts for zoom (baked into the viewport's own
    // transform) — but every drawn SIZE (font size, line width, arrowhead
    // length, stamp padding) is a raw CSS-pixel value from the Annotation,
    // with no equivalent multiplication. Pre-P1 it was `* scale` where
    // `scale = zoom * 1.5`; that got dropped instead of replaced with
    // `* viewport.scale` (pdf.js's own viewport already carries that same
    // zoom*1.5 as its `scale`), so annotations stopped growing/shrinking
    // with the page at non-default zoom.
    const vscale = viewport?.scale ?? 1;

    for (const ann of pageAnnotations) {
        switch (ann.type) {
            case 'text':
                if (ann.position && ann.text && viewport) {
                    const p = pdfCoords.pdfToViewport(viewport, ann.position.x, ann.position.y);
                    ctx.fillStyle = ann.color;
                    ctx.font = `${(ann.fontSize || 16) * vscale}px Inter, sans-serif`;
                    ctx.fillText(ann.text, p.x, p.y);
                }
                break;

            case 'highlight':
                if (ann.rect && viewport) {
                    const r = pdfCoords.pdfRectToViewportRect(viewport, ann.rect);
                    ctx.fillStyle = ann.color;
                    ctx.globalAlpha = ann.opacity;
                    ctx.fillRect(r.x, r.y, r.w, r.h);
                    ctx.globalAlpha = 1;
                }
                break;

            case 'draw':
                if (ann.points && ann.points.length > 1 && viewport) {
                    const pts = ann.points.map(p => pdfCoords.pdfToViewport(viewport, p.x, p.y));
                    ctx.strokeStyle = ann.color;
                    ctx.lineWidth = (ann.lineWidth || 3) * vscale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                    ctx.stroke();
                }
                break;

            case 'shape':
                if (ann.rect && viewport) {
                    const r = pdfCoords.pdfRectToViewportRect(viewport, ann.rect);
                    ctx.strokeStyle = ann.color;
                    ctx.lineWidth = (ann.lineWidth || 2) * vscale;
                    if (ann.shapeType === 'rectangle') {
                        ctx.strokeRect(r.x, r.y, r.w, r.h);
                    } else if (ann.shapeType === 'circle') {
                        const cx = r.x + r.w / 2;
                        const cy = r.y + r.h / 2;
                        const rx = Math.abs(r.w / 2);
                        const ry = Math.abs(r.h / 2);
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                        ctx.stroke();
                    } else if (ann.shapeType === 'line') {
                        ctx.beginPath();
                        ctx.moveTo(r.x, r.y);
                        ctx.lineTo(r.x + r.w, r.y + r.h);
                        ctx.stroke();
                    } else if (ann.shapeType === 'arrow') {
                        const sx = r.x, sy = r.y;
                        const ex = r.x + r.w, ey = r.y + r.h;
                        ctx.beginPath();
                        ctx.moveTo(sx, sy);
                        ctx.lineTo(ex, ey);
                        ctx.stroke();
                        // Arrowhead
                        const angle = Math.atan2(ey - sy, ex - sx);
                        const headLen = 12 * vscale;
                        ctx.beginPath();
                        ctx.moveTo(ex, ey);
                        ctx.lineTo(ex - headLen * Math.cos(angle - Math.PI / 6), ey - headLen * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(ex, ey);
                        ctx.lineTo(ex - headLen * Math.cos(angle + Math.PI / 6), ey - headLen * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();
                    }
                }
                break;

            case 'stamp':
                if (ann.position && ann.stampType && viewport) {
                    const p = pdfCoords.pdfToViewport(viewport, ann.position.x, ann.position.y);
                    const stampColor = STAMP_COLORS[ann.stampType] || '#ef4444';
                    const stampSize = 28 * vscale;
                    ctx.save();
                    ctx.translate(p.x, p.y);
                    ctx.rotate(-0.15);
                    ctx.strokeStyle = stampColor;
                    ctx.lineWidth = 3 * vscale;
                    ctx.font = `bold ${stampSize}px Inter, sans-serif`;
                    const textMetrics = ctx.measureText(ann.stampType);
                    const pad = 12 * vscale;
                    ctx.strokeRect(
                        -pad, -stampSize - pad / 2,
                        textMetrics.width + pad * 2, stampSize + pad
                    );
                    ctx.fillStyle = stampColor;
                    ctx.globalAlpha = 0.85;
                    ctx.fillText(ann.stampType, 0, 0);
                    ctx.globalAlpha = 1;
                    ctx.restore();
                }
                break;

            case 'signature':
                // signatureData is PDF-space (normalizeSignatureStrokes'
                // viewport-space output is converted at placement time — see
                // DocViewer's handlePointerUp 'signature' branch); bake
                // (pdfBake.ts) draws the SAME points with no further
                // conversion, so overlay and bake agree by construction.
                if (ann.signatureData && viewport) {
                    ctx.strokeStyle = ann.color || '#1a1a2e';
                    ctx.lineWidth = 2 * vscale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    for (const stroke of ann.signatureData) {
                        if (stroke.length < 2) continue;
                        const pts = stroke.map(p => pdfCoords.pdfToViewport(viewport, p.x, p.y));
                        ctx.beginPath();
                        ctx.moveTo(pts[0].x, pts[0].y);
                        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                        ctx.stroke();
                    }
                }
                break;
        }
    }

    // Draw current in-progress shape/highlight — still viewport-space (not
    // committed as an Annotation yet), so no conversion needed for POSITION,
    // but the stroke width still needs the same * vscale as the committed
    // 'draw' case above, or the live preview looks a different thickness
    // than what gets committed a moment later.
    if (isDrawing && drawStart && activeTool === 'draw' && currentPath.length > 1) {
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = drawSize * vscale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for (let i = 1; i < currentPath.length; i++) {
            ctx.lineTo(currentPath[i].x, currentPath[i].y);
        }
        ctx.stroke();
    }
}
