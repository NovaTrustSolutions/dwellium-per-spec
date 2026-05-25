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
import { PDFDocument } from 'pdf-lib';
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

type ToolCategory = 'hot' | 'from-pdf' | 'to-pdf' | 'merge-split' | 'all';
type ViewMode = 'toolset' | 'viewer' | 'converting';

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
    const [conversionJobs, setConversionJobs] = useState<ConversionJob[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const [mergeFiles, setMergeFiles] = useState<File[]>([]);
    const [splitRange, setSplitRange] = useState('');
    const [activeConversionTarget, setActiveConversionTarget] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const mergeInputRef = useRef<HTMLInputElement>(null);
    const convertInputRef = useRef<HTMLInputElement>(null);
    const viewerContainerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

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
    const openPdfFile = useCallback(async (file: File) => {
        setIsLoading(true);
        setViewMode('viewer');
        setSelectedFile(file);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdfjsLib = await loadPdfjs();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            setTotalPages(pdf.numPages);
            setCurrentPage(1);

            // Store the URL for reference
            const url = URL.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' }));
            if (pdfUrl) URL.revokeObjectURL(pdfUrl);
            setPdfUrl(url);

            // Render first page
            await renderPage(pdf, 1, zoomLevel);
        } catch (err) {
            showToast('Failed to open PDF file');
            console.error(err);
            setViewMode('toolset');
        } finally {
            setIsLoading(false);
        }
    }, [pdfUrl, zoomLevel]);

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

    const renderPage = async (pdf: any, pageNum: number, zoom: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: zoom * 1.5 });
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
    };

    const goToPage = useCallback(async (pageNum: number) => {
        if (pageNum < 1 || pageNum > totalPages || !pdfUrl) return;
        setCurrentPage(pageNum);
        setIsLoading(true);
        try {
            const res = await fetch(pdfUrl);
            const buf = await res.arrayBuffer();
            const pdfjsLib = await loadPdfjs();
            const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
            await renderPage(pdf, pageNum, zoomLevel);
        } catch {
            showToast('Failed to render page');
        } finally {
            setIsLoading(false);
        }
    }, [totalPages, pdfUrl, zoomLevel]);

    // ---- Conversion Engine ----
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

        try {
            // Simulate progress animation
            const progressInterval = setInterval(() => {
                setConversionJobs(prev => prev.map(j =>
                    j.id === jobId && j.status === 'processing'
                        ? { ...j, progress: Math.min(j.progress + 8, 90) }
                        : j
                ));
            }, 300);

            // Perform actual conversion via backend
            const formData = new FormData();
            formData.append('file', file);
            formData.append('targetFormat', targetFormat);

            const res = await fetch(`${API_BASE}/docs/convert`, {
                method: 'POST',
                body: formData,
            });

            clearInterval(progressInterval);

            if (res.ok) {
                const blob = await res.blob();
                const resultUrl = URL.createObjectURL(blob);
                setConversionJobs(prev => prev.map(j =>
                    j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl } : j
                ));
                showToast(`✅ Converted to ${targetFormat.toUpperCase()}`);
            } else {
                // Fallback: client-side conversion where possible
                const result = await clientSideConvert(file, targetFormat);
                if (result) {
                    setConversionJobs(prev => prev.map(j =>
                        j.id === jobId ? { ...j, status: 'done', progress: 100, resultUrl: result } : j
                    ));
                    showToast(`✅ Converted to ${targetFormat.toUpperCase()}`);
                } else {
                    throw new Error('Conversion failed on both server and client');
                }
            }
        } catch (err: any) {
            setConversionJobs(prev => prev.map(j =>
                j.id === jobId ? { ...j, status: 'error', progress: 0, error: err.message || 'Conversion failed' } : j
            ));
            showToast(`❌ Conversion failed: ${err.message || 'Unknown error'}`);
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
            default:
                return null;
        }
    };

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

    // ---- Split PDF ----
    const splitPdf = useCallback(async () => {
        if (!selectedFile) {
            showToast('Open a PDF file first');
            return;
        }
        setIsLoading(true);
        try {
            const arrayBuffer = await selectedFile.arrayBuffer();
            const srcPdf = await PDFDocument.load(arrayBuffer);
            const total = srcPdf.getPageCount();

            // Parse range (e.g., "1-3" or "1,3,5" or "1-3,5-7")
            const ranges = splitRange.trim() || `1-${total}`;
            const pageIndices: number[] = [];
            for (const part of ranges.split(',')) {
                const trimmed = part.trim();
                if (trimmed.includes('-')) {
                    const [start, end] = trimmed.split('-').map(Number);
                    for (let i = Math.max(1, start); i <= Math.min(total, end); i++) {
                        pageIndices.push(i - 1);
                    }
                } else {
                    const n = Number(trimmed);
                    if (n >= 1 && n <= total) pageIndices.push(n - 1);
                }
            }

            if (pageIndices.length === 0) {
                showToast('Invalid page range');
                setIsLoading(false);
                return;
            }

            const newPdf = await PDFDocument.create();
            const pages = await newPdf.copyPages(srcPdf, pageIndices);
            pages.forEach(page => newPdf.addPage(page));
            const pdfBytes = await newPdf.save();

            const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `split_${selectedFile.name}`;
            a.click();

            showToast(`✅ Split complete: ${pageIndices.length} pages extracted`);
        } catch (err: any) {
            showToast(`❌ Split failed: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    }, [selectedFile, splitRange]);

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
        { key: 'all', label: 'All Tools' },
    ];

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
                        {/* Viewer Toolbar */}
                        <div className="pdfg-viewer__toolbar">
                            <button className="pdfg-viewer__back" onClick={() => setViewMode('toolset')}>← Back</button>
                            <span className="pdfg-viewer__filename">{selectedFile?.name || 'untitled.pdf'}</span>
                            <div className="pdfg-viewer__nav">
                                <button onClick={() => void goToPage(currentPage - 1)} disabled={currentPage <= 1}>◀</button>
                                <span className="pdfg-viewer__page-info">
                                    Page <input
                                        type="number"
                                        className="pdfg-viewer__page-input"
                                        value={currentPage}
                                        min={1}
                                        max={totalPages}
                                        onChange={e => void goToPage(Number(e.target.value))}
                                    /> of {totalPages}
                                </span>
                                <button onClick={() => void goToPage(currentPage + 1)} disabled={currentPage >= totalPages}>▶</button>
                            </div>
                            <div className="pdfg-viewer__zoom">
                                <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))}>−</button>
                                <span>{Math.round(zoomLevel * 100)}%</span>
                                <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))}>+</button>
                            </div>
                            <div className="pdfg-viewer__actions">
                                <button className="pdfg-viewer__action-btn" onClick={() => triggerConvert('txt')} title="Extract Text">📝 TXT</button>
                                <button className="pdfg-viewer__action-btn" onClick={() => triggerConvert('png')} title="Export as Image">🖼 PNG</button>
                                <button className="pdfg-viewer__action-btn" onClick={() => triggerConvert('html')} title="Convert to HTML">&lt;/&gt; HTML</button>
                            </div>
                        </div>

                        {/* Split Controls */}
                        <div className="pdfg-viewer__split-bar">
                            <span>Split:</span>
                            <input
                                type="text"
                                className="pdfg-viewer__split-input"
                                value={splitRange}
                                onChange={e => setSplitRange(e.target.value)}
                                placeholder={`Pages (e.g., 1-3,5,7-${totalPages})`}
                            />
                            <button className="pdfg-viewer__split-btn" onClick={() => void splitPdf()} disabled={isLoading}>
                                ✂ Split
                            </button>
                        </div>

                        {/* Canvas */}
                        <div className="pdfg-viewer__canvas-wrap" ref={viewerContainerRef}>
                            {isLoading && <div className="pdfg-viewer__loading">Loading…</div>}
                            <canvas ref={canvasRef} className="pdfg-viewer__canvas" />
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
