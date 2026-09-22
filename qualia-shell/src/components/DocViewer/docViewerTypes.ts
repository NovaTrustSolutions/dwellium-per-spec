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
