import { useState, useRef, useEffect, useCallback } from 'react';
import { ArrowRight, ArrowUp, Bookmark, ChevronLeft, ChevronRight, Circle, Download, Eraser, ExternalLink, FileText, Highlighter, Image, Minus, Paperclip, PenTool, Pencil, Plus, Redo2, RotateCw, Save, Square, Trash2, Undo2, X } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import './DocViewer.css';
import { API_BASE } from '../../config';
import type {
    DocFile, ToolMode, ShapeType, StampType, PreviewMode, Point,
    Annotation, AnnotationMap, TextItem, TextEdit,
} from './docViewerTypes';
import { STAMP_COLORS } from './docViewerTypes';
import {
    shiftAnnotationsForInsert, shiftAnnotationsForDelete,
    shiftTextEditsForInsert, shiftTextEditsForDelete,
    normalizeSignatureStrokes,
} from './annotationModel';
import { bakeAnnotations } from './pdfBake';
import { useAnnotationHistory, type DocSnapshot } from './useAnnotationHistory';
import { usePdfDocument } from './usePdfDocument';
import type { ViewportLike } from './pdfCoords';
import * as pdfCoords from './pdfCoords';

// ============================================
// TYPES — see docViewerTypes.ts for the shared shapes; ToolMode/ShapeType/
// StampType/PreviewMode/Point/Annotation/AnnotationMap/TextItem/TextEdit
// and STAMP_COLORS are imported above.
// ============================================

const API_FILES = `${API_BASE}/api/files`;
const TEXT_FILE_TYPES = new Set(['txt', 'md', 'csv', 'json', 'html']);
const IMAGE_FILE_TYPES = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);
/** Everything that isn't text/image is attempted as a PDF (P1 N1: needed to
 * decide whether to keep the canvas mounted while that attempt is loading). */
const isPdfAttemptType = (type: string) => !TEXT_FILE_TYPES.has(type) && !IMAGE_FILE_TYPES.has(type);
// Text Save Back must never PUT a truncated body (audit finding #2). Above
// this cap the file opens read-only instead of silently truncating.
const TEXT_CONTENT_CAP_BYTES = 2 * 1024 * 1024;
// Width (annotation-space units) a placed signature is scaled to.
const SIGNATURE_TARGET_WIDTH = 160;

// ============================================
// COMPONENT
// ============================================

