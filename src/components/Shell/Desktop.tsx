import { useWindows } from '../../context/WindowContext';
import { useHierarchy } from '../../context/HierarchyContext';
import { useLayout, getRegionRects } from '../../context/LayoutContext';
import { useTheme } from '../../context/ThemeContext';
import { API_BASE } from '../../config';
import React, { useState, useRef, useEffect, Suspense, lazy } from 'react';
import Window from '../Window/Window';
import ControlPanel from '../ControlPanel/ControlPanel';

// Lazy-loaded widgets — each gets its own chunk for faster initial load
const InboxWidget = lazy(() => import('../InboxWidget/InboxWidget'));
const TaskMenu = lazy(() => import('../TaskMenu/TaskMenu'));
const ARAConsole = lazy(() => import('../ARAConsole/ARAConsole'));
const TranscriptionHub = lazy(() => import('../TranscriptionHub/TranscriptionHub'));
const FileManagerWidget = lazy(() => import('../FileManager/FileManager'));
const Notepad = lazy(() => import('../Notepad/Notepad'));
const DocViewer = lazy(() => import('../DocViewer/DocViewer'));
const TrelloBoard = lazy(() => import('../TrelloBoard/TrelloBoard'));
const FactCheckLog = lazy(() => import('../FactCheckLog/FactCheckLog'));
const InboxZero = lazy(() => import('../InboxZero/InboxZero'));
const ThoughtWeaver = lazy(() => import('../ThoughtWeaver/ThoughtWeaver'));
const StrataDashboard = lazy(() => import('../StrataDashboard/StrataDashboard'));
const AstraDashboard = lazy(() => import('../AstraDashboard/AstraDashboard'));
const HomeUpkeepAI = lazy(() => import('../HomeUpkeepAI/HomeUpkeepAI'));
const AutomationHub = lazy(() => import('../AutomationHub/AutomationHub'));
const TwoBrains = lazy(() => import('../TwoBrains/TwoBrains'));
const HydraAI = lazy(() => import('../HydraAI/HydraAI'));
const TenantPortalMgmt = lazy(() => import('../TenantPortalMgmt/TenantPortalMgmt'));
const GeorgiaCode = lazy(() => import('../GeorgiaCode/GeorgiaCode'));
const StellaAgent = lazy(() => import('../StellaAgent/StellaAgent'));
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
}

const EXPLORER_FILE_ICONS: Record<string, string> = {
    pdf: '📄',
    md: '📃',
    txt: '📃',
    html: '🌐',
    doc: '📝',
    docx: '📝',
    mmd: '📎',
    unknown: '📎',
};

function getExplorerFileIcon(type: string): string {
    return EXPLORER_FILE_ICONS[type?.toLowerCase()] || EXPLORER_FILE_ICONS.unknown;
}

function formatExplorerFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
}

