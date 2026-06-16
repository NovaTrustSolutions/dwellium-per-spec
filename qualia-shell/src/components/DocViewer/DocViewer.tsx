import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowUp, Bookmark, Eraser, FileText, Highlighter, Image, Paperclip, PenTool, Pencil, Trash2, X } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import './DocViewer.css';
import { API_BASE } from '../../config';

// ============================================
// TYPES
// ============================================

interface DocFile {
    id: string;
    name: string;
    type: string;
    url?: string;
}

type ToolMode = 'select' | 'text' | 'editText' | 'highlight' | 'draw' | 'shape' | 'signature' | 'stamp';
type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow';
type StampType = 'APPROVED' | 'DRAFT' | 'CONFIDENTIAL' | 'REVIEWED' | 'URGENT' | 'FINAL';
type PreviewMode = 'pdf' | 'text' | 'image' | 'unavailable';

interface Point { x: number; y: number; }

interface Annotation {
    id: string;
    type: 'text' | 'highlight' | 'draw' | 'shape' | 'signature' | 'stamp';
    page: number;
    color: string;
    opacity: number;
    // Text
    text?: string;
    fontSize?: number;
    position?: Point;
    // Highlight / Shape
    rect?: { x: number; y: number; w: number; h: number };
    shapeType?: ShapeType;
    lineWidth?: number;
    // Draw
    points?: Point[];
    // Stamp
    stampType?: StampType;
    // Signature
    signatureData?: Point[][];
}

interface TextItem {
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

interface TextEdit {
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

const API_FILES = `${API_BASE}/api/files`;
const TEXT_FILE_TYPES = new Set(['txt', 'md', 'csv', 'json', 'html']);
const IMAGE_FILE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

const STAMP_COLORS: Record<StampType, string> = {
    APPROVED: '#22c55e',
    DRAFT: '#f59e0b',
    CONFIDENTIAL: '#ef4444',
    REVIEWED: '#3b82f6',
    URGENT: '#dc2626',
    FINAL: '#D6FE51',
};

// ============================================
// COMPONENT
// ============================================

export default function DocViewer() {
    const [files, setFiles] = useState<DocFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [zoom, setZoom] = useState(1.0);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [previewMode, setPreviewMode] = useState<PreviewMode>('unavailable');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewMessage, setPreviewMessage] = useState<string | null>(null);
    const [textContent, setTextContent] = useState('');
    const [textDraft, setTextDraft] = useState('');
    const [savedLocalPath, setSavedLocalPath] = useState<string | null>(null);

    // PDF state
    const [pdfDoc, setPdfDoc] = useState<any>(null);
    const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);

