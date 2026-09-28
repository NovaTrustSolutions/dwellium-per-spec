import { useState, useRef, useEffect, useCallback } from 'react';
import { FileText, Image, Paperclip } from 'lucide-react';
import { PDFDocument, rgb, StandardFonts, degrees } from 'pdf-lib';
import './DocViewer.css';
import { API_BASE } from '../../config';
import type {
    DocFile, ToolMode, ShapeType, StampType, PreviewMode, Point,
    Annotation, AnnotationMap, TextItem, TextEdit,
} from './docViewerTypes';
import {
    shiftAnnotationsForInsert, shiftAnnotationsForDelete,
    shiftTextEditsForInsert, shiftTextEditsForDelete,
} from './annotationModel';
import { bakeAnnotations } from './pdfBake';
import { useAnnotationHistory, type DocSnapshot } from './useAnnotationHistory';
import { usePdfDocument, type PdfDocLike } from './usePdfDocument';
import type { ViewportLike } from './pdfCoords';
import * as pdfCoords from './pdfCoords';
import { subscribeDocViewerOpen, takePendingDocViewerOpen, type DocViewerOpenRequest } from '../../lib/docViewerLauncher';
import type { PDFPageProxy, PageViewport } from 'pdfjs-dist';
import { drawAnnotationOverlay } from './annotationOverlay';
import { useAnnotationPointerTool } from './useAnnotationPointerTool';
import PageSidebar from './PageSidebar';
import DocToolbar from './DocToolbar';
import EditToolbar from './EditToolbar';
import TextLayerEditor from './TextLayerEditor';
import SignatureModal from './SignatureModal';