export default function DocViewer() {
    const [files, setFiles] = useState<DocFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<DocFile | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [zoom, setZoom] = useState(1.0);
    // R2 (adversarial review): reloadPdfFromBytes is a plain closure
    // recreated every render, but applySnapshot (a useCallback keyed only on
    // currentPage) can hold onto a STALE reloadPdfFromBytes from a render
    // where `zoom` was old — undo/redo after a zoom change (with no page
    // change) then renders the restored page at the wrong scale. A ref
    // always reads the live value regardless of which render's closure is
    // executing, with no dependency-array changes needed.
    const zoomRef = useRef(zoom);
    zoomRef.current = zoom;
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [previewMode, setPreviewMode] = useState<PreviewMode>('unavailable');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [previewMessage, setPreviewMessage] = useState<string | null>(null);
    const [textContent, setTextContent] = useState('');
    const [textDraft, setTextDraft] = useState('');
    const [textReadOnly, setTextReadOnly] = useState(false);
    const [savedLocalPath, setSavedLocalPath] = useState<string | null>(null);

    // PDF state — lifecycle (sequence token + destroy()) owned by
    // usePdfDocument (P1 item 7). `pdfDoc`/`pdfBytes` alias its state so the
    // rest of the component reads them exactly as before.
    const pdfLifecycle = usePdfDocument();
    const pdfDoc = pdfLifecycle.doc;
    const pdfBytes = pdfLifecycle.bytes;
    // True once annotations/text edits/byte mutations have happened since
    // load or the last successful Save Back (P0 item 3 dirty flag).
    const [pdfDirty, setPdfDirty] = useState(false);
    const [renderError, setRenderError] = useState<string | null>(null);
    // Destroy on unmount (P1 item 7 / audit #11: pdf.js docs never destroyed).
    // pdfLifecycle.destroy is useCallback-stable, so this effect body only
    // ever runs its cleanup once, on unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => () => pdfLifecycle.destroy(), [pdfLifecycle.destroy]);

    // Editing state
    const [activeTool, setActiveTool] = useState<ToolMode>('select');
    const [annotations, setAnnotations] = useState<AnnotationMap>(new Map());
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
    // P1 item 6: the live pdf.js viewport for the currently-rendered page —
    // the ONE thing pointer math (getCanvasCoords), overlay rendering and
    // annotation-commit coordinate conversion all read, via pdfCoords.ts.
    // A ref (not state): it's written synchronously in renderPage, before
    // renderPage's OWN state updates (setTextItems, setRenderVersion) cause
    // the re-render that reads it — so it's always fresh by the time it's read.
    const viewportRef = useRef<(ViewportLike & { width?: number; height?: number; scale?: number }) | null>(null);
    // N1 (found live): bumped every time renderPage finishes successfully.
    // renderOverlay depends on it instead of `zoom` directly, so it reliably
    // redraws after ANY change that produces a new viewport (zoom, rotate,
    // page nav, insert/delete, undo/redo) rather than only a zoom change.
    const [renderVersion, setRenderVersion] = useState(0);
    // N1: flips true the instant the base canvas DOM node mounts, so the
    // page-1-on-open render effect can depend on "is the canvas actually
    // there yet" instead of racing isLoading.
    const [canvasMounted, setCanvasMounted] = useState(false);
    const setCanvasNode = useCallback((el: HTMLCanvasElement | null) => {
        canvasRef.current = el;
        setCanvasMounted(!!el);
    }, []);

    // ---- TOAST ----
    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 2500);
    };

    // ---- HISTORY (undo/redo covering annotations + text edits + pdf bytes) ----
    const history = useAnnotationHistory(showToast);

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
    // Call BEFORE mutating annotations/textEdits/pdfBytes. bytesChanged tells
    // the history hook whether this step touched pdfBytes (insert/delete/
    // rotate page, baked text edit) vs annotations only.
    const pushUndo = useCallback((bytesChanged: boolean) => {
        history.pushHistory({ annotations, textEdits, pdfBytes }, bytesChanged);
    }, [history, annotations, textEdits, pdfBytes]);

    const applySnapshot = useCallback(async (snap: DocSnapshot) => {
        setAnnotations(snap.annotations);
        setTextEdits(snap.textEdits);
        if (snap.pdfBytes) {
            await reloadPdfFromBytes(snap.pdfBytes, currentPage);
        }
        setPdfDirty(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentPage]);

    const undo = useCallback(() => {
        const restored = history.undo({ annotations, textEdits, pdfBytes });
        if (restored) void applySnapshot(restored);
    }, [history, annotations, textEdits, pdfBytes, applySnapshot]);

    const redo = useCallback(() => {
        const restored = history.redo({ annotations, textEdits, pdfBytes });
        if (restored) void applySnapshot(restored);
    }, [history, annotations, textEdits, pdfBytes, applySnapshot]);

    // P1 item 9: Cmd/Ctrl+Z / Shift+Z is a native listener scoped to the
    // viewer root element (rootRef), not `window` — it used to hijack Cmd+Z
    // inside the text textarea and block native undo there. A native
    // addEventListener (rather than a JSX onKeyDown prop) also keeps this
    // div out of jsx-a11y/no-static-element-interactions: it isn't acting as
    // a fake interactive widget, it's a scroll/event boundary that ignores
    // the shortcut whenever focus is in an input/textarea/select/
    // contenteditable descendant.
    const rootRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const handler = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const tag = target?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(); else undo();
            }
        };
        el.addEventListener('keydown', handler);
        return () => el.removeEventListener('keydown', handler);
    }, [undo, redo]);

    const resetDocumentState = useCallback((file: DocFile) => {
        setSelectedFile(file);
        setCurrentPage(1);
        // P1 item 7: reset totalPages too (audit #16) — otherwise the page
        // nav briefly shows the PREVIOUS file's page count while the new one
        // loads (or permanently, if the new file fails to produce a count).
        setTotalPages(0);
        setAnnotations(new Map());
        setTextItems([]);
        setEditingTextItem(null);
        setEditedText('');
        setTextEdits([]);
        pdfLifecycle.destroy();
        viewportRef.current = null;
        // R4 (adversarial review of N1): N1 deliberately keeps the canvas
        // CONTAINER mounted across a file switch (so the effect that draws
        // page 1 can depend on canvasMounted) — but that also kept the
        // PREVIOUS file's rendered bitmap sitting in the canvas while the new
        // file loads, bleeding through the translucent/blurred loading
        // spinner. Clearing the bitmap here (same technique renderPage's own
        // error path already uses) means the loading window shows nothing
        // stale, not a dimmed ghost of the last document.
        if (canvasRef.current) {
            canvasRef.current.width = 0;
            canvasRef.current.height = 0;
        }
        setPdfDirty(false);
        setRenderError(null);
        setPreviewMode('unavailable');
        setPreviewUrl(null);
        setPreviewMessage(null);
        setTextContent('');
        setTextDraft('');
        setTextReadOnly(false);
        setSavedLocalPath(null);
        history.reset();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pdfLifecycle.destroy]);

    // P1 item 7 (audit #10): a sequence token at the loadDocument level too —
    // pdfLifecycle's own token stops a stale PDF doc/bytes from winning, but
    // an outer token is what lets a superseded call's continuation skip
    // touching isLoading/previewMode/etc at all, so it can never flicker the
    // UI back to a half-reset state after a newer load has already painted.
    const loadSeqRef = useRef(0);

    // ---- DOCUMENT LOADING ----
    const loadDocument = useCallback(async (file: DocFile) => {
        const mySeq = ++loadSeqRef.current;
        const stale = () => mySeq !== loadSeqRef.current;
        setIsLoading(true);
        resetDocumentState(file);

        try {
            const url = file.url || `${API_FILES}/${file.id}`;

            if (TEXT_FILE_TYPES.has(file.type)) {
                setPreviewMode('text');
                setTotalPages(1);
                // P0 item 2: load the FULL body (never the truncated /preview
                // route) and PUT it back only when it's under the cap.
                try {
                    const res = await fetch(`${API_FILES}/${file.id}`);
                    if (!res.ok) throw new Error(`Could not load file (${res.status})`);
                    const declaredSize = Number(res.headers.get('content-length'));
                    if (Number.isFinite(declaredSize) && declaredSize > TEXT_CONTENT_CAP_BYTES) {
                        throw new Error(`File is over the ${(TEXT_CONTENT_CAP_BYTES / (1024 * 1024)).toFixed(0)} MB preview cap`);
                    }
                    const content = await res.text();
                    if (new TextEncoder().encode(content).length > TEXT_CONTENT_CAP_BYTES) {
                        throw new Error(`File exceeds the ${(TEXT_CONTENT_CAP_BYTES / (1024 * 1024)).toFixed(0)} MB preview cap`);
                    }
                    if (stale()) return;
                    setTextContent(content);
                    setTextDraft(content);
                    setTextReadOnly(false);
                    setPreviewMessage(null);
                } catch (err) {
                    if (stale()) return;
                    setTextContent('');
                    setTextDraft('');
                    setTextReadOnly(true);
                    setPreviewMessage(
                        `Opened read-only — ${err instanceof Error ? err.message : 'could not load file content'}. Save Back is disabled.`,
                    );
                }
                if (!stale()) setIsLoading(false);
                return;
            }

            if (IMAGE_FILE_TYPES.has(file.type)) {
                setPreviewMode('image');
                setPreviewUrl(url);
                setTotalPages(1);
                setIsLoading(false);
                return;
            }

            // P0 item 3: only flip previewMode to 'pdf' — which is what makes
            // Save Back visible — once BOTH the pdf.js doc and the real bytes
            // are in hand. No window where previewMode==='pdf' but
            // pdfBytes is still null. Load lifecycle (sequence token +
            // AbortController + destroy() of a superseded doc) lives in
            // usePdfDocument (P1 item 7).
            try {
                const result = await pdfLifecycle.load(url);
                if (stale()) return; // a newer loadDocument call is now in charge
                if (!result) return; // pdfLifecycle itself judged this load stale
                setTotalPages(result.doc.numPages);
                setPreviewMode('pdf');
            } catch {
                if (stale()) return;
                setPreviewMode('unavailable');
                setPreviewUrl(url);
                setPreviewMessage(`Preview not available for .${file.type} files yet. You can still open the original or cache a local copy.`);
            }
        } catch (err) {
            if (stale()) return;
            console.error('PDF.js load error:', err);
            setPreviewMode('unavailable');
            setPreviewMessage(err instanceof Error ? err.message : 'Preview unavailable');
        }

        if (!stale()) setIsLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resetDocumentState, pdfLifecycle.load]);

    const guessTypeFromName = (name: string): string => {
        const idx = name.lastIndexOf('.');
        return idx >= 0 ? name.slice(idx + 1).toLowerCase() : '';
    };

    // Command Palette / Desktop deep-link.
    const openFileFromPalette = useCallback(async (detail: { fileId?: string; name?: string }) => {
        const { fileId, name } = detail;
        let candidate = files.find(file => (fileId && file.id === fileId) || (name && file.name === name));
        if (!candidate && fileId) {
            // P1 item 8: don't require the file to be on the first page of
            // GET /api/files — refresh once in case it's a newer file, but
            // if the list STILL doesn't have it, build the DocFile straight
            // from the event detail and load its bytes by id directly.
            const refreshed = await fetchDocFiles();
            candidate = refreshed.find(file => (fileId && file.id === fileId) || (name && file.name === name));
            if (!candidate) {
                candidate = { id: fileId, name: name || fileId, type: guessTypeFromName(name || '') || 'pdf' };
                const built = candidate;
                setFiles(prev => (prev.some(f => f.id === built.id) ? prev : [...prev, built]));
            }
        } else if (!candidate) {
            const refreshed = await fetchDocFiles();
            candidate = refreshed.find(file => (fileId && file.id === fileId) || (name && file.name === name));
        }
        if (candidate) void loadDocument(candidate);
    }, [files, fetchDocFiles, loadDocument]);

    useEffect(() => {
        const onOpenFile = (event: Event) => {
            const detail = (event as CustomEvent<{ fileId?: string; name?: string }>).detail;
            if (!detail?.fileId && !detail?.name) return;
            // N2: a request consumed via the live event listener must ALSO
            // clear the global pending slot — otherwise a later remount's
            // drain-pending effect sees a stale non-null slot and reopens
            // this same (already-handled) request.
            (window as any).__qualiaDocViewerPendingFile = null;
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
    // P1 item 6 (HiDPI): the canvas BITMAP is CSS size * devicePixelRatio,
    // the 2D context is scaled to match, and `page.render`'s own `transform`
    // option applies the same dpr — so every draw call elsewhere (overlay,
    // pointer math) can work purely in CSS/viewport-pixel units and still
    // land on crisp bitmap pixels. `scale: zoomLevel * 1.5` for the pdf.js
    // viewport itself is UNCHANGED (still what pins the zoom in
    // docViewerUndoZoom.test.tsx) — dpr is layered on top via `transform`,
    // never folded into `scale`, so it stays decoupled from zoom.
    const renderPage = async (pdf: any, pageNum: number, zoomLevel: number) => {
        const canvas = canvasRef.current;
        if (!canvas || !pdf) return;

        try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: zoomLevel * 1.5 });
            viewportRef.current = viewport;
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(viewport.width * dpr);
            canvas.height = Math.ceil(viewport.height * dpr);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            await page.render({ canvasContext: ctx, viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
            setRenderError(null);
            setRenderVersion(v => v + 1);

            // Extract text layer for editText mode
            await extractTextLayer(page, viewport);
        } catch (err) {
            // P0 item 3: no fabricated fallback page — an honest error
            // instead of the old `renderDemoPage` fake document.
            console.error('Page render error:', err);
            canvas.width = 0;
            canvas.height = 0;
            viewportRef.current = null;
            setRenderError('This page could not be rendered.');
            setTextItems([]);
        }
    };

    /** Re-load pdf.js after pdfBytes changes (insert/delete/rotate/undo). Does
     * NOT call renderPage itself (R7, adversarial review of P1 item 7):
     * replaceBytes's own setDoc + the setCurrentPage below both feed the
     * page-render effect ([currentPage, zoom, pdfDoc, previewMode,
     * canvasMounted]) — pdfDoc is a NEW object every replaceBytes call, so
     * that effect reliably re-fires on its own. An explicit renderPage() call
     * here used to race it: two concurrent page.render() calls landed on the
     * SAME <canvas>, and pdf.js's "Cannot use the same canvas during
     * multiple render() operations" rejection zeroed the canvas — a silently
     * blank page on every Rotate/Insert/Delete/text-edit. One render path,
     * same pattern goToPage already uses (plain setCurrentPage). */
    const reloadPdfFromBytes = async (bytes: Uint8Array, pageToShow: number) => {
        const newPdf = await pdfLifecycle.replaceBytes(bytes);
        if (!newPdf) return currentPage; // superseded by a newer load — leave state to it
        setTotalPages(newPdf.numPages);
        const clamped = Math.max(1, Math.min(newPdf.numPages, pageToShow));
        setCurrentPage(clamped);
        return clamped;
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
                    // P1 audit #14: raw PDF-unit width (unscaled) for the
                    // text-edit white-out — see commitTextEdit.
                    pdfWidth: item.width,
                });
            });

            setTextItems(items);
        } catch (err) {
            console.error('Text extraction error:', err);
            setTextItems([]);
        }
    };

    // Re-render on page/zoom change, AND once the canvas DOM node actually
    // mounts (N1, found live): previewMode/pdfDoc can both already be
    // 'pdf'/set by the time isLoading flips false in the SAME render that
    // first mounts the canvas — StrictMode's extra render pass, or any
    // render ordering where this effect fires before the ref commit, left
    // the canvas at its default 300x150 with nothing drawn until the user
    // navigated a page. Depending on `canvasMounted` (flipped by a ref
    // CALLBACK, which always fires after the DOM node exists) closes that
    // gap: if pdfDoc was already ready when the canvas mounted, this effect
    // re-fires right then. No fabricated fallback page when pdfDoc isn't
    // loaded (P0 item 3/4) — the loading spinner or the "unavailable" empty
    // state covers that window honestly.
    useEffect(() => {
        if (previewMode !== 'pdf' || !pdfDoc || !canvasMounted) return;
        void renderPage(pdfDoc, currentPage, zoom);
    }, [currentPage, zoom, pdfDoc, previewMode, canvasMounted]);

    // ---- RENDER OVERLAY (ANNOTATIONS) ----
    // P1 item 6: committed annotations are stored in PDF user space and
    // converted to viewport (CSS-pixel) space with the SAME live viewport
    // pdfBake will (conceptually) invert — pdfCoords.ts is the one place
    // that math lives. The in-progress preview (isDrawing) is still tracked
    // in viewport space directly (nothing to convert, not yet an
    // Annotation), so it draws with no scaling at all. HiDPI: the context is
    // scaled by devicePixelRatio so every draw call below works in
    // viewport/CSS-pixel units, matching what getCanvasCoords hands back and
    // what pdfToViewport produces — no `zoom * 1.5` multiplication anywhere
    // in this function any more.
    const renderOverlay = useCallback(() => {
        const overlay = overlayRef.current;
        const base = canvasRef.current;
        if (!overlay || !base) return;

        overlay.width = base.width;
        overlay.height = base.height;
        overlay.style.width = base.style.width;
        overlay.style.height = base.style.height;
        const ctx = overlay.getContext('2d');
        if (!ctx) return;
        const dpr = window.devicePixelRatio || 1;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, overlay.width / dpr, overlay.height / dpr);

        const pageAnnotations = annotations.get(currentPage) || [];
        const viewport = viewportRef.current;
        // R3 (adversarial review of P1 item 6): converting ANN POSITIONS
        // through pdfCoords already accounts for zoom (baked into the
        // viewport's own transform) — but every drawn SIZE (font size, line
        // width, arrowhead length, stamp padding) is a raw CSS-pixel value
        // from the Annotation, with no equivalent multiplication. Pre-P1 it
        // was `* scale` where `scale = zoom * 1.5`; that got dropped instead
        // of replaced with `* viewport.scale` (pdf.js's own viewport already
        // carries that same zoom*1.5 as its `scale`), so annotations stopped
        // growing/shrinking with the page at non-default zoom.
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
                    // viewport-space output is converted at placement time —
                    // see addAnnotation's 'signature' branch); bake
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

        // Draw current in-progress shape/highlight — still viewport-space
        // (not committed as an Annotation yet), so no conversion needed for
        // POSITION, but the stroke width still needs the same * vscale as
        // the committed 'draw' case above, or the live preview looks a
        // different thickness than what gets committed a moment later.
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
        // renderVersion isn't read directly — it's the trigger that makes this
        // redraw whenever renderPage produces a NEW viewport (zoom, rotate,
        // page nav, insert/delete, undo/redo), not only on a zoom change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [annotations, currentPage, renderVersion, isDrawing, drawStart, activeTool, currentPath, drawColor, drawSize]);

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
        if (!pdfBytes) {
            showToast('No document bytes loaded — cannot edit text');
            setEditingTextItem(null);
            return;
        }

        // P1 item 6: editingTextItem.x/y/width/height are viewport-space
        // (screen positioning); the TextEdit record and the white-out below
        // both need PDF-space values, which pdf.js already handed us
        // unscaled — transform[4]/[5] (position) and pdfWidth/fontSize
        // (size, audit #14) — no zoom/scale division needed.
        const edit: TextEdit = {
            pageNum: currentPage,
            itemIndex: editingTextItem.itemIndex,
            originalText: editingTextItem.str,
            newText: editedText,
            x: editingTextItem.transform[4],
            y: editingTextItem.transform[5],
            width: editingTextItem.pdfWidth,
            height: editingTextItem.fontSize,
            fontSize: editingTextItem.fontSize,
        };

        pushUndo(true);

        // Store the edit
        const nextTextEdits = [
            ...textEdits.filter(e => !(e.pageNum === edit.pageNum && e.itemIndex === edit.itemIndex)),
            edit,
        ];
        setTextEdits(nextTextEdits);

        // Apply the edit to the PDF bytes using pdf-lib
        try {
            const doc = await PDFDocument.load(pdfBytes);
            const page = doc.getPage(currentPage - 1);
            const font = await doc.embedFont(StandardFonts.Helvetica);

            // Draw a white rectangle over the original text — sized from the
            // pdf.js text item's OWN width/height (already PDF units, audit
            // #14), not Helvetica metrics for whatever font the document
            // actually used (the old bug: wide-font text left visible tails).
            const pdfX = editingTextItem.transform[4];
            const pdfY = editingTextItem.transform[5];
            const originalFontSize = edit.fontSize;
            const textWidth = edit.width;

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

            const newBytes = new Uint8Array(await doc.save());
            setPdfDirty(true);
            await reloadPdfFromBytes(newBytes, currentPage);

            showToast(`Text updated: "${edit.originalText}" → "${editedText}"`);
        } catch (err) {
            console.error('Text edit error:', err);
            showToast('Error applying text edit');
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

    // ---- POINTER EVENTS (P1 item 10) ----
    // Screen -> viewport-space (CSS pixel, top-left origin, y-down): a ratio
    // of the overlay's ACTUAL rendered CSS size to the viewport's own
    // width/height, not a `zoom * 1.5` division — decoupled from that magic
    // constant (P1 item 6) and correct even if the browser visually scales
    // the canvas down (e.g. a narrow container).
    const getCanvasCoords = (e: { clientX: number; clientY: number }): Point => {
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
    };

    const addAnnotation = (ann: Annotation) => {
        pushUndo(false);
        setPdfDirty(true);
        setAnnotations(prev => {
            const next = new Map(prev);
            const pageAnns = [...(next.get(ann.page) || []), ann];
            next.set(ann.page, pageAnns);
            return next;
        });
    };

    const capturePointer = (e: React.PointerEvent) => {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* not supported (e.g. jsdom) */ }
    };
    const releasePointer = (e: React.PointerEvent) => {
        try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not supported */ }
    };

    // R6 (adversarial review of P1 item 10): only ONE pointer contact drives
    // the overlay at a time. Without this, a second concurrent touch (e.g. a
    // palm graze — more likely now that `touch-action: none` suppresses the
    // browser's own touch-scroll rejection) writes its coordinates into the
    // SAME isDrawing/drawStart/currentPath state as the first, corrupting or
    // duplicating the in-progress annotation.
    const activePointerIdRef = useRef<number | null>(null);

    const handlePointerDown = (e: React.PointerEvent) => {
        // R5 (adversarial review of P1 item 9): clicking this canvas doesn't
        // natively focus it (a plain <canvas> isn't focusable), so the
        // browser drops focus to <body> — the rootRef keydown listener never
        // sees a SUBSEQUENT Cmd+Z at all (its target is <body>, outside the
        // viewer subtree, so it never bubbles in). Reclaiming focus onto the
        // (tabIndex=-1, programmatically-focusable) viewer root on every
        // pointer interaction keeps Cmd+Z working right after a draw.
        rootRef.current?.focus({ preventScroll: true });
        if (activePointerIdRef.current !== null) return; // a pointer is already active — ignore a second contact
        if (activeTool === 'select' || activeTool === 'editText') return;
        activePointerIdRef.current = e.pointerId;
        capturePointer(e);
        const pos = getCanvasCoords(e);
        setIsDrawing(true);
        setDrawStart(pos);

        if (activeTool === 'draw') {
            setCurrentPath([pos]);
        }
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;
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
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        activePointerIdRef.current = null;
        releasePointer(e);
        if (!isDrawing || !drawStart) {
            setIsDrawing(false);
            return;
        }
        const pos = getCanvasCoords(e);
        // P1 item 6: convert the viewport-space geometry just captured into
        // PDF user space with the live viewport, ONCE, right here at commit
        // — everything downstream (overlay render, bake) works in PDF space.
        const viewport = viewportRef.current;

        if (activeTool === 'text') {
            const text = prompt('Enter text:');
            if (text && viewport) {
                addAnnotation({
                    id: crypto.randomUUID(),
                    type: 'text',
                    page: currentPage,
                    color: drawColor,
                    opacity: 1,
                    text,
                    fontSize,
                    position: pdfCoords.viewportToPdf(viewport, pos.x, pos.y),
                    rotation: viewport.rotation ?? 0,
                });
            }
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
                setShowSignatureModal(true);
            }
        }

        setIsDrawing(false);
        setDrawStart(null);
    };

    const handlePointerCancel = (e: React.PointerEvent) => {
        if (e.pointerId !== activePointerIdRef.current) return;
        activePointerIdRef.current = null;
        releasePointer(e);
        setIsDrawing(false);
        setDrawStart(null);
        setCurrentPath([]);
    };

    // ---- PAGE MANIPULATION ----
    // P0 item 5: insert/delete re-key the annotation Map AND the text-edit
    // list so they stay on the page they were placed on, and the byte
    // mutation is snapshotted for undo (pushUndo(true) BEFORE the mutation).
    const insertPage = async () => {
        if (!pdfBytes) {
            showToast('No document bytes loaded — cannot insert a page');
            return;
        }
        pushUndo(true);
        try {
            const doc = await PDFDocument.load(pdfBytes);
            const [width, height] = [612, 792];
            const insertedPageNum = currentPage + 1;
            doc.insertPage(currentPage, [width, height]); // Insert after current
            const newBytes = new Uint8Array(await doc.save());
            setAnnotations(prev => shiftAnnotationsForInsert(prev, insertedPageNum));
            setTextEdits(prev => shiftTextEditsForInsert(prev, insertedPageNum));
            setPdfDirty(true);
            await reloadPdfFromBytes(newBytes, insertedPageNum);
            showToast(`Blank page inserted after page ${currentPage}`);
        } catch (err) {
            console.error('Insert page error:', err);
            showToast('Error inserting page');
        }
    };

    const deletePage = async () => {
        if (totalPages <= 1) {
            showToast("Can't delete the only page");
            return;
        }
        if (!pdfBytes) {
            showToast('No document bytes loaded — cannot delete a page');
            return;
        }
        pushUndo(true);
        try {
            const doc = await PDFDocument.load(pdfBytes);
            const deletedPageNum = currentPage;
            doc.removePage(currentPage - 1);
            const newBytes = new Uint8Array(await doc.save());
            setAnnotations(prev => shiftAnnotationsForDelete(prev, deletedPageNum));
            setTextEdits(prev => shiftTextEditsForDelete(prev, deletedPageNum));
            setPdfDirty(true);
            await reloadPdfFromBytes(newBytes, currentPage);
            showToast(`Page ${deletedPageNum} deleted`);
        } catch (err) {
            console.error('Delete page error:', err);
            showToast('Error deleting page');
        }
    };

    const rotatePage = async (direction: 'cw' | 'ccw') => {
        if (!pdfBytes) {
            showToast('Rotate requires a loaded PDF');
            return;
        }
        pushUndo(true);
        try {
            const doc = await PDFDocument.load(pdfBytes);
            const page = doc.getPage(currentPage - 1);
            const current = page.getRotation().angle;
            const delta = direction === 'cw' ? 90 : -90;
            const nextRotation = ((current + delta) % 360 + 360) % 360;
            page.setRotation(degrees(current + delta));
            const newBytes = new Uint8Array(await doc.save());
            // R1/R2 (adversarial review of P1 item 6): text/stamp annotations
            // carry the page rotation they were CREATED under so bake can
            // counter-rotate them upright (see pdfBake.ts). Rotating the page
            // again afterward left that stored value stale — Save/Export
            // baked those annotations at the wrong orientation even though
            // the overlay (which never reads ann.rotation) still looked
            // upright on screen. Re-sync it to the page's new rotation here,
            // in the one function that mutates page rotation, so every path
            // that got here (toolbar Rotate button, no other caller) stays correct.
            setAnnotations(prev => {
                const pageAnns = prev.get(currentPage);
                if (!pageAnns?.some(a => a.type === 'text' || a.type === 'stamp')) return prev;
                const next = new Map(prev);
                next.set(currentPage, pageAnns.map(a =>
                    (a.type === 'text' || a.type === 'stamp') ? { ...a, rotation: nextRotation } : a));
                return next;
            });
            setPdfDirty(true);
            await reloadPdfFromBytes(newBytes, currentPage);
            showToast(`Page rotated ${direction === 'cw' ? '90° clockwise' : '90° counter-clockwise'}`);
        } catch (err) {
            console.error('Rotate error:', err);
            showToast('Error rotating page');
        }
    };

    // ---- DOWNLOAD / EXPORT ----
    // P0 items 1+3: bakeAnnotations (pdfBake.ts) is the single bake
    // implementation (handles signature too) and throws when there are no
    // real bytes — Export/Save Back refuse instead of fabricating a blank
    // document.
    const buildPdfBytes = useCallback(async (): Promise<Uint8Array> => {
        if (!pdfBytes) {
            throw new Error('No PDF loaded — nothing to export or save.');
        }
        return bakeAnnotations(pdfBytes, annotations);
    }, [annotations, pdfBytes]);

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
        if (previewMode === 'text' && textReadOnly) {
            showToast('This file is read-only — Save Back is disabled.');
            return;
        }
        if (previewMode === 'pdf' && !pdfBytes) {
            showToast('No document bytes loaded — nothing to save.');
            return;
        }

        // P0 item 3: confirm before overwriting the original, naming the file.
        // Cancel sends no request.
        if (!window.confirm(`Overwrite "${selectedFile.name}" in Qualia with these changes?`)) {
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
            setPdfDirty(false);
            showToast('Changes saved back into Qualia');
        } catch (err) {
            console.error('Save document error:', err);
            showToast(err instanceof Error ? err.message : 'Failed to save document');
        } finally {
            setIsSaving(false);
        }
    }, [buildPdfBytes, pdfBytes, previewMode, selectedFile, textDraft, textReadOnly]);

    // ---- SIGNATURE MODAL ----
    const sigDrawingRef = useRef(false);
    const sigCurrentStroke = useRef<Point[]>([]);
    // R6: same single-active-pointer guard as the overlay canvas.
    const sigPointerIdRef = useRef<number | null>(null);

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
            setSignatureStrokes(prev => [...prev, stroke]);
        }
        sigDrawingRef.current = false;
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
        pushUndo(false);
        setPdfDirty(true);
        setAnnotations(prev => {
            const next = new Map(prev);
            next.set(currentPage, []);
            return next;
        });
        showToast('Annotations cleared for this page');
    };

    // ---- TOOL CONFIG ----
    const COLORS = ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#D6FE51', '#ec4899', '#1a1a2e', '#ffffff'];
    const canEditPdf = previewMode === 'pdf' && !!pdfBytes;
    const canSaveBack = previewMode === 'pdf' || previewMode === 'text';
    const isTextDirty = previewMode === 'text' && textDraft !== textContent;

    // P0 item 3: Save Back is disabled until pdfBytes are loaded, and while
    // clean (nothing to save) — with a title explaining why in each case.
    let saveBackDisabled = isSaving;
    let saveBackTitle = 'Save changes back into Qualia';
    if (isSaving) {
        saveBackTitle = 'Saving…';
    } else if (previewMode === 'pdf') {
        if (!pdfBytes) {
            saveBackDisabled = true;
            saveBackTitle = 'Waiting for the PDF to finish loading';
        } else if (!pdfDirty) {
            saveBackDisabled = true;
            saveBackTitle = 'No changes to save';
        }
    } else if (previewMode === 'text') {
        if (textReadOnly) {
            saveBackDisabled = true;
            saveBackTitle = 'File is read-only (too large, or failed to load fully) — Save Back is disabled';
        } else if (!isTextDirty) {
            saveBackDisabled = true;
            saveBackTitle = 'No changes to save';
        }
    }

    // ---- RENDER ----
    return (
        <div className="doc-viewer" ref={rootRef} tabIndex={-1}>
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
                                        <button className="dv-toolbar__btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={14} aria-hidden /></button>
                                        <input className="dv-toolbar__page-input" type="number" value={currentPage}
                                            onChange={e => goToPage(parseInt(e.target.value) || 1)}
                                            min={1} max={totalPages} />
                                        <span>/ {totalPages}</span>
                                        <button className="dv-toolbar__btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page"><ChevronRight size={14} aria-hidden /></button>
                                    </div>

                                    <div className="dv-zoom">
                                        <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
                                        <span className="dv-zoom__level">{Math.round(zoom * 100)}%</span>
                                        <button className="dv-zoom__btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
                                    </div>
                                </>
                            )}

                            <button className="dv-toolbar__btn dv-toolbar__btn--download" onClick={downloadCurrentDocument} title="Export current document">
                                <Download size={14} aria-hidden /> Export
                            </button>
                            {canSaveBack && (
                                <button className="dv-toolbar__btn" onClick={() => void saveDocumentToQualia()} disabled={saveBackDisabled} title={saveBackTitle}>
                                    {isSaving ? 'Saving…' : <><Save size={14} aria-hidden /> Save Back</>}
                                </button>
                            )}
                            <button className="dv-toolbar__btn" onClick={() => void materializeLocalCopy()} title="Materialize local copy and copy path">
                                <Download size={14} aria-hidden /> Cache Local
                            </button>
                            <button className="dv-toolbar__btn" onClick={openOriginalFile} title="Open original file route">
                                <ExternalLink size={14} aria-hidden /> Open Original
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
                                <span className="dv-edit-btn__icon"><Square size={14} aria-hidden /></span>
                                <span className="dv-edit-btn__label">Shapes</span>
                            </button>
                        </div>

                        <div className="dv-edit-toolbar__divider" />

                        <div className="dv-edit-toolbar__group">
                            <button className={`dv-edit-btn ${activeTool === 'signature' ? 'dv-edit-btn--active' : ''}`}
                                onClick={() => {
                                    // Always open the modal — even with an existing
                                    // signature — so the user can redraw/replace it
                                    // (audit finding: the gate on strokes.length made
                                    // an existing signature unreplaceable). Existing
                                    // strokes aren't cleared just by reopening, so
                                    // "Use Signature" alone still re-places the same one.
                                    setShowSignatureModal(true);
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
                                <span className="dv-edit-btn__icon"><Plus size={14} aria-hidden /></span>
                                <span className="dv-edit-btn__label">Insert</span>
                            </button>
                            <button className="dv-edit-btn" onClick={deletePage} title="Delete Current Page">
                                <span className="dv-edit-btn__icon"><Trash2 size={14} /></span>
                                <span className="dv-edit-btn__label">Delete</span>
                            </button>
                            <button className="dv-edit-btn" onClick={() => rotatePage('cw')} title="Rotate CW">
                                <span className="dv-edit-btn__icon"><RotateCw size={14} aria-hidden /></span>
                                <span className="dv-edit-btn__label">Rotate</span>
                            </button>
                        </div>

                        <div className="dv-edit-toolbar__divider" />

                        <div className="dv-edit-toolbar__group">
                            <button className="dv-edit-btn" onClick={undo} title="Undo (Ctrl+Z)" disabled={!history.canUndo}>
                                <span className="dv-edit-btn__icon"><Undo2 size={14} aria-hidden /></span>
                                <span className="dv-edit-btn__label">Undo</span>
                            </button>
                            <button className="dv-edit-btn" onClick={redo} title="Redo (Ctrl+Shift+Z)" disabled={!history.canRedo}>
                                <span className="dv-edit-btn__icon"><Redo2 size={14} aria-hidden /></span>
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
                                            {s === 'rectangle' ? <Square size={14} aria-hidden /> : s === 'circle' ? <Circle size={14} aria-hidden /> : s === 'line' ? <Minus size={14} aria-hidden /> : <ArrowRight size={14} aria-hidden />}
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
                {selectedFile && isPdfAttemptType(selectedFile.type) && (isLoading || previewMode === 'pdf') ? (
                    // N1 (found live): the canvas stays MOUNTED under the
                    // spinner instead of being swapped out for it — a
                    // conditional that unmounted the canvas while isLoading
                    // was true, gated behind a render effect that never
                    // re-ran once loading ended, left page 1 undrawn (300x150
                    // blank) until the user navigated. The `canvasMounted`
                    // dependency on the render effect (above) is the other
                    // half of this fix.
                    <div className="dv-canvas-container" ref={containerRef}>
                        {isLoading && (
                            <div className="dv-loading dv-loading--overlay">
                                <div className="dv-loading__spinner" />
                                Loading document...
                            </div>
                        )}
                        <div className="dv-canvas-wrapper"
                            style={{ cursor: activeTool === 'select' ? 'default' : activeTool === 'text' || activeTool === 'editText' ? 'text' : 'crosshair' }}>
                            {renderError && (
                                <div className="dv-canvas-error" role="status">{renderError}</div>
                            )}
                            <canvas ref={setCanvasNode} />
                            <canvas ref={overlayRef} className="dv-overlay-canvas"
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerCancel}
                            />

                            {/* Text Layer — visible in editText mode */}
                            {activeTool === 'editText' && textItems.length > 0 && (
                                <div className="dv-text-layer" style={{
                                    width: viewportRef.current?.width ?? canvasRef.current?.width ?? 0,
                                    height: viewportRef.current?.height ?? canvasRef.current?.height ?? 0,
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
                ) : isLoading ? (
                    <div className="dv-loading">
                        <div className="dv-loading__spinner" />
                        Loading document...
                    </div>
                ) : selectedFile && previewMode === 'text' ? (
                    <div className="dv-text-preview">
                        <div className="dv-text-preview__meta">
                            <span>{selectedFile.name}</span>
                            <span>{textDraft.length.toLocaleString()} chars</span>
                            {textReadOnly && <span className="dv-text-preview__dirty">Read-only</span>}
                            {!textReadOnly && isTextDirty && <span className="dv-text-preview__dirty">Unsaved changes</span>}
                        </div>
                        <textarea
                            className="dv-text-preview__editor"
                            value={textDraft}
                            onChange={(e) => setTextDraft(e.target.value)}
                            readOnly={textReadOnly}
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
            )}

            {/* Toast */}
            {toast && (
                <div className="dv-toast">{toast}</div>
            )}
        </div>
    );
}