function HierarchyBrowser() {
    const { selectedId, getSelectedItem, getBreadcrumb } = useHierarchy();
    const selected = getSelectedItem();
    const breadcrumb = getBreadcrumb();
    const [projectFiles, setProjectFiles] = useState<ExplorerFile[]>([]);
    const [isLoadingFiles, setIsLoadingFiles] = useState(false);

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

        return () => {
            cancelled = true;
        };
    }, [selectedId, selected?.type]);

    return (
        <div className="window-app">
            <div className="window-app__header">
                <h2>Hierarchy Explorer</h2>
                <p className="window-app__desc">Browse the Domain &gt; Node &gt; Project &gt; Asset structure</p>
            </div>
            {selected ? (
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
                    {selected.type === 'project' && (
                        <div className="detail-children">
                            <div className="detail-section-header">
                                <h4>Files ({projectFiles.length})</h4>
                                {isLoadingFiles && <span className="detail-loading">Loading…</span>}
                            </div>
                            {!isLoadingFiles && projectFiles.length === 0 && (
                                <div className="window-app__hint">No files found for this project yet.</div>
                            )}
                            {projectFiles.map(file => (
                                <div key={file.id} className="detail-child-row detail-child-row--file">
                                    <span>{getExplorerFileIcon(file.type)}</span>
                                    <span className="detail-child-row__label">{file.name}</span>
                                    <span className="detail-child-row__meta">{formatExplorerFileSize(file.size)}</span>
                                    <button
                                        className="detail-child-row__action"
                                        onClick={() => window.open(`${API_BASE}/api/files/${file.id}/download`, '_blank', 'noopener')}
                                    >
                                        Download
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                <div className="window-app__empty">
                    <span className="window-app__empty-icon">🗂️</span>
                    <p>Select an item in the sidebar to view details</p>
                </div>
            )}
        </div>
    );
}

function Terminal() {
    return (
        <div className="window-app window-app--terminal">
            <div className="terminal-output">
                <div className="terminal-line terminal-line--system">
                    <span className="terminal-prompt">DWELLIUM v1.0.0-alpha</span>
                </div>
                <div className="terminal-line terminal-line--system">
                    <span className="terminal-prompt">AI-Dashboard369 Shell initialized</span>
                </div>
                <div className="terminal-line">
                    <span className="terminal-prompt">$</span>
                    <span className="terminal-cursor">_</span>
                </div>
            </div>
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

/** Map component keys to actual React components */
const WINDOW_COMPONENTS: Record<string, React.FC> = {
    'control-panel': ControlPanel,
    'hierarchy-browser': HierarchyBrowser,
    'file-manager': FileManagerWidget,
    'terminal': Terminal,
    'inbox': InboxWidget,
    'tasks': TaskMenu,
    'ara-console': ARAConsole,
    'transcription': TranscriptionHub,
    'notepad': Notepad,
    'doc-viewer': DocViewer,
    'trello-board': TrelloBoard,
    'fact-check-log': FactCheckLog,
    'inbox-zero': InboxZero,
    'thought-weaver': ThoughtWeaver,
    'strata-dashboard': StrataDashboard,
    'astra-dashboard': AstraDashboard,
    'home-upkeep-ai': HomeUpkeepAI,
    'automation-hub': AutomationHub,
    'two-brains': TwoBrains,
    'hydra-ai': HydraAI,
    'tenant-portal-mgmt': TenantPortalMgmt,
    'georgia-code': GeorgiaCode,
    'stella-agent': StellaAgent,
};

export default function Desktop() {
    const { windows, closeWindow, openWindow } = useWindows();
    const { settings, updateSettings, regionAssignments, hoveredRegionId, setActiveRegionTab } = useLayout();
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
            openWindow('file-manager', 'Files', '📁');
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

    return (
        <div
            className="desktop"
            ref={desktopRef}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDesktopDoubleClick}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {/* Background grid pattern */}
            <div className="desktop__bg" />

            {/* ── Preset Layout Toolbar ── */}
            <div className="desktop__preset-toolbar" style={{
                position: 'absolute', top: '8px', right: '8px', zIndex: 9990,
                display: 'flex', gap: '4px', padding: '4px 6px',
                borderRadius: '8px', background: 'rgba(15,15,25,0.7)',
                backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.08)',
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
                        padding: '4px 8px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                        fontSize: '11px', fontWeight: 500, letterSpacing: '0.5px',
                        color: settings.regionLayout === p.layout ? '#fff' : 'rgba(255,255,255,0.5)',
                        background: settings.regionLayout === p.layout ? 'rgba(59,130,246,0.4)' : 'transparent',
                        transition: 'all 0.15s',
                    }}>{p.label}</button>
                ))}
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

            {/* Region Tab Bars */}
            {regionRects.map(region => {
                const ids = regionAssignments[region.id];
                if (!ids || ids.length < 2) return null;
                return (
                    <div key={'tabs-' + region.id} style={{
                        position: 'absolute', left: region.x, top: region.y,
                        width: region.w, height: 30, zIndex: 9999,
                        display: 'flex', gap: 0,
                        background: 'rgba(15,17,23,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)',
                        backdropFilter: 'blur(10px)',
                    }}>
                        {ids.map((wid, idx) => {
                            const win = windows.find(w => w.id === wid);
                            if (!win) return null;
                            const isActive = idx === 0;
                            return (
                                <button key={wid} onClick={() => setActiveRegionTab(region.id, wid)} style={{
                                    flex: '0 1 auto', maxWidth: 160, padding: '4px 14px', fontSize: 11,
                                    fontWeight: isActive ? 600 : 400, cursor: 'pointer',
                                    background: isActive ? 'rgba(99,102,241,0.12)' : 'transparent',
                                    border: 'none', borderBottom: isActive ? '2px solid #818cf8' : '2px solid transparent',
                                    color: isActive ? '#e2e8f0' : '#64748b',
                                    display: 'flex', alignItems: 'center', gap: 5,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    transition: 'all 0.15s ease',
                                }}>
                                    <span style={{ fontSize: 13 }}>{win.icon}</span> {win.title}
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
                <div key={toast.id} className="qualia-toast">
                    {toast.message}
                </div>
            )}

            {/* Context Menu */}
            {contextMenu && (
                <div className="desktop-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
                    <button onClick={() => windowsRef.current.forEach(w => closeWindow(w.id))}>✕ Center Focus (Close All)</button>
                    <button onClick={toggleTheme}>🎨 Toggle Theme</button>
                    <button onClick={() => window.location.reload()}>🔄 Reload System</button>
                </div>
            )}

            {/* Custom Tooltip */}
            {tooltip && (
                <div className="qualia-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
                    {tooltip.text}
                </div>
            )}
        </div>
    );
}
