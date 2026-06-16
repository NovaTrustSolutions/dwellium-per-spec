/**
 * PDFGear — full document-processing suite (Stirling-PDF / PDF Gear parity).
 *
 * Everything that can run in the browser runs in the browser (local-first):
 *  - Viewer: page nav, zoom, rotate-view, fit-width, print, find.
 *  - Pages: rotate, delete, extract, split (range / by-count / burst), merge,
 *    reorder, n-up, scale, crop (click-drag), add blank page, remove blanks.
 *  - Edit: add text (click-to-place), watermark, page numbers, compress.
 *  - Fill & Sign: text, signature (text or image), date, checkmark — placed by
 *    clicking on the page.
 *  - Annotate: highlight / underline / box / note — drawn by dragging on the page.
 *  - Forms: add text field (drag), flatten.
 *  - Convert: PDF → txt/md/html/xml/rtf/png/jpeg (client); office (backend).
 *  - Images: images → PDF, export pages as images, extract embedded images, stamp.
 *  - Secure: remove restrictions, sanitise, true redaction (rasterised).
 *  - OCR: scanned PDF → text / searchable PDF (tesseract.js, lazy).
 *  - Info: get info, edit metadata, compare two PDFs.
 *
 * Operations that genuinely require native binaries are honestly backend-gated
 * with graceful states: real (Ghostscript) compression, office conversions,
 * add-password encryption, certificate signing, PDF/A, qpdf repair. See
 * Docs/PDF_BACKEND_CONTRACT.md.
 */
import { useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, BookOpen, Calendar, Check, ChevronLeft, ChevronRight, Combine, Copy, Crop, Droplet, Eraser, EyeOff, FileCheck2, FileCode, FileCog, FilePlus, FileSearch, FileText, FileType2, FolderOpen, FormInput, GitCompare, Hash, Highlighter, Image, Image as ImageIcon, ImageDown, ImagePlus, Info, LayoutGrid, ListOrdered, Lock, Maximize2, MessageSquare, Minimize2, Minus, PenTool, Printer, Redo2, RotateCw, Save, Scaling, ScanText, Scissors, Search, ShieldCheck, ShieldOff, Square, Stamp, Trash2, Type, Undo2, X, ZoomIn, ZoomOut, type LucideIcon } from 'lucide-react';
import './PDFGear.css';
import { API_BASE } from '../../config';
import { loadPdfjs, getInfo, renderAllPagesToPng, removeBlankPages, redactAndFlatten, comparePdfs, extractEmbeddedImages } from './pdfRaster';
import { ocrPdfToText, ocrPdfToSearchablePdf, type OcrProgress } from './ocr';
import * as ops from './pdfOps';
import type { PdfRect } from './pdfOps';
import type { ViewportLike, Point } from './coords';
import PlacementOverlay from './PlacementOverlay';
import { PdfFieldModal, PdfInfoModal, type PdfField } from './PdfModal';

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

type ToolCategory = 'hot' | 'organize' | 'edit' | 'convert' | 'images' | 'secure' | 'all';
type ViewMode = 'toolset' | 'viewer' | 'converting';
type RibbonTab = 'home' | 'pages' | 'edit' | 'fill-sign' | 'annotate' | 'form' | 'convert' | 'images' | 'secure' | 'ocr' | 'info';

type PlacementTool =
    | 'text' | 'signature' | 'note' | 'checkmark'
    | 'highlight' | 'underline' | 'box' | 'redact' | 'crop' | 'stamp' | 'formfield';

interface Placement {
    tool: PlacementTool;
    mode: 'point' | 'rect';
    hint: string;
    payload?: { text?: string; size?: number; oblique?: boolean; image?: { bytes: Uint8Array; type: 'png' | 'jpg' } };
}

