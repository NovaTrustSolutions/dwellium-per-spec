/**
 * DocViewer — bake annotations into real PDF bytes with pdf-lib.
 *
 * Pure / node-testable: no DOM, no canvas. Extracted from DocViewer's old
 * inline `buildPdfBytes` (P0 item 5 module split).
 *
 * P0 item 1: adds the missing `case 'signature'` — previously Sign → Save
 * Back produced a PDF with no signature at all. Draws each stroke the same
 * way `case 'draw'` does (line segments in PDF-point space, y flipped),
 * because normalizeSignatureStrokes (annotationModel.ts) already put the
 * signature's points in that same absolute annotation-space the overlay
 * uses — no separate scaling here, so overlay and bake agree by construction.
 *
 * P0 item 3: throws on empty pdfBytes instead of silently fabricating a
 * blank multi-page document (the old `renderDemoPage`-adjacent fallback).
 * Callers must refuse to export/save when there is no real document loaded.
 */
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Annotation, AnnotationMap } from './docViewerTypes';
import { STAMP_COLORS } from './docViewerTypes';

function hexToRgbTuple(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return [Number.isFinite(r) ? r : 0, Number.isFinite(g) ? g : 0, Number.isFinite(b) ? b : 0];
}

export async function bakeAnnotations(pdfBytes: Uint8Array, annotations: AnnotationMap): Promise<Uint8Array> {
    if (!pdfBytes || pdfBytes.length === 0) {
        throw new Error('bakeAnnotations: no PDF bytes loaded — refusing to bake onto a non-existent document');
    }

    const doc = await PDFDocument.load(pdfBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    annotations.forEach((pageAnns: Annotation[], pageIdx: number) => {
        if (pageIdx < 1 || pageIdx > doc.getPageCount()) return;
        const page = doc.getPage(pageIdx - 1);
        const { height } = page.getSize();

        for (const ann of pageAnns) {
            switch (ann.type) {
                case 'text':
                    if (ann.position && ann.text) {
                        const [r1, g1, b1] = hexToRgbTuple(ann.color);
                        page.drawText(ann.text, {
                            x: ann.position.x,
                            y: height - ann.position.y,
                            size: ann.fontSize || 16,
                            font,
                            color: rgb(r1, g1, b1),
                        });
                    }
                    break;

                case 'highlight':
                    if (ann.rect) {
                        const [r1, g1, b1] = hexToRgbTuple(ann.color);
                        page.drawRectangle({
                            x: ann.rect.x,
                            y: height - ann.rect.y - ann.rect.h,
                            width: ann.rect.w,
                            height: ann.rect.h,
                            color: rgb(r1, g1, b1),
                            opacity: ann.opacity,
                        });
                    }
                    break;

                case 'shape':
                    if (ann.rect) {
                        const [r1, g1, b1] = hexToRgbTuple(ann.color);
                        const borderColor = rgb(r1, g1, b1);
                        if (ann.shapeType === 'rectangle') {
                            page.drawRectangle({
                                x: ann.rect.x,
                                y: height - ann.rect.y - ann.rect.h,
                                width: ann.rect.w,
                                height: ann.rect.h,
                                borderColor,
                                borderWidth: ann.lineWidth || 2,
                            });
                        } else if (ann.shapeType === 'circle') {
                            page.drawEllipse({
                                x: ann.rect.x + ann.rect.w / 2,
                                y: height - ann.rect.y - ann.rect.h / 2,
                                xScale: ann.rect.w / 2,
                                yScale: ann.rect.h / 2,
                                borderColor,
                                borderWidth: ann.lineWidth || 2,
                            });
                        } else if (ann.shapeType === 'line' || ann.shapeType === 'arrow') {
                            page.drawLine({
                                start: { x: ann.rect.x, y: height - ann.rect.y },
                                end: { x: ann.rect.x + ann.rect.w, y: height - ann.rect.y - ann.rect.h },
                                color: borderColor,
                                thickness: ann.lineWidth || 2,
                            });
                        }
                    }
                    break;

                case 'stamp':
                    if (ann.position && ann.stampType) {
                        const [r1, g1, b1] = hexToRgbTuple(STAMP_COLORS[ann.stampType]);
                        page.drawText(ann.stampType, {
                            x: ann.position.x,
                            y: height - ann.position.y,
                            size: 28,
                            font: boldFont,
                            color: rgb(r1, g1, b1),
                            opacity: 0.85,
                        });
                    }
                    break;

                case 'draw':
                    if (ann.points && ann.points.length > 1) {
                        const [r1, g1, b1] = hexToRgbTuple(ann.color);
                        for (let i = 0; i < ann.points.length - 1; i++) {
                            page.drawLine({
                                start: { x: ann.points[i].x, y: height - ann.points[i].y },
                                end: { x: ann.points[i + 1].x, y: height - ann.points[i + 1].y },
                                color: rgb(r1, g1, b1),
                                thickness: ann.lineWidth || 3,
                            });
                        }
                    }
                    break;

                case 'signature':
                    if (ann.signatureData) {
                        const [r1, g1, b1] = hexToRgbTuple(ann.color || '#1a1a2e');
                        for (const stroke of ann.signatureData) {
                            for (let i = 0; i < stroke.length - 1; i++) {
                                page.drawLine({
                                    start: { x: stroke[i].x, y: height - stroke[i].y },
                                    end: { x: stroke[i + 1].x, y: height - stroke[i + 1].y },
                                    color: rgb(r1, g1, b1),
                                    thickness: 2,
                                });
                            }
                        }
                    }
                    break;
            }
        }
    });

    return new Uint8Array(await doc.save());
}