    // Editing state
    const [activeTool, setActiveTool] = useState<ToolMode>('select');
    const [annotations, setAnnotations] = useState<Map<number, Annotation[]>>(new Map());
    const [undoStack, setUndoStack] = useState<Map<number, Annotation[]>[]>([]);
    const [redoStack, setRedoStack] = useState<Map<number, Annotation[]>[]>([]);
    const [drawColor, setDrawColor] = useState('#ef4444');
    const [drawSize, setDrawSize] = useState(3);
    const [fontSize, setFontSize] = useState(16);
    const [selectedShape, setSelectedShape] = useState<ShapeType>('rectangle');
    const [selectedStamp, setSelectedStamp] = useState<StampType>('APPROVED');
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showStampPicker, setShowStampPicker] = useState(false);
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [signatureStrokes, setSignatureStrokes] = useState<Point[][]>([]);
    const [toast, setToast] = useState<string | null>(null);

    // Text editing state
    const [textItems, setTextItems] = useState<TextItem[]>([]);
    const [editingTextItem, setEditingTextItem] = useState<TextItem | null>(null);
    const [editedText, setEditedText] = useState('');
    const [textEdits, setTextEdits] = useState<TextEdit[]>([]);

    // Drawing state
    const [isDrawing, setIsDrawing] = useState(false);
    const [drawStart, setDrawStart] = useState<Point | null>(null);
    const [currentPath, setCurrentPath] = useState<Point[]>([]);

    // Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
    const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const hasDrainedPending = useRef(false);

    // ---- TOAST ----
    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

    // ---- FETCH FILES ----
    useEffect(() => { void fetchDocFiles(); }, []);

    const fetchDocFiles = useCallback(async (): Promise<DocFile[]> => {
        try {
            const res = await fetch(API_FILES);
            const json = await res.json();
            if (json.success) {
                const docs = json.data.filter((f: any) =>
                    ['pdf', 'doc', 'docx', 'txt', 'md', 'csv', 'json', 'html', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(f.type)
                );
                setFiles(docs);
                return docs;
            }
        } catch {
            // Backend unavailable — show empty
        }
        setFiles([]);
        return [];
    }, []);

    // ---- SAVE UNDO STATE ----
    const pushUndo = useCallback(() => {
        const snapshot = new Map<number, Annotation[]>();
        annotations.forEach((v, k) => snapshot.set(k, [...v]));
        setUndoStack(prev => [...prev.slice(-30), snapshot]);
        setRedoStack([]);
    }, [annotations]);

    const undo = useCallback(() => {
        if (undoStack.length === 0) return;
        const current = new Map<number, Annotation[]>();
        annotations.forEach((v, k) => current.set(k, [...v]));
        setRedoStack(prev => [...prev, current]);
        const prev = undoStack[undoStack.length - 1];
        setUndoStack(s => s.slice(0, -1));
        setAnnotations(prev);
    }, [undoStack, annotations]);

    const redo = useCallback(() => {
        if (redoStack.length === 0) return;
        const current = new Map<number, Annotation[]>();
        annotations.forEach((v, k) => current.set(k, [...v]));
        setUndoStack(prev => [...prev, current]);
        const next = redoStack[redoStack.length - 1];
        setRedoStack(s => s.slice(0, -1));
        setAnnotations(next);
    }, [redoStack, annotations]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [undo, redo]);

    const resetDocumentState = useCallback((file: DocFile) => {
        setSelectedFile(file);
        setCurrentPage(1);
        setAnnotations(new Map());
        setUndoStack([]);
        setRedoStack([]);
        setTextItems([]);
        setEditingTextItem(null);
        setEditedText('');
        setTextEdits([]);
        setPdfDoc(null);
        setPdfBytes(null);
        setPreviewMode('unavailable');
        setPreviewUrl(null);
        setPreviewMessage(null);
        setTextContent('');
        setTextDraft('');
        setSavedLocalPath(null);
    }, []);

    // ---- DOCUMENT LOADING ----
    const loadDocument = useCallback(async (file: DocFile) => {
        setIsLoading(true);
        resetDocumentState(file);

        try {
            const url = file.url || `${API_FILES}/${file.id}`;

            if (TEXT_FILE_TYPES.has(file.type)) {
                setPreviewMode('text');
                setTotalPages(1);
                const res = await fetch(`${API_FILES}/${file.id}/preview`);
                const json = await res.json();
                if (!res.ok || !json?.success || json?.data?.previewType !== 'text') {
                    throw new Error(json?.error || `Text preview failed (${res.status})`);
                }
                const content = json.data.content || '';
                setTextContent(content);
                setTextDraft(content);
                setPreviewMessage(json.data.truncated ? 'Preview truncated to first 5,000 characters.' : null);
                setIsLoading(false);
                return;
            }

            if (IMAGE_FILE_TYPES.has(file.type)) {
                setPreviewMode('image');
                setPreviewUrl(url);
                setTotalPages(1);
                setIsLoading(false);
                return;
            }

            setPreviewMode('pdf');
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

            try {
                const pdf = await pdfjsLib.getDocument(url).promise;
                setPdfDoc(pdf);
                setTotalPages(pdf.numPages);

                // Also load as pdf-lib bytes for page manipulation
                const response = await fetch(url);
                const bytes = new Uint8Array(await response.arrayBuffer());
                setPdfBytes(bytes);

                renderPage(pdf, 1, zoom);
            } catch {
                setPdfDoc(null);
                setPdfBytes(null);
                setPreviewMode('unavailable');
                setPreviewUrl(url);
                setPreviewMessage(`Preview not available for .${file.type} files yet. You can still open the original or cache a local copy.`);
            }
        } catch (err) {
            console.error('PDF.js load error:', err);
            setPdfDoc(null);
            setPdfBytes(null);
            setPreviewMode('unavailable');
            setPreviewMessage(err instanceof Error ? err.message : 'Preview unavailable');
        }

        setIsLoading(false);
    }, [resetDocumentState, zoom]);

    // Command Palette deep-link
    const openFileFromPalette = useCallback(async (detail: { fileId?: string; name?: string }) => {
        const { fileId, name } = detail;
        let candidate = files.find(file => (fileId && file.id === fileId) || (name && file.name === name));
        if (!candidate) {
            const refreshed = await fetchDocFiles();
            candidate = refreshed.find(file => (fileId && file.id === fileId) || (name && file.name === name));
        }
        if (candidate) void loadDocument(candidate);
    }, [files, fetchDocFiles, loadDocument]);

    useEffect(() => {
        const onOpenFile = (event: Event) => {
            const detail = (event as CustomEvent<{ fileId?: string; name?: string }>).detail;
            if (!detail?.fileId && !detail?.name) return;
            void openFileFromPalette(detail);
        };
        window.addEventListener('qualia-docviewer-open-file', onOpenFile);
        return () => window.removeEventListener('qualia-docviewer-open-file', onOpenFile);
    }, [openFileFromPalette]);

    // ---- DRAIN PENDING FILE QUEUE ----
    // When DocViewer freshly mounts (cold-open), events may arrive before
    // this component registers its listener. The global queue captures those.
    useEffect(() => {
        if (hasDrainedPending.current || files.length === 0) return;
        hasDrainedPending.current = true;
        const pending = (window as any).__qualiaDocViewerPendingFile;
        if (pending) {
            (window as any).__qualiaDocViewerPendingFile = null;
            void openFileFromPalette(pending);
        }
    }, [files, openFileFromPalette]);

    // ---- RENDER PDF PAGE ----
    const renderPage = async (pdf: any, pageNum: number, zoomLevel: number) => {
        const canvas = canvasRef.current;
        if (!canvas || !pdf) return;

        try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: zoomLevel * 1.5 });
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            await page.render({ canvasContext: ctx, viewport }).promise;

            // Extract text layer for editText mode
            await extractTextLayer(page, viewport);
        } catch {
            renderDemoPage(pageNum);
            setTextItems([]);
        }
    };

    // ---- EXTRACT TEXT LAYER ----
    const extractTextLayer = async (page: any, viewport: any) => {
        try {
            const textContent = await page.getTextContent();
            const items: TextItem[] = [];

            textContent.items.forEach((item: any, index: number) => {
                if (!item.str || item.str.trim() === '') return;

                const tx = item.transform;
                // transform is [scaleX, skewX, skewY, scaleY, translateX, translateY]
                const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);
                const fontSize = fontHeight;

                // Convert PDF coordinates to canvas coordinates via the viewport
                const [x, y] = viewport.convertToViewportPoint(tx[4], tx[5]);

                // Approximate text width using the item width and viewport scale
                const scaleFactor = viewport.scale;
                const textWidth = item.width * scaleFactor;
                const textHeight = fontSize * scaleFactor;

                // Check if this text has been edited
                const existingEdit = textEdits.find(
                    e => e.pageNum === currentPage && e.itemIndex === index
                );

                items.push({
                    str: existingEdit ? existingEdit.newText : item.str,
                    x,
                    y: y - textHeight, // Adjust Y: PDF origin is bottom-left, canvas is top-left
                    width: textWidth,
                    height: textHeight,
                    fontSize,
                    fontFamily: item.fontName || 'sans-serif',
                    transform: tx,
                    itemIndex: index,
                });
            });

            setTextItems(items);
        } catch (err) {
            console.error('Text extraction error:', err);
            setTextItems([]);
        }
    };

    const renderDemoPage = (pageNum: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const scale = zoom * 1.5;
        canvas.width = 612 * scale;
        canvas.height = 792 * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, 80 * scale);
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${20 * scale}px Inter, sans-serif`;
        ctx.fillText(selectedFile?.name || 'Document', 40 * scale, 50 * scale);

        ctx.fillStyle = '#374151';
        ctx.font = `${12 * scale}px Inter, sans-serif`;
        const lines = [
            'MASTER SERVICES AGREEMENT', '',
            `Page ${pageNum} of ${totalPages}`, '',
            'This Agreement is entered into as of the date set forth below,',
            'by and between the parties identified herein.', '',
            'SECTION 1. SCOPE OF SERVICES', '',
            'The Provider shall deliver the services described in Exhibit A,',
            'attached hereto and incorporated herein by reference.', '',
            'All services shall be performed in accordance with industry',
            'standards and applicable regulations.', '',
            'SECTION 2. COMPENSATION', '',
            'Client shall compensate Provider according to the fee schedule',
            'outlined in Exhibit B, with payments due net-30 from invoice date.', '',
            'SECTION 3. TERM AND TERMINATION', '',
            'This Agreement shall commence on the Effective Date and continue',
            'for a period of twelve (12) months unless terminated earlier.',
        ];
        lines.forEach((line, i) => {
            ctx.fillText(line, 40 * scale, (120 + i * 22) * scale);
        });

        ctx.fillStyle = '#9ca3af';
        ctx.font = `${10 * scale}px Inter, sans-serif`;
        ctx.fillText(`— ${pageNum} —`, canvas.width / 2 - 15 * scale, canvas.height - 30 * scale);
    };

    // Re-render on page/zoom change
    useEffect(() => {
        if (previewMode !== 'pdf') return;
        if (pdfDoc) renderPage(pdfDoc, currentPage, zoom);
        else if (selectedFile) renderDemoPage(currentPage);
    }, [currentPage, zoom, pdfDoc, selectedFile, previewMode]);

    // ---- RENDER OVERLAY (ANNOTATIONS) ----
    const renderOverlay = useCallback(() => {
        const overlay = overlayRef.current;
        const base = canvasRef.current;
        if (!overlay || !base) return;

        overlay.width = base.width;
        overlay.height = base.height;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, overlay.width, overlay.height);

        const pageAnnotations = annotations.get(currentPage) || [];
        const scale = zoom * 1.5;

        for (const ann of pageAnnotations) {
            switch (ann.type) {
                case 'text':
                    if (ann.position && ann.text) {
                        ctx.fillStyle = ann.color;
                        ctx.font = `${(ann.fontSize || 16) * scale}px Inter, sans-serif`;
                        ctx.fillText(ann.text, ann.position.x * scale, ann.position.y * scale);
                    }
                    break;

                case 'highlight':
                    if (ann.rect) {
                        ctx.fillStyle = ann.color;
                        ctx.globalAlpha = ann.opacity;
                        ctx.fillRect(
                            ann.rect.x * scale, ann.rect.y * scale,
                            ann.rect.w * scale, ann.rect.h * scale
                        );
                        ctx.globalAlpha = 1;
                    }
                    break;

                case 'draw':
                    if (ann.points && ann.points.length > 1) {
                        ctx.strokeStyle = ann.color;
                        ctx.lineWidth = (ann.lineWidth || 3) * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();
                        ctx.moveTo(ann.points[0].x * scale, ann.points[0].y * scale);
                        for (let i = 1; i < ann.points.length; i++) {
                            ctx.lineTo(ann.points[i].x * scale, ann.points[i].y * scale);
                        }
                        ctx.stroke();
                    }
                    break;

                case 'shape':
                    if (ann.rect) {
                        ctx.strokeStyle = ann.color;
                        ctx.lineWidth = (ann.lineWidth || 2) * scale;
                        const r = ann.rect;
                        if (ann.shapeType === 'rectangle') {
                            ctx.strokeRect(r.x * scale, r.y * scale, r.w * scale, r.h * scale);
                        } else if (ann.shapeType === 'circle') {
                            const cx = (r.x + r.w / 2) * scale;
                            const cy = (r.y + r.h / 2) * scale;
                            const rx = Math.abs(r.w / 2) * scale;
                            const ry = Math.abs(r.h / 2) * scale;
                            ctx.beginPath();
                            ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
                            ctx.stroke();
                        } else if (ann.shapeType === 'line') {
                            ctx.beginPath();
                            ctx.moveTo(r.x * scale, r.y * scale);
                            ctx.lineTo((r.x + r.w) * scale, (r.y + r.h) * scale);
                            ctx.stroke();
                        } else if (ann.shapeType === 'arrow') {
                            const sx = r.x * scale, sy = r.y * scale;
                            const ex = (r.x + r.w) * scale, ey = (r.y + r.h) * scale;
                            ctx.beginPath();
                            ctx.moveTo(sx, sy);
                            ctx.lineTo(ex, ey);
                            ctx.stroke();
                            // Arrowhead
                            const angle = Math.atan2(ey - sy, ex - sx);
                            const headLen = 12 * scale;
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
                    if (ann.position && ann.stampType) {
                        const stampColor = STAMP_COLORS[ann.stampType] || '#ef4444';
                        const stampSize = 28 * scale;
                        ctx.save();
                        ctx.translate(ann.position.x * scale, ann.position.y * scale);
                        ctx.rotate(-0.15);
                        ctx.strokeStyle = stampColor;
                        ctx.lineWidth = 3 * scale;
                        ctx.font = `bold ${stampSize}px Inter, sans-serif`;
                        const textMetrics = ctx.measureText(ann.stampType);
                        const pad = 12 * scale;
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
                    if (ann.position && ann.signatureData) {
                        ctx.save();
                        ctx.translate(ann.position.x * scale, ann.position.y * scale);
                        ctx.strokeStyle = '#1a1a2e';
                        ctx.lineWidth = 2 * scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        for (const stroke of ann.signatureData) {
                            if (stroke.length < 2) continue;
                            ctx.beginPath();
                            ctx.moveTo(stroke[0].x * scale * 0.5, stroke[0].y * scale * 0.5);
                            for (let i = 1; i < stroke.length; i++) {
                                ctx.lineTo(stroke[i].x * scale * 0.5, stroke[i].y * scale * 0.5);
                            }
                            ctx.stroke();
                        }
                        ctx.restore();
                    }
                    break;
            }
        }

        // Draw current in-progress shape/highlight
        if (isDrawing && drawStart && activeTool === 'draw' && currentPath.length > 1) {
            ctx.strokeStyle = drawColor;
            ctx.lineWidth = drawSize * scale;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(currentPath[0].x * scale, currentPath[0].y * scale);
            for (let i = 1; i < currentPath.length; i++) {
                ctx.lineTo(currentPath[i].x * scale, currentPath[i].y * scale);
            }
            ctx.stroke();
        }
    }, [annotations, currentPage, zoom, isDrawing, drawStart, activeTool, currentPath, drawColor, drawSize]);

    useEffect(() => { renderOverlay(); }, [renderOverlay]);

    // ---- TEXT EDITING ----
    const handleTextItemClick = (item: TextItem) => {
        if (activeTool !== 'editText') return;
        setEditingTextItem(item);
        setEditedText(item.str);
    };

    const commitTextEdit = async () => {
        if (!editingTextItem || editedText === editingTextItem.str) {
            setEditingTextItem(null);
            return;
        }

        const scale = zoom * 1.5;
        const edit: TextEdit = {
            pageNum: currentPage,
            itemIndex: editingTextItem.itemIndex,
            originalText: editingTextItem.str,
            newText: editedText,
            x: editingTextItem.x / scale,
            y: editingTextItem.y / scale,
            width: editingTextItem.width / scale,
            height: editingTextItem.height / scale,
            fontSize: editingTextItem.fontSize,
        };

        // Store the edit
        setTextEdits(prev => {
            const filtered = prev.filter(
                e => !(e.pageNum === edit.pageNum && e.itemIndex === edit.itemIndex)
            );
            return [...filtered, edit];
        });

        // Apply the edit to the PDF bytes using pdf-lib
        if (pdfBytes) {
            try {
                const doc = await PDFDocument.load(pdfBytes);
                const page = doc.getPage(currentPage - 1);
                const { height } = page.getSize();
                const font = await doc.embedFont(StandardFonts.Helvetica);

                // Draw a white rectangle over the original text
                const pdfX = editingTextItem.transform[4];
                const pdfY = editingTextItem.transform[5];
                const originalFontSize = edit.fontSize;
                const textWidth = font.widthOfTextAtSize(edit.originalText, originalFontSize);

                page.drawRectangle({
                    x: pdfX - 1,
                    y: pdfY - 2,
                    width: textWidth + 4,
                    height: originalFontSize + 4,
                    color: rgb(1, 1, 1), // white
                });

                // Draw the new text
                page.drawText(editedText, {
                    x: pdfX,
                    y: pdfY,
                    size: originalFontSize,
                    font,
                    color: rgb(0, 0, 0),
                });

                const newBytes = await doc.save();
                setPdfBytes(new Uint8Array(newBytes));

                // Re-load in pdfjs
                const pdfjsLib = await import('pdfjs-dist');
                const newPdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
                setPdfDoc(newPdf);
                await renderPage(newPdf, currentPage, zoom);

                showToast(`Text updated: "${edit.originalText}" → "${editedText}"`);
            } catch (err) {
                console.error('Text edit error:', err);
                showToast('Error applying text edit');
            }
        } else {
            // Demo mode — just update the text items display
            setTextItems(prev =>
                prev.map(ti =>
                    ti.itemIndex === editingTextItem.itemIndex
                        ? { ...ti, str: editedText }
                        : ti
                )
            );
            showToast(`Text updated (demo mode)`);
        }

        setEditingTextItem(null);
    };

    const cancelTextEdit = () => {
        setEditingTextItem(null);
        setEditedText('');
    };

    const handleTextEditKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void commitTextEdit();
        } else if (e.key === 'Escape') {
            cancelTextEdit();
        }
    };

    // ---- MOUSE EVENTS ----
    const getCanvasCoords = (e: React.MouseEvent): Point => {
        const overlay = overlayRef.current;
        if (!overlay) return { x: 0, y: 0 };
        const rect = overlay.getBoundingClientRect();
        const scale = zoom * 1.5;
        return {
            x: (e.clientX - rect.left) / scale,
            y: (e.clientY - rect.top) / scale,
        };
    };

    const addAnnotation = (ann: Annotation) => {
        pushUndo();
        setAnnotations(prev => {
            const next = new Map(prev);
            const pageAnns = [...(next.get(ann.page) || []), ann];
            next.set(ann.page, pageAnns);
            return next;
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (activeTool === 'select' || activeTool === 'editText') return;
        const pos = getCanvasCoords(e);
        setIsDrawing(true);
        setDrawStart(pos);

        if (activeTool === 'draw') {
            setCurrentPath([pos]);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDrawing || !drawStart) return;
        const pos = getCanvasCoords(e);

        if (activeTool === 'draw') {
            setCurrentPath(prev => [...prev, pos]);
        } else if (activeTool === 'highlight' || activeTool === 'shape') {
            // Live preview via overlay re-render
            const overlay = overlayRef.current;
            if (!overlay) return;
            const ctx = overlay.getContext('2d');
            if (!ctx) return;
            renderOverlay();
            const scale = zoom * 1.5;
            const x = Math.min(drawStart.x, pos.x) * scale;
            const y = Math.min(drawStart.y, pos.y) * scale;
            const w = Math.abs(pos.x - drawStart.x) * scale;
            const h = Math.abs(pos.y - drawStart.y) * scale;

            if (activeTool === 'highlight') {
                ctx.fillStyle = drawColor;
                ctx.globalAlpha = 0.3;
                ctx.fillRect(x, y, w, h);
                ctx.globalAlpha = 1;
            } else {
                ctx.strokeStyle = drawColor;
                ctx.lineWidth = drawSize * scale;
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
                    ctx.moveTo(drawStart.x * scale, drawStart.y * scale);
                    ctx.lineTo(pos.x * scale, pos.y * scale);
                    ctx.stroke();
                    if (selectedShape === 'arrow') {
                        const angle = Math.atan2(pos.y - drawStart.y, pos.x - drawStart.x);
                        const headLen = 12 * scale;
                        ctx.beginPath();
                        ctx.moveTo(pos.x * scale, pos.y * scale);
                        ctx.lineTo(pos.x * scale - headLen * Math.cos(angle - Math.PI / 6), pos.y * scale - headLen * Math.sin(angle - Math.PI / 6));
                        ctx.moveTo(pos.x * scale, pos.y * scale);
                        ctx.lineTo(pos.x * scale - headLen * Math.cos(angle + Math.PI / 6), pos.y * scale - headLen * Math.sin(angle + Math.PI / 6));
                        ctx.stroke();
                    }
                }
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (!isDrawing || !drawStart) {
            setIsDrawing(false);
            return;
        }
        const pos = getCanvasCoords(e);

        if (activeTool === 'text') {
            const text = prompt('Enter text:');
            if (text) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'text',
                    page: currentPage,
                    color: drawColor,
                    opacity: 1,
                    text,
                    fontSize,
                    position: pos,
                });
            }
        } else if (activeTool === 'highlight') {
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
                    rect: { x: rx, y: ry, w: rw, h: rh },
                });
            }
        } else if (activeTool === 'draw') {
            if (currentPath.length > 1) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'draw',
                    page: currentPage,
                    color: drawColor,
                    opacity: 1,
                    points: [...currentPath],
                    lineWidth: drawSize,
                });
            }
            setCurrentPath([]);
        } else if (activeTool === 'shape') {
            const rx = Math.min(drawStart.x, pos.x);
            const ry = Math.min(drawStart.y, pos.y);
            const rw = pos.x - drawStart.x;
            const rh = pos.y - drawStart.y;
            if (Math.abs(rw) > 2 || Math.abs(rh) > 2) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'shape',
                    page: currentPage,
                    color: drawColor,
                    opacity: 1,
                    shapeType: selectedShape,
                    rect: selectedShape === 'line' || selectedShape === 'arrow'
                        ? { x: drawStart.x, y: drawStart.y, w: rw, h: rh }
                        : { x: rx, y: ry, w: Math.abs(rw), h: Math.abs(rh) },
                    lineWidth: drawSize,
                });
            }
        } else if (activeTool === 'stamp') {
            addAnnotation({
                id: crypto.randomUUID(),
                type: 'stamp',
                page: currentPage,
                color: STAMP_COLORS[selectedStamp],
                opacity: 0.85,
                stampType: selectedStamp,
                position: pos,
            });
        } else if (activeTool === 'signature') {
            if (signatureStrokes.length > 0) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'signature',
                    page: currentPage,
                    color: '#1a1a2e',
                    opacity: 1,
                    position: pos,
                    signatureData: signatureStrokes,
                });
                showToast('Signature placed');
            } else {
                showToast('Draw a signature first');
                setShowSignatureModal(true);
            }
        }

        setIsDrawing(false);
        setDrawStart(null);
    };

    // ---- PAGE MANIPULATION ----
    const insertPage = async () => {
        if (pdfBytes) {
            try {
                const doc = await PDFDocument.load(pdfBytes);
                const [width, height] = [612, 792];
                doc.insertPage(currentPage, [width, height]); // Insert after current
                const newBytes = await doc.save();
                setPdfBytes(new Uint8Array(newBytes));

                // Re-load in pdfjs
                const pdfjsLib = await import('pdfjs-dist');
                const newPdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
                setPdfDoc(newPdf);
                setTotalPages(newPdf.numPages);
                setCurrentPage(currentPage + 1);
                showToast(`Blank page inserted after page ${currentPage}`);
            } catch (err) {
                console.error('Insert page error:', err);
                showToast('Error inserting page');
            }
        } else {
            // Demo mode
            setTotalPages(prev => prev + 1);
            setCurrentPage(currentPage + 1);
            showToast(`Blank page inserted (demo mode)`);
        }
    };

    const deletePage = async () => {
        if (totalPages <= 1) {
            showToast("Can't delete the only page");
            return;
        }
        if (pdfBytes) {
            try {
                const doc = await PDFDocument.load(pdfBytes);
                doc.removePage(currentPage - 1);
                const newBytes = await doc.save();
                setPdfBytes(new Uint8Array(newBytes));

                const pdfjsLib = await import('pdfjs-dist');
                const newPdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
                setPdfDoc(newPdf);
                setTotalPages(newPdf.numPages);
                if (currentPage > newPdf.numPages) setCurrentPage(newPdf.numPages);
                showToast(`Page ${currentPage} deleted`);
            } catch (err) {
                console.error('Delete page error:', err);
                showToast('Error deleting page');
            }
        } else {
            setTotalPages(prev => Math.max(1, prev - 1));
            if (currentPage > totalPages - 1) setCurrentPage(Math.max(1, totalPages - 1));
            showToast(`Page ${currentPage} deleted (demo mode)`);
        }
    };

    const rotatePage = async (direction: 'cw' | 'ccw') => {
        if (pdfBytes) {
            try {
                const doc = await PDFDocument.load(pdfBytes);
                const page = doc.getPage(currentPage - 1);
                const current = page.getRotation().angle;
                const delta = direction === 'cw' ? 90 : -90;
                page.setRotation(degrees(current + delta));
                const newBytes = await doc.save();
                setPdfBytes(new Uint8Array(newBytes));

                const pdfjsLib = await import('pdfjs-dist');
                const newPdf = await pdfjsLib.getDocument({ data: newBytes }).promise;
                setPdfDoc(newPdf);
                renderPage(newPdf, currentPage, zoom);
                showToast(`Page rotated ${direction === 'cw' ? '90° clockwise' : '90° counter-clockwise'}`);
            } catch (err) {
                console.error('Rotate error:', err);
                showToast('Error rotating page');
            }
        } else {
            showToast(`Rotate ${direction === 'cw' ? 'CW' : 'CCW'} (requires real PDF)`);
        }
    };

    // ---- DOWNLOAD / EXPORT ----
    const buildPdfBytes = useCallback(async (): Promise<Uint8Array> => {
        let doc: PDFDocument;
        if (pdfBytes) {
            doc = await PDFDocument.load(pdfBytes);
        } else {
            doc = await PDFDocument.create();
            for (let i = 0; i < totalPages; i++) {
                doc.addPage([612, 792]);
            }
        }

        const font = await doc.embedFont(StandardFonts.Helvetica);
        const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

        annotations.forEach((pageAnns, pageIdx) => {
            if (pageIdx < 1 || pageIdx > doc.getPageCount()) return;
            const page = doc.getPage(pageIdx - 1);
            const { height } = page.getSize();

            for (const ann of pageAnns) {
                switch (ann.type) {
                    case 'text':
                        if (ann.position && ann.text) {
                            const hexColor = ann.color;
                            const r1 = parseInt(hexColor.slice(1, 3), 16) / 255;
                            const g1 = parseInt(hexColor.slice(3, 5), 16) / 255;
                            const b1 = parseInt(hexColor.slice(5, 7), 16) / 255;
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
                            const hexColor = ann.color;
                            const r1 = parseInt(hexColor.slice(1, 3), 16) / 255;
                            const g1 = parseInt(hexColor.slice(3, 5), 16) / 255;
                            const b1 = parseInt(hexColor.slice(5, 7), 16) / 255;
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
                            const hexColor = ann.color;
                            const r1 = parseInt(hexColor.slice(1, 3), 16) / 255;
                            const g1 = parseInt(hexColor.slice(3, 5), 16) / 255;
                            const b1 = parseInt(hexColor.slice(5, 7), 16) / 255;
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
                            const stampColor = STAMP_COLORS[ann.stampType];
                            const r1 = parseInt(stampColor.slice(1, 3), 16) / 255;
                            const g1 = parseInt(stampColor.slice(3, 5), 16) / 255;
                            const b1 = parseInt(stampColor.slice(5, 7), 16) / 255;
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
                            const hexColor = ann.color;
                            const r1 = parseInt(hexColor.slice(1, 3), 16) / 255;
                            const g1 = parseInt(hexColor.slice(3, 5), 16) / 255;
                            const b1 = parseInt(hexColor.slice(5, 7), 16) / 255;
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
                }
            }
        });

        return new Uint8Array(await doc.save());
    }, [annotations, pdfBytes, totalPages]);

    const materializeLocalCopy = useCallback(async () => {
        if (!selectedFile) return;
        try {
            const res = await fetch(`${API_FILES}/${selectedFile.id}/materialize`, { method: 'POST' });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || `Materialize failed (${res.status})`);
            }
            const localPath = json?.data?.localPath || null;
            setSavedLocalPath(localPath);
            if (localPath) {
                await navigator.clipboard.writeText(localPath).catch(() => {});
                showToast(`Local copy ready: ${localPath}`);
            }
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to cache a local copy');
        }
    }, [selectedFile]);

    const openOriginalFile = useCallback(() => {
        if (!selectedFile) return;
        window.open(`${API_FILES}/${selectedFile.id}`, '_blank', 'noopener');
    }, [selectedFile]);

    const downloadCurrentDocument = async () => {
        if (!selectedFile) return;
        try {
            let blob: Blob;
            if (previewMode === 'pdf') {
                const bytes = await buildPdfBytes();
                blob = new Blob([bytes], { type: 'application/pdf' });
            } else if (previewMode === 'text') {
                blob = new Blob([textDraft], { type: 'text/plain;charset=utf-8' });
            } else {
                openOriginalFile();
                return;
            }

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = selectedFile.name || 'document';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(previewMode === 'pdf' ? 'Document exported' : 'Text document downloaded');
        } catch (err) {
            console.error('Download error:', err);
            showToast('Error exporting document');
        }
    };

    const saveDocumentToQualia = useCallback(async () => {
        if (!selectedFile) return;
        if (previewMode !== 'pdf' && previewMode !== 'text') {
            showToast('Save-back is currently available for PDF and text documents.');
            return;
        }

        setIsSaving(true);
        try {
            const blob = previewMode === 'pdf'
                ? new Blob([await buildPdfBytes()], { type: 'application/pdf' })
                : new Blob([textDraft], { type: 'text/plain;charset=utf-8' });

            const formData = new FormData();
            formData.append('file', blob, selectedFile.name);
            formData.append('changeNote', `Saved from Doc Viewer (${previewMode})`);

            const res = await fetch(`${API_FILES}/${selectedFile.id}/content`, {
                method: 'PUT',
                body: formData,
            });
            const json = await res.json();
            if (!res.ok || !json?.success) {
                throw new Error(json?.error || `Save failed (${res.status})`);
            }

            const updatedFile = json?.data?.file as DocFile | undefined;
            const nextSavedPath = json?.data?.savedPath || null;
            if (updatedFile) {
                setSelectedFile(updatedFile);
                setFiles(prev => prev.map(file => file.id === updatedFile.id ? { ...file, ...updatedFile } : file));
            }
            if (previewMode === 'text') {
                setTextContent(textDraft);
            }
            if (nextSavedPath) {
                setSavedLocalPath(nextSavedPath);
            }
            showToast('Changes saved back into Qualia');
        } catch (err) {
            console.error('Save document error:', err);
            showToast(err instanceof Error ? err.message : 'Failed to save document');
        } finally {
            setIsSaving(false);
        }
    }, [buildPdfBytes, previewMode, selectedFile, textDraft]);

    // ---- SIGNATURE MODAL ----
    const sigDrawingRef = useRef(false);
    const sigCurrentStroke = useRef<Point[]>([]);

    const handleSigMouseDown = (e: React.MouseEvent) => {
        const canvas = sigCanvasRef.current;
        if (!canvas) return;
        sigDrawingRef.current = true;
        const rect = canvas.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        sigCurrentStroke.current = [pt];
    };

    const handleSigMouseMove = (e: React.MouseEvent) => {
        if (!sigDrawingRef.current) return;
        const canvas = sigCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const rect = canvas.getBoundingClientRect();
        const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
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

    const handleSigMouseUp = () => {
        if (sigDrawingRef.current && sigCurrentStroke.current.length > 1) {
            setSignatureStrokes(prev => [...prev, [...sigCurrentStroke.current]]);
        }
        sigDrawingRef.current = false;
        sigCurrentStroke.current = [];
    };

    const clearSignature = () => {
        setSignatureStrokes([]);
        const canvas = sigCanvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const confirmSignature = () => {
        if (signatureStrokes.length === 0) {
            showToast('Please draw your signature first');
            return;
        }
        setShowSignatureModal(false);
        setActiveTool('signature');
        showToast('Click on the page to place your signature');
    };

    // ---- NAVIGATION ----
    const goToPage = (page: number) => {
        const clamped = Math.max(1, Math.min(totalPages, page));
        setCurrentPage(clamped);
    };

    // ---- CLEAR ALL ANNOTATIONS ----
    const clearAnnotations = () => {
        pushUndo();
        setAnnotations(prev => {
            const next = new Map(prev);
            next.set(currentPage, []);
            return next;
        });
        showToast('Annotations cleared for this page');
    };

    // ---- TOOL CONFIG ----
    const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#D6FE51', '#ec4899', '#1a1a2e', '#ffffff'];
    const canEditPdf = previewMode === 'pdf';
    const canSaveBack = previewMode === 'pdf' || previewMode === 'text';
    const isTextDirty = previewMode === 'text' && textDraft !== textContent;

    // ---- RENDER ----
    return (
        <div className="doc-viewer">
            {/* Page Thumbnails */}
            {selectedFile && previewMode === 'pdf' && totalPages > 0 && (
                <div className="dv-nav">
                    {Array.from({ length: totalPages }, (_, i) => (
                        <div key={i + 1}
                            className={`dv-nav__thumb ${currentPage === i + 1 ? 'dv-nav__thumb--active' : ''}`}
                            onClick={() => goToPage(i + 1)}>
                            p.{i + 1}
                        </div>
                    ))}
                    <button className="dv-nav__add-page" onClick={insertPage} title="Insert blank page">
                        +
                    </button>
                </div>
            )}

            {/* Main Area */}
            <div className="dv-main">
                {/* File Toolbar */}
                <div className="dv-toolbar">
                    <select className="dv-toolbar__file-select"
                        value={selectedFile?.id || ''}
                        onChange={(e) => {
                            const file = files.find(f => f.id === e.target.value);
                            if (file) void loadDocument(file);
                        }}>
                        <option value="">Select a document...</option>
                        {files.map(f => (
                            <option key={f.id} value={f.id}>{f.name}</option>
                        ))}
                    </select>

                    {selectedFile && (
                        <>
                            {previewMode === 'pdf' && (
                                <>
                                    <div className="dv-toolbar__page">
                                        <button className="dv-toolbar__btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}>◀</button>
                                        <input className="dv-toolbar__page-input" type="number" value={currentPage}
                                            onChange={e => goToPage(parseInt(e.target.value) || 1)}
                                            min={1} max={totalPages} />
                                        <span>/ {totalPages}</span>
                                        <button className="dv-toolbar__btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>▶</button>
                                    </div>

                                    <div className="dv-zoom">
                                        <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
                                        <span className="dv-zoom__level">{Math.round(zoom * 100)}%</span>
                                        <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
                                    </div>
                                </>
                            )}

                            <button className="dv-toolbar__btn dv-toolbar__btn--download" onClick={downloadCurrentDocument} title="Export current document">
                                Export
                            </button>
                            {canSaveBack && (
                                <button className="dv-toolbar__btn" onClick={() => void saveDocumentToQualia()} disabled={isSaving || (previewMode === 'text' && !isTextDirty)}>
                                    {isSaving ? 'Saving…' : 'Save Back'}
                                </button>
                            )}
                            <button className="dv-toolbar__btn" onClick={() => void materializeLocalCopy()} title="Materialize local copy and copy path">
                                Cache Local
                            </button>
                            <button className="dv-toolbar__btn" onClick={openOriginalFile} title="Open original file route">
                                ↗ Open Original
                            </button>
                        </>
                    )}
                </div>
                {selectedFile && (previewMessage || savedLocalPath) && (
                    <div className="dv-toolbar dv-toolbar--info">
                        {previewMessage && <span className="dv-toolbar__hint">{previewMessage}</span>}
                        {savedLocalPath && <span className="dv-toolbar__hint">Local path: {savedLocalPath}</span>}
                    </div>
                )}

                {/* Editing Toolbar */}
                {selectedFile && canEditPdf && (
                    <div className="dv-edit-toolbar">
                        <div className="dv-edit-toolbar__group">
                            <button className={`dv-edit-btn ${activeTool === 'select' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => { setActiveTool('select'); setEditingTextItem(null); }} title="Select">
                                <span className="dv-edit-btn__icon"><ArrowUp size={14} /></span>
                                <span className="dv-edit-btn__label">Select</span>
                            </button>
                            <button className={`dv-edit-btn ${activeTool === 'editText' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => { setActiveTool('editText'); showToast('Click on any text to edit it'); }} title="Edit Existing Text">
                                <span className="dv-edit-btn__icon"><Pencil size={14} /></span>
                                <span className="dv-edit-btn__label">Edit Text</span>
                            </button>
                            <button className={`dv-edit-btn ${activeTool === 'text' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => setActiveTool('text')} title="Add Text">
                                <span className="dv-edit-btn__icon">T</span>
                                <span className="dv-edit-btn__label">Text</span>
                            </button>
                            <button className={`dv-edit-btn ${activeTool === 'highlight' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => { setActiveTool('highlight'); setDrawColor('#f59e0b'); }} title="Highlight">
                                <span className="dv-edit-btn__icon"><Highlighter size={14} /></span>
                                <span className="dv-edit-btn__label">Highlight</span>
                            </button>
                            <button className={`dv-edit-btn ${activeTool === 'draw' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => setActiveTool('draw')} title="Freehand Draw">
                                <span className="dv-edit-btn__icon"><Pencil size={14} /></span>
                                <span className="dv-edit-btn__label">Draw</span>
                            </button>
                            <button className={`dv-edit-btn ${activeTool === 'shape' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => setActiveTool('shape')} title="Shapes">
                                <span className="dv-edit-btn__icon">▭</span>
                                <span className="dv-edit-btn__label">Shapes</span>
                            </button>
                        </div>

                        <div className="dv-edit-toolbar__divider" />

                        <div className="dv-edit-toolbar__group">
                            <button className={`dv-edit-btn ${activeTool === 'signature' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => {
                                    if (signatureStrokes.length === 0) setShowSignatureModal(true);
                                    else setActiveTool('signature');
                                }} title="Signature">
                                <span className="dv-edit-btn__icon"><PenTool size={14} /></span>
                                <span className="dv-edit-btn__label">Sign</span>
                            </button>
                            <button className={`dv-edit-btn ${activeTool === 'stamp' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => { setActiveTool('stamp'); setShowStampPicker(!showStampPicker); }} title="Stamps">
                                <span className="dv-edit-btn__icon"><Bookmark size={14} /></span>
                                <span className="dv-edit-btn__label">Stamp</span>
                            </button>
                        </div>

                        <div className="dv-edit-toolbar__divider" />

                        <div className="dv-edit-toolbar__group">
                            <button className="dv-edit-btn" onClick={insertPage} title="Insert Blank Page">
                                <span className="dv-edit-btn__icon">+</span>
                                <span className="dv-edit-btn__label">Insert</span>
                            </button>
                            <button className="dv-edit-btn" onClick={deletePage} title="Delete Current Page">
                                <span className="dv-edit-btn__icon"><Trash2 size={14} /></span>
                                <span className="dv-edit-btn__label">Delete</span>
                            </button>
                            <button className="dv-edit-btn" onClick={() => rotatePage('cw')} title="Rotate CW">
                                <span className="dv-edit-btn__icon">↻</span>
                                <span className="dv-edit-btn__label">Rotate</span>
                            </button>
                        </div>

                        <div className="dv-edit-toolbar__divider" />

                        <div className="dv-edit-toolbar__group">
                            <button className="dv-edit-btn" onClick={undo} title="Undo (Ctrl+Z)" disabled={undoStack.length === 0}>
                                <span className="dv-edit-btn__icon">↩</span>
                                <span className="dv-edit-btn__label">Undo</span>
                            </button>
                            <button className="dv-edit-btn" onClick={redo} title="Redo (Ctrl+Shift+Z)" disabled={redoStack.length === 0}>
                                <span className="dv-edit-btn__icon">↪</span>
                                <span className="dv-edit-btn__label">Redo</span>
                            </button>
                            <button className="dv-edit-btn" onClick={clearAnnotations} title="Clear Annotations">
                                <span className="dv-edit-btn__icon"><Eraser size={14} /></span>
                                <span className="dv-edit-btn__label">Clear</span>
                            </button>
                        </div>

                        {/* Color Picker */}
                        {(activeTool === 'text' || activeTool === 'draw' || activeTool === 'highlight' || activeTool === 'shape') && (
                            <div className="dv-edit-toolbar__group dv-color-group">
                                <div className="dv-edit-toolbar__divider" />
                                <button className="dv-edit-btn dv-color-toggle"
                                    onClick={() => setShowColorPicker(!showColorPicker)}
                                    title="Color">
                                    <span className="dv-color-swatch" style={{ background: drawColor }} />
                                </button>
                                {showColorPicker && (
                                    <div className="dv-color-picker">
                                        {COLORS.map(c => (
                                            <button key={c}
                                                className={`dv-color-picker__item ${drawColor === c ? 'dv-color-picker__item--active' : ''}`}
                                                style={{ background: c }}
                                                onClick={() => { setDrawColor(c); setShowColorPicker(false); }}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Size control for draw/shape */}
                        {(activeTool === 'draw' || activeTool === 'shape') && (
                            <div className="dv-edit-toolbar__group">
                                <input type="range" min="1" max="12" value={drawSize}
                                    onChange={e => setDrawSize(parseInt(e.target.value))}
                                    className="dv-size-slider" title={`Size: ${drawSize}`} />
                            </div>
                        )}

                        {/* Font size for text */}
                        {activeTool === 'text' && (
                            <div className="dv-edit-toolbar__group">
                                <input type="number" min="8" max="72" value={fontSize}
                                    onChange={e => setFontSize(parseInt(e.target.value) || 16)}
                                    className="dv-font-size-input" title="Font size" />
                            </div>
                        )}

                        {/* Shape sub-tools */}
                        {activeTool === 'shape' && (
                            <div className="dv-edit-toolbar__group dv-shape-group">
                                <div className="dv-edit-toolbar__divider" />
                                {(['rectangle', 'circle', 'line', 'arrow'] as ShapeType[]).map(s => (
                                    <button key={s}
                                        className={`dv-edit-btn dv-edit-btn--small ${selectedShape === s ? 'dv-edit-btn--active' : ''}`}
                                        onClick={() => setSelectedShape(s)} title={s}>
                                        <span className="dv-edit-btn__icon">
                                            {s === 'rectangle' ? '▭' : s === 'circle' ? '○' : s === 'line' ? '╱' : '→'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Stamp picker */}
                        {showStampPicker && activeTool === 'stamp' && (
                            <div className="dv-stamp-picker">
                                {(Object.keys(STAMP_COLORS) as StampType[]).map(s => (
                                    <button key={s}
                                        className={`dv-stamp-picker__item ${selectedStamp === s ? 'dv-stamp-picker__item--active' : ''}`}
                                        style={{ borderColor: STAMP_COLORS[s], color: STAMP_COLORS[s] }}
                                        onClick={() => { setSelectedStamp(s); setShowStampPicker(false); }}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                {isLoading ? (
                    <div className="dv-loading">
                        <div className="dv-loading__spinner" />
                        Loading document...
                    </div>
                ) : selectedFile && previewMode === 'pdf' ? (
                    <div className="dv-canvas-container" ref={containerRef}>
                        <div className="dv-canvas-wrapper"
                            style={{ cursor: activeTool === 'select' ? 'default' : activeTool === 'text' || activeTool === 'editText' ? 'text' : 'crosshair' }}>
                            <canvas ref={canvasRef} />
                            <canvas ref={overlayRef} className="dv-overlay-canvas"
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={() => { if (isDrawing) { setIsDrawing(false); setDrawStart(null); } }}
                            />

                            {/* Text Layer — visible in editText mode */}
                            {activeTool === 'editText' && textItems.length > 0 && (
                                <div className="dv-text-layer" style={{
                                    width: canvasRef.current?.width || 0,
                                    height: canvasRef.current?.height || 0,
                                }}>
                                    {textItems.map((item, idx) => (
                                        <span
                                            key={`text-${item.itemIndex}-${idx}`}
                                            className={`dv-text-item ${editingTextItem?.itemIndex === item.itemIndex ? 'dv-text-item--editing' : ''
                                                } ${textEdits.some(e => e.pageNum === currentPage && e.itemIndex === item.itemIndex) ? 'dv-text-item--edited' : ''
                                                }`}
                                            style={{
                                                left: `${item.x}px`,
                                                top: `${item.y}px`,
                                                width: `${item.width}px`,
                                                height: `${item.height}px`,
                                                fontSize: `${item.height * 0.85}px`,
                                            }}
                                            onClick={() => handleTextItemClick(item)}
                                            title={`Click to edit: "${item.str}"`}
                                        >
                                            {item.str}
                                        </span>
                                    ))}

                                    {/* Inline Text Editor */}
                                    {editingTextItem && (
                                        <div className="dv-text-editor-container" style={{
                                            left: `${editingTextItem.x}px`,
                                            top: `${editingTextItem.y - 4}px`,
                                        }}>
                                            <input
                                                className="dv-text-editor-input"
                                                type="text"
                                                value={editedText}
                                                onChange={e => setEditedText(e.target.value)}
                                                onKeyDown={handleTextEditKeyDown}
                                                onBlur={() => void commitTextEdit()}
                                                autoFocus
                                                style={{
                                                    fontSize: `${editingTextItem.height * 0.85}px`,
                                                    minWidth: `${Math.max(editingTextItem.width, 120)}px`,
                                                }}
                                            />
                                            <div className="dv-text-editor-hint">
                                                Enter to save · Esc to cancel
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                ) : selectedFile && previewMode === 'text' ? (
                    <div className="dv-text-preview">
                        <div className="dv-text-preview__meta">
                            <span>{selectedFile.name}</span>
                            <span>{textDraft.length.toLocaleString()} chars</span>
                            {isTextDirty && <span className="dv-text-preview__dirty">Unsaved changes</span>}
                        </div>
                        <textarea
                            className="dv-text-preview__editor"
                            value={textDraft}
                            onChange={(e) => setTextDraft(e.target.value)}
                            spellCheck={false}
                        />
                    </div>
                ) : selectedFile && previewMode === 'image' ? (
                    <div className="dv-image-preview">
                        {previewUrl ? (
                            <img
                                className="dv-image-preview__img"
                                src={previewUrl}
                                alt={selectedFile.name}
                                style={{ transform: `scale(${zoom})` }}
                            />
                        ) : (
                            <div className="dv-empty">
                                <span className="dv-empty__icon"><Image size={14} /></span>
                                <span className="dv-empty__text">Image preview unavailable</span>
                            </div>
                        )}
                    </div>
                ) : selectedFile ? (
                    <div className="dv-empty">
                        <span className="dv-empty__icon"><Paperclip size={14} /></span>
                        <span className="dv-empty__text">This file opens in the Docs workspace, but inline preview is not ready yet.</span>
                        <span className="dv-empty__hint">Use Cache Local to get a local copy path or Open Original to use the raw file.</span>
                    </div>
                ) : (
                    <div className="dv-empty">
                        <span className="dv-empty__icon"><FileText size={14} /></span>
                        <span className="dv-empty__text">Select a document to view</span>
                        <span className="dv-empty__hint">Supports PDF, text, JSON, HTML, and image previews</span>
                    </div>
                )}
            </div>

            {/* Signature Modal */}
            {showSignatureModal && (
                <div className="dv-modal-overlay" onClick={() => setShowSignatureModal(false)}>
                    <div className="dv-modal" onClick={e => e.stopPropagation()}>
                        <div className="dv-modal__header">
                            <h3>Draw Your Signature</h3>
                            <button className="dv-modal__close" onClick={() => setShowSignatureModal(false)}><X size={16} /></button>
                        </div>
                        <div className="dv-modal__body">
                            <canvas
                                ref={sigCanvasRef}
                                width={480}
                                height={200}
                                className="dv-sig-canvas"
                                onMouseDown={handleSigMouseDown}
                                onMouseMove={handleSigMouseMove}
                                onMouseUp={handleSigMouseUp}
                                onMouseLeave={handleSigMouseUp}
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
            )}

            {/* Toast */}
            {toast && (
                <div className="dv-toast">{toast}</div>
            )}
        </div>
    );
}
