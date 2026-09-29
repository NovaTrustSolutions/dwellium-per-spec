/**
 * DocViewer — shared types.
 *
 * Extracted from DocViewer.tsx (P0 item 5 module split) so pure helpers
 * (annotationModel.ts, pdfBake.ts, useAnnotationHistory.ts) can depend on
 * them without importing the component itself.
 */

export interface DocFile {
    id: string;
    name: string;
    type: string;
    url?: string;
    // 16d: the file's own size (bytes)/updatedAt as the backend's GET
    // /api/files reports it — the fingerprint a draft is checked against
    // (useAnnotationDrafts.ts). Optional: older callers / test fixtures that
    // build a DocFile by hand don't need to carry these.
    size?: number;
    updatedAt?: string;
}

export type ToolMode = 'select' | 'text' | 'editText' | 'highlight' | 'draw' | 'shape' | 'signature' | 'stamp';
export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow';
export type StampType = 'APPROVED' | 'DRAFT' | 'CONFIDENTIAL' | 'REVIEWED' | 'URGENT' | 'FINAL';
export type PreviewMode = 'pdf' | 'text' | 'image' | 'unavailable';

export interface Point { x: number; y: number; }

export interface Rect { x: number; y: number; w: number; h: number; }

export interface Annotation {
    id: string;
    type: 'text' | 'highlight' | 'draw' | 'shape' | 'signature' | 'stamp';
    page: number;
    color: string;
    opacity: number;
    // Text
    text?: string;
    fontSize?: number;
    position?: Point;
    // Highlight / Shape / Signature bounding box
    rect?: Rect;
    shapeType?: ShapeType;
    lineWidth?: number;
    // Draw
    points?: Point[];
    // Stamp
    stampType?: StampType;
    // Signature — normalized (annotation-space, absolute) strokes; see
    // annotationModel.normalizeSignatureStrokes. NOT raw modal-pixel coords.
    signatureData?: Point[][];
    // P1 item 6: the page's /Rotate value (degrees, clockwise-on-display) at
    // the moment this annotation was created. 'text'/'stamp' bake counter-
    // rotated by this so they read upright in the page's displayed
    // orientation regardless of later rotate operations. Geometry-only types
    // (highlight/shape/draw/signature) don't need it — their PDF-space
    // coordinates already encode the rotation they were placed under.
    rotation?: number;
}

/** Page-keyed annotations. Page numbers are 1-based. */
export type AnnotationMap = Map<number, Annotation[]>;

export interface TextItem {
    str: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
    fontFamily: string;
    transform: number[];
    itemIndex: number;
    // P1 audit #14: the pdf.js text item's own width in PDF (unscaled) units
    // — `width` above is scaled to viewport/CSS pixels for on-screen
    // positioning. The text-edit white-out must size itself from THIS, not
    // from Helvetica glyph metrics for whatever font the document actually
    // used (the old bug: wide-font text left visible tails).
    pdfWidth: number;
}

export interface TextEdit {
    pageNum: number;
    itemIndex: number;
    originalText: string;
    newText: string;
    x: number;
    y: number;
    width: number;
    height: number;
    fontSize: number;
}

export const STAMP_COLORS: Record<StampType, string> = {
    APPROVED: '#22c55e',
    DRAFT: '#f59e0b',
    CONFIDENTIAL: '#ef4444',
    REVIEWED: '#3b82f6',
    URGENT: '#dc2626',
    FINAL: '#D6FE51',
};
