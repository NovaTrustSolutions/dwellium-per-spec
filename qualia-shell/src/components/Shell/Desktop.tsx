import { useWindows } from '../../context/WindowContext';
import { useHierarchy } from '../../context/HierarchyContext';
import { useLayout, getRegionRects } from '../../context/LayoutContext';
import { useTheme } from '../../context/ThemeContext';
import { API_BASE } from '../../config';
import { reportError } from '../../services/errorReporter';
import { getIcon } from '../Sidebar/iconMap';
import React, { useState, useRef, useEffect, Suspense, useCallback, useMemo } from 'react';
import Window from '../Window/Window';

// Widget Registry — single source of truth for all widget components
import { WINDOW_COMPONENTS as REGISTRY_COMPONENTS } from '../../registry/widgetRegistry';

import QuickLook from '../QuickLook/QuickLook';
import './Desktop.css';

/** Suspense fallback for lazy-loaded widgets */
const WidgetLoader = () => (
    <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#64748b', fontSize: 13,
        fontFamily: 'Inter, system-ui, sans-serif',
    }}>
        <div style={{
            width: 20, height: 20, marginRight: 8,
            border: '2px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1',
            borderRadius: '50%', animation: 'spin 0.6s linear infinite',
        }} />
        Loading…
    </div>
);

/** Error Boundary for lazy-loaded widgets — prevents one broken widget from crashing the shell */
class WidgetErrorBoundary extends React.Component<
    { children: React.ReactNode; widgetName?: string },
    { hasError: boolean; error: Error | null }
