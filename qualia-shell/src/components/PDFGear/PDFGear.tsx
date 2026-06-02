/**
 * PDFGear — Full-featured document processing suite
 * 
 * Mirrors the PDF Gear desktop app with:
 * - Toolset grid with category tabs (Hot Tools, Convert from PDF, Convert to PDF, Merge & Split, All Tools)
 * - Recent files panel with name, date, size
 * - Open File + Create Blank PDF actions
 * - Full PDF viewer with page navigation
 * - Conversion progress tracking
 * - Merge/Split operations via pdf-lib
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { PDFDocument, degrees, StandardFonts, rgb } from 'pdf-lib';
import {
    Undo2, Redo2, ArrowLeft, ChevronLeft, ChevronRight,
    ZoomIn, ZoomOut, RotateCw, Search, Printer, Maximize2, X,
    FolderOpen, Save, Type, Calendar, Check, PenTool, Droplet, Hash, Minimize2,
    Trash2, Copy, Scissors, Combine, FormInput, Lock, ShieldCheck,
    FileText, FileCode, Image as ImageIcon, FileType2,
    Highlighter, MessageSquare, Square, Minus,
    type LucideIcon,
} from 'lucide-react';
import './PDFGear.css';
import { API_BASE } from '../../config';

// SSR guard: pdfjs-dist references DOMMatrix at module-init time, which
// throws "DOMMatrix is not defined" during server-side render. The widget
// is only exercised in event handlers / effects (never during render), so
// a lazy + cached client-only loader keeps render() SSR-safe and matches
// the framework-agnostic browser-global guard pattern from CLAUDE.md
// Phase-9+ widget-altitude SSR-safety taxonomy.
type PdfjsLib = typeof import('pdfjs-dist');
let pdfjsLibPromise: Promise<PdfjsLib> | null = null;
function loadPdfjs(): Promise<PdfjsLib> {
    if (typeof window === 'undefined') {
        return Promise.reject(new Error('pdfjs-dist is browser-only'));
    }
    if (!pdfjsLibPromise) {
        pdfjsLibPromise = import('pdfjs-dist').then(lib => {
            lib.GlobalWorkerOptions.workerSrc = new URL(
                'pdfjs-dist/build/pdf.worker.mjs',
                import.meta.url
            ).toString();
            return lib;
        });
    }
    return pdfjsLibPromise;
}

// ---- Types ----
interface RecentFile {
    id: string;
    name: string;
    openedAt: string;
    size: string;
    path?: string;
    type: string;
}

interface ConversionJob {
    id: string;
    sourceFile: string;
    targetFormat: string;
    status: 'queued' | 'processing' | 'done' | 'error';
    progress: number;
    resultUrl?: string;
    error?: string;
}

type ToolCategory = 'hot' | 'from-pdf' | 'to-pdf' | 'merge-split' | 'edit' | 'all';
type ViewMode = 'toolset' | 'viewer' | 'converting';
type RibbonTab = 'home' | 'fill-sign' | 'edit' | 'pages' | 'form' | 'tools' | 'protect' | 'annotate';

interface PDFTool {
    id: string;
    label: string;
    icon: string;
    iconBg: string;
    category: ToolCategory[];
    description: string;
    action: () => void;
}

// ---- Component ----
export default function PDFGear() {
    const [viewMode, setViewMode] = useState<ViewMode>('toolset');
    const [activeCategory, setActiveCategory] = useState<ToolCategory>('hot');
    const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfPages, setPdfPages] = useState<HTMLCanvasElement[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [zoomLevel, setZoomLevel] = useState(1.0);
    const [rotation, setRotation] = useState(0);
    const [fitWidth, setFitWidth] = useState(false);
    const [docVersion, setDocVersion] = useState(0);
    const [conversionJobs, setConversionJobs] = useState<ConversionJob[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [mergeFiles, setMergeFiles] = useState<File[]>([]);
    const [activeConversionTarget, setActiveConversionTarget] = useState<string | null>(null);
    // Ribbon header state
    const [activeTab, setActiveTab] = useState<RibbonTab>('home');
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [findHits, setFindHits] = useState<number[]>([]);
    const [findIdx, setFindIdx] = useState(0);
    const [findBusy, setFindBusy] = useState(false);
    // Undo/redo history. We keep stack *lengths* in state (so the toolbar
    // buttons re-render their enabled/disabled state) while the byte snapshots
    // live in refs (avoids cloning large Uint8Arrays through React state).
    const [histLen, setHistLen] = useState({ undo: 0, redo: 0 });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mergeInputRef = useRef<HTMLInputElement>(null);
    const convertInputRef = useRef<HTMLInputElement>(null);
    const viewerContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    // Loaded pdfjs document + in-flight render task (held in refs so page nav,
    // zoom, rotate, fit-width and search all reuse one parsed document instead
    // of re-fetching + re-parsing the blob on every interaction).
    const pdfDocRef = useRef<any>(null);
    const renderTaskRef = useRef<any>(null);
    // Working-document edit model: the bytes currently shown in the viewer.
    // Edit operations (rotate/delete/watermark/annotate/…) mutate these bytes
    // in place and push the prior snapshot onto the undo stack, so Undo/Redo in
    // the ribbon are genuinely functional. Capped to MAX_HISTORY snapshots.
    const workingBytesRef = useRef<Uint8Array | null>(null);
    const undoStackRef = useRef<Uint8Array[]>([]);
    const redoStackRef = useRef<Uint8Array[]>([]);
    const MAX_HISTORY = 25;

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    // ---- Load Recent Files from Backend ----
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/files?limit=20`);
                if (!res.ok) return;
                const json = await res.json();
                const files = (json.data || json.files || []).slice(0, 10);
                setRecentFiles(files.map((f: any) => ({
                    id: f.id,
                    name: f.name || f.fileName || 'Unknown',
                    openedAt: f.updatedAt || f.createdAt || new Date().toISOString(),
                    size: formatFileSize(f.size || 0),
                    path: f.path,
                    type: f.type || 'pdf',
                })));
            } catch { /* silent */ }
        })();
    }, []);

    function formatFileSize(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
    }

    function formatDate(iso: string): string {
        try {
            const d = new Date(iso);
            return d.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace('T', ' ');
        } catch { return iso; }
    }

    // ---- PDF Viewer ----
    // Load a set of PDF bytes into the viewer: parse with pdfjs, refresh page
    // count, expose a fresh object URL (for print/preview) and trigger a render
    // via the docVersion bump. `bytes` becomes the live working document.
    const loadDocFromBytes = useCallback(async (bytes: Uint8Array, name?: string) => {
        const pdfjsLib = await loadPdfjs();
        // pdfjs transfers/detaches the buffer it parses, so hand it a copy and
        // keep our own pristine snapshot as the working document.
        const pdf = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
        pdfDocRef.current = pdf;
        workingBytesRef.current = bytes;
        setTotalPages(pdf.numPages);
        setCurrentPage(prev => Math.min(Math.max(1, prev), pdf.numPages) || 1);

        const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' }));
        setPdfUrl(prev => { if (prev) URL.revokeObjectURL(prev); return url; });
        if (name) setSelectedFile(prev => (prev && prev.name === name ? prev : new File([bytes.slice().buffer as ArrayBuffer], name, { type: 'application/pdf' })));
        setDocVersion(v => v + 1);
    }, []);

    const openPdfFile = useCallback(async (file: File) => {
        setIsLoading(true);
        setViewMode('viewer');
        setActiveTab('home');
        setSelectedFile(file);
        // New document → reset edit history + view transforms.
        undoStackRef.current = [];
        redoStackRef.current = [];
        setHistLen({ undo: 0, redo: 0 });
        setRotation(0);
        setFitWidth(false);
        setCurrentPage(1);
        setFindOpen(false);
        setFindHits([]);
        try {
            const arrayBuffer = await file.arrayBuffer();
            await loadDocFromBytes(new Uint8Array(arrayBuffer), file.name);
        } catch (err) {
            showToast('Failed to open PDF file');
            console.error(err);
            setViewMode('toolset');
        } finally {
            setIsLoading(false);
        }
    }, [loadDocFromBytes]);

    const openRecentFile = useCallback(async (recent: RecentFile) => {
        try {
            const res = await fetch(`${API_BASE}/files/${recent.id}`);
            if (!res.ok) throw new Error('Download failed');
            const blob = await res.blob();
            const file = new File([blob], recent.name, { type: blob.type });

            if (recent.type === 'pdf' || recent.name.endsWith('.pdf')) {
                await openPdfFile(file);
            } else {
                showToast(`Opened: ${recent.name}`);
                setSelectedFile(file);
                setViewMode('viewer');
            }
        } catch {
            showToast(`Cannot open: ${recent.name}`);
        }
    }, [openPdfFile]);

    // Render the current page from the in-memory pdfjs document, applying the
    // active zoom / rotation / fit-width. Cancels any in-flight render first so
    // rapid zoom/page changes never collide on the same canvas (pdfjs throws
    // "Cannot use the same canvas during multiple render() operations").
    const renderCurrentPage = useCallback(async () => {
        const pdf = pdfDocRef.current;
        const canvas = canvasRef.current;
        if (!pdf || !canvas) return;
        if (renderTaskRef.current) {
            try { renderTaskRef.current.cancel(); } catch { /* noop */ }
            renderTaskRef.current = null;
        }
        const page = await pdf.getPage(currentPage);
        let scale = zoomLevel * 1.5;
        if (fitWidth && viewerContainerRef.current) {
            const base = page.getViewport({ scale: 1, rotation });
            const avail = viewerContainerRef.current.clientWidth - 48;
            if (avail > 0) scale = Math.max(0.2, avail / base.width);
        }
        const viewport = page.getViewport({ scale, rotation });
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const task = page.render({ canvasContext: ctx, viewport, canvas } as any);
        renderTaskRef.current = task;
        try {
            await task.promise;
        } catch (e: any) {
            // RenderingCancelledException is expected when superseded — ignore.
            if (e?.name !== 'RenderingCancelledException') throw e;
        } finally {
            if (renderTaskRef.current === task) renderTaskRef.current = null;
        }
    }, [currentPage, zoomLevel, rotation, fitWidth]);

    // Re-render whenever the page, zoom, rotation, fit-width or document change.
    useEffect(() => {
        if (viewMode !== 'viewer' || !pdfDocRef.current) return;
        let cancelled = false;
        setIsLoading(true);
        renderCurrentPage()
            .catch(() => { if (!cancelled) showToast('Failed to render page'); })
            .finally(() => { if (!cancelled) setIsLoading(false); });
        return () => { cancelled = true; };
    }, [renderCurrentPage, docVersion, viewMode]);

    const goToPage = useCallback((pageNum: number) => {
        if (Number.isNaN(pageNum) || pageNum < 1 || pageNum > totalPages) return;
        setCurrentPage(pageNum);
    }, [totalPages]);

    // ---- Edit history engine ----
    // Build a File from the live working bytes so export/convert/extract operate
    // on the *edited* document, not the originally-opened file.
    const currentPdfFile = useCallback((): File | null => {
        const b = workingBytesRef.current;
        const name = selectedFile?.name || 'document.pdf';
        if (b) return new File([b.slice().buffer as ArrayBuffer], name, { type: 'application/pdf' });
        return selectedFile;
    }, [selectedFile]);

    // Run a pdf-lib transform against the working document, commit the result
    // in-view, and push the prior snapshot onto the undo stack.
    const applyEdit = useCallback(async (
        transform: (pdf: PDFDocument) => Promise<void> | void,
        label: string,
        saveOptions?: Parameters<PDFDocument['save']>[0],
    ) => {
        const base = workingBytesRef.current;
        if (!base) { showToast('Open a PDF first'); return; }
        setIsLoading(true);
        try {
            const pdf = await PDFDocument.load(base.slice());
            await transform(pdf);
            const out = await pdf.save(saveOptions);
            undoStackRef.current.push(base);
            if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
            redoStackRef.current = [];
            setHistLen({ undo: undoStackRef.current.length, redo: 0 });
            await loadDocFromBytes(out, selectedFile?.name);
            showToast(label);
        } catch (e: any) {
            showToast(`Edit failed: ${e?.message || e}`);
        } finally {
            setIsLoading(false);
        }
    }, [loadDocFromBytes, selectedFile]);

    const undo = useCallback(async () => {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        const prev = stack.pop()!;
        if (workingBytesRef.current) redoStackRef.current.push(workingBytesRef.current);
        setHistLen({ undo: stack.length, redo: redoStackRef.current.length });
        setIsLoading(true);
        try { await loadDocFromBytes(prev, selectedFile?.name); showToast('Undo'); }
        finally { setIsLoading(false); }
    }, [loadDocFromBytes, selectedFile]);

    const redo = useCallback(async () => {
        const stack = redoStackRef.current;
        if (!stack.length) return;
        const next = stack.pop()!;
        if (workingBytesRef.current) {
            undoStackRef.current.push(workingBytesRef.current);
            if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
        }
        setHistLen({ undo: undoStackRef.current.length, redo: stack.length });
        setIsLoading(true);
        try { await loadDocFromBytes(next, selectedFile?.name); showToast('Redo'); }
        finally { setIsLoading(false); }
    }, [loadDocFromBytes, selectedFile]);

    // ---- View transforms (do not mutate the document) ----
    const rotateView = useCallback(() => setRotation(r => (r + 90) % 360), []);
    const toggleFitWidth = useCallback(() => setFitWidth(f => !f), []);

    // ---- Save / Print the working document ----
    const downloadOpenPdf = useCallback(() => {
        const b = workingBytesRef.current;
        if (!b) { showToast('Open a PDF first'); return; }
        const name = selectedFile?.name || 'document.pdf';
        downloadPdfBytes(b.slice(), name);
        showToast(`Saved ${name}`);
    }, [selectedFile]);

    const printPdf = useCallback(() => {
        const url = pdfUrl;
        if (!url) { showToast('Open a PDF first'); return; }
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        iframe.src = url;
        iframe.onload = () => {
            try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
            catch { window.open(url, '_blank'); }
        };
        document.body.appendChild(iframe);
        setTimeout(() => { try { document.body.removeChild(iframe); } catch { /* noop */ } }, 60000);
    }, [pdfUrl]);

    // ---- In-document text search (jump to matching pages) ----
    const runFind = useCallback(async (q: string) => {
        const pdf = pdfDocRef.current;
        const needle = q.trim().toLowerCase();
        if (!pdf || !needle) { setFindHits([]); setFindIdx(0); return; }
        setFindBusy(true);
        try {
            const hits: number[] = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const text = content.items.map((it: any) => (typeof it.str === 'string' ? it.str : '')).join(' ').toLowerCase();
                let from = 0;
                for (;;) {
                    const at = text.indexOf(needle, from);
                    if (at === -1) break;
                    hits.push(i);
                    from = at + needle.length;
                }
            }
            setFindHits(hits);
            setFindIdx(0);
            if (hits.length) { setCurrentPage(hits[0]); showToast(`${hits.length} match${hits.length > 1 ? 'es' : ''}`); }
            else showToast('No matches');
        } finally { setFindBusy(false); }
    }, []);

    const stepFind = useCallback((dir: 1 | -1) => {
        if (!findHits.length) return;
        const next = (findIdx + dir + findHits.length) % findHits.length;
        setFindIdx(next);
        setCurrentPage(findHits[next]);
    }, [findHits, findIdx]);

    // ---- Conversion Engine ----
    // Client-side-handled formats: try in-browser FIRST (instant + no backend round-trip).
    // Backend-only formats (docx/xlsx/pptx + reverse): hit /docs/convert which requires
    // LibreOffice on backend; falls back to a friendly error if unavailable.
    const CLIENT_FORMATS = new Set(['txt', 'png', 'jpeg', 'jpg', 'html', 'md', 'rtf', 'xml']);
    const BACKEND_ONLY_FORMATS = new Set(['docx', 'xlsx', 'pptx', 'pdf-from-docx', 'pdf-from-xlsx', 'pdf-from-pptx']);

    const convertFile = useCallback(async (file: File, targetFormat: string) => {
        const jobId = `job_${Date.now().toString(36)}`;
        const job: ConversionJob = {
            id: jobId,
            sourceFile: file.name,
            targetFormat,
            status: 'processing',
            progress: 0,
        };
        setConversionJobs(prev => [job, ...prev]);
        setViewMode('converting');

        const progressInterval = setInterval(() => {
            setConversionJobs(prev => prev.map(j =>
                j.id === jobId && j.status === 'processing'
                    ? { ...j, progress: Math.min(j.progress + 12, 90) }
                    : j
            ));
        }, 200);

        try {
            // 1. Try client-side first for supported formats (fast path)
            if (CLIENT_FORMATS.has(targetFormat)) {
                const result = await clientSideConvert(file, targetFormat);
                if (result) {
                    clearInterval(progressInterval);
                    setConversionJobs(prev => prev.map(j =>
                        j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl: result } : j
                    ));
                    showToast(`Converted to ${targetFormat.toUpperCase()}`);
                    return;
                }
            }

            // 2. Backend (requires LibreOffice for office formats)
            const formData = new FormData();
            formData.append('file', file);
            formData.append('targetFormat', targetFormat);

            let res: Response | null = null;
            try {
                res = await fetch(`${API_BASE}/docs/convert`, {
                    method: 'POST',
                    body: formData,
                });
            } catch {
                res = null;
            }

            clearInterval(progressInterval);

            if (res && res.ok) {
                const blob = await res.blob();
                const resultUrl = URL.createObjectURL(blob);
                setConversionJobs(prev => prev.map(j =>
                    j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl } : j
                ));
                showToast(`Converted to ${targetFormat.toUpperCase()}`);
            } else {
                // Backend failed → try client fallback if not already tried
                if (!CLIENT_FORMATS.has(targetFormat)) {
                    const result = await clientSideConvert(file, targetFormat);
                    if (result) {
                        setConversionJobs(prev => prev.map(j =>
                            j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl: result } : j
                        ));
                        showToast(`Converted to ${targetFormat.toUpperCase()}`);
                        return;
                    }
                }
                const msg = BACKEND_ONLY_FORMATS.has(targetFormat)
                    ? `${targetFormat.toUpperCase()} requires LibreOffice on the backend (not yet installed). Available client-side formats: TXT, PNG, JPEG, HTML, MD, RTF, XML.`
                    : `Conversion to ${targetFormat.toUpperCase()} unavailable`;
                throw new Error(msg);
            }
        } catch (err: any) {
            clearInterval(progressInterval);
            setConversionJobs(prev => prev.map(j =>
                j.id === jobId ? { ...j, status: 'error', progress: 0, error: err.message || 'Conversion failed' } : j
            ));
            showToast(`Conversion failed: ${err.message || 'Unknown error'}`);
        }
    }, []);

    // Client-side conversions for what pdf-lib / pdfjs can handle
    const clientSideConvert = async (file: File, targetFormat: string): Promise<string | null> => {
        const arrayBuffer = await file.arrayBuffer();

        switch (targetFormat) {
            case 'txt': {
                // PDF to TXT using pdf.js
                const pdfjsLib = await loadPdfjs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items
                        .map((item: any) => item.str)
                        .join(' ');
                    fullText += `--- Page ${i} ---\n${pageText}\n\n`;
                }
                const blob = new Blob([fullText], { type: 'text/plain' });
                return URL.createObjectURL(blob);
            }
            case 'png':
            case 'jpeg':
            case 'jpg': {
                // PDF page to image using canvas
                const pdfjsLib = await loadPdfjs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;
                await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
                const mimeType = targetFormat === 'png' ? 'image/png' : 'image/jpeg';
                const dataUrl = canvas.toDataURL(mimeType, 0.92);
                const res = await fetch(dataUrl);
                const blob = await res.blob();
                return URL.createObjectURL(blob);
            }
            case 'html': {
                // PDF to basic HTML
                const pdfjsLib = await loadPdfjs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let html = '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>Converted PDF</title>\n<style>body{font-family:sans-serif;padding:40px;max-width:800px;margin:0 auto;}.page{margin-bottom:40px;padding-bottom:20px;border-bottom:1px solid #ddd;}.page-num{color:#999;font-size:12px;}</style>\n</head>\n<body>\n';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const paragraphs = content.items.map((item: any) => `<p>${escapeHtml(item.str)}</p>`).join('\n');
                    html += `<div class="page"><div class="page-num">Page ${i}</div>\n${paragraphs}\n</div>\n`;
                }
                html += '</body>\n</html>';
                const blob = new Blob([html], { type: 'text/html' });
                return URL.createObjectURL(blob);
            }
            case 'md': {
                // PDF to Markdown — plain text with page headers
                const pdfjsLib = await loadPdfjs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let md = `# ${file.name.replace(/\.pdf$/i, '')}\n\n`;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map((item: any) => item.str).join(' ');
                    md += `## Page ${i}\n\n${pageText}\n\n`;
                }
                const blob = new Blob([md], { type: 'text/markdown' });
                return URL.createObjectURL(blob);
            }
            case 'rtf': {
                // PDF to RTF — plain text wrapped in minimal RTF header
                const pdfjsLib = await loadPdfjs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let body = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map((item: any) => item.str).join(' ');
                    body += `\\par\\b Page ${i}\\b0\\par ${pageText.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')}\\par\\par `;
                }
                const rtf = `{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 ${body}}`;
                const blob = new Blob([rtf], { type: 'application/rtf' });
                return URL.createObjectURL(blob);
            }
            case 'xml': {
                // PDF to XML — structured page/text element tree
                const pdfjsLib = await loadPdfjs();
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<document>\n';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    xml += `  <page number="${i}">\n`;
                    for (const item of content.items as any[]) {
                        xml += `    <text>${escapeHtml(item.str)}</text>\n`;
                    }
                    xml += '  </page>\n';
                }
                xml += '</document>\n';
                const blob = new Blob([xml], { type: 'application/xml' });
                return URL.createObjectURL(blob);
            }
            default:
                // DOCX / XLSX / PPTX require server-side LibreOffice — not available client-side
                return null;
        }
    };

    // ---- Edit Operations (pdf-lib, all client-side) ----
    const downloadPdfBytes = (bytes: Uint8Array, filename: string) => {
        const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    const parsePageRange = (input: string, total: number): number[] => {
        // 1-based input → 0-based indices; supports "1-3,5,7-9" syntax
        const out: number[] = [];
        for (const part of input.split(',')) {
            const trimmed = part.trim();
            if (!trimmed) continue;
            if (trimmed.includes('-')) {
                const [s, e] = trimmed.split('-').map(n => Number(n.trim()));
                for (let i = Math.max(1, s); i <= Math.min(total, e); i++) out.push(i - 1);
            } else {
                const n = Number(trimmed);
                if (n >= 1 && n <= total) out.push(n - 1);
            }
        }
        return Array.from(new Set(out)).sort((a, b) => a - b);
    };

    const rotatePages = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const angleStr = window.prompt('Rotation angle (90, 180, 270, or -90)?', '90');
        if (!angleStr) return;
        const angle = Number(angleStr);
        if (![90, 180, 270, -90, -180, -270].includes(angle)) { showToast('Invalid angle'); return; }
        const rangeStr = window.prompt('Pages to rotate (e.g., "1-3,5" or "all")?', 'all');
        if (rangeStr === null) return;
        let count = 0;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            const indices = rangeStr.trim().toLowerCase() === 'all'
                ? Array.from({ length: total }, (_, i) => i)
                : parsePageRange(rangeStr, total);
            indices.forEach(i => {
                const p = pdf.getPage(i);
                p.setRotation(degrees((p.getRotation().angle + angle + 360) % 360));
            });
            count = indices.length;
        }, `Rotated ${rangeStr.trim().toLowerCase() === 'all' ? 'all' : count} page(s) by ${angle}°`);
    }, [applyEdit]);

    const deletePages = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const rangeStr = window.prompt('Pages to DELETE (e.g., "1-3,5")?', '');
        if (!rangeStr) return;
        let removed = 0;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            const removeSet = new Set(parsePageRange(rangeStr, total));
            if (removeSet.size === 0) throw new Error('No valid pages');
            if (removeSet.size >= total) throw new Error('Cannot delete all pages');
            // Delete from highest index down so earlier indices stay valid
            Array.from(removeSet).sort((a, b) => b - a).forEach(i => pdf.removePage(i));
            removed = removeSet.size;
        }, `Deleted ${removed} page(s)`);
    }, [applyEdit]);

    const addWatermark = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const text = window.prompt('Watermark text?', 'DRAFT');
        if (!text) return;
        let n = 0;
        await applyEdit(async pdf => {
            const font = await pdf.embedFont(StandardFonts.HelveticaBold);
            const pages = pdf.getPages();
            pages.forEach(p => {
                const { width, height } = p.getSize();
                const size = Math.min(width, height) * 0.18;
                const textWidth = font.widthOfTextAtSize(text, size);
                p.drawText(text, {
                    x: (width - textWidth) / 2, y: height / 2,
                    size, font, color: rgb(0.75, 0.75, 0.75),
                    opacity: 0.35, rotate: degrees(45),
                });
            });
            n = pages.length;
        }, `Watermark "${text}" added to ${n} page(s)`);
    }, [applyEdit]);

    const addPageNumbers = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        let n = 0;
        await applyEdit(async pdf => {
            const font = await pdf.embedFont(StandardFonts.Helvetica);
            const pages = pdf.getPages();
            pages.forEach((p, i) => {
                const { width } = p.getSize();
                const label = `${i + 1} / ${pages.length}`;
                const size = 10;
                const textWidth = font.widthOfTextAtSize(label, size);
                p.drawText(label, { x: (width - textWidth) / 2, y: 24, size, font, color: rgb(0.4, 0.4, 0.4) });
            });
            n = pages.length;
        }, `Page numbers added to ${n} page(s)`);
    }, [applyEdit]);

    // Shared text placement used by Add Text, Date, Signature and Note.
    const placeText = useCallback(async (defaultText: string, label: string, sizeDefault: number, oblique = false) => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const text = window.prompt(`${label} — text?`, defaultText);
        if (!text) return;
        const pageStr = window.prompt(`Which page (1-${totalPages || '?'})?`, String(currentPage || 1));
        if (!pageStr) return;
        const pageNum = Number(pageStr);
        const xStr = window.prompt('X position from left (default 50)?', '50');
        if (xStr === null) return;
        const yStr = window.prompt('Y position from bottom (default 50)?', '50');
        if (yStr === null) return;
        const sizeStr = window.prompt('Font size?', String(sizeDefault));
        if (sizeStr === null) return;
        await applyEdit(async pdf => {
            const total = pdf.getPageCount();
            if (pageNum < 1 || pageNum > total) throw new Error('Page out of range');
            const font = await pdf.embedFont(oblique ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica);
            pdf.getPage(pageNum - 1).drawText(text, {
                x: Number(xStr) || 50, y: Number(yStr) || 50,
                size: Number(sizeStr) || sizeDefault, font, color: rgb(0, 0, 0),
            });
        }, `${label} added to page ${pageNum}`);
    }, [applyEdit, totalPages, currentPage]);

    const addTextOverlay = useCallback(() => placeText('', 'Text', 14), [placeText]);
    const addDate = useCallback(() => placeText(new Date().toLocaleDateString(), 'Date', 12), [placeText]);
    const addSignature = useCallback(() => placeText('', 'Signature', 28, true), [placeText]);
    const addNote = useCallback(() => placeText('', 'Note', 12), [placeText]);

    // Fill & Sign: draw a checkmark (two strokes) so we don't depend on a glyph
    // the standard WinAnsi font can't encode.
    const addCheckmark = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const pageStr = window.prompt(`Which page (1-${totalPages || '?'})?`, String(currentPage || 1));
        if (!pageStr) return;
        const pageNum = Number(pageStr);
        const xStr = window.prompt('X position from left (default 60)?', '60');
        if (xStr === null) return;
        const yStr = window.prompt('Y position from bottom (default 60)?', '60');
        if (yStr === null) return;
        const x = Number(xStr) || 60, y = Number(yStr) || 60;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            if (pageNum < 1 || pageNum > total) throw new Error('Page out of range');
            const page = pdf.getPage(pageNum - 1);
            const color = rgb(0.13, 0.55, 0.13);
            page.drawLine({ start: { x, y: y + 4 }, end: { x: x + 6, y }, thickness: 2.5, color });
            page.drawLine({ start: { x: x + 6, y }, end: { x: x + 18, y: y + 16 }, thickness: 2.5, color });
        }, `Checkmark added to page ${pageNum}`);
    }, [applyEdit, totalPages, currentPage]);

    // Annotations: highlight box, underline, and outline rectangle.
    const addHighlight = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const pageStr = window.prompt(`Which page (1-${totalPages || '?'})?`, String(currentPage || 1));
        if (!pageStr) return;
        const pageNum = Number(pageStr);
        const xStr = window.prompt('X from left (default 50)?', '50'); if (xStr === null) return;
        const yStr = window.prompt('Y from bottom (default 50)?', '50'); if (yStr === null) return;
        const wStr = window.prompt('Width (default 200)?', '200'); if (wStr === null) return;
        const hStr = window.prompt('Height (default 16)?', '16'); if (hStr === null) return;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            if (pageNum < 1 || pageNum > total) throw new Error('Page out of range');
            pdf.getPage(pageNum - 1).drawRectangle({
                x: Number(xStr) || 50, y: Number(yStr) || 50,
                width: Number(wStr) || 200, height: Number(hStr) || 16,
                color: rgb(1, 0.9, 0.2), opacity: 0.4,
            });
        }, `Highlight added to page ${pageNum}`);
    }, [applyEdit, totalPages, currentPage]);

    const addUnderline = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const pageStr = window.prompt(`Which page (1-${totalPages || '?'})?`, String(currentPage || 1));
        if (!pageStr) return;
        const pageNum = Number(pageStr);
        const xStr = window.prompt('X from left (default 50)?', '50'); if (xStr === null) return;
        const yStr = window.prompt('Y from bottom (default 50)?', '50'); if (yStr === null) return;
        const wStr = window.prompt('Length (default 200)?', '200'); if (wStr === null) return;
        const x = Number(xStr) || 50, y = Number(yStr) || 50, w = Number(wStr) || 200;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            if (pageNum < 1 || pageNum > total) throw new Error('Page out of range');
            pdf.getPage(pageNum - 1).drawLine({ start: { x, y }, end: { x: x + w, y }, thickness: 1.5, color: rgb(0.85, 0.1, 0.1) });
        }, `Underline added to page ${pageNum}`);
    }, [applyEdit, totalPages, currentPage]);

    const addRectangle = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const pageStr = window.prompt(`Which page (1-${totalPages || '?'})?`, String(currentPage || 1));
        if (!pageStr) return;
        const pageNum = Number(pageStr);
        const xStr = window.prompt('X from left (default 50)?', '50'); if (xStr === null) return;
        const yStr = window.prompt('Y from bottom (default 50)?', '50'); if (yStr === null) return;
        const wStr = window.prompt('Width (default 160)?', '160'); if (wStr === null) return;
        const hStr = window.prompt('Height (default 80)?', '80'); if (hStr === null) return;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            if (pageNum < 1 || pageNum > total) throw new Error('Page out of range');
            pdf.getPage(pageNum - 1).drawRectangle({
                x: Number(xStr) || 50, y: Number(yStr) || 50,
                width: Number(wStr) || 160, height: Number(hStr) || 80,
                borderColor: rgb(0.85, 0.1, 0.1), borderWidth: 1.5,
            });
        }, `Box added to page ${pageNum}`);
    }, [applyEdit, totalPages, currentPage]);

    // Form: add an interactive text field, or flatten existing fields.
    const addFormTextField = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        const name = window.prompt('Field name?', `field_${Math.floor(currentPage)}`);
        if (!name) return;
        const pageStr = window.prompt(`Which page (1-${totalPages || '?'})?`, String(currentPage || 1));
        if (!pageStr) return;
        const pageNum = Number(pageStr);
        const xStr = window.prompt('X from left (default 60)?', '60'); if (xStr === null) return;
        const yStr = window.prompt('Y from bottom (default 60)?', '60'); if (yStr === null) return;
        await applyEdit(pdf => {
            const total = pdf.getPageCount();
            if (pageNum < 1 || pageNum > total) throw new Error('Page out of range');
            const form = pdf.getForm();
            const field = form.createTextField(`${name}_${Math.random().toString(36).slice(2, 7)}`);
            field.setText('');
            field.addToPage(pdf.getPage(pageNum - 1), {
                x: Number(xStr) || 60, y: Number(yStr) || 60,
                width: 160, height: 22, borderWidth: 1, borderColor: rgb(0.4, 0.4, 0.4),
            });
        }, `Text field added to page ${pageNum}`);
    }, [applyEdit, totalPages, currentPage]);

    const flattenForm = useCallback(async () => {
        if (!workingBytesRef.current) { showToast('Open a PDF first'); return; }
        await applyEdit(pdf => { pdf.getForm().flatten(); }, 'Form fields flattened (locked)');
    }, [applyEdit]);

    const extractPages = useCallback(async () => {
        const src = currentPdfFile();
        if (!src) { showToast('Open a PDF first'); return; }
        const rangeStr = window.prompt('Pages to extract (e.g., "1-3,5")?', '');
        if (!rangeStr) return;
        setIsLoading(true);
        try {
            const buf = await src.arrayBuffer();
            const doc = await PDFDocument.load(buf);
            const total = doc.getPageCount();
            const indices = parsePageRange(rangeStr, total);
            if (indices.length === 0) { showToast('No valid pages'); return; }
            const out = await PDFDocument.create();
            const copied = await out.copyPages(doc, indices);
            copied.forEach(p => out.addPage(p));
            const bytes = await out.save();
            downloadPdfBytes(bytes, `extract_${src.name}`);
            showToast(`Extracted ${indices.length} page(s)`);
        } catch (e: any) {
            showToast(`Extract failed: ${e.message}`);
        } finally { setIsLoading(false); }
    }, [currentPdfFile]);

    const compressPdf = useCallback(async () => {
        const base = workingBytesRef.current;
        if (!base) { showToast('Open a PDF first'); return; }
        const orig = base.byteLength;
        // No structural change — just re-serialize with object streams, which
        // pdf-lib packs more compactly (~15-30% on uncompressed PDFs).
        await applyEdit(() => { /* re-save only */ },
            `Compressed: ${formatFileSize(orig)} → …`,
            { useObjectStreams: true, addDefaultPage: false });
        const after = workingBytesRef.current?.byteLength ?? orig;
        const pct = Math.round((1 - after / orig) * 100);
        showToast(`Compressed: ${formatFileSize(orig)} → ${formatFileSize(after)} (${pct > 0 ? `-${pct}%` : 'no change'})`);
    }, [applyEdit]);

    function escapeHtml(unsafe: string): string {
        return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // ---- Merge PDFs ----
    const mergePdfs = useCallback(async () => {
        if (mergeFiles.length < 2) {
            showToast('Select at least 2 PDF files to merge');
            return;
        }
        setIsLoading(true);
        try {
            const mergedPdf = await PDFDocument.create();
            for (const file of mergeFiles) {
                const arrayBuffer = await file.arrayBuffer();
                const pdf = await PDFDocument.load(arrayBuffer);
                const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                pages.forEach(page => mergedPdf.addPage(page));
            }
            const pdfBytes = await mergedPdf.save();
            const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);

            // Auto-download
            const a = document.createElement('a');
            a.href = url;
            a.download = 'merged.pdf';
            a.click();

            showToast(`✅ Merged ${mergeFiles.length} PDFs successfully`);
            setMergeFiles([]);
        } catch (err: any) {
            showToast(`❌ Merge failed: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [mergeFiles]);

    // ---- Split PDF (exports the chosen pages as a new file) ----
    const splitPdf = useCallback(async () => {
        const src = currentPdfFile();
        if (!src) { showToast('Open a PDF file first'); return; }
        const range = window.prompt('Pages to split out (e.g., "1-3,5" — blank = all)?', '');
        if (range === null) return;
        setIsLoading(true);
        try {
            const arrayBuffer = await src.arrayBuffer();
            const srcPdf = await PDFDocument.load(arrayBuffer);
            const total = srcPdf.getPageCount();
            const pageIndices = range.trim()
                ? parsePageRange(range, total)
                : Array.from({ length: total }, (_, i) => i);

            if (pageIndices.length === 0) { showToast('Invalid page range'); return; }

            const newPdf = await PDFDocument.create();
            const pages = await newPdf.copyPages(srcPdf, pageIndices);
            pages.forEach(page => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();
            downloadPdfBytes(pdfBytes, `split_${src.name}`);
            showToast(`Split complete: ${pageIndices.length} page(s) exported`);
        } catch (err: any) {
            showToast(`Split failed: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [currentPdfFile]);

    // ---- Create Blank PDF ----
    const createBlankPdf = useCallback(async () => {
        const pdf = await PDFDocument.create();
        pdf.addPage([612, 792]);
        const pdfBytes = await pdf.save();
        const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
        const file = new File([blob], 'untitled.pdf', { type: 'application/pdf' });
        await openPdfFile(file);
    }, [openPdfFile]);

    // ---- Download conversion result ----
    const downloadResult = (job: ConversionJob) => {
        if (!job.resultUrl) return;
        const a = document.createElement('a');
        a.href = job.resultUrl;
        const ext = job.targetFormat;
        const base = job.sourceFile.replace(/\.[^/.]+$/, '');
        a.download = `${base}.${ext}`;
        a.click();
        showToast(`Downloaded ${base}.${ext}`);
    };

    // ---- Tool Definitions ----
    const triggerConvert = (target: string) => {
        setActiveConversionTarget(target);
        convertInputRef.current?.click();
    };

    const tools: PDFTool[] = [
        // Convert from PDF
        { id: 'pdf-to-word', label: 'PDF to Word', icon: 'W', iconBg: '#2b579a', category: ['hot', 'from-pdf', 'all'], description: 'Convert PDF to editable Word document', action: () => triggerConvert('docx') },
        { id: 'pdf-to-excel', label: 'PDF to Excel', icon: 'X', iconBg: '#217346', category: ['hot', 'from-pdf', 'all'], description: 'Extract tables to Excel spreadsheet', action: () => triggerConvert('xlsx') },
        { id: 'pdf-to-ppt', label: 'PDF to PPT', icon: '⊙', iconBg: '#d24726', category: ['hot', 'from-pdf', 'all'], description: 'Convert PDF slides to PowerPoint', action: () => triggerConvert('pptx') },
        { id: 'pdf-to-png', label: 'PDF to PNG', icon: '🖼', iconBg: '#6c5ce7', category: ['hot', 'from-pdf', 'all'], description: 'Render PDF pages as PNG images', action: () => triggerConvert('png') },
        { id: 'pdf-to-jpeg', label: 'PDF to JPEG', icon: '🌅', iconBg: '#00b894', category: ['from-pdf', 'all'], description: 'Render PDF pages as JPEG images', action: () => triggerConvert('jpeg') },
        { id: 'pdf-to-rtf', label: 'PDF to RTF', icon: 'R', iconBg: '#e84393', category: ['from-pdf', 'all'], description: 'Convert PDF to Rich Text Format', action: () => triggerConvert('rtf') },
        { id: 'pdf-to-txt', label: 'PDF to TXT', icon: 'T', iconBg: '#fdcb6e', category: ['hot', 'from-pdf', 'all'], description: 'Extract plain text from PDF', action: () => triggerConvert('txt') },
        { id: 'pdf-to-html', label: 'PDF to HTML', icon: '<>', iconBg: '#e17055', category: ['from-pdf', 'all'], description: 'Convert PDF to HTML web page', action: () => triggerConvert('html') },
        { id: 'pdf-to-xml', label: 'PDF to XML', icon: '</>', iconBg: '#0984e3', category: ['from-pdf', 'all'], description: 'Extract structured XML from PDF', action: () => triggerConvert('xml') },

        // Convert to PDF
        { id: 'word-to-pdf', label: 'Word to PDF', icon: 'W', iconBg: '#2b579a', category: ['hot', 'to-pdf', 'all'], description: 'Convert Word document to PDF', action: () => triggerConvert('pdf-from-docx') },
        { id: 'excel-to-pdf', label: 'Excel to PDF', icon: 'X', iconBg: '#217346', category: ['to-pdf', 'all'], description: 'Convert Excel spreadsheet to PDF', action: () => triggerConvert('pdf-from-xlsx') },
        { id: 'ppt-to-pdf', label: 'PPT to PDF', icon: '⊙', iconBg: '#d24726', category: ['to-pdf', 'all'], description: 'Convert PowerPoint to PDF', action: () => triggerConvert('pdf-from-pptx') },

        // Merge & Split
        { id: 'merge-pdf', label: 'Merge PDFs', icon: '⊕', iconBg: '#6c5ce7', category: ['hot', 'merge-split', 'all'], description: 'Combine multiple PDFs into one', action: () => mergeInputRef.current?.click() },
        { id: 'split-pdf', label: 'Split PDF', icon: '✂', iconBg: '#00cec9', category: ['hot', 'merge-split', 'all'], description: 'Split PDF by page range', action: () => { if (!selectedFile) { fileInputRef.current?.click(); } else { showToast('Use the split controls in the viewer'); } } },

        // ---- Edit (all client-side via pdf-lib) ----
        { id: 'rotate-pages', label: 'Rotate Pages', icon: '↻', iconBg: '#0984e3', category: ['hot', 'edit', 'all'], description: 'Rotate selected pages 90/180/270°', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void rotatePages(); } },
        { id: 'delete-pages', label: 'Delete Pages', icon: '🗑', iconBg: '#d63031', category: ['hot', 'edit', 'all'], description: 'Remove pages from PDF', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void deletePages(); } },
        { id: 'extract-pages', label: 'Extract Pages', icon: '⎘', iconBg: '#00b894', category: ['edit', 'all'], description: 'Save selected pages as new PDF', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void extractPages(); } },
        { id: 'add-watermark', label: 'Watermark', icon: '⌘', iconBg: '#fdcb6e', category: ['hot', 'edit', 'all'], description: 'Add diagonal text watermark to all pages', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void addWatermark(); } },
        { id: 'page-numbers', label: 'Page Numbers', icon: '№', iconBg: '#6c5ce7', category: ['edit', 'all'], description: 'Add page numbers to bottom of each page', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void addPageNumbers(); } },
        { id: 'text-overlay', label: 'Add Text', icon: '✎', iconBg: '#e17055', category: ['edit', 'all'], description: 'Draw text on a specific page', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void addTextOverlay(); } },
        { id: 'compress-pdf', label: 'Compress PDF', icon: '⇪', iconBg: '#00cec9', category: ['edit', 'all'], description: 'Reduce file size via object streams', action: () => { if (!selectedFile) fileInputRef.current?.click(); else void compressPdf(); } },
    ];

    const filteredTools = activeCategory === 'all'
        ? tools
        : tools.filter(t => t.category.includes(activeCategory));

    // ---- Handle file selection for conversion ----
    const handleConvertFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !activeConversionTarget) return;
        e.target.value = '';
        await convertFile(file, activeConversionTarget);
        setActiveConversionTarget(null);
    };

    const handleMergeFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (files.length > 0) {
            setMergeFiles(prev => [...prev, ...files]);
            showToast(`Added ${files.length} file(s) to merge queue`);
        }
    };

    const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.name.endsWith('.pdf')) {
            await openPdfFile(file);
        } else {
            setSelectedFile(file);
            showToast(`Loaded: ${file.name}`);
        }
    };

    // ---- Category Tabs ----
    const categories: { key: ToolCategory; label: string }[] = [
        { key: 'hot', label: 'Hot Tools' },
        { key: 'from-pdf', label: 'Convert from PDF' },
        { key: 'to-pdf', label: 'Convert to PDF' },
        { key: 'merge-split', label: 'Merge & Split' },
        { key: 'edit', label: 'Edit' },
        { key: 'all', label: 'All Tools' },
    ];

    // ---- Ribbon (viewer header shortcut bar) ----
    const ribbonTabs: { key: RibbonTab; label: string }[] = [
        { key: 'home', label: 'Home' },
        { key: 'fill-sign', label: 'Fill & Sign' },
        { key: 'edit', label: 'Edit' },
        { key: 'pages', label: 'Pages' },
        { key: 'form', label: 'Form' },
        { key: 'tools', label: 'Tools' },
        { key: 'protect', label: 'Protect' },
        { key: 'annotate', label: 'Annotations' },
    ];

    // Render a single ribbon button (icon over label). Plain function (not a
    // component) so React doesn't remount the subtree each render.
    const rbtn = (
        Icon: LucideIcon,
        label: string,
        onClick: () => void,
        opts?: { disabled?: boolean; active?: boolean; danger?: boolean },
    ) => (
        <button
            key={label}
            type="button"
            className={`pdfg-rb${opts?.active ? ' is-active' : ''}${opts?.danger ? ' is-danger' : ''}`}
            onClick={onClick}
            disabled={opts?.disabled}
            title={label}
            aria-label={label}
        >
            <Icon size={20} aria-hidden="true" />
            <span className="pdfg-rb__label">{label}</span>
        </button>
    );

    const convertCurrent = (fmt: string) => {
        const f = currentPdfFile();
        if (f) void convertFile(f, fmt); else showToast('Open a PDF first');
    };

    const renderRibbonBody = () => {
        const busy = isLoading;
        switch (activeTab) {
            case 'home':
                return <>
                    {rbtn(FolderOpen, 'Open', () => fileInputRef.current?.click())}
                    {rbtn(Save, 'Save', downloadOpenPdf, { disabled: busy })}
                    {rbtn(Printer, 'Print', printPdf)}
                    {rbtn(Search, 'Find', () => setFindOpen(o => !o), { active: findOpen })}
                </>;
            case 'fill-sign':
                return <>
                    {rbtn(Type, 'Add Text', addTextOverlay, { disabled: busy })}
                    {rbtn(PenTool, 'Signature', addSignature, { disabled: busy })}
                    {rbtn(Calendar, 'Date', addDate, { disabled: busy })}
                    {rbtn(Check, 'Checkmark', addCheckmark, { disabled: busy })}
                </>;
            case 'edit':
                return <>
                    {rbtn(Type, 'Add Text', addTextOverlay, { disabled: busy })}
                    {rbtn(Droplet, 'Watermark', addWatermark, { disabled: busy })}
                    {rbtn(Hash, 'Page Numbers', addPageNumbers, { disabled: busy })}
                    {rbtn(Minimize2, 'Compress', compressPdf, { disabled: busy })}
                </>;
            case 'pages':
                return <>
                    {rbtn(RotateCw, 'Rotate Pages', rotatePages, { disabled: busy })}
                    {rbtn(Trash2, 'Delete', deletePages, { disabled: busy, danger: true })}
                    {rbtn(Copy, 'Extract', extractPages, { disabled: busy })}
                    {rbtn(Scissors, 'Split', splitPdf, { disabled: busy })}
                    {rbtn(Combine, 'Merge', () => mergeInputRef.current?.click())}
                </>;
            case 'form':
                return <>
                    {rbtn(FormInput, 'Add Field', addFormTextField, { disabled: busy })}
                    {rbtn(Lock, 'Flatten', flattenForm, { disabled: busy })}
                </>;
            case 'tools':
                return <>
                    {rbtn(FileText, 'Extract Text', () => convertCurrent('txt'))}
                    {rbtn(FileText, 'Markdown', () => convertCurrent('md'))}
                    {rbtn(FileCode, 'HTML', () => convertCurrent('html'))}
                    {rbtn(FileCode, 'XML', () => convertCurrent('xml'))}
                    {rbtn(FileType2, 'RTF', () => convertCurrent('rtf'))}
                    {rbtn(ImageIcon, 'PNG', () => convertCurrent('png'))}
                    {rbtn(ImageIcon, 'JPEG', () => convertCurrent('jpeg'))}
                    {rbtn(FileType2, 'To Word', () => convertCurrent('docx'))}
                    {rbtn(FileType2, 'To Excel', () => convertCurrent('xlsx'))}
                    {rbtn(FileType2, 'To PPT', () => convertCurrent('pptx'))}
                </>;
            case 'protect':
                return <>
                    {rbtn(Droplet, 'Watermark', addWatermark, { disabled: busy })}
                    {rbtn(Lock, 'Flatten', flattenForm, { disabled: busy })}
                    {rbtn(ShieldCheck, 'Encrypt', () => showToast('Password encryption needs the backend (not available in-browser)'))}
                </>;
            case 'annotate':
                return <>
                    {rbtn(Highlighter, 'Highlight', addHighlight, { disabled: busy })}
                    {rbtn(Minus, 'Underline', addUnderline, { disabled: busy })}
                    {rbtn(Square, 'Box', addRectangle, { disabled: busy })}
                    {rbtn(MessageSquare, 'Note', addNote, { disabled: busy })}
                </>;
            default:
                return null;
        }
    };

    // ---- Render ----
    return (
        <div className="pdfg">
            {/* Hidden file inputs */}
            <input ref={fileInputRef} type="file" accept=".pdf" hidden onChange={handleOpenFile} />
            <input ref={convertInputRef} type="file" accept=".pdf,.docx,.xlsx,.pptx,.doc,.xls,.ppt,.html,.txt,.rtf" hidden onChange={handleConvertFileChange} />
            <input ref={mergeInputRef} type="file" accept=".pdf" multiple hidden onChange={handleMergeFileChange} />

            {/* Sidebar */}
            <div className="pdfg-sidebar">
                <div className="pdfg-sidebar__version">V2.21</div>
                <button className="pdfg-sidebar__open-btn" onClick={() => fileInputRef.current?.click()}>
                    <span className="pdfg-sidebar__open-icon">📂</span> Open File
                </button>
                <button className="pdfg-sidebar__action" onClick={createBlankPdf}>
                    <span>⊕</span> Create Blank PDF
                </button>
                <button className="pdfg-sidebar__action" onClick={() => setViewMode('toolset')}>
                    <span>📖</span> User Guide
                </button>

                {/* Merge queue */}
                {mergeFiles.length > 0 && (
                    <div className="pdfg-sidebar__merge">
                        <div className="pdfg-sidebar__merge-title">Merge Queue ({mergeFiles.length})</div>
                        {mergeFiles.map((f, i) => (
                            <div key={i} className="pdfg-sidebar__merge-item">
                                <span className="pdfg-sidebar__merge-name">{f.name}</span>
                                <button className="pdfg-sidebar__merge-remove" onClick={() => setMergeFiles(prev => prev.filter((_, idx) => idx !== i))}>✕</button>
                            </div>
                        ))}
                        <button className="pdfg-sidebar__merge-add" onClick={() => mergeInputRef.current?.click()}>+ Add More</button>
                        <button className="pdfg-sidebar__open-btn pdfg-sidebar__merge-go" onClick={() => void mergePdfs()} disabled={isLoading}>
                            {isLoading ? '⏳ Merging…' : '⊕ Merge All'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div className="pdfg-main">
                {/* Toolset View */}
                {viewMode === 'toolset' && (
                    <div className="pdfg-toolset">
                        <h2 className="pdfg-toolset__title">Toolset</h2>
                        
                        {/* Category Tabs */}
                        <div className="pdfg-toolset__tabs">
                            {categories.map(cat => (
                                <button
                                    key={cat.key}
                                    className={`pdfg-toolset__tab ${activeCategory === cat.key ? 'pdfg-toolset__tab--active' : ''}`}
                                    onClick={() => setActiveCategory(cat.key)}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        {/* Tool Grid */}
                        <div className="pdfg-toolset__grid">
                            {filteredTools.map(tool => (
                                <button
                                    key={tool.id}
                                    className="pdfg-tool"
                                    onClick={tool.action}
                                    title={tool.description}
                                >
                                    <div className="pdfg-tool__icon" style={{ backgroundColor: tool.iconBg }}>
                                        <span>{tool.icon}</span>
                                    </div>
                                    <span className="pdfg-tool__label">{tool.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Recent Files */}
                        <div className="pdfg-recent">
                            <div className="pdfg-recent__header">
                                <span className="pdfg-recent__title">Recent</span>
                                {recentFiles.length > 0 && (
                                    <button className="pdfg-recent__clear" onClick={() => setRecentFiles([])}>Clear</button>
                                )}
                            </div>
                            {recentFiles.length > 0 ? (
                                <table className="pdfg-recent__table">
                                    <thead>
                                        <tr>
                                            <th>Name</th>
                                            <th>Opened</th>
                                            <th>Size</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recentFiles.map(file => (
                                            <tr
                                                key={file.id}
                                                className="pdfg-recent__row"
                                                onClick={() => void openRecentFile(file)}
                                            >
                                                <td className="pdfg-recent__name">{file.name}</td>
                                                <td className="pdfg-recent__date">{formatDate(file.openedAt)}</td>
                                                <td className="pdfg-recent__size">{file.size}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="pdfg-recent__empty">No recent files</div>
                            )}
                        </div>
                    </div>
                )}

                {/* PDF Viewer */}
                {viewMode === 'viewer' && (
                    <div className="pdfg-viewer">
                        {/* Ribbon shortcut bar: undo/redo + section tabs + contextual tools */}
                        <div className="pdfg-ribbon">
                            <div className="pdfg-ribbon__top">
                                <button className="pdfg-ribbon__icon-btn" onClick={() => setViewMode('toolset')} title="Back to tools" aria-label="Back to tools">
                                    <ArrowLeft size={18} aria-hidden="true" />
                                </button>
                                <span className="pdfg-ribbon__sep" />
                                <button className="pdfg-ribbon__icon-btn" onClick={() => void undo()} disabled={!histLen.undo} title="Undo" aria-label="Undo">
                                    <Undo2 size={18} aria-hidden="true" />
                                </button>
                                <button className="pdfg-ribbon__icon-btn" onClick={() => void redo()} disabled={!histLen.redo} title="Redo" aria-label="Redo">
                                    <Redo2 size={18} aria-hidden="true" />
                                </button>
                                <span className="pdfg-ribbon__sep" />
                                <nav className="pdfg-ribbon__tabs" role="tablist" aria-label="PDF tools">
                                    {ribbonTabs.map(t => (
                                        <button
                                            key={t.key}
                                            role="tab"
                                            aria-selected={activeTab === t.key}
                                            className={`pdfg-ribbon__tab${activeTab === t.key ? ' is-active' : ''}`}
                                            onClick={() => setActiveTab(t.key)}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </nav>
                                <span className="pdfg-ribbon__filename" title={selectedFile?.name || 'untitled.pdf'}>
                                    {selectedFile?.name || 'untitled.pdf'}
                                </span>
                            </div>
                            <div className="pdfg-ribbon__body" role="tabpanel">
                                {renderRibbonBody()}
                            </div>
                        </div>

                        {/* Find bar */}
                        {findOpen && (
                            <div className="pdfg-find">
                                <Search size={15} aria-hidden="true" />
                                <input
                                    className="pdfg-find__input"
                                    autoFocus
                                    value={findQuery}
                                    placeholder="Find in document…"
                                    aria-label="Find in document"
                                    onChange={e => setFindQuery(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') { if (findHits.length) stepFind(1); else void runFind(findQuery); }
                                        else if (e.key === 'Escape') setFindOpen(false);
                                    }}
                                />
                                <button className="pdfg-find__btn" onClick={() => void runFind(findQuery)} disabled={findBusy}>
                                    {findBusy ? '…' : 'Find'}
                                </button>
                                <span className="pdfg-find__count">{findHits.length ? `${findIdx + 1} / ${findHits.length}` : '0 / 0'}</span>
                                <button className="pdfg-find__nav" onClick={() => stepFind(-1)} disabled={!findHits.length} aria-label="Previous match">
                                    <ChevronLeft size={16} aria-hidden="true" />
                                </button>
                                <button className="pdfg-find__nav" onClick={() => stepFind(1)} disabled={!findHits.length} aria-label="Next match">
                                    <ChevronRight size={16} aria-hidden="true" />
                                </button>
                                <button className="pdfg-find__nav" onClick={() => setFindOpen(false)} aria-label="Close find">
                                    <X size={16} aria-hidden="true" />
                                </button>
                            </div>
                        )}

                        {/* Canvas */}
                        <div className="pdfg-viewer__canvas-wrap" ref={viewerContainerRef}>
                            {isLoading && <div className="pdfg-viewer__loading">Loading…</div>}
                            <canvas ref={canvasRef} className="pdfg-viewer__canvas" />
                        </div>

                        {/* Bottom page / zoom bar */}
                        <div className="pdfg-pagebar">
                            <button className="pdfg-pagebar__btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page">
                                <ChevronLeft size={16} aria-hidden="true" />
                            </button>
                            <span className="pdfg-pagebar__page">
                                <input
                                    type="number"
                                    className="pdfg-viewer__page-input"
                                    value={currentPage}
                                    min={1}
                                    max={totalPages}
                                    aria-label="Current page"
                                    onChange={e => goToPage(Number(e.target.value))}
                                /> / {totalPages}
                            </span>
                            <button className="pdfg-pagebar__btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page">
                                <ChevronRight size={16} aria-hidden="true" />
                            </button>
                            <span className="pdfg-pagebar__sep" />
                            <button className="pdfg-pagebar__btn" onClick={() => setZoomLevel(z => Math.max(0.25, +(z - 0.25).toFixed(2)))} disabled={fitWidth} aria-label="Zoom out">
                                <ZoomOut size={16} aria-hidden="true" />
                            </button>
                            <span className="pdfg-pagebar__zoom">{Math.round(zoomLevel * 100)}%</span>
                            <button className="pdfg-pagebar__btn" onClick={() => setZoomLevel(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={fitWidth} aria-label="Zoom in">
                                <ZoomIn size={16} aria-hidden="true" />
                            </button>
                            <button className={`pdfg-pagebar__btn${fitWidth ? ' is-active' : ''}`} onClick={toggleFitWidth} title="Fit width" aria-label="Fit width">
                                <Maximize2 size={16} aria-hidden="true" />
                            </button>
                            <button className="pdfg-pagebar__btn" onClick={rotateView} title="Rotate view" aria-label="Rotate view">
                                <RotateCw size={16} aria-hidden="true" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Conversion Progress View */}
                {viewMode === 'converting' && (
                    <div className="pdfg-convert">
                        <div className="pdfg-convert__header">
                            <button className="pdfg-viewer__back" onClick={() => setViewMode('toolset')}>← Back to Tools</button>
                            <h2>Conversions</h2>
                        </div>
                        <div className="pdfg-convert__list">
                            {conversionJobs.map(job => (
                                <div key={job.id} className={`pdfg-convert__job pdfg-convert__job--${job.status}`}>
                                    <div className="pdfg-convert__job-info">
                                        <span className="pdfg-convert__job-name">{job.sourceFile}</span>
                                        <span className="pdfg-convert__job-arrow">→</span>
                                        <span className="pdfg-convert__job-target">{job.targetFormat.toUpperCase()}</span>
                                    </div>
                                    <div className="pdfg-convert__job-progress">
                                        <div className="pdfg-convert__job-bar" style={{ width: `${job.progress}%` }} />
                                    </div>
                                    <div className="pdfg-convert__job-status">
                                        {job.status === 'done' && (
                                            <button className="pdfg-convert__download" onClick={() => downloadResult(job)}>⬇ Download</button>
                                        )}
                                        {job.status === 'processing' && <span className="pdfg-convert__processing">⏳ {job.progress}%</span>}
                                        {job.status === 'error' && <span className="pdfg-convert__error">❌ {job.error}</span>}
                                    </div>
                                </div>
                            ))}
                            {conversionJobs.length === 0 && (
                                <div className="pdfg-convert__empty">No conversions yet. Use the toolset to start converting.</div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Toast */}
            {toast && <div className="pdfg-toast">{toast}</div>}
        </div>
    );
}