type ModalState =
    | { kind: 'fields'; title: string; submitLabel?: string; fields: PdfField[]; submit: (v: Record<string, string>) => void }
    | { kind: 'info'; title: string; rows?: Array<{ label: string; value: string }>; content?: ReactNode }
    | null;

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
    const [activeTab, setActiveTab] = useState<RibbonTab>('home');
    const [findOpen, setFindOpen] = useState(false);
    const [findQuery, setFindQuery] = useState('');
    const [findHits, setFindHits] = useState<number[]>([]);
    const [findIdx, setFindIdx] = useState(0);
    const [findBusy, setFindBusy] = useState(false);
    const [histLen, setHistLen] = useState({ undo: 0, redo: 0 });
    const [placement, setPlacement] = useState<Placement | null>(null);
    const [modal, setModal] = useState<ModalState>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const mergeInputRef = useRef<HTMLInputElement>(null);
    const convertInputRef = useRef<HTMLInputElement>(null);
    const imageInputRef = useRef<HTMLInputElement>(null);   // images → PDF
    const stampInputRef = useRef<HTMLInputElement>(null);   // stamp / signature image
    const overlayInputRef = useRef<HTMLInputElement>(null); // overlay PDF
    const compareInputRef = useRef<HTMLInputElement>(null); // compare PDF
    const viewerContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pdfDocRef = useRef<any>(null);
    const renderTaskRef = useRef<any>(null);
    const currentViewportRef = useRef<ViewportLike | null>(null);
    const workingBytesRef = useRef<Uint8Array | null>(null);
    const undoStackRef = useRef<Uint8Array[]>([]);
    const redoStackRef = useRef<Uint8Array[]>([]);
    const MAX_HISTORY = 25;

    const showToast = (msg: string) => {
        setToast(msg);
        setTimeout(() => setToast(null), 3500);
    };

    // ---- Recent files ----
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

    // ---- Viewer document loader ----
    const loadDocFromBytes = useCallback(async (bytes: Uint8Array, name?: string) => {
        const pdfjsLib = await loadPdfjs();
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
        undoStackRef.current = [];
        redoStackRef.current = [];
        setHistLen({ undo: 0, redo: 0 });
        setRotation(0);
        setFitWidth(false);
        setCurrentPage(1);
        setFindOpen(false);
        setFindHits([]);
        setPlacement(null);
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
            if (recent.type === 'pdf' || recent.name.endsWith('.pdf')) await openPdfFile(file);
            else { showToast(`Opened: ${recent.name}`); setSelectedFile(file); setViewMode('viewer'); }
        } catch {
            showToast(`Cannot open: ${recent.name}`);
        }
    }, [openPdfFile]);

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
        // Store the live viewport so click-on-canvas placement can project
        // screen coords → PDF user-space for the CURRENT zoom + rotation.
        currentViewportRef.current = viewport as unknown as ViewportLike;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const task = page.render({ canvasContext: ctx, viewport, canvas } as any);
        renderTaskRef.current = task;
        try {
            await task.promise;
        } catch (e: any) {
            if (e?.name !== 'RenderingCancelledException') throw e;
        } finally {
            if (renderTaskRef.current === task) renderTaskRef.current = null;
        }
    }, [currentPage, zoomLevel, rotation, fitWidth]);

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
    const workingBytes = () => workingBytesRef.current;

    const commit = useCallback(async (out: Uint8Array, label: string) => {
        const base = workingBytesRef.current;
        if (base) {
            undoStackRef.current.push(base);
            if (undoStackRef.current.length > MAX_HISTORY) undoStackRef.current.shift();
        }
        redoStackRef.current = [];
        setHistLen({ undo: undoStackRef.current.length, redo: 0 });
        await loadDocFromBytes(out, selectedFile?.name);
        showToast(label);
    }, [loadDocFromBytes, selectedFile]);

    /** Run a bytes→bytes op against the working document, with undo. */
    const applyBytesOp = useCallback(async (op: (bytes: Uint8Array) => Promise<Uint8Array>, label: string) => {
        const base = workingBytesRef.current;
        if (!base) { showToast('Open a PDF first'); return; }
        setIsLoading(true);
        try {
            const out = await op(base.slice());
            await commit(out, label);
        } catch (e: any) {
            showToast(`Failed: ${e?.message || e}`);
        } finally {
            setIsLoading(false);
        }
    }, [commit]);

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

    // ---- View transforms ----
    const rotateView = useCallback(() => setRotation(r => (r + 90) % 360), []);
    const toggleFitWidth = useCallback(() => setFitWidth(f => !f), []);

    // ---- Save / print ----
    const downloadBytes = (bytes: Uint8Array, filename: string) => {
        const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/pdf' });
        downloadBlob(blob, filename);
    };
    const downloadBlob = (blob: Blob, filename: string) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    };
    const readBytes = async (file: File): Promise<Uint8Array> => new Uint8Array(await file.arrayBuffer());

    const downloadOpenPdf = useCallback(() => {
        const b = workingBytes();
        if (!b) { showToast('Open a PDF first'); return; }
        const name = selectedFile?.name || 'document.pdf';
        downloadBytes(b, name);
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

    // ---- Find ----
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

    // ---- Conversion engine (client + backend office) ----
    const CLIENT_FORMATS = new Set(['txt', 'png', 'jpeg', 'jpg', 'html', 'md', 'rtf', 'xml']);
    const BACKEND_ONLY_FORMATS = new Set(['docx', 'xlsx', 'pptx', 'pdf-from-docx', 'pdf-from-xlsx', 'pdf-from-pptx']);

    function escapeHtml(unsafe: string): string {
        return unsafe.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    const clientSideConvert = async (file: File, targetFormat: string): Promise<string | null> => {
        const arrayBuffer = await file.arrayBuffer();
        const pdfjsLib = await loadPdfjs();
        switch (targetFormat) {
            case 'txt': {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let fullText = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    fullText += `--- Page ${i} ---\n${content.items.map((it: any) => it.str).join(' ')}\n\n`;
                }
                return URL.createObjectURL(new Blob([fullText], { type: 'text/plain' }));
            }
            case 'png': case 'jpeg': case 'jpg': {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                const page = await pdf.getPage(1);
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width; canvas.height = viewport.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;
                await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
                const mimeType = targetFormat === 'png' ? 'image/png' : 'image/jpeg';
                const res = await fetch(canvas.toDataURL(mimeType, 0.92));
                return URL.createObjectURL(await res.blob());
            }
            case 'html': {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let html = '<!DOCTYPE html>\n<html>\n<head><meta charset="utf-8"><title>Converted PDF</title>\n<style>body{font-family:sans-serif;padding:40px;max-width:800px;margin:0 auto;}.page{margin-bottom:40px;padding-bottom:20px;border-bottom:1px solid #ddd;}.page-num{color:#999;font-size:12px;}</style>\n</head>\n<body>\n';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    html += `<div class="page"><div class="page-num">Page ${i}</div>\n${content.items.map((it: any) => `<p>${escapeHtml(it.str)}</p>`).join('\n')}\n</div>\n`;
                }
                html += '</body>\n</html>';
                return URL.createObjectURL(new Blob([html], { type: 'text/html' }));
            }
            case 'md': {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let md = `# ${file.name.replace(/\.pdf$/i, '')}\n\n`;
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    md += `## Page ${i}\n\n${content.items.map((it: any) => it.str).join(' ')}\n\n`;
                }
                return URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
            }
            case 'rtf': {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let body = '';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    const pageText = content.items.map((it: any) => it.str).join(' ');
                    body += `\\par\\b Page ${i}\\b0\\par ${pageText.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}')}\\par\\par `;
                }
                return URL.createObjectURL(new Blob([`{\\rtf1\\ansi\\deff0 {\\fonttbl{\\f0 Helvetica;}}\\f0\\fs24 ${body}}`], { type: 'application/rtf' }));
            }
            case 'xml': {
                const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<document>\n';
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const content = await page.getTextContent();
                    xml += `  <page number="${i}">\n`;
                    for (const item of content.items as any[]) xml += `    <text>${escapeHtml(item.str)}</text>\n`;
                    xml += '  </page>\n';
                }
                xml += '</document>\n';
                return URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
            }
            default:
                return null;
        }
    };

    const convertFile = useCallback(async (file: File, targetFormat: string) => {
        const jobId = `job_${Date.now().toString(36)}`;
        setConversionJobs(prev => [{ id: jobId, sourceFile: file.name, targetFormat, status: 'processing', progress: 0 }, ...prev]);
        setViewMode('converting');
        const progressInterval = setInterval(() => {
            setConversionJobs(prev => prev.map(j => j.id === jobId && j.status === 'processing' ? { ...j, progress: Math.min(j.progress + 12, 90) } : j));
        }, 200);
        try {
            if (CLIENT_FORMATS.has(targetFormat)) {
                const result = await clientSideConvert(file, targetFormat);
                if (result) {
                    clearInterval(progressInterval);
                    setConversionJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl: result } : j));
                    showToast(`Converted to ${targetFormat.toUpperCase()}`);
                    return;
                }
            }
            const formData = new FormData();
            formData.append('file', file);
            formData.append('targetFormat', targetFormat);
            let res: Response | null = null;
            try { res = await fetch(`${API_BASE}/docs/convert`, { method: 'POST', body: formData }); } catch { res = null; }
            clearInterval(progressInterval);
            if (res && res.ok) {
                const resultUrl = URL.createObjectURL(await res.blob());
                setConversionJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl } : j));
                showToast(`Converted to ${targetFormat.toUpperCase()}`);
            } else {
                if (!CLIENT_FORMATS.has(targetFormat)) {
                    const result = await clientSideConvert(file, targetFormat);
                    if (result) {
                        setConversionJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl: result } : j));
                        showToast(`Converted to ${targetFormat.toUpperCase()}`);
                        return;
                    }
                }
                throw new Error(BACKEND_ONLY_FORMATS.has(targetFormat)
                    ? `${targetFormat.toUpperCase()} requires LibreOffice on the backend (not installed). Client formats: TXT, PNG, JPEG, HTML, MD, RTF, XML.`
                    : `Conversion to ${targetFormat.toUpperCase()} unavailable`);
            }
        } catch (err: any) {
            clearInterval(progressInterval);
            setConversionJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'error', progress: 0, error: err.message || 'Conversion failed' } : j));
            showToast(`Conversion failed: ${err.message || 'Unknown error'}`);
        }
    }, []);

    const currentPdfFile = useCallback((): File | null => {
        const b = workingBytesRef.current;
        const name = selectedFile?.name || 'document.pdf';
        if (b) return new File([b.slice().buffer as ArrayBuffer], name, { type: 'application/pdf' });
        return selectedFile;
    }, [selectedFile]);

    const convertCurrent = (fmt: string) => {
        const f = currentPdfFile();
        if (f) void convertFile(f, fmt); else showToast('Open a PDF first');
    };

    // ---- Placement (click-on-canvas) ----
    const requireOpen = (): boolean => {
        if (!workingBytesRef.current) { fileInputRef.current?.click(); return false; }
        return true;
    };

    const beginPlacement = (p: Placement) => { if (requireOpen()) setPlacement(p); };

    const onPlacementPoint = useCallback(async (pt: Point) => {
        const p = placement;
        if (!p) return;
        const pageIndex = currentPage - 1;
        if (p.tool === 'text' || p.tool === 'signature' || p.tool === 'note') {
            const text = p.payload?.text || '';
            if (!text) return;
            await applyBytesOp(b => ops.placeText(b, {
                pageIndex, x: pt.x, y: pt.y, text,
                size: p.payload?.size ?? (p.tool === 'signature' ? 28 : 14),
                oblique: p.payload?.oblique,
            }), `${p.tool === 'signature' ? 'Signature' : p.tool === 'note' ? 'Note' : 'Text'} placed`);
        } else if (p.tool === 'checkmark') {
            await applyBytesOp(b => ops.drawCheckmark(b, pageIndex, pt.x, pt.y), 'Checkmark placed');
        }
    }, [placement, currentPage, applyBytesOp]);

    const onPlacementRect = useCallback(async (rect: PdfRect) => {
        const p = placement;
        if (!p) return;
        const pageIndex = currentPage - 1;
        switch (p.tool) {
            case 'highlight':
                await applyBytesOp(b => ops.drawHighlight(b, pageIndex, rect), 'Highlight added'); break;
            case 'box':
                await applyBytesOp(b => ops.drawRectangleOutline(b, pageIndex, rect), 'Box added'); break;
            case 'underline':
                await applyBytesOp(b => ops.drawUnderline(b, pageIndex, { x: rect.x, y: rect.y }, rect.width), 'Underline added'); break;
            case 'crop':
                await applyBytesOp(b => ops.cropPages(b, rect, [pageIndex]), 'Page cropped'); break;
            case 'redact':
                await applyBytesOp(b => redactAndFlatten(b, { [pageIndex]: [rect] }), 'Redacted (flattened)'); break;
            case 'formfield':
                await applyBytesOp(b => ops.addTextField(b, pageIndex, rect, 'field'), 'Form field added'); break;
            case 'stamp':
            case 'signature': {
                const img = p.payload?.image;
                if (!img) return;
                await applyBytesOp(b => ops.stampImage(b, { pageIndex, bytes: img.bytes, type: img.type, x: rect.x, y: rect.y, width: rect.width, height: rect.height }), 'Image placed');
                break;
            }
        }
    }, [placement, currentPage, applyBytesOp]);

    // Placement tools that prompt for content first via the field modal.
    const startTextPlacement = (tool: 'text' | 'signature' | 'note') => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields',
            title: tool === 'signature' ? 'Signature text' : tool === 'note' ? 'Note text' : 'Add text',
            submitLabel: 'Click to place →',
            fields: [
                { name: 'text', label: 'Text', type: 'text', placeholder: tool === 'signature' ? 'Your name' : 'Text…' },
                { name: 'size', label: 'Font size', type: 'number', defaultValue: tool === 'signature' ? '28' : '14', min: 6, max: 96 },
            ],
            submit: (v) => {
                setModal(null);
                if (!v.text?.trim()) { showToast('No text entered'); return; }
                setPlacement({ tool, mode: 'point', hint: `Click where the ${tool} should go.`, payload: { text: v.text, size: Number(v.size) || 14, oblique: tool === 'signature' } });
            },
        });
    };

    // ---- Parameter-driven ops (styled modal, no window.prompt) ----
    const askRotate = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'Rotate pages', submitLabel: 'Rotate',
            fields: [
                { name: 'angle', label: 'Angle', type: 'select', defaultValue: '90', options: [{ value: '90', label: '90° clockwise' }, { value: '180', label: '180°' }, { value: '270', label: '270°' }, { value: '-90', label: '90° counter-clockwise' }] },
                { name: 'range', label: 'Pages (e.g. 1-3,5 or "all")', type: 'text', defaultValue: 'all' },
            ],
            submit: (v) => {
                setModal(null);
                const angle = Number(v.angle);
                void applyBytesOp(async (b) => {
                    const total = await ops.getPageCount(b);
                    const idx = v.range.trim().toLowerCase() === 'all' ? undefined : ops.parsePageRange(v.range, total);
                    return ops.rotatePages(b, angle, idx);
                }, `Rotated ${v.range.trim().toLowerCase() === 'all' ? 'all pages' : v.range} by ${angle}°`);
            },
        });
    };

    const askDelete = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'Delete pages', submitLabel: 'Delete',
            fields: [{ name: 'range', label: 'Pages to delete (e.g. 1-3,5)', type: 'text', placeholder: '2,4-6' }],
            submit: (v) => {
                setModal(null);
                void applyBytesOp(async (b) => {
                    const total = await ops.getPageCount(b);
                    return ops.deletePages(b, ops.parsePageRange(v.range, total));
                }, 'Pages deleted');
            },
        });
    };

    const askExtract = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        setModal({
            kind: 'fields', title: 'Extract pages → new PDF', submitLabel: 'Extract',
            fields: [{ name: 'range', label: 'Pages to extract (e.g. 1-3,5)', type: 'text', placeholder: '1-3' }],
            submit: (v) => {
                setModal(null);
                void (async () => {
                    setIsLoading(true);
                    try {
                        const total = await ops.getPageCount(b0);
                        const out = await ops.extractPages(b0.slice(), ops.parsePageRange(v.range, total));
                        downloadBytes(out, `extract_${selectedFile?.name || 'document.pdf'}`);
                        showToast('Extracted pages downloaded');
                    } catch (e: any) { showToast(`Extract failed: ${e?.message || e}`); }
                    finally { setIsLoading(false); }
                })();
            },
        });
    };

    const askSplitCount = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        setModal({
            kind: 'fields', title: 'Split by page count', submitLabel: 'Split',
            fields: [{ name: 'n', label: 'Pages per file', type: 'number', defaultValue: '1', min: 1 }],
            submit: (v) => {
                setModal(null);
                void (async () => {
                    setIsLoading(true);
                    try {
                        const chunks = await ops.splitByCount(b0.slice(), Math.max(1, Number(v.n) || 1));
                        const base = (selectedFile?.name || 'document.pdf').replace(/\.pdf$/i, '');
                        chunks.forEach((c, i) => setTimeout(() => downloadBytes(c, `${base}_part${i + 1}.pdf`), i * 250));
                        showToast(`Split into ${chunks.length} file(s)`);
                    } catch (e: any) { showToast(`Split failed: ${e?.message || e}`); }
                    finally { setIsLoading(false); }
                })();
            },
        });
    };

    const askNUp = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'N-up (pages per sheet)', submitLabel: 'Apply',
            fields: [{ name: 'n', label: 'Pages per sheet', type: 'select', defaultValue: '2', options: [2, 4, 6, 8, 9, 16].map(n => ({ value: String(n), label: `${n}-up` })) }],
            submit: (v) => { setModal(null); void applyBytesOp(b => ops.nUpPdf(b, Number(v.n)), `${v.n}-up applied`); },
        });
    };

    const askScale = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'Scale pages', submitLabel: 'Scale',
            fields: [{ name: 'factor', label: 'Scale factor', type: 'number', defaultValue: '1.0', step: 0.1, min: 0.1, max: 5, help: 'e.g. 0.5 = half size, 2 = double' }],
            submit: (v) => { setModal(null); void applyBytesOp(b => ops.scalePages(b, Number(v.factor) || 1), `Scaled ×${v.factor}`); },
        });
    };

    const askReorder = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'Reorder pages', submitLabel: 'Reorder',
            fields: [{ name: 'order', label: 'New page order (1-based, comma-separated)', type: 'text', placeholder: '3,1,2', help: 'List every page in the order you want.' }],
            submit: (v) => {
                setModal(null);
                const order = v.order.split(',').map(s => Number(s.trim()) - 1).filter(n => !Number.isNaN(n));
                void applyBytesOp(b => ops.reorderPages(b, order), 'Pages reordered');
            },
        });
    };

    const askBlankPage = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'Add blank page', submitLabel: 'Insert',
            fields: [{ name: 'after', label: 'Insert after page #', type: 'number', defaultValue: String(currentPage), min: 0, help: '0 = at the front' }],
            submit: (v) => { setModal(null); void applyBytesOp(b => ops.addBlankPage(b, (Number(v.after) || 0) - 1), 'Blank page added'); },
        });
    };

    const askWatermark = () => {
        if (!requireOpen()) return;
        setModal({
            kind: 'fields', title: 'Watermark', submitLabel: 'Apply',
            fields: [
                { name: 'text', label: 'Text', type: 'text', defaultValue: 'DRAFT' },
                { name: 'opacity', label: 'Opacity', type: 'number', defaultValue: '0.35', step: 0.05, min: 0.05, max: 1 },
            ],
            submit: (v) => { setModal(null); if (!v.text?.trim()) return; void applyBytesOp(b => ops.addWatermark(b, { text: v.text, opacity: Number(v.opacity) || 0.35 }), 'Watermark added'); },
        });
    };

    const askMetadata = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        void (async () => {
            const meta = await ops.readMetadata(b0.slice());
            setModal({
                kind: 'fields', title: 'Edit metadata', submitLabel: 'Save',
                fields: [
                    { name: 'title', label: 'Title', type: 'text', defaultValue: meta.title || '' },
                    { name: 'author', label: 'Author', type: 'text', defaultValue: meta.author || '' },
                    { name: 'subject', label: 'Subject', type: 'text', defaultValue: meta.subject || '' },
                    { name: 'keywords', label: 'Keywords (comma-separated)', type: 'text', defaultValue: (meta.keywords || []).join(', ') },
                    { name: 'creator', label: 'Creator', type: 'text', defaultValue: meta.creator || '' },
                ],
                submit: (v) => {
                    setModal(null);
                    void applyBytesOp(b => ops.setMetadata(b, {
                        title: v.title, author: v.author, subject: v.subject,
                        keywords: v.keywords ? v.keywords.split(',').map(s => s.trim()).filter(Boolean) : [],
                        creator: v.creator,
                    }), 'Metadata saved');
                },
            });
        })();
    };

    // ---- No-param ops ----
    const doCompressStructural = () => { if (requireOpen()) void applyBytesOp(b => ops.compressStructural(b), 'Compressed (structural)'); };
    const doPageNumbers = () => { if (requireOpen()) void applyBytesOp(b => ops.addPageNumbers(b), 'Page numbers added'); };
    const doFlatten = () => { if (requireOpen()) void applyBytesOp(b => ops.flattenForm(b), 'Form flattened'); };
    const doRemoveRestrictions = () => { if (requireOpen()) void applyBytesOp(b => ops.removeRestrictions(b), 'Restrictions removed'); };
    const doSanitize = () => {
        if (!requireOpen()) return;
        void applyBytesOp(async (b) => { const r = await ops.sanitize(b); showToast(`Sanitised: ${r.removed.join(', ') || 'nothing found'}`); return r.bytes; }, 'Sanitised');
    };
    const doRemoveBlanks = () => {
        if (!requireOpen()) return;
        void applyBytesOp(async (b) => { const r = await removeBlankPages(b); showToast(r.removed.length ? `Removed ${r.removed.length} blank page(s)` : 'No blank pages found'); return r.bytes; }, 'Blank pages removed');
    };

    // ---- Image / export ops ----
    const doExportPagesAsImages = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        void (async () => {
            setIsLoading(true);
            try {
                const blobs = await renderAllPagesToPng(b0.slice());
                const base = (selectedFile?.name || 'document.pdf').replace(/\.pdf$/i, '');
                blobs.forEach((bl, i) => setTimeout(() => downloadBlob(bl, `${base}_page${i + 1}.png`), i * 250));
                showToast(`Exported ${blobs.length} page image(s)`);
            } catch (e: any) { showToast(`Export failed: ${e?.message || e}`); }
            finally { setIsLoading(false); }
        })();
    };

    const doExtractImages = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        void (async () => {
            setIsLoading(true);
            try {
                const blobs = await extractEmbeddedImages(b0.slice());
                if (!blobs.length) { showToast('No embedded images found — try Export pages as images'); return; }
                const base = (selectedFile?.name || 'document.pdf').replace(/\.pdf$/i, '');
                blobs.forEach((bl, i) => setTimeout(() => downloadBlob(bl, `${base}_image${i + 1}.png`), i * 250));
                showToast(`Extracted ${blobs.length} image(s)`);
            } catch (e: any) { showToast(`Extract failed: ${e?.message || e}`); }
            finally { setIsLoading(false); }
        })();
    };

    // ---- OCR ----
    const ocrProgress = (p: OcrProgress) => {
        const pg = p.page && p.pageCount ? ` (page ${p.page}/${p.pageCount})` : '';
        setToast(`OCR: ${p.status}${pg}`);
    };
    const doOcrText = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        void (async () => {
            setIsLoading(true);
            showToast('OCR: preparing engine…');
            try {
                const { text } = await ocrPdfToText(b0.slice(), { onProgress: ocrProgress });
                const base = (selectedFile?.name || 'document.pdf').replace(/\.pdf$/i, '');
                downloadBlob(new Blob([text], { type: 'text/plain' }), `${base}_ocr.txt`);
                showToast('OCR text downloaded');
            } catch (e: any) { showToast(`OCR failed: ${e?.message || e}`); }
            finally { setIsLoading(false); }
        })();
    };
    const doOcrSearchable = () => {
        if (!requireOpen()) return;
        showToast('OCR: preparing engine…');
        void applyBytesOp(async (b) => {
            try { return await ocrPdfToSearchablePdf(b, { onProgress: ocrProgress }); }
            catch (e: any) { throw new Error(e?.message || 'OCR PDF unavailable — use OCR → text'); }
        }, 'Searchable PDF created');
    };

    // ---- Info / compare ----
    const doGetInfo = () => {
        const b0 = workingBytes();
        if (!b0) { fileInputRef.current?.click(); return; }
        void (async () => {
            setIsLoading(true);
            try {
                const info = await getInfo(b0.slice());
                const first = info.pageSizes[0];
                setModal({
                    kind: 'info', title: 'Document info',
                    rows: [
                        { label: 'Pages', value: String(info.numPages) },
                        { label: 'PDF version', value: info.pdfVersion || '—' },
                        { label: 'Title', value: info.title || '—' },
                        { label: 'Author', value: info.author || '—' },
                        { label: 'Subject', value: info.subject || '—' },
                        { label: 'Keywords', value: info.keywords || '—' },
                        { label: 'Creator', value: info.creator || '—' },
                        { label: 'Producer', value: info.producer || '—' },
                        { label: 'Created', value: info.creationDate || '—' },
                        { label: 'Modified', value: info.modDate || '—' },
                        { label: 'Page 1 size', value: first ? `${first.width} × ${first.height} pt` : '—' },
                        { label: 'Fingerprint', value: info.fingerprint || '—' },
                    ],
                });
            } catch (e: any) { showToast(`Info failed: ${e?.message || e}`); }
            finally { setIsLoading(false); }
        })();
    };

    const handleCompareFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        const b0 = workingBytes();
        if (!file || !b0) return;
        setIsLoading(true);
        try {
            const result = await comparePdfs(b0.slice(), await readBytes(file));
            setModal({
                kind: 'info', title: `Compare — ${result.identical ? 'identical text' : 'differences found'}`,
                rows: [
                    { label: 'This document pages', value: String(result.pageCountA) },
                    { label: `"${file.name}" pages`, value: String(result.pageCountB) },
                    ...result.pages.filter(p => !p.same).slice(0, 30).map(p => ({ label: `Page ${p.page}`, value: `+${p.addedWords} / −${p.removedWords} words` })),
                ],
            });
        } catch (err: any) { showToast(`Compare failed: ${err?.message || err}`); }
        finally { setIsLoading(false); }
    };

    // ---- Merge / split (existing) ----
    const mergePdfsAction = useCallback(async () => {
        if (mergeFiles.length < 2) { showToast('Select at least 2 PDFs to merge'); return; }
        setIsLoading(true);
        try {
            const sources = await Promise.all(mergeFiles.map(readBytes));
            const out = await ops.mergePdfs(sources);
            downloadBytes(out, 'merged.pdf');
            showToast(`Merged ${mergeFiles.length} PDFs`);
            setMergeFiles([]);
        } catch (err: any) { showToast(`Merge failed: ${err?.message || err}`); }
        finally { setIsLoading(false); }
    }, [mergeFiles]);

    // ---- Backend-gated native-only ops (honest states) ----
    const backendOp = async (path: string, file: File, label: string, fallback?: () => void) => {
        setIsLoading(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            let res: Response | null = null;
            try { res = await fetch(`${API_BASE}${path}`, { method: 'POST', body: fd }); } catch { res = null; }
            if (res && res.ok) {
                const blob = await res.blob();
                downloadBlob(blob, `${label}_${file.name}`);
                showToast(`${label} (backend)`);
            } else if (fallback) {
                fallback();
            } else {
                showToast(`${label} needs the backend service (not available). See Docs/PDF_BACKEND_CONTRACT.md`);
            }
        } finally { setIsLoading(false); }
    };

    const doCompressReal = () => {
        const f = currentPdfFile();
        if (!f) { fileInputRef.current?.click(); return; }
        // Try real (Ghostscript) compression on the backend; fall back to the
        // client structural compressor so the user always gets *something*.
        void backendOp('/pdf/compress', f, 'compressed', () => {
            showToast('Backend compressor offline — applied client structural compression');
            void applyBytesOp(b => ops.compressStructural(b), 'Compressed (structural)');
        });
    };
    const doEncrypt = () => {
        const f = currentPdfFile();
        if (!f) { fileInputRef.current?.click(); return; }
        showToast('Add-password encryption requires the backend (qpdf). Use Secure → Remove restrictions for the inverse. See PDF backend contract.');
    };
    const doPdfA = () => {
        const f = currentPdfFile();
        if (!f) { fileInputRef.current?.click(); return; }
        void backendOp('/pdf/pdfa', f, 'pdfa');
    };
    const doRepair = () => {
        const f = currentPdfFile();
        if (!f) { fileInputRef.current?.click(); return; }
        void backendOp('/pdf/repair', f, 'repaired');
    };

    // ---- Create blank ----
    const createBlankPdf = useCallback(async () => {
        const bytes = await ops.createBlank();
        const file = new File([bytes.slice().buffer as ArrayBuffer], 'untitled.pdf', { type: 'application/pdf' });
        await openPdfFile(file);
    }, [openPdfFile]);

    const downloadResult = (job: ConversionJob) => {
        if (!job.resultUrl) return;
        const a = document.createElement('a');
        a.href = job.resultUrl;
        a.download = `${job.sourceFile.replace(/\.[^/.]+$/, '')}.${job.targetFormat}`;
        a.click();
        showToast(`Downloaded ${job.targetFormat.toUpperCase()}`);
    };

    // ---- File input handlers ----
    const triggerConvert = (target: string) => { setActiveConversionTarget(target); convertInputRef.current?.click(); };
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
        if (files.length > 0) { setMergeFiles(prev => [...prev, ...files]); showToast(`Added ${files.length} file(s) to merge queue`); }
    };
    const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        if (file.name.endsWith('.pdf')) await openPdfFile(file);
        else { setSelectedFile(file); showToast(`Loaded: ${file.name}`); }
    };
    const handleImagesToPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        setIsLoading(true);
        try {
            const imgs = await Promise.all(files.map(async (f) => ({ bytes: await readBytes(f), type: (f.type.includes('png') ? 'png' : 'jpg') as 'png' | 'jpg' })));
            const out = await ops.imagesToPdf(imgs);
            const file = new File([out.slice().buffer as ArrayBuffer], 'images.pdf', { type: 'application/pdf' });
            await openPdfFile(file);
            showToast(`Built PDF from ${files.length} image(s)`);
        } catch (err: any) { showToast(`Image→PDF failed: ${err?.message || err}`); }
        finally { setIsLoading(false); }
    };
    const handleStampImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !requireOpen()) return;
        const bytes = await readBytes(file);
        const type: 'png' | 'jpg' = file.type.includes('png') ? 'png' : 'jpg';
        setPlacement({ tool: 'stamp', mode: 'rect', hint: 'Drag a box to place the image.', payload: { image: { bytes, type } } });
    };
    const handleOverlayFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file || !requireOpen()) return;
        const overlayBytes = await readBytes(file);
        void applyBytesOp(b => ops.overlayPdf(b, overlayBytes), 'Overlay stamped');
    };

    // ---- Tool grid (landing) ----
    const tools: PDFTool[] = [
        { id: 'pdf-to-word', label: 'PDF to Word', icon: 'W', iconBg: '#2b579a', category: ['hot', 'convert', 'all'], description: 'Convert PDF to editable Word (backend)', action: () => triggerConvert('docx') },
        { id: 'pdf-to-png', label: 'PDF to PNG', icon: '', iconBg: '#6c5ce7', category: ['hot', 'convert', 'images', 'all'], description: 'Render PDF pages as PNG', action: () => triggerConvert('png') },
        { id: 'pdf-to-txt', label: 'PDF to TXT', icon: 'T', iconBg: '#fdcb6e', category: ['hot', 'convert', 'all'], description: 'Extract plain text', action: () => triggerConvert('txt') },
        { id: 'images-to-pdf', label: 'Images to PDF', icon: '', iconBg: '#00b894', category: ['hot', 'images', 'all'], description: 'Combine images into a PDF', action: () => imageInputRef.current?.click() },
        { id: 'merge-pdf', label: 'Merge PDFs', icon: '⊕', iconBg: '#6c5ce7', category: ['hot', 'organize', 'all'], description: 'Combine multiple PDFs', action: () => mergeInputRef.current?.click() },
        { id: 'split-pdf', label: 'Split PDF', icon: '', iconBg: '#00cec9', category: ['hot', 'organize', 'all'], description: 'Split by page count', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else askSplitCount(); } },
        { id: 'nup-pdf', label: 'N-up', icon: '▦', iconBg: '#0984e3', category: ['organize', 'all'], description: 'Multiple pages per sheet', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else askNUp(); } },
        { id: 'reorder-pdf', label: 'Reorder', icon: '↕', iconBg: '#e17055', category: ['organize', 'all'], description: 'Rearrange page order', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else askReorder(); } },
        { id: 'rotate-pages', label: 'Rotate', icon: '↻', iconBg: '#0984e3', category: ['hot', 'organize', 'all'], description: 'Rotate pages', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else askRotate(); } },
        { id: 'delete-pages', label: 'Delete Pages', icon: '', iconBg: '#d63031', category: ['organize', 'all'], description: 'Remove pages', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else askDelete(); } },
        { id: 'remove-blanks', label: 'Remove Blanks', icon: '␣', iconBg: '#636e72', category: ['organize', 'all'], description: 'Drop blank pages', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else doRemoveBlanks(); } },
        { id: 'watermark', label: 'Watermark', icon: '⌘', iconBg: '#fdcb6e', category: ['hot', 'edit', 'all'], description: 'Add a watermark', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else askWatermark(); } },
        { id: 'compress', label: 'Compress', icon: '⇪', iconBg: '#00cec9', category: ['hot', 'edit', 'all'], description: 'Reduce file size', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else doCompressReal(); } },
        { id: 'redact', label: 'Redact', icon: '▮', iconBg: '#2d3436', category: ['secure', 'all'], description: 'True redaction (flatten)', action: () => beginPlacement({ tool: 'redact', mode: 'rect', hint: 'Drag over the area to redact.' }) },
        { id: 'ocr', label: 'OCR', icon: '', iconBg: '#a29bfe', category: ['hot', 'all'], description: 'Recognise text in scans', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else doOcrText(); } },
        { id: 'get-info', label: 'Get Info', icon: 'ℹ', iconBg: '#0984e3', category: ['secure', 'all'], description: 'Document properties', action: () => { if (!workingBytes()) fileInputRef.current?.click(); else doGetInfo(); } },
    ];
    const filteredTools = activeCategory === 'all' ? tools : tools.filter(t => t.category.includes(activeCategory));

    const categories: { key: ToolCategory; label: string }[] = [
        { key: 'hot', label: 'Hot Tools' },
        { key: 'organize', label: 'Organize' },
        { key: 'edit', label: 'Edit' },
        { key: 'convert', label: 'Convert' },
        { key: 'images', label: 'Images' },
        { key: 'secure', label: 'Secure' },
        { key: 'all', label: 'All Tools' },
    ];

    // ---- Ribbon ----
    const ribbonTabs: { key: RibbonTab; label: string }[] = [
        { key: 'home', label: 'Home' },
        { key: 'pages', label: 'Pages' },
        { key: 'edit', label: 'Edit' },
        { key: 'fill-sign', label: 'Fill & Sign' },
        { key: 'annotate', label: 'Annotate' },
        { key: 'form', label: 'Forms' },
        { key: 'convert', label: 'Convert' },
        { key: 'images', label: 'Images' },
        { key: 'secure', label: 'Secure' },
        { key: 'ocr', label: 'OCR' },
        { key: 'info', label: 'Info' },
    ];

    const rbtn = (Icon: LucideIcon, label: string, onClick: () => void, opts?: { disabled?: boolean; active?: boolean; danger?: boolean }) => (
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

    const renderRibbonBody = () => {
        const busy = isLoading;
        switch (activeTab) {
            case 'home':
                return <>
                    {rbtn(FolderOpen, 'Open', () => fileInputRef.current?.click())}
                    {rbtn(Save, 'Save', downloadOpenPdf, { disabled: busy })}
                    {rbtn(Printer, 'Print', printPdf)}
                    {rbtn(Search, 'Find', () => setFindOpen(o => !o), { active: findOpen })}
                    {rbtn(Info, 'Get Info', doGetInfo)}
                </>;
            case 'pages':
                return <>
                    {rbtn(RotateCw, 'Rotate', askRotate, { disabled: busy })}
                    {rbtn(Trash2, 'Delete', askDelete, { disabled: busy, danger: true })}
                    {rbtn(Copy, 'Extract', askExtract, { disabled: busy })}
                    {rbtn(Scissors, 'Split', askSplitCount, { disabled: busy })}
                    {rbtn(Combine, 'Merge', () => mergeInputRef.current?.click())}
                    {rbtn(ListOrdered, 'Reorder', askReorder, { disabled: busy })}
                    {rbtn(LayoutGrid, 'N-up', askNUp, { disabled: busy })}
                    {rbtn(Scaling, 'Scale', askScale, { disabled: busy })}
                    {rbtn(FilePlus, 'Blank Page', askBlankPage, { disabled: busy })}
                    {rbtn(Eraser, 'Remove Blanks', doRemoveBlanks, { disabled: busy })}
                </>;
            case 'edit':
                return <>
                    {rbtn(Type, 'Add Text', () => startTextPlacement('text'), { disabled: busy })}
                    {rbtn(Droplet, 'Watermark', askWatermark, { disabled: busy })}
                    {rbtn(Hash, 'Page Numbers', doPageNumbers, { disabled: busy })}
                    {rbtn(Crop, 'Crop', () => beginPlacement({ tool: 'crop', mode: 'rect', hint: 'Drag the crop area on the page.' }), { disabled: busy })}
                    {rbtn(Minimize2, 'Compress', doCompressReal, { disabled: busy })}
                </>;
            case 'fill-sign':
                return <>
                    {rbtn(Type, 'Add Text', () => startTextPlacement('text'), { disabled: busy })}
                    {rbtn(PenTool, 'Signature', () => startTextPlacement('signature'), { disabled: busy })}
                    {rbtn(ImageIcon, 'Signature Image', () => stampInputRef.current?.click(), { disabled: busy })}
                    {rbtn(Calendar, 'Date', () => { if (requireOpen()) setPlacement({ tool: 'text', mode: 'point', hint: 'Click to place today’s date.', payload: { text: new Date().toLocaleDateString(), size: 12 } }); }, { disabled: busy })}
                    {rbtn(Check, 'Checkmark', () => beginPlacement({ tool: 'checkmark', mode: 'point', hint: 'Click to place a checkmark.' }), { disabled: busy })}
                </>;
            case 'annotate':
                return <>
                    {rbtn(Highlighter, 'Highlight', () => beginPlacement({ tool: 'highlight', mode: 'rect', hint: 'Drag to highlight an area.' }), { disabled: busy })}
                    {rbtn(Minus, 'Underline', () => beginPlacement({ tool: 'underline', mode: 'rect', hint: 'Drag to underline.' }), { disabled: busy })}
                    {rbtn(Square, 'Box', () => beginPlacement({ tool: 'box', mode: 'rect', hint: 'Drag to draw a box.' }), { disabled: busy })}
                    {rbtn(MessageSquare, 'Note', () => startTextPlacement('note'), { disabled: busy })}
                </>;
            case 'form':
                return <>
                    {rbtn(FormInput, 'Add Field', () => beginPlacement({ tool: 'formfield', mode: 'rect', hint: 'Drag where the field should go.' }), { disabled: busy })}
                    {rbtn(Lock, 'Flatten', doFlatten, { disabled: busy })}
                </>;
            case 'convert':
                return <>
                    {rbtn(FileText, 'Text', () => convertCurrent('txt'))}
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
            case 'images':
                return <>
                    {rbtn(ImagePlus, 'Images → PDF', () => imageInputRef.current?.click())}
                    {rbtn(ImageDown, 'Pages → Images', doExportPagesAsImages, { disabled: busy })}
                    {rbtn(ImageIcon, 'Extract Images', doExtractImages, { disabled: busy })}
                    {rbtn(Stamp, 'Stamp Image', () => stampInputRef.current?.click(), { disabled: busy })}
                    {rbtn(Combine, 'Overlay PDF', () => overlayInputRef.current?.click(), { disabled: busy })}
                </>;
            case 'secure':
                return <>
                    {rbtn(EyeOff, 'Redact', () => beginPlacement({ tool: 'redact', mode: 'rect', hint: 'Drag over the area to redact (text removed).' }), { disabled: busy })}
                    {rbtn(ShieldOff, 'Sanitise', doSanitize, { disabled: busy })}
                    {rbtn(ShieldCheck, 'Remove Restrictions', doRemoveRestrictions, { disabled: busy })}
                    {rbtn(Lock, 'Encrypt', doEncrypt)}
                    {rbtn(FileCheck2, 'PDF/A', doPdfA)}
                    {rbtn(FileCog, 'Repair', doRepair)}
                </>;
            case 'ocr':
                return <>
                    {rbtn(ScanText, 'OCR → Text', doOcrText, { disabled: busy })}
                    {rbtn(FileSearch, 'OCR → Searchable PDF', doOcrSearchable, { disabled: busy })}
                </>;
            case 'info':
                return <>
                    {rbtn(Info, 'Get Info', doGetInfo)}
                    {rbtn(FileCog, 'Metadata', askMetadata, { disabled: busy })}
                    {rbtn(GitCompare, 'Compare', () => { if (!requireOpen()) return; compareInputRef.current?.click(); }, { disabled: busy })}
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
            <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" multiple hidden onChange={handleImagesToPdf} />
            <input ref={stampInputRef} type="file" accept="image/png,image/jpeg" hidden onChange={handleStampImage} />
            <input ref={overlayInputRef} type="file" accept=".pdf" hidden onChange={handleOverlayFile} />
            <input ref={compareInputRef} type="file" accept=".pdf" hidden onChange={handleCompareFile} />

            {/* Sidebar */}
            <div className="pdfg-sidebar">
                <div className="pdfg-sidebar__version">V3.0</div>
                <button className="pdfg-sidebar__open-btn" onClick={() => fileInputRef.current?.click()}>
                    <span className="pdfg-sidebar__open-icon"><FolderOpen size={14} /></span> Open File
                </button>
                <button className="pdfg-sidebar__action" onClick={createBlankPdf}><span>⊕</span> Create Blank PDF</button>
                <button className="pdfg-sidebar__action" onClick={() => imageInputRef.current?.click()}><span><Image size={14} /></span> Images → PDF</button>
                <button className="pdfg-sidebar__action" onClick={() => setViewMode('toolset')}><span><BookOpen size={14} /></span> All Tools</button>

                {mergeFiles.length > 0 && (
                    <div className="pdfg-sidebar__merge">
                        <div className="pdfg-sidebar__merge-title">Merge Queue ({mergeFiles.length})</div>
                        {mergeFiles.map((f, i) => (
                            <div key={i} className="pdfg-sidebar__merge-item">
                                <span className="pdfg-sidebar__merge-name">{f.name}</span>
                                <button className="pdfg-sidebar__merge-remove" onClick={() => setMergeFiles(prev => prev.filter((_, idx) => idx !== i))}><X size={16} /></button>
                            </div>
                        ))}
                        <button className="pdfg-sidebar__merge-add" onClick={() => mergeInputRef.current?.click()}>+ Add More</button>
                        <button className="pdfg-sidebar__open-btn pdfg-sidebar__merge-go" onClick={() => void mergePdfsAction()} disabled={isLoading}>
                            {isLoading ? 'Merging…' : '⊕ Merge All'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main */}
            <div className="pdfg-main">
                {viewMode === 'toolset' && (
                    <div className="pdfg-toolset">
                        <h2 className="pdfg-toolset__title">Toolset</h2>
                        <div className="pdfg-toolset__tabs">
                            {categories.map(cat => (
                                <button key={cat.key} className={`pdfg-toolset__tab ${activeCategory === cat.key ? 'pdfg-toolset__tab--active' : ''}`} onClick={() => setActiveCategory(cat.key)}>{cat.label}</button>
                            ))}
                        </div>
                        <div className="pdfg-toolset__grid">
                            {filteredTools.map(tool => (
                                <button key={tool.id} className="pdfg-tool" onClick={tool.action} title={tool.description}>
                                    <div className="pdfg-tool__icon" style={{ backgroundColor: tool.iconBg }}><span>{tool.icon}</span></div>
                                    <span className="pdfg-tool__label">{tool.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="pdfg-recent">
                            <div className="pdfg-recent__header">
                                <span className="pdfg-recent__title">Recent</span>
                                {recentFiles.length > 0 && <button className="pdfg-recent__clear" onClick={() => setRecentFiles([])}>Clear</button>}
                            </div>
                            {recentFiles.length > 0 ? (
                                <table className="pdfg-recent__table">
                                    <thead><tr><th>Name</th><th>Opened</th><th>Size</th></tr></thead>
                                    <tbody>
                                        {recentFiles.map(file => (
                                            <tr key={file.id} className="pdfg-recent__row" onClick={() => void openRecentFile(file)}>
                                                <td className="pdfg-recent__name">{file.name}</td>
                                                <td className="pdfg-recent__date">{formatDate(file.openedAt)}</td>
                                                <td className="pdfg-recent__size">{file.size}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : <div className="pdfg-recent__empty">No recent files</div>}
                        </div>
                    </div>
                )}

                {viewMode === 'viewer' && (
                    <div className="pdfg-viewer">
                        <div className="pdfg-ribbon">
                            <div className="pdfg-ribbon__top">
                                <button className="pdfg-ribbon__icon-btn" onClick={() => setViewMode('toolset')} title="Back to tools" aria-label="Back to tools"><ArrowLeft size={18} aria-hidden="true" /></button>
                                <span className="pdfg-ribbon__sep" />
                                <button className="pdfg-ribbon__icon-btn" onClick={() => void undo()} disabled={!histLen.undo} title="Undo" aria-label="Undo"><Undo2 size={18} aria-hidden="true" /></button>
                                <button className="pdfg-ribbon__icon-btn" onClick={() => void redo()} disabled={!histLen.redo} title="Redo" aria-label="Redo"><Redo2 size={18} aria-hidden="true" /></button>
                                <span className="pdfg-ribbon__sep" />
                                <nav className="pdfg-ribbon__tabs" role="tablist" aria-label="PDF tools">
                                    {ribbonTabs.map(t => (
                                        <button key={t.key} role="tab" aria-selected={activeTab === t.key} className={`pdfg-ribbon__tab${activeTab === t.key ? ' is-active' : ''}`} onClick={() => setActiveTab(t.key)}>{t.label}</button>
                                    ))}
                                </nav>
                                <span className="pdfg-ribbon__filename" title={selectedFile?.name || 'untitled.pdf'}>{selectedFile?.name || 'untitled.pdf'}</span>
                            </div>
                            <div className="pdfg-ribbon__body" role="tabpanel">{renderRibbonBody()}</div>
                        </div>

                        {findOpen && (
                            <div className="pdfg-find">
                                <Search size={15} aria-hidden="true" />
                                <input className="pdfg-find__input" autoFocus value={findQuery} placeholder="Find in document…" aria-label="Find in document"
                                    onChange={e => setFindQuery(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { if (findHits.length) stepFind(1); else void runFind(findQuery); } else if (e.key === 'Escape') setFindOpen(false); }} />
                                <button className="pdfg-find__btn" onClick={() => void runFind(findQuery)} disabled={findBusy}>{findBusy ? '…' : 'Find'}</button>
                                <span className="pdfg-find__count">{findHits.length ? `${findIdx + 1} / ${findHits.length}` : '0 / 0'}</span>
                                <button className="pdfg-find__nav" onClick={() => stepFind(-1)} disabled={!findHits.length} aria-label="Previous match"><ChevronLeft size={16} aria-hidden="true" /></button>
                                <button className="pdfg-find__nav" onClick={() => stepFind(1)} disabled={!findHits.length} aria-label="Next match"><ChevronRight size={16} aria-hidden="true" /></button>
                                <button className="pdfg-find__nav" onClick={() => setFindOpen(false)} aria-label="Close find"><X size={16} aria-hidden="true" /></button>
                            </div>
                        )}

                        <div className="pdfg-viewer__canvas-wrap" ref={viewerContainerRef}>
                            {isLoading && <div className="pdfg-viewer__loading">Loading…</div>}
                            <div className="pdfg-viewer__stage">
                                <canvas ref={canvasRef} className="pdfg-viewer__canvas" />
                                <PlacementOverlay
                                    active={!!placement}
                                    mode={placement?.mode || 'point'}
                                    hint={placement?.hint || ''}
                                    canvasRef={canvasRef}
                                    viewportRef={currentViewportRef}
                                    onPoint={(p) => void onPlacementPoint(p)}
                                    onRect={(r) => void onPlacementRect(r)}
                                    onCancel={() => setPlacement(null)}
                                />
                            </div>
                        </div>

                        <div className="pdfg-pagebar">
                            <button className="pdfg-pagebar__btn" onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
                            <span className="pdfg-pagebar__page">
                                <input type="number" className="pdfg-viewer__page-input" value={currentPage} min={1} max={totalPages} aria-label="Current page" onChange={e => goToPage(Number(e.target.value))} /> / {totalPages}
                            </span>
                            <button className="pdfg-pagebar__btn" onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= totalPages} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
                            <span className="pdfg-pagebar__sep" />
                            <button className="pdfg-pagebar__btn" onClick={() => setZoomLevel(z => Math.max(0.25, +(z - 0.25).toFixed(2)))} disabled={fitWidth} aria-label="Zoom out"><ZoomOut size={16} aria-hidden="true" /></button>
                            <span className="pdfg-pagebar__zoom">{Math.round(zoomLevel * 100)}%</span>
                            <button className="pdfg-pagebar__btn" onClick={() => setZoomLevel(z => Math.min(4, +(z + 0.25).toFixed(2)))} disabled={fitWidth} aria-label="Zoom in"><ZoomIn size={16} aria-hidden="true" /></button>
                            <button className={`pdfg-pagebar__btn${fitWidth ? ' is-active' : ''}`} onClick={toggleFitWidth} title="Fit width" aria-label="Fit width"><Maximize2 size={16} aria-hidden="true" /></button>
                            <button className="pdfg-pagebar__btn" onClick={rotateView} title="Rotate view" aria-label="Rotate view"><RotateCw size={16} aria-hidden="true" /></button>
                        </div>
                    </div>
                )}

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
                                    <div className="pdfg-convert__job-progress"><div className="pdfg-convert__job-bar" style={{ width: `${job.progress}%` }} /></div>
                                    <div className="pdfg-convert__job-status">
                                        {job.status === 'done' && <button className="pdfg-convert__download" onClick={() => downloadResult(job)}>Download</button>}
                                        {job.status === 'processing' && <span className="pdfg-convert__processing">{job.progress}%</span>}
                                        {job.status === 'error' && <span className="pdfg-convert__error">{job.error}</span>}
                                    </div>
                                </div>
                            ))}
                            {conversionJobs.length === 0 && <div className="pdfg-convert__empty">No conversions yet.</div>}
                        </div>
                    </div>
                )}
            </div>

            {/* Param / info modals */}
            {modal?.kind === 'fields' && (
                <PdfFieldModal title={modal.title} fields={modal.fields} submitLabel={modal.submitLabel}
                    onSubmit={(v) => modal.submit(v)} onClose={() => setModal(null)} />
            )}
            {modal?.kind === 'info' && (
                <PdfInfoModal title={modal.title} rows={modal.rows} onClose={() => setModal(null)}>{modal.content}</PdfInfoModal>
            )}

            {toast && <div className="pdfg-toast">{toast}</div>}
        </div>
    );
}