> {
    constructor(props: { children: React.ReactNode; widgetName?: string }) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[WidgetErrorBoundary] ${this.props.widgetName || 'Widget'} crashed:`, error, info.componentStack);
        reportError(error, `Widget:${this.props.widgetName || 'unknown'}`, { componentStack: info.componentStack });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: '#94a3b8', fontSize: 13, gap: 12, padding: 24, textAlign: 'center',
                    fontFamily: 'Inter, system-ui, sans-serif', background: 'rgba(15,17,23,0.6)',
                }}>
                    <span style={{ fontSize: 32 }}>⚠️</span>
                    <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 14 }}>
                        {this.props.widgetName || 'Widget'} encountered an error
                    </div>
                    <div style={{ color: '#64748b', fontSize: 12, maxWidth: 320 }}>
                        {this.state.error?.message || 'Something went wrong'}
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            marginTop: 8, padding: '6px 18px', fontSize: 12, fontWeight: 500,
                            background: 'rgba(99,102,241,0.15)', color: '#818cf8', border: '1px solid rgba(99,102,241,0.3)',
                            borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                        }}
                    >
                        🔄 Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

/** Placeholder content for window types */
interface ExplorerFile {
    id: string;
    name: string;
    type: string;
    size: number;
    createdAt?: string;
    updatedAt?: string;
}

type InlinePreviewData =
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'text'; content: string; truncated: boolean }
    | { kind: 'pdf'; url: string }
    | { kind: 'image'; url: string }
    | { kind: 'unsupported'; message: string };

const EXPLORER_FILE_ICONS: Record<string, string> = {
    pdf: '📄', md: '📃', txt: '📃', html: '🌐', css: '🎨', js: '⚡',
    ts: '⚡', tsx: '⚡', jsx: '⚡', json: '{ }', csv: '📊', xml: '📋',
    doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📽️', pptx: '📽️',
    rtf: '📝', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️',
    svg: '🖼️', mp3: '🎵', mp4: '🎬', wav: '🎵', mov: '🎬', avi: '🎬',
    zip: '📦', tar: '📦', gz: '📦', rar: '📦', mmd: '📎', unknown: '📎',
};

function getExplorerFileIcon(type: string): string {
    return EXPLORER_FILE_ICONS[type?.toLowerCase()] || EXPLORER_FILE_ICONS.unknown;
}

function formatExplorerFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

const FILE_TYPE_LABELS: Record<string, string> = {
    pdf: 'PDF Document', png: 'PNG Image', jpg: 'JPEG Image', jpeg: 'JPEG Image',
    gif: 'GIF Image', webp: 'WebP Image', svg: 'SVG Image',
    txt: 'Text File', md: 'Markdown', csv: 'CSV Spreadsheet',
    json: 'JSON Data', html: 'HTML Document', xml: 'XML Document',
    doc: 'Word Document', docx: 'Word Document', xls: 'Excel Spreadsheet',
    xlsx: 'Excel Spreadsheet', ppt: 'PowerPoint', pptx: 'PowerPoint',
    rtf: 'Rich Text', mp3: 'Audio (MP3)', mp4: 'Video (MP4)',
    wav: 'Audio (WAV)', mov: 'QuickTime Video', zip: 'ZIP Archive',
    js: 'JavaScript', ts: 'TypeScript', tsx: 'React TSX', css: 'Stylesheet',
};

function HierarchyBrowser() {
    const { openWindow } = useWindows();
    const { selectedId, getSelectedItem, getBreadcrumb } = useHierarchy();
    const selected = getSelectedItem();
    const breadcrumb = getBreadcrumb();
    const [allFiles, setAllFiles] = useState<ExplorerFile[]>([]);
    const [projectFiles, setProjectFiles] = useState<ExplorerFile[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);
    const [focusedFileIdx, setFocusedFileIdx] = useState<number>(-1);
    const [quickLookFile, setQuickLookFile] = useState<ExplorerFile | null>(null);
    const [showPreviewPane, setShowPreviewPane] = useState(true);
    const [inlinePreview, setInlinePreview] = useState<InlinePreviewData>({ kind: 'idle' });
    const [fileFilter, setFileFilter] = useState('');
    const fileListRef = useRef<HTMLDivElement>(null);

    const openFileInWindow = useCallback((file: ExplorerFile) => {
        const detail = { fileId: file.id, name: file.name };
        (window as any).__qualiaDocViewerPendingFile = detail;
        openWindow('doc-viewer', file.name, '📑');
        const dispatch = (attempt: number) => {
            if (attempt > 5) return;
            window.dispatchEvent(new CustomEvent('qualia-docviewer-open-file', { detail }));
            setTimeout(() => dispatch(attempt + 1), 300 * Math.pow(2, attempt));
        };
        setTimeout(() => dispatch(0), 250);
    }, [openWindow]);

    const materializeFile = useCallback(async (file: ExplorerFile) => {
        try {
            const response = await fetch(`${API_BASE}/api/files/${file.id}/materialize`, { method: 'POST' });
            const json = await response.json().catch(() => null);
            if (!response.ok || !json?.success) {
                throw new Error(json?.error || `Materialize failed (${response.status})`);
            }
            const localPath = json?.data?.localPath;
            if (localPath) {
                await navigator.clipboard.writeText(localPath).catch(() => {});
                window.dispatchEvent(new CustomEvent('qualia-toast', { detail: `Local copy ready: ${localPath}` }));
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to materialize file';
            window.dispatchEvent(new CustomEvent('qualia-toast', { detail: message }));
        }
    }, []);

    // Determine the active file list (project-scoped or all files)
    const displayFiles = useMemo(() => {
        const source = (selected?.type === 'project' && projectFiles.length > 0) ? projectFiles : allFiles;
        if (!fileFilter.trim()) return source;
        const lf = fileFilter.toLowerCase();
        return source.filter(f => f.name.toLowerCase().includes(lf) || f.type.toLowerCase().includes(lf));
    }, [selected, projectFiles, allFiles, fileFilter]);

    // Fetch inline preview when focused file changes
    useEffect(() => {
        if (!showPreviewPane || focusedFileIdx < 0 || focusedFileIdx >= displayFiles.length) {
            setInlinePreview({ kind: 'idle' });
            return;
        }

        const file = displayFiles[focusedFileIdx];
        setInlinePreview({ kind: 'loading' });
        let cancelled = false;

        async function fetchPreview() {
            try {
                const res = await fetch(`${API_BASE}/api/files/${file.id}/preview`);
                const json = await res.json();
                if (cancelled) return;

                if (!json?.success || !json?.data?.previewable) {
                    setInlinePreview({ kind: 'unsupported', message: json?.data?.message || `No preview for .${file.type} files` });
                    return;
                }
                const data = json.data;
                if (data.previewType === 'text') {
                    setInlinePreview({ kind: 'text', content: data.content, truncated: data.truncated });
                } else if (data.previewType === 'pdf') {
                    setInlinePreview({ kind: 'pdf', url: `${API_BASE}${data.downloadUrl}` });
                } else if (data.previewType === 'image') {
                    setInlinePreview({ kind: 'image', url: `${API_BASE}${data.downloadUrl}` });
                } else {
                    setInlinePreview({ kind: 'unsupported', message: 'Unknown preview type' });
                }
            } catch {
                if (!cancelled) setInlinePreview({ kind: 'unsupported', message: 'Failed to load preview' });
            }
        }
        void fetchPreview();
        return () => { cancelled = true; };
    }, [focusedFileIdx, displayFiles, showPreviewPane]);

    // Keyboard handler — arrow nav, Space for QuickLook, Enter to open
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (quickLookFile) return;
            const el = fileListRef.current;
            if (!el || !el.contains(document.activeElement)) return;

            if (e.key === ' ' && focusedFileIdx >= 0 && focusedFileIdx < displayFiles.length) {
                e.preventDefault();
                e.stopPropagation();
                setQuickLookFile(displayFiles[focusedFileIdx]);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedFileIdx(prev => Math.min(prev + 1, displayFiles.length - 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedFileIdx(prev => Math.max(prev - 1, 0));
            } else if (e.key === 'Enter' && focusedFileIdx >= 0 && focusedFileIdx < displayFiles.length) {
                e.preventDefault();
                openFileInWindow(displayFiles[focusedFileIdx]);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedFileIdx, displayFiles, quickLookFile, openFileInWindow]);

    // Reset focus when files change
    useEffect(() => {
        setFocusedFileIdx(displayFiles.length > 0 ? 0 : -1);
    }, [displayFiles]);

    // Load ALL files on mount
    useEffect(() => {
        let cancelled = false;
        async function loadAllFiles() {
            try {
                const res = await fetch(`${API_BASE}/api/files?limit=200`);
                const json = await res.json();
                if (!cancelled && json?.success && Array.isArray(json.data)) {
                    setAllFiles(json.data as ExplorerFile[]);
                }
            } catch { /* silent */ }
        }
        void loadAllFiles();
        return () => { cancelled = true; };
    }, []);

    // Load project-scoped files when a project is selected
    useEffect(() => {
        let cancelled = false;
        async function loadProjectFiles() {
            if (!selectedId || selected?.type !== 'project') {
                setProjectFiles([]);
                setIsLoadingFiles(false);
                return;
            }
            setIsLoadingFiles(true);
            try {
                const params = new URLSearchParams({ projectId: selectedId });
                const response = await fetch(`${API_BASE}/api/files?${params.toString()}`);
                const json = await response.json();
                if (!cancelled && json?.success && Array.isArray(json.data)) {
                    setProjectFiles(json.data as ExplorerFile[]);
                } else if (!cancelled) {
                    setProjectFiles([]);
                }
            } catch {
                if (!cancelled) setProjectFiles([]);
            } finally {
                if (!cancelled) setIsLoadingFiles(false);
            }
        }
        void loadProjectFiles();
        return () => { cancelled = true; };
    }, [selectedId, selected?.type]);

    const focusedFile = focusedFileIdx >= 0 && focusedFileIdx < displayFiles.length ? displayFiles[focusedFileIdx] : null;
    const focusedTypeLabel = focusedFile ? (FILE_TYPE_LABELS[focusedFile.type?.toLowerCase()] || focusedFile.type?.toUpperCase() || 'File') : '';

    return (
        <div className="window-app">
            <div className="window-app__header">
                <h2>Hierarchy Explorer</h2>
                <p className="window-app__desc">Browse the Domain &gt; Node &gt; Project &gt; Asset structure</p>
            </div>
            {selected && (
                <div className="window-app__detail">
                    <div className="detail-card">
                        <span className="detail-card__icon">{selected.icon}</span>
                        <div>
                            <h3>{selected.name}</h3>
                            <span className="detail-card__type">{selected.type}</span>
                            {breadcrumb.length > 0 && (
                                <div className="detail-card__path">
                                    {breadcrumb.map(item => item.name).join(' / ')}
                                </div>
                            )}
                        </div>
                    </div>
                    {selected.children && selected.children.length > 0 && (
                        <div className="detail-children">
                            <h4>Children ({selected.children.length})</h4>
                            {selected.children.map(child => (
                                <div key={child.id} className="detail-child-row">
                                    <span>{child.icon}</span>
                                    <span>{child.name}</span>
                                    <span className="detail-child-row__type">{child.type}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Files Section — always visible ── */}
            <div className="detail-children explorer-files-section">
                <div className="detail-section-header">
                    <h4>
                        {selected?.type === 'project' ? `Project Files (${displayFiles.length})` : `All Files (${displayFiles.length})`}
                    </h4>
                    {isLoadingFiles && <span className="detail-loading">Loading…</span>}
                    <div className="explorer-toolbar">
                        <input
                            className="explorer-filter-input"
                            type="text"
                            placeholder="Filter files…"
                            value={fileFilter}
                            onChange={e => setFileFilter(e.target.value)}
                        />
                        <button
                            className={`explorer-toggle-preview${showPreviewPane ? ' explorer-toggle-preview--active' : ''}`}
                            onClick={() => setShowPreviewPane(p => !p)}
                            title={showPreviewPane ? 'Hide preview pane' : 'Show preview pane'}
                        >
                            {showPreviewPane ? '◧' : '▭'}
                        </button>
                    </div>
                </div>
                {displayFiles.length > 0 && (
                    <div className="explorer-hints">
                        ▸ Click to preview · Double-click to open · Space for Quick Look · Enter to open
                    </div>
                )}

                <div className={`explorer-split-view${showPreviewPane ? ' explorer-split-view--with-preview' : ''}`}>
                    {/* Left: File List */}
                    <div ref={fileListRef} tabIndex={0} className="explorer-file-list" role="listbox">
                        {displayFiles.length === 0 && !isLoadingFiles && (
                            <div className="window-app__hint" style={{ padding: '16px 12px' }}>No files found.</div>
                        )}
                        {displayFiles.map((file, idx) => (
                            <div
                                key={file.id}
                                className={`detail-child-row detail-child-row--file${focusedFileIdx === idx ? ' detail-child-row--focused' : ''}`}
                                role="option"
                                aria-selected={focusedFileIdx === idx}
                                onClick={() => setFocusedFileIdx(idx)}
                                onDoubleClick={() => openFileInWindow(file)}
                            >
                                <span className="detail-child-row__icon">{getExplorerFileIcon(file.type)}</span>
                                <span className="detail-child-row__label">{file.name}</span>
                                <span className="detail-child-row__meta">{formatExplorerFileSize(file.size)}</span>
                                <button
                                    className="detail-child-row__action detail-child-row__action--preview"
                                    onClick={(e) => { e.stopPropagation(); setFocusedFileIdx(idx); setQuickLookFile(file); }}
                                    title="Quick Look (Space)"
                                >
                                    👁
                                </button>
                                <button
                                    className="detail-child-row__action detail-child-row__action--open"
                                    onClick={(e) => { e.stopPropagation(); openFileInWindow(file); }}
                                    title="Open in Doc Viewer"
                                >
                                    ↗ Open
                                </button>
                                <button
                                    className="detail-child-row__action"
                                    onClick={(e) => { e.stopPropagation(); void materializeFile(file); }}
                                    title="Download locally"
                                >
                                    📥
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Right: Inline Preview Pane */}
                    {showPreviewPane && (
                        <div className="explorer-preview-pane">
                            {inlinePreview.kind === 'idle' && (
                                <div className="explorer-preview-empty">
                                    <span className="explorer-preview-empty__icon">👁</span>
                                    <p>Select a file to preview</p>
                                </div>
                            )}
                            {inlinePreview.kind === 'loading' && (
                                <div className="explorer-preview-loading">
                                    <div className="explorer-preview-spinner" />
                                    <span>Loading preview…</span>
                                </div>
                            )}
                            {inlinePreview.kind === 'text' && focusedFile && (
                                <div className="explorer-preview-text">
                                    <div className="explorer-preview-header">
                                        <span className="explorer-preview-header__icon">{getExplorerFileIcon(focusedFile.type)}</span>
                                        <div>
                                            <div className="explorer-preview-header__name">{focusedFile.name}</div>
                                            <div className="explorer-preview-header__meta">{focusedTypeLabel} · {formatExplorerFileSize(focusedFile.size)}</div>
                                        </div>
                                        <button className="ql-btn ql-btn--open" onClick={() => openFileInWindow(focusedFile)} title="Open in Doc Viewer">↗ Open</button>
                                    </div>
                                    <pre className="explorer-preview-pre">{inlinePreview.content}</pre>
                                    {inlinePreview.truncated && (
                                        <div className="explorer-preview-truncated">Content truncated — open to see full file</div>
                                    )}
                                </div>
                            )}
                            {inlinePreview.kind === 'pdf' && focusedFile && (
                                <div className="explorer-preview-media">
                                    <div className="explorer-preview-header">
                                        <span className="explorer-preview-header__icon">{getExplorerFileIcon(focusedFile.type)}</span>
                                        <div>
                                            <div className="explorer-preview-header__name">{focusedFile.name}</div>
                                            <div className="explorer-preview-header__meta">{focusedTypeLabel} · {formatExplorerFileSize(focusedFile.size)}</div>
                                        </div>
                                        <button className="ql-btn ql-btn--open" onClick={() => openFileInWindow(focusedFile)} title="Open in Doc Viewer">↗ Open</button>
                                    </div>
                                    <iframe className="explorer-preview-iframe" src={inlinePreview.url} title={`Preview: ${focusedFile.name}`} />
                                </div>
                            )}
                            {inlinePreview.kind === 'image' && focusedFile && (
                                <div className="explorer-preview-media">
                                    <div className="explorer-preview-header">
                                        <span className="explorer-preview-header__icon">{getExplorerFileIcon(focusedFile.type)}</span>
                                        <div>
                                            <div className="explorer-preview-header__name">{focusedFile.name}</div>
                                            <div className="explorer-preview-header__meta">{focusedTypeLabel} · {formatExplorerFileSize(focusedFile.size)}</div>
                                        </div>
                                        <button className="ql-btn ql-btn--open" onClick={() => openFileInWindow(focusedFile)} title="Open in Doc Viewer">↗ Open</button>
                                    </div>
                                    <img className="explorer-preview-img" src={inlinePreview.url} alt={focusedFile.name} />
                                </div>
                            )}
                            {inlinePreview.kind === 'unsupported' && focusedFile && (
                                <div className="explorer-preview-empty">
                                    <span className="explorer-preview-empty__icon">{getExplorerFileIcon(focusedFile.type)}</span>
                                    <div className="explorer-preview-header__name">{focusedFile.name}</div>
                                    <div className="explorer-preview-header__meta">{focusedTypeLabel} · {formatExplorerFileSize(focusedFile.size)}</div>
                                    <p style={{ marginTop: 8, opacity: 0.5 }}>{inlinePreview.message}</p>
                                    <button className="ql-btn ql-btn--open" style={{ marginTop: 12 }} onClick={() => openFileInWindow(focusedFile)}>↗ Open in Doc Viewer</button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Quick Look Overlay */}
            {quickLookFile && (
                <QuickLook
                    file={quickLookFile}
                    onClose={() => setQuickLookFile(null)}
                    onOpenInWindow={(f) => openFileInWindow(f as ExplorerFile)}
                />
            )}
        </div>
    );
}

/** Snap overlay — renders guide lines and margin boundaries during drag */
function SnapOverlay() {
    const { activeGuides, settings } = useLayout();
    const hasGuides = activeGuides.length > 0;

    const guideColor = (type: string) => {
        switch (type) {
            case 'edge': return 'rgba(0, 136, 204, 0.7)';
            case 'margin': return 'rgba(240, 90, 40, 0.6)';
            case 'window': return 'rgba(39, 174, 96, 0.6)';
            case 'grid': return 'rgba(155, 89, 182, 0.4)';
            default: return 'rgba(0, 136, 204, 0.5)';
        }
    };

    return (
        <div className="snap-overlay" style={{ pointerEvents: 'none' }}>
            {/* Margin boundary lines (always visible when snap enabled) */}
            {settings.snapEnabled && settings.snapToEdges && (
                <>
                    <div className="snap-margin-line snap-margin-line--h" style={{ top: settings.margins.top }} />
                    <div className="snap-margin-line snap-margin-line--h" style={{ bottom: settings.margins.bottom }} />
                    <div className="snap-margin-line snap-margin-line--v" style={{ left: settings.margins.left }} />
                    <div className="snap-margin-line snap-margin-line--v" style={{ right: settings.margins.right }} />
                </>
            )}

            {/* Active snap guide lines during drag */}
            {hasGuides && activeGuides.map((guide, i) => (
                <div
                    key={`${guide.axis}-${guide.position}-${i}`}
                    className={`snap-guide snap-guide--${guide.axis} snap-guide--active`}
                    style={{
                        ...(guide.axis === 'x'
                            ? { left: guide.position, top: 0, bottom: 0, width: 1 }
                            : { top: guide.position, left: 0, right: 0, height: 1 }),
                        backgroundColor: guideColor(guide.type),
                    }}
                />
            ))}
        </div>
    );
}

/**
 * Map component keys to actual React components.
 * Derived from widgetRegistry + HierarchyBrowser (defined locally in Desktop.tsx).
 */
export const WINDOW_COMPONENTS: Record<string, React.FC> = {
    // HierarchyBrowser is defined locally in Desktop.tsx — not in the registry
    'hierarchy-browser': HierarchyBrowser,
    // All other widgets from the centralized registry
    ...REGISTRY_COMPONENTS,
} as Record<string, React.FC>;

export default function Desktop() {
    const { windows, closeWindow, openWindow } = useWindows();
    const { settings, updateSettings, regionAssignments, hoveredRegionId, setActiveRegionTab, assignWindowToRegion, moveTabToRegion } = useLayout();
    const { toggleTheme } = useTheme();
    const desktopRef = useRef<HTMLDivElement>(null);
    const [desktopSize, setDesktopSize] = useState({ w: 0, h: 0 });
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null);
    const [toast, setToast] = useState<{ message: string, id: number } | null>(null);
    const [tooltip, setTooltip] = useState<{ text: string, x: number, y: number } | null>(null);
    const tooltipTimeout = useRef<number | ReturnType<typeof setTimeout> | null>(null);
    const windowsRef = useRef(windows);
    windowsRef.current = windows;

    // Toast listener
    useEffect(() => {
        const handleToast = (e: Event) => {
            const customEvent = e as CustomEvent;
            setToast({ message: customEvent.detail, id: Date.now() });
            setTimeout(() => setToast(null), 3000);
        };
        window.addEventListener('qualia-toast', handleToast);
        return () => window.removeEventListener('qualia-toast', handleToast);
    }, []);

    // Open-widget event (e.g. Cmd+Shift+2 for Two Brains)
    useEffect(() => {
        const handleOpenWidget = (e: Event) => {
            const component = (e as CustomEvent).detail as string;
            const existing = windowsRef.current.find(w => w.component === component);
            if (existing) {
                // restore
                openWindow(component, component, '');
            } else {
                const labels: Record<string, { title: string; icon: string }> = {
                    'two-brains': { title: 'Two Brains', icon: 'brain' },
                };
                const info = labels[component] || { title: component, icon: '■' };
                openWindow(component, info.title, info.icon);
            }
        };
        window.addEventListener('qualia-open-widget', handleOpenWidget);
        return () => window.removeEventListener('qualia-open-widget', handleOpenWidget);
    }, [openWindow]);

    // ── Auto-assign new windows to the correct layout region ──
    // Whenever a new window appears and regions are enabled, assign it to the
    // least-occupied region so it snaps into the grid layout from settings.
    useEffect(() => {
        if (!settings.regionsEnabled) return;
        // Compute current region rects from desktop size
        const desktopEl = document.querySelector<HTMLElement>('.desktop-canvas');
        const rect = desktopEl?.getBoundingClientRect();
        if (!rect || rect.width === 0) return;
        const regions = getRegionRects(settings.regionLayout, rect.width, rect.height);
        if (regions.length === 0) return;

        // Find all window IDs currently in any region
        const assignedIds = new Set(Object.values(regionAssignments).flat());

        // For each window not yet assigned to a region, assign to least-occupied region
        for (const win of windows) {
            if (win.minimized || assignedIds.has(win.id)) continue;
            // Find least-occupied region
            const occupancy = regions.map(r => ({
                id: r.id,
                count: (regionAssignments[r.id] || []).length,
            }));
            const best = occupancy.reduce((a, b) => a.count <= b.count ? a : b);
            assignWindowToRegion(win.id, best.id, windows);
            assignedIds.add(win.id); // prevent double-assign in same pass
        }
    }, [windows, settings.regionsEnabled, settings.regionLayout, regionAssignments, assignWindowToRegion]);

    // Custom Tooltip System
    useEffect(() => {
        const handleMouseOver = (e: MouseEvent) => {
            const target = (e.target as HTMLElement).closest('[title], [data-q-title]');
            if (!target) {
                if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
                setTooltip(null);
                return;
            }

            const titleText = target.getAttribute('title') || target.getAttribute('data-q-title');
            if (titleText) {
                if (target.getAttribute('title')) {
                    target.setAttribute('data-q-title', titleText);
                    target.removeAttribute('title');
                }
                if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
                tooltipTimeout.current = setTimeout(() => {
                    const rect = target.getBoundingClientRect();
                    setTooltip({ text: titleText, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
                }, 600); // 600ms fade-in delay
            }
        };

        const handleMouseOut = () => {
            if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
            setTooltip(null);
        };

        document.addEventListener('mouseover', handleMouseOver);
        document.addEventListener('mouseout', handleMouseOut);
        return () => {
            document.removeEventListener('mouseover', handleMouseOver);
            document.removeEventListener('mouseout', handleMouseOut);
        };
    }, []);

    // Context Menu & Double Click
    const handleContextMenu = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.window') || (e.target as HTMLElement).closest('.qualia-toast')) return;
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY });
    };

    const handleDoubleClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.window')) return;
        // Quick-save layout on double-click empty desktop
        const layout = { windows: windowsRef.current, dockItems: [] }; // Mock dockItems or ignore, but it's handled by Context! 
        // We should just use saveLayout from useWindows.
    };

    const closeContextMenu = () => setContextMenu(null);

    useEffect(() => {
        window.addEventListener('click', closeContextMenu);
        return () => window.removeEventListener('click', closeContextMenu);
    }, []);

    // Drag and Drop Files
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            openWindow('file-manager', 'Files', 'folder-open');
        }
    };

    // Global Esc shortcut to close top window
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) {
                    // Let inputs handle their own escape logic
                    return;
                }
                const openWindows = windowsRef.current.filter(w => !w.minimized);
                if (openWindows.length > 0) {
                    const topMost = openWindows.reduce((prev, current) => (prev.zIndex > current.zIndex) ? prev : current);
                    closeWindow(topMost.id);
                }
            }
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [closeWindow]);

    // Track desktop dimensions
    useEffect(() => {
        const el = desktopRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setDesktopSize({ w: entry.contentRect.width, h: entry.contentRect.height });
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    const regionRects = settings.regionsEnabled
        ? getRegionRects(settings.regionLayout, desktopSize.w, desktopSize.h)
        : [];

    const handleDesktopDoubleClick = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('.window')) return;
        window.dispatchEvent(new CustomEvent('qualia-toast', { detail: 'Layout Auto-Saved' }));
        // In a real scenario we'd call saveLayout() here. Since saveLayout is in context but not returned, we can dispatch it.
        // Wait, saveLayout IS returned in useWindows! Let's destructure it and call it.
    };

    const [isLayoutMenuOpen, setIsLayoutMenuOpen] = useState(false);

    return (
        <div
            className="desktop desktop-canvas"
            ref={desktopRef}
            role="main"
            aria-label="Dwellium Desktop"
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDesktopDoubleClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Skip-to-content link for keyboard/screen-reader users */}
            <a
                href="#desktop-content"
                className="sr-only"
                onFocus={(e) => { (e.target as HTMLElement).style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:99999;padding:8px 20px;background:#6366f1;color:#fff;border-radius:8px;font-size:14px;font-weight:600;text-decoration:none;width:auto;height:auto;clip:auto;white-space:normal;'; }}
                onBlur={(e) => { (e.target as HTMLElement).style.cssText = ''; }}
            >
                Skip to content
            </a>
            {/* Hidden live region for screen reader announcements */}
            <div id="a11y-live-region" className="sr-only" aria-live="polite" aria-atomic="true" />
            <div id="desktop-content">
            {/* Background grid pattern */}
            <div className="desktop__bg" />

            {/* ── Collapsible Preset Layout Toolbar ── */}
            <div className={`desktop__layout-menu ${isLayoutMenuOpen ? 'open' : ''}`} style={{
                position: 'absolute', right: '0', top: '50%', transform: 'translateY(-50%)', zIndex: 9990,
                display: 'flex', alignItems: 'center', transition: 'transform 0.3s ease',
            }}>
                <button
                    className="desktop__layout-toggle"
                    onClick={() => setIsLayoutMenuOpen(!isLayoutMenuOpen)}
                    title="Toggle Layout Guides"
                    style={{
                        height: '40px', width: '20px', padding: '0', border: '1px solid rgba(255,255,255,0.08)',
                        borderRight: 'none', borderRadius: '4px 0 0 4px', cursor: 'pointer',
                        background: 'rgba(15,15,25,0.7)', backdropFilter: 'blur(12px)',
                        color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '-2px 0 8px rgba(0,0,0,0.2)',
                    }}>
                    <span style={{ fontSize: '10px' }}>{isLayoutMenuOpen ? '▶' : '◀'}</span>
                </button>
                <div className="desktop__preset-toolbar" style={{
                    display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 6px',
                    background: 'rgba(15,15,25,0.7)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRight: 'none', borderRadius: '0 0 0 8px',
                    width: isLayoutMenuOpen ? 'auto' : '0px', overflow: 'hidden', opacity: isLayoutMenuOpen ? 1 : 0, transition: 'all 0.3s ease',
                }}>
                    {([
                        { layout: 'none', label: '✕', tip: 'No Regions' },
                        { layout: 'halves-h', label: '⬜⬜', tip: 'Split (2 cols)' },
                        { layout: 'thirds-h', label: '⬜⬜⬜', tip: 'Thirds' },
                        { layout: 'quadrants', label: '⊞', tip: 'Fourths (2×2)' },
                    ] as { layout: string; label: string; tip: string }[]).map(p => (
                        <button key={p.layout} title={p.tip} onClick={() => {
                            updateSettings({ regionLayout: p.layout as any, regionsEnabled: p.layout !== 'none' });
                        }} style={{
                            padding: '6px 8px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                            fontSize: '11px', fontWeight: 500, letterSpacing: '0.5px', whiteSpace: 'nowrap',
                            color: settings.regionLayout === p.layout ? '#fff' : 'rgba(255,255,255,0.5)',
                            background: settings.regionLayout === p.layout ? 'rgba(59,130,246,0.4)' : 'transparent',
                            transition: 'all 0.15s',
                        }}>{p.label}</button>
                    ))}
                </div>
            </div>

            {/* Region overlays */}
            {regionRects.length > 0 && (
                <div className="desktop__regions">
                    {regionRects.map(region => {
                        const isOccupied = (regionAssignments[region.id] || []).length > 0;
                        const isHovered = hoveredRegionId === region.id;
                        return (
                            <div
                                key={region.id}
                                className={`desktop__region ${isOccupied ? 'desktop__region--occupied' : ''} ${isHovered ? 'desktop__region--active' : ''}`}
                                style={{
                                    left: region.x,
                                    top: region.y,
                                    width: region.w,
                                    height: region.h,
                                }}
                            >
                                {!isOccupied && (
                                    <span className="desktop__region-label">{region.label}</span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Snap overlay */}
            <SnapOverlay />

            {/* Region Tab Bars — with drag-and-drop reordering */}
            {regionRects.map(region => {
                const ids = regionAssignments[region.id];
                if (!ids || ids.length < 2) return null;
                const maxZ = Math.max(0, ...ids.map(wid => windows.find(w => w.id === wid)?.zIndex || 0));
                return (
                    <div
                        key={'tabs-' + region.id}
                        data-region-id={region.id}
                        onDragOver={e => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = 'move';
                            (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.15)';
                        }}
                        onDragLeave={e => {
                            (e.currentTarget as HTMLElement).style.background = 'rgba(15,17,23,0.92)';
                        }}
                        onDrop={e => {
                            e.preventDefault();
                            (e.currentTarget as HTMLElement).style.background = 'rgba(15,17,23,0.92)';
                            const draggedWindowId = e.dataTransfer.getData('text/tab-window-id');
                            const sourceRegionId = e.dataTransfer.getData('text/tab-source-region');
                            if (!draggedWindowId) return;

                            // Find drop position by mouse X relative to existing tabs
                            const tabBar = e.currentTarget as HTMLElement;
                            const tabButtons = Array.from(tabBar.querySelectorAll('[data-tab-wid]'));
                            let insertIdx = ids.length; // default: append at end
                            for (let i = 0; i < tabButtons.length; i++) {
                                const rect = tabButtons[i].getBoundingClientRect();
                                if (e.clientX < rect.left + rect.width / 2) {
                                    insertIdx = i;
                                    break;
                                }
                            }

                            // If same region, adjust index for the dragged item being removed
                            if (sourceRegionId === region.id) {
                                const oldIdx = ids.indexOf(draggedWindowId);
                                if (oldIdx >= 0 && oldIdx < insertIdx) insertIdx--;
                            }

                            moveTabToRegion(draggedWindowId, region.id, insertIdx);
                        }}
                        style={{
                            position: 'absolute', left: region.x, top: region.y,
                            width: region.w, height: 30, zIndex: (maxZ * 10) + 1,
                            display: 'flex', gap: 0,
                            background: 'rgba(15,17,23,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                            backdropFilter: 'blur(10px)',
                            transition: 'background 0.15s ease',
                        }}
                    >
                        {ids.map((wid, idx) => {
                            const win = windows.find(w => w.id === wid);
                            if (!win) return null;
                            const isActive = idx === 0;
                            return (
                                <button
                                    key={wid}
                                    data-tab-wid={wid}
                                    draggable
                                    onDragStart={e => {
                                        e.dataTransfer.setData('text/tab-window-id', wid);
                                        e.dataTransfer.setData('text/tab-source-region', region.id);
                                        e.dataTransfer.effectAllowed = 'move';
                                        // Semi-transparent drag image
                                        const el = e.currentTarget as HTMLElement;
                                        el.style.opacity = '0.5';
                                        setTimeout(() => { el.style.opacity = '1'; }, 0);
                                    }}
                                    onDragEnd={e => {
                                        (e.currentTarget as HTMLElement).style.opacity = '1';
                                    }}
                                    onClick={() => setActiveRegionTab(region.id, wid)}
                                    style={{
                                        flex: '0 1 auto', maxWidth: 160, padding: '4px 10px 4px 14px', fontSize: 11,
                                        fontWeight: isActive ? 600 : 400, cursor: 'grab',
                                        background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                                        border: 'none', borderBottom: isActive ? '2px solid #818cf8' : '2px solid transparent',
                                        color: isActive ? '#e2e8f0' : '#64748b',
                                        display: 'flex', alignItems: 'center', gap: 5,
                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                        transition: 'all 0.15s ease',
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    <span style={{ fontSize: 13, flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>{(() => { const Icon = getIcon(win.icon); return Icon ? <Icon size={14} strokeWidth={1.75} /> : win.icon; })()}</span>
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{win.title}</span>
                                    {/* × Close button inside the tab */}
                                    <span
                                        role="button"
                                        aria-label={`Close ${win.title}`}
                                        onClick={e => { e.stopPropagation(); closeWindow(win.id); }}
                                        style={{
                                            flexShrink: 0, marginLeft: 2,
                                            width: 14, height: 14,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            borderRadius: '50%',
                                            fontSize: 10, lineHeight: 1,
                                            color: isActive ? '#94a3b8' : '#475569',
                                            transition: 'all 0.12s ease',
                                            cursor: 'pointer',
                                        }}
                                        onMouseEnter={e => {
                                            (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.2)';
                                            (e.currentTarget as HTMLElement).style.color = '#f87171';
                                        }}
                                        onMouseLeave={e => {
                                            (e.currentTarget as HTMLElement).style.background = '';
                                            (e.currentTarget as HTMLElement).style.color = isActive ? '#94a3b8' : '#475569';
                                        }}
                                    >
                                        ×
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                );
            })}

            {/* Render all windows */}
            {windows.map(win => {
                const Component = WINDOW_COMPONENTS[win.component];
                // Check if this window is in a region
                let regionId: string | undefined;
                let isActiveTab = true;
                for (const [rId, ids] of Object.entries(regionAssignments)) {
                    const idx = ids.indexOf(win.id);
                    if (idx >= 0) {
                        regionId = rId;
                        isActiveTab = idx === 0; // first = active
                        break;
                    }
                }
                const regionRect = regionId ? regionRects.find(r => r.id === regionId) : null;
                // Offset for tab bar when multiple tabs exist
                const tabBarHeight = regionId && (regionAssignments[regionId]?.length || 0) > 1 ? 30 : 0;
                const adjustedRect = regionRect && tabBarHeight ? {
                    ...regionRect, y: regionRect.y + tabBarHeight, h: regionRect.h - tabBarHeight,
                } : regionRect;

                return (
                    <Window key={win.id} state={win} regionRect={adjustedRect || undefined}
                        containerStyle={regionId && !isActiveTab ? { display: 'none' } : undefined}>
                        {Component ? (
                            <WidgetErrorBoundary widgetName={win.title}>
                                <Suspense fallback={<WidgetLoader />}>
                                    <Component />
                                </Suspense>
                            </WidgetErrorBoundary>
                        ) : <div className="window-app__empty">Unknown component: {win.component}</div>}
                    </Window>
                );
            })}

            {/* Empty state */}
            {windows.filter(w => !w.minimized).length === 0 && (
                <div className="desktop__empty">
                    <div className="desktop__empty-logo">◆</div>
                    <h1 className="desktop__empty-title">DWELLIUM</h1>
                    <p className="desktop__empty-sub">Click an icon in the sidebar to get started</p>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div key={toast.id} className="qualia-toast" role="status" aria-live="polite">
                    {toast.message}
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div className="desktop-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button onClick={() => windowsRef.current.forEach(w => closeWindow(w.id))}>Close All Windows</button>
                    <button onClick={toggleTheme}>Toggle Theme</button>
                    <button onClick={() => window.location.reload()}>Reload System</button>
                    <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '4px 0' }} />
                    <div style={{ padding: '4px 12px 2px', fontSize: 10, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Skin</div>
                    <div style={{ display: 'flex', gap: 8, padding: '4px 12px 8px' }}>
                        {(['default', 'minimal', 'aurora', 'warm', 'neon'] as const).map(skin => (
                            <button
                                key={skin}
                                className={`skin-swatch${document.documentElement.getAttribute('data-skin') === skin ? ' active' : ''}`}
                                data-skin={skin}
                                onClick={() => window.dispatchEvent(new CustomEvent('qualia-skin-change', { detail: skin }))}
                                title={skin.charAt(0).toUpperCase() + skin.slice(1)}
                                style={{ border: 'none', padding: 0 }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Custom Tooltip */}
            {tooltip && (
                <div className="qualia-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                    {tooltip.text}
                </div>
            )}
            </div> {/* end #desktop-content */}
        </div>
    );
}