// ============================================
// TYPES — see docViewerTypes.ts for the shared shapes; ToolMode/ShapeType/
// StampType/PreviewMode/Point/Annotation/AnnotationMap/TextItem/TextEdit
// are imported above.
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

    // Drawing state (isDrawing/drawStart/currentPath) now lives inside
    // useAnnotationPointerTool (P2 item 11 module split) — see `pointerTool`
    // below, defined once `renderOverlay` exists.

    // Refs
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const overlayRef = useRef<HTMLCanvasElement | null>(null);
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
    const openFileFromPalette = useCallback(async (detail: DocViewerOpenRequest) => {
        const { fileId, name } = detail;
        // R-item15 (adversarial review): requestDocViewerOpen() redispatches
        // its open event up to 6 times over ~9.5s so a still-mounting Doc
        // Viewer has several chances to catch it (see docViewerLauncher.ts).
        // 'doc-viewer' is a singleton window (WindowContext.tsx re-focuses
        // an existing one instead of spawning a new one), so DocViewer is
        // normally ALREADY mounted and subscribed for every dispatch after
        // the first. Without this guard each replay re-ran loadDocument ->
        // resetDocumentState on the SAME already-open file, silently
        // wiping any annotation/signature/text edit made in the meantime.
        // Reopening a file that's already open is a no-op — the window is
        // already showing it and openWindow() already re-focused it.
        if (selectedFile && ((fileId && selectedFile.id === fileId) || (!fileId && name && selectedFile.name === name))) {
            return;
        }
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
    }, [files, fetchDocFiles, loadDocument, selectedFile]);

    // P2 item 15: subscribeDocViewerOpen already clears the global pending
    // slot on receipt (N2 fix) — a later remount's drain-pending effect
    // below can't reopen this same already-handled request.
    useEffect(() => subscribeDocViewerOpen(detail => void openFileFromPalette(detail)), [openFileFromPalette]);

    // ---- DRAIN PENDING FILE QUEUE ----
    // When DocViewer freshly mounts (cold-open), events may arrive before
    // this component registers its listener. The global queue captures those.
    useEffect(() => {
        if (hasDrainedPending.current || files.length === 0) return;
        hasDrainedPending.current = true;
        const pending = takePendingDocViewerOpen();
        if (pending) void openFileFromPalette(pending);
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
    const renderPage = async (pdf: PdfDocLike, pageNum: number, zoomLevel: number) => {
        const canvas = canvasRef.current;
        if (!canvas || !pdf) return;

        try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: zoomLevel * 1.5 });
            viewportRef.current = pdfCoords.fromPdfjsViewport(viewport);
            const dpr = window.devicePixelRatio || 1;
            canvas.width = Math.ceil(viewport.width * dpr);
            canvas.height = Math.ceil(viewport.height * dpr);
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            // `canvas` is required by pdf.js's own RenderParameters type
            // (canvasContext alone is the legacy/back-compat form).
            await page.render({ canvasContext: ctx, canvas, viewport, transform: [dpr, 0, 0, dpr, 0, 0] }).promise;
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
    const extractTextLayer = async (page: PDFPageProxy, viewport: PageViewport) => {
        try {
            const textContent = await page.getTextContent();
            const items: TextItem[] = [];

            textContent.items.forEach((item, index) => {
                // getTextContent() items are TextItem | TextMarkedContent —
                // the latter (marked-content markers) only appear when
                // { includeMarkedContent: true } is passed, which this call
                // never does, but the 'str' guard narrows the union either way.
                if (!('str' in item) || !item.str || item.str.trim() === '') return;

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
    // useAnnotationPointerTool (P1 item 10 / P2 item 11) owns isDrawing/
    // drawStart/currentPath and the pointer handlers, but ALSO needs
    // renderOverlay (defined below, since it reads the hook's own state) as
    // one of its inputs. `renderOverlayRef` breaks that circular dependency:
    // the hook gets a stable function that always calls whatever renderOverlay
    // currently is, and renderOverlay itself is assigned into the ref right
    // after it's defined (and on every render, so it's never stale).
    const renderOverlayRef = useRef<() => void>(() => {});
    const invokeRenderOverlay = useCallback(() => renderOverlayRef.current(), []);

    const addAnnotation = useCallback((ann: Annotation) => {
        pushUndo(false);
        setPdfDirty(true);
        setAnnotations(prev => {
            const next = new Map(prev);
            const pageAnns = [...(next.get(ann.page) || []), ann];
            next.set(ann.page, pageAnns);
            return next;
        });
    }, [pushUndo]);

    // P2 item 13 (a11y): 'text' tool placement — an inline, ref-focused field
    // positioned at the click point, replacing window.prompt(). The pointer
    // hook only hands back the placement point (viewport + PDF space); the
    // Annotation is built and committed here on Enter/blur, since fontSize/
    // drawColor already live in this component.
    const [pendingTextInsert, setPendingTextInsert] = useState<{ screenX: number; screenY: number; pdfPos: Point; rotation: number } | null>(null);
    const [pendingTextValue, setPendingTextValue] = useState('');
    const pendingTextInputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (pendingTextInsert) pendingTextInputRef.current?.focus();
    }, [pendingTextInsert]);

    // R1/R2 fix: addAnnotation is a side effect (writes annotation state +
    // pushes undo history) and must NOT run inside a setState functional
    // updater — React 18 StrictMode invokes updaters twice to check purity
    // and only discards the RETURN value, not side effects performed inside
    // them, so the bug doubled every placed text annotation. Read
    // pendingTextInsert as a plain value instead and call addAnnotation
    // outside any updater.
    // R1/R2 fix: addAnnotation is a side effect (writes annotation state +
    // pushes undo history) and must NOT run inside a setState functional
    // updater — React 18 StrictMode invokes updaters twice to check purity
    // and only discards the RETURN value, not side effects performed inside
    // them, so the bug doubled every placed text annotation. Read
    // pendingTextInsert as a plain value instead and call addAnnotation
    // outside any updater.
    const commitPendingTextInsert = useCallback(() => {
        if (pendingTextInsert && pendingTextValue.trim()) {
            addAnnotation({
                id: crypto.randomUUID(),
                type: 'text',
                page: currentPage,
                color: drawColor,
                opacity: 1,
                text: pendingTextValue,
                fontSize,
                position: pendingTextInsert.pdfPos,
                rotation: pendingTextInsert.rotation,
            });
        }
        setPendingTextInsert(null);
        setPendingTextValue('');
    }, [pendingTextInsert, pendingTextValue, addAnnotation, currentPage, drawColor, fontSize]);

    const cancelPendingTextInsert = useCallback(() => {
        setPendingTextInsert(null);
        setPendingTextValue('');
    }, []);

    const pointerTool = useAnnotationPointerTool({
        overlayRef, viewportRef, rootRef,
        activeTool, currentPage, drawColor, drawSize, selectedShape, selectedStamp, signatureStrokes,
        renderOverlay: invokeRenderOverlay,
        addAnnotation,
        showToast,
        onNeedSignature: () => setShowSignatureModal(true),
        onRequestTextInput: (screenPos, pdfPos, rotation) => {
            setPendingTextValue('');
            setPendingTextInsert({ screenX: screenPos.x, screenY: screenPos.y, pdfPos, rotation });
        },
    });
    const { isDrawing, drawStart, currentPath, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = pointerTool;

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

        // The actual per-annotation-type drawing is a pure function in
        // annotationOverlay.ts (P2 item 11 module split) — this wrapper only
        // owns the DOM/canvas plumbing (sizing the overlay to the base
        // canvas, DPR scaling, clearing) that has to live next to the refs.
        drawAnnotationOverlay(ctx, {
            pageAnnotations: annotations.get(currentPage) || [],
            viewport: viewportRef.current,
            isDrawing, drawStart, activeTool, currentPath, drawColor, drawSize,
        });
        // renderVersion isn't read directly — it's the trigger that makes this
        // redraw whenever renderPage produces a NEW viewport (zoom, rotate,
        // page nav, insert/delete, undo/redo), not only on a zoom change.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [annotations, currentPage, renderVersion, isDrawing, drawStart, activeTool, currentPath, drawColor, drawSize]);
    renderOverlayRef.current = renderOverlay;

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
    // Drawing mechanics (canvas ref, pointer handlers, clear) live in
    // SignatureModal.tsx (P2 item 11 module split) — `signatureStrokes`
    // itself stays lifted here because handlePointerUp's 'signature' branch
    // still needs it AFTER the modal has closed, at placement time.
    const onSignatureConfirmed = useCallback(() => {
        setShowSignatureModal(false);
        setActiveTool('signature');
        showToast('Click on the page to place your signature');
    }, []);

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
                <PageSidebar totalPages={totalPages} currentPage={currentPage} onGoToPage={goToPage} onInsertPage={insertPage} />
            )}

            {/* Main Area */}
            <div className="dv-main">
                {/* File Toolbar */}
                <DocToolbar
                    files={files}
                    selectedFile={selectedFile}
                    onSelectFile={file => void loadDocument(file)}
                    previewMode={previewMode}
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onGoToPage={goToPage}
                    zoom={zoom}
                    setZoom={setZoom}
                    onExport={() => void downloadCurrentDocument()}
                    canSaveBack={canSaveBack}
                    onSaveBack={() => void saveDocumentToQualia()}
                    saveBackDisabled={saveBackDisabled}
                    saveBackTitle={saveBackTitle}
                    isSaving={isSaving}
                    onCacheLocal={() => void materializeLocalCopy()}
                    onOpenOriginal={openOriginalFile}
                    previewMessage={previewMessage}
                    savedLocalPath={savedLocalPath}
                />

                {/* Editing Toolbar */}
                {selectedFile && canEditPdf && (
                    <EditToolbar
                        activeTool={activeTool}
                        setActiveTool={setActiveTool}
                        onEnterSelectTool={() => { setActiveTool('select'); setEditingTextItem(null); }}
                        showToast={showToast}
                        drawColor={drawColor}
                        setDrawColor={setDrawColor}
                        drawSize={drawSize}
                        setDrawSize={setDrawSize}
                        fontSize={fontSize}
                        setFontSize={setFontSize}
                        selectedShape={selectedShape}
                        setSelectedShape={setSelectedShape}
                        selectedStamp={selectedStamp}
                        setSelectedStamp={setSelectedStamp}
                        showColorPicker={showColorPicker}
                        setShowColorPicker={setShowColorPicker}
                        showStampPicker={showStampPicker}
                        setShowStampPicker={setShowStampPicker}
                        // Always open the modal — even with an existing
                        // signature — so the user can redraw/replace it
                        // (audit finding: the gate on strokes.length made an
                        // existing signature unreplaceable). Existing strokes
                        // aren't cleared just by reopening, so "Use
                        // Signature" alone still re-places the same one.
                        onOpenSignatureModal={() => setShowSignatureModal(true)}
                        onInsertPage={insertPage}
                        onDeletePage={deletePage}
                        onRotatePage={rotatePage}
                        onUndo={undo}
                        onRedo={redo}
                        canUndo={history.canUndo}
                        canRedo={history.canRedo}
                        onClearAnnotations={clearAnnotations}
                    />
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
                    // P2 item 13 (a11y): this is the axe scrollable-region-focusable
                    // fix — an overflow:auto region must be in the tab order so
                    // keyboard users can scroll it, even though jsx-a11y's default
                    // config treats a plain <div> as non-interactive (see FluidOS.tsx
                    // for the same established exception pattern in this repo).
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
                    <div className="dv-canvas-container" ref={containerRef} tabIndex={0}>
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
                            {/* P2 item 13 (a11y): the page canvas itself carries a
                                meaningful name — which document, which page of how
                                many — instead of being an unlabeled graphic. */}
                            <canvas ref={setCanvasNode} aria-label={`${selectedFile.name} — page ${currentPage} of ${totalPages}`} />
                            <canvas ref={overlayRef} className="dv-overlay-canvas" aria-hidden="true"
                                onPointerDown={handlePointerDown}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                onPointerCancel={handlePointerCancel}
                            />

                            {pendingTextInsert && (
                                <input
                                    ref={pendingTextInputRef}
                                    className="dv-inline-text-input"
                                    style={{ left: pendingTextInsert.screenX, top: pendingTextInsert.screenY, fontSize: `${fontSize}px` }}
                                    value={pendingTextValue}
                                    onChange={e => setPendingTextValue(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { e.preventDefault(); commitPendingTextInsert(); }
                                        else if (e.key === 'Escape') { e.preventDefault(); cancelPendingTextInsert(); }
                                    }}
                                    onBlur={commitPendingTextInsert}
                                    aria-label="New text annotation"
                                    placeholder="Enter text…"
                                />
                            )}

                            {/* Text Layer — visible in editText mode */}
                            {activeTool === 'editText' && textItems.length > 0 && (
                                <TextLayerEditor
                                    width={viewportRef.current?.width ?? canvasRef.current?.width ?? 0}
                                    height={viewportRef.current?.height ?? canvasRef.current?.height ?? 0}
                                    textItems={textItems}
                                    editingTextItem={editingTextItem}
                                    editedText={editedText}
                                    setEditedText={setEditedText}
                                    currentPage={currentPage}
                                    textEdits={textEdits}
                                    onTextItemClick={handleTextItemClick}
                                    onCommitTextEdit={() => void commitTextEdit()}
                                    onKeyDown={handleTextEditKeyDown}
                                />
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
            <SignatureModal
                open={showSignatureModal}
                strokes={signatureStrokes}
                onStrokesChange={setSignatureStrokes}
                onClose={() => setShowSignatureModal(false)}
                onConfirmed={onSignatureConfirmed}
                showToast={showToast}
            />

            {/* Toast — the visible bubble is unchanged (still mounts only
                while a toast is showing). P2 item 13 (a11y): a SEPARATE,
                permanently-mounted role="status" region carries the same
                text for assistive tech — a live region that itself mounts
                and unmounts on every toast is not reliably announced, since
                AT needs the region to already exist in the DOM before its
                content changes. */}
            {toast && <div className="dv-toast">{toast}</div>}
            <div className="sr-only" role="status" aria-live="polite">{toast}</div>
        </div>
    );
}
