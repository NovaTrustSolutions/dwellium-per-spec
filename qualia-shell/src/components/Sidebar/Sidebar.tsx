import { useRef, useCallback, useState, useEffect, useMemo, useSyncExternalStore, DragEvent } from 'react';
import { useHierarchy } from '../../context/HierarchyContext';
import { useWindows } from '../../context/WindowContext';
import { useUser } from '../../context/UserContext';
import { usePermissions } from '../../context/PermissionsContext';
import { HierarchyItem } from '../../data/types';
import { rankWidgetSearchResults, WidgetSearchMatch } from './widgetSearch';
import { getIcon, isLucideKey } from './iconMap';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import SpacesSwitcher from './SpacesSwitcher';
import { useHiddenWidgets, hideWidget, unhideWidget, foldStandaloneAgentsOnce, hideTerminalOnce } from '../../lib/hiddenWidgetsStore';
import { useGridLock } from '../../hooks/useGridLock';
import { Check, CloudFog, CloudRain, CloudSnow, CloudSun, FolderOpen, Lock, Search, Settings, Sun, Unlock, X, Zap, type LucideIcon } from 'lucide-react';
import './Sidebar.css';
import React from 'react';

/**
 * Renders a Lucide SVG icon if the key is recognized, otherwise falls back to text/emoji.
 * Used everywhere an icon string needs to be displayed.
 */
function SidebarIcon({ iconKey, size = 16, className }: { iconKey: string; size?: number; className?: string }) {
    const LucideIcon = getIcon(iconKey);
    if (LucideIcon) {
        return <LucideIcon size={size} strokeWidth={1.75} className={className} />;
    }
    // Fallback for legacy emoji icons from saved layouts in localStorage
    return <span className={className}>{iconKey}</span>;
}

const MIN_WIDTH = 200;
const MAX_WIDTH = 420;
const STORAGE_KEY = 'dwellium-sidebar-width';
const SPLIT_STORAGE_KEY = 'dwellium-sidebar-split';
const DOMAINS_COLLAPSED_KEY = 'qualia_domains_collapsed';
const ICON_ONLY_KEY = 'qualia_sidebar_icon_only';
const SIDEBAR_GROUPS_KEY = 'qualia_sidebar_groups';

const DEFAULT_WIDTH = 240;
const DEFAULT_SPLIT_RATIO = 0.5;

// ============================================
// SSR-SAFE EXTERNAL STORES (Phase-8+ Task 8.10 PROVIDER-SSR-REMEDIATION)
// ============================================
// Migrated from 5 useState lazy initializers reading localStorage (fired
// during render; L264 + L285 threw ReferenceError on SSR before HARD-CRASH
// → SOFT-DEGRADED try/catch uplift) to useSyncExternalStore +
// getServerSnapshot per Cowork Q1 LOCK Option A at Task 8.10 PRE0.
// Per Q1 LOCK: HARD-CRASH sites L264 (sidebarSplitStore) + L285
// (sidebarWidthStore) receive explicit try/catch wrap in deserializer
// alongside the factory's built-in try/catch (defense-in-depth +
// HARD-CRASH → SOFT-DEGRADED uplift visible at call site).
// Exported for unit test access at src/test/appfolioParity/.

export const domainsCollapsedStore = createLocalStorageStore<boolean>(
    () => {
        try {
            const saved = localStorage.getItem(DOMAINS_COLLAPSED_KEY);
            if (saved !== null) return saved === 'true';
        } catch { /* ignore */ }
        return true; // collapsed by default
    },
    true,
);

export const iconOnlyStore = createLocalStorageStore<boolean>(
    () => {
        try {
            const saved = localStorage.getItem(ICON_ONLY_KEY);
            if (saved !== null) return saved === 'true';
        } catch { /* ignore */ }
        return true; // icon-rail by default — calmer initial canvas (one-click expand via »)
    },
    true,
);

export const sidebarGroupsStore = createLocalStorageStore<Set<string>>(
    () => {
        try {
            const saved = localStorage.getItem(SIDEBAR_GROUPS_KEY);
            if (saved) return new Set(JSON.parse(saved));
        } catch { /* ignore */ }
        // Default arrangement (Ilya 2026-06-11): the daily-driver groups open
        // out of the box — matches the canonical e2e seed set, so fresh
        // browsers see the same sidebar the tests (and Ilya) see.
        return new Set<string>(['Property Management', 'AI Tools', 'Filing Cabinet']);
    },
    new Set<string>(),
);

export const sidebarSplitStore = createLocalStorageStore<number>(
    () => {
        try {
            const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
            return saved ? Math.max(0.2, Math.min(0.8, parseFloat(saved))) : DEFAULT_SPLIT_RATIO;
        } catch { return DEFAULT_SPLIT_RATIO; }
    },
    DEFAULT_SPLIT_RATIO,
);

export const sidebarWidthStore = createLocalStorageStore<number>(
    () => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            return saved ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved))) : DEFAULT_WIDTH;
        } catch { return DEFAULT_WIDTH; }
    },
    DEFAULT_WIDTH,
);

/* ── child type map ──────────────────────────────── */
const CHILD_TYPE: Record<string, 'node' | 'project' | null> = {
    domain: 'node',
    node: 'project',
    project: null,
};

const CHILD_LABEL: Record<string, string> = {
    domain: 'Node',
    node: 'Project',
};

/* ── TreeNode ────────────────────────────────────── */

function TreeNode({ item, depth = 0 }: { item: HierarchyItem; depth?: number }) {
    const { selectedId, expandedIds, selectItem, toggleExpand, addItem, removeItem, renameItem } = useHierarchy();
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedIds.has(item.id);
    const isSelected = selectedId === item.id;
    const childType = CHILD_TYPE[item.type];

    const [isAdding, setIsAdding] = useState(false);
    const [addValue, setAddValue] = useState('');
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(item.name);
    const addInputRef = useRef<HTMLInputElement>(null);
    const renameInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isAdding && addInputRef.current) addInputRef.current.focus();
    }, [isAdding]);

    useEffect(() => {
        if (isRenaming && renameInputRef.current) {
            renameInputRef.current.focus();
            renameInputRef.current.select();
        }
    }, [isRenaming]);

    const confirmAdd = () => {
        const name = addValue.trim();
        if (name && childType) {
            addItem(item.id, name, childType);
        }
        setAddValue('');
        setIsAdding(false);
    };

    const confirmRename = () => {
        const name = renameValue.trim();
        if (name && name !== item.name) {
            renameItem(item.id, name);
        } else {
            setRenameValue(item.name);
        }
        setIsRenaming(false);
    };

    return (
        <div className="tree-node">
            <div
                className={`tree-node__row ${isSelected ? 'tree-node__row--selected' : ''}`}
                style={{ paddingLeft: depth * 16 + 8 }}
                onClick={() => {
                    selectItem(item.id);
                    if (hasChildren || (item.children && item.children.length === 0)) toggleExpand(item.id);
                }}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenameValue(item.name);
                    setIsRenaming(true);
                }}
            >
                <span className={`tree-node__chevron ${(hasChildren || (item.children !== undefined)) ? '' : 'tree-node__chevron--hidden'} ${isExpanded ? 'tree-node__chevron--open' : ''}`}>
                    ›
                </span>
                <span className="tree-node__icon">{item.icon}</span>
                {isRenaming ? (
                    <input
                        ref={renameInputRef}
                        className="tree-node__inline-input"
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') confirmRename();
                            if (e.key === 'Escape') { setRenameValue(item.name); setIsRenaming(false); }
                        }}
                        onBlur={confirmRename}
                        onClick={e => e.stopPropagation()}
                    />
                ) : (
                    <span className="tree-node__label">{item.name}</span>
                )}

                {/* Hover Actions */}
                <span className="tree-node__actions">
                    {childType && (
                        <button
                            className="tree-node__action-btn"
                            title={`Add ${CHILD_LABEL[item.type]}`}
                            onClick={e => { e.stopPropagation(); setIsAdding(true); }}
                        >
                            +
                        </button>
                    )}
                    <button
                        className="tree-node__action-btn tree-node__action-btn--danger"
                        title="Delete"
                        onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                    >
                        ×
                    </button>
                </span>
            </div>

            {/* Expanded Children */}
            {isExpanded && item.children && (
                <div className="tree-node__children">
                    {item.children.map(child => (
                        <TreeNode key={child.id} item={child} depth={depth + 1} />
                    ))}
                </div>
            )}

            {/* Inline Add Input */}
            {isAdding && (
                <div className="tree-node__add-row" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
                    <input
                        ref={addInputRef}
                        className="tree-node__inline-input"
                        placeholder={`${CHILD_LABEL[item.type]} name…`}
                        value={addValue}
                        onChange={e => setAddValue(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') confirmAdd();
                            if (e.key === 'Escape') { setAddValue(''); setIsAdding(false); }
                        }}
                        onBlur={confirmAdd}
                    />
                </div>
            )}
        </div>
    );
}

/* ── Sidebar Main ────────────────────────────────── */

export default function Sidebar() {
    const { hierarchy, addItem, getBreadcrumb, expandAll: expandAllDomains, collapseAll: collapseAllDomains } = useHierarchy();
    const { dockItems, windows, openWindow, closeWindow, restoreWindow, moveDockItem, saveLayout, savedLayouts, saveNamedLayout, loadNamedLayout, deleteNamedLayout } = useWindows();
    const { user, logout, hasMinRole } = useUser();
    const { can } = usePermissions();
    const { locked: gridLocked, toggle: toggleGridLock } = useGridLock();

    const canSaveLayout = hasMinRole('corporate');

    // Add / remove widgets: hidden set filters the sidebar; the gallery re-adds.
    const hidden = useHiddenWidgets();
    const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
    const [galleryOpen, setGalleryOpen] = useState(false);
    const removeWidget = useCallback((component: string) => {
        hideWidget(component);
        windows.filter(w => w.component === component).forEach(w => closeWindow(w.id));
    }, [windows, closeWindow]);

    // Heavy fold: retire the standalone agent widgets into the Agent Lab once.
    // 2026-06-12 (Ilya): Terminal retired to hidden-feature status the same way.
    useEffect(() => { foldStandaloneAgentsOnce(); hideTerminalOnce(); }, []);

    // Layout UI State
    const [saveFlash, setSaveFlash] = useState(false);
    const [showSavePopover, setShowSavePopover] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [showLoadDropdown, setShowLoadDropdown] = useState(false);
    // Domains panel — collapsed by default for clean initial view
    const domainsCollapsed = useSyncExternalStore(
        domainsCollapsedStore.subscribe,
        domainsCollapsedStore.getSnapshot,
        domainsCollapsedStore.getServerSnapshot,
    );
    const setDomainsCollapsed = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof value === 'function' ? value(domainsCollapsedStore.getSnapshot()) : value;
        domainsCollapsedStore.set(next, () => localStorage.setItem(DOMAINS_COLLAPSED_KEY, String(next)));
    }, []);
    const [showOptions, setShowOptions] = useState(false);

    // Icon-only collapsed mode
    const iconOnly = useSyncExternalStore(
        iconOnlyStore.subscribe,
        iconOnlyStore.getSnapshot,
        iconOnlyStore.getServerSnapshot,
    );
    const setIconOnly = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
        const next = typeof value === 'function' ? value(iconOnlyStore.getSnapshot()) : value;
        iconOnlyStore.set(next, () => localStorage.setItem(ICON_ONLY_KEY, String(next)));
    }, []);
    const breadcrumb = getBreadcrumb();
    const sidebarRef = useRef<HTMLElement>(null);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const [dragItem, setDragItem] = useState<{ id: string, group: string | undefined, index: number } | null>(null);
    const [dragOverInfo, setDragOverInfo] = useState<{ group: string | undefined, index: number } | null>(null);

    // Add Domain state
    const [isAddingDomain, setIsAddingDomain] = useState(false);
    const [domainName, setDomainName] = useState('');
    const domainInputRef = useRef<HTMLInputElement>(null);

    // Widget Hierarchy State — collapsed by default for clean initial view
    const expandedGroups = useSyncExternalStore(
        sidebarGroupsStore.subscribe,
        sidebarGroupsStore.getSnapshot,
        sidebarGroupsStore.getServerSnapshot,
    );
    const setExpandedGroups = useCallback((value: Set<string> | ((prev: Set<string>) => Set<string>)) => {
        const next = typeof value === 'function' ? value(sidebarGroupsStore.getSnapshot()) : value;
        sidebarGroupsStore.set(next, () => localStorage.setItem(SIDEBAR_GROUPS_KEY, JSON.stringify(Array.from(next))));
    }, []);
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Keyboard shortcuts (local widget filter only; global Cmd/Ctrl+K is handled by Command Palette)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                const active = document.activeElement;
                if (active !== searchInputRef.current) return;
                setSearchQuery('');
                searchInputRef.current?.blur();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const toggleGroup = useCallback((groupName: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupName)) next.delete(groupName);
            else next.add(groupName);
            return next;
        });
    }, []);

    // Split ratio (0..1, fraction of space for top panel)
    const splitRatio = useSyncExternalStore(
        sidebarSplitStore.subscribe,
        sidebarSplitStore.getSnapshot,
        sidebarSplitStore.getServerSnapshot,
    );
    const setSplitRatio = useCallback((value: number | ((prev: number) => number)) => {
        const next = typeof value === 'function' ? value(sidebarSplitStore.getSnapshot()) : value;
        sidebarSplitStore.set(next, () => localStorage.setItem(SPLIT_STORAGE_KEY, String(next)));
    }, []);

    useEffect(() => {
        if (isAddingDomain && domainInputRef.current) domainInputRef.current.focus();
    }, [isAddingDomain]);

    const confirmAddDomain = () => {
        const name = domainName.trim();
        if (name) addItem(null, name, 'domain');
        setDomainName('');
        setIsAddingDomain(false);
    };

    // --- Dynamic width ---
    const width = useSyncExternalStore(
        sidebarWidthStore.subscribe,
        sidebarWidthStore.getSnapshot,
        sidebarWidthStore.getServerSnapshot,
    );
    const setWidth = useCallback((value: number | ((prev: number) => number)) => {
        const next = typeof value === 'function' ? value(sidebarWidthStore.getSnapshot()) : value;
        sidebarWidthStore.set(next, () => localStorage.setItem(STORAGE_KEY, String(next)));
    }, []);

    const onResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = width;

        const onMove = (ev: MouseEvent) => {
            const newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + (ev.clientX - startX)));
            setWidth(newW);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [width]);

    // --- Horizontal divider drag (split resize) ---
    const onSplitResizeStart = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startY = e.clientY;
        const startRatio = splitRatio;
        const container = splitContainerRef.current;
        if (!container) return;
        const containerHeight = container.getBoundingClientRect().height;

        const onMove = (ev: MouseEvent) => {
            const deltaY = ev.clientY - startY;
            const deltaRatio = deltaY / containerHeight;
            const newRatio = Math.max(0.15, Math.min(0.85, startRatio + deltaRatio));
            setSplitRatio(newRatio);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = 'row-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [splitRatio]);

    // --- Widget launcher (click-to-toggle per Ilya 2026-05-28) ---
    // Click an unopened widget → opens it.
    // Click an already-open widget → closes it.
    // Click a minimized widget → restores it (treats minimized as "open but hidden").
    const handleWidgetClick = useCallback((component: string, label: string, icon: string) => {
        const existing = windows.find(w => w.component === component);
        if (!existing) {
            openWindow(component, label, icon);
        } else if (existing.minimized) {
            restoreWindow(existing.id);
        } else {
            closeWindow(existing.id);
        }
    }, [windows, openWindow, restoreWindow, closeWindow]);

    // --- Widget drag-to-reorder ---
    const onWidgetDragStart = useCallback((e: DragEvent, id: string, group: string | undefined, index: number) => {
        setDragItem({ id, group, index });
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    }, []);

    const onWidgetDragOver = useCallback((e: DragEvent, group: string | undefined, index: number) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverInfo({ group, index });
    }, []);

    const onWidgetDrop = useCallback((e: DragEvent, toGroup: string | undefined, toIndex: number) => {
        e.preventDefault();
        if (dragItem && (dragItem.group !== toGroup || dragItem.index !== toIndex)) {
            moveDockItem(dragItem.id, toGroup, toIndex);
        }
        setDragItem(null);
        setDragOverInfo(null);
    }, [dragItem, moveDockItem]);

    const onWidgetDragEnd = useCallback(() => {
        setDragItem(null);
        setDragOverInfo(null);
    }, []);

    // Determine collapsed mode (small width or icon-only)
    const collapsed = iconOnly; // Text only hides in icon-only mode (« button), never from width resize


    /* ── Personalized greeting + weather ──────────────── */
    const GREETING_MESSAGES: Record<string, string> = {
        'Andy': "Let's build the future",
        'Lisa': "Command the empire",
        'Wendy': "Leading the way forward",
        'Candace': "Excellence in motion",
        'Grieve': "Wise counsel, sharp moves",
        'Baldwin': "Strategy meets precision",
        'Leo': "Vision without limits",
        'Lee': "Keeping it all running",
        'Jose': "Hands that build greatness",
        'Marcus Johnson': "Welcome home",
    };

    const getTimeGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const [temperature, setTemperature] = useState<string | null>(null);
    const [weatherIcon, setWeatherIcon] = useState<LucideIcon | null>(null);

    useEffect(() => {
        // Use browser geolocation for accurate weather, fallback to Atlanta, GA (ZP Group HQ area)
        const fetchWeather = async (lat: number, lon: number) => {
            try {
                const res = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&temperature_unit=fahrenheit&timezone=auto`
                );
                const data = await res.json();
                if (data?.current?.temperature_2m != null) {
                    const temp = Math.round(data.current.temperature_2m);
                    const code = data.current.weather_code ?? 0;
                    // Weather icon (Lucide) from WMO code
                    const icon: LucideIcon = code === 0 ? Sun
                        : code <= 3 ? CloudSun
                        : code <= 48 ? CloudFog
                        : code <= 67 ? CloudRain
                        : code <= 77 ? CloudSnow
                        : code <= 82 ? CloudRain
                        : code <= 86 ? CloudSnow
                        : Zap;
                    setWeatherIcon(() => icon);
                    setTemperature(`${temp}°F`);
                }
            } catch {
                setTemperature(null);
                setWeatherIcon(null);
            }
        };

        // Try browser geolocation first
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
                () => fetchWeather(33.749, -84.388), // Fallback: Atlanta, GA
                { timeout: 5000 }
            );
        } else {
            fetchWeather(33.749, -84.388); // Fallback: Atlanta, GA
        }

        const interval = setInterval(() => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
                    () => fetchWeather(33.749, -84.388),
                    { timeout: 5000 }
                );
            } else {
                fetchWeather(33.749, -84.388);
            }
        }, 600_000); // refresh every 10min
        return () => clearInterval(interval);
    }, []);

    const userName = user?.name || 'there';
    const personalMessage = GREETING_MESSAGES[userName] || "Let's get things done";
    const timeGreeting = getTimeGreeting();

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${iconOnly ? 'sidebar--icon-only' : ''}`} ref={sidebarRef} style={{ width: iconOnly ? 48 : width }} role="navigation" aria-label="Main navigation">
            {/* Header with Logo + Sign Out */}
            <div className="sidebar__header">
                <div className="sidebar__logo">
                    <span className="sidebar__logo-icon">◆</span>
                    {!iconOnly && !collapsed && <span className="sidebar__logo-text">DWELLIUM</span>}
                </div>
                {!iconOnly && (
                    <button
                        className="sidebar__signout-btn"
                        onClick={logout}
                        title="Sign out"
                    >
                        {collapsed ? '⏻' : 'Sign Out'}
                    </button>
                )}
                <button
                    className="sidebar__collapse-toggle"
                    onClick={() => setIconOnly(!iconOnly)}
                    title={iconOnly ? 'Expand sidebar' : 'Collapse to icons'}
                >
                    {iconOnly ? '»' : '«'}
                </button>
            </div>

            {/* Spaces (Way 2) — one click swaps the whole canvas */}
            <SpacesSwitcher compact={iconOnly} />

            {/* Personalized greeting + temperature */}
            {!iconOnly && !collapsed && user && (
                <div className="sidebar__greeting">
                    <div className="sidebar__greeting-top">
                        <span className="sidebar__greeting-hello">{timeGreeting}, <strong>{userName}</strong></span>
                        {temperature && (
                            <span className="sidebar__greeting-temp">
                                {weatherIcon && (() => { const WIcon = weatherIcon; return <WIcon size={13} aria-hidden style={{ verticalAlign: 'middle', marginRight: 3 }} />; })()}
                                {temperature}
                            </span>
                        )}
                    </div>
                    <div className="sidebar__greeting-msg">{personalMessage}</div>
                </div>
            )}

            {/* Breadcrumb */}
            {!iconOnly && !collapsed && breadcrumb.length > 0 && (
                <div className="sidebar__breadcrumb">
                    {breadcrumb.map((item, i) => (
                        <span key={item.id}>
                            {i > 0 && <span className="sidebar__breadcrumb-sep"> / </span>}
                            <span className="sidebar__breadcrumb-item">{item.name}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* ===== ICON-ONLY MODE ===== */}
            {iconOnly ? (
                <div className="sidebar__icon-rail">
                    {dockItems.filter(item => can(`widget:${item.component}`)).map(item => {
                        const isOpen = windows.some(w => w.component === item.component);
                        return (
                            <button
                                key={item.id}
                                className={`sidebar__icon-rail-btn ${isOpen ? 'sidebar__icon-rail-btn--open' : ''}`}
                                onClick={() => handleWidgetClick(item.component, item.label, item.icon)}
                                title={item.label}
                            >
                                <span className="sidebar__icon-rail-icon"><SidebarIcon iconKey={item.icon} size={18} /></span>
                                {isOpen && <span className="sidebar__icon-rail-dot" />}
                            </button>
                        );
                    })}
                </div>
            ) : (
                /* ===== SPLIT CONTAINER ===== */
                <div className="sidebar__split-container" ref={splitContainerRef}>
                    {/* ---- TOP PANEL: Hierarchy Tree ---- */}
                    <div className="sidebar__split-top" style={domainsCollapsed ? { flex: '0 0 auto' } : { flex: `0 0 ${splitRatio * 100}%` }}>
                        {can('section:domains') ? (
                            <>
                                <div className="sidebar__split-top-header">
                                    <button
                                        className="sidebar__domain-toggle-btn"
                                        onClick={() => setDomainsCollapsed(!domainsCollapsed)}
                                        title={domainsCollapsed ? 'Expand Domains' : 'Collapse Domains'}
                                        style={{ marginRight: '4px' }}
                                    >{domainsCollapsed ? '+' : '−'}</button>
                                    <span className="sidebar__panel-title">Domains</span>
                                    {/* 2026-05-26: gear button ALWAYS visible to the right of the Domains header; expand/collapse-all buttons remain conditional on domains being open + non-empty. */}
                                    <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
                                        {!domainsCollapsed && hierarchy.length > 0 && (
                                            <>
                                                <button
                                                    className="sidebar__domain-toggle-btn"
                                                    onClick={expandAllDomains}
                                                    title="Expand All Nodes"
                                                >⊞</button>
                                                <button
                                                    className="sidebar__domain-toggle-btn"
                                                    onClick={collapseAllDomains}
                                                    title="Collapse All Nodes"
                                                >⊟</button>
                                            </>
                                        )}
                                        <button
                                            className={`sidebar__domain-toggle-btn ${gridLocked ? 'sidebar__domain-toggle-btn--active' : ''}`}
                                            onClick={toggleGridLock}
                                            title={gridLocked ? 'Unlock grid — allow moving & resizing widgets' : 'Lock grid in place'}
                                            aria-pressed={gridLocked}
                                            aria-label={gridLocked ? 'Unlock grid' : 'Lock grid in place'}
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >{gridLocked ? <Lock size={12} /> : <Unlock size={12} />}</button>
                                        <button
                                            className="sidebar__domain-toggle-btn"
                                            onClick={() => handleWidgetClick('control-panel', 'Settings', 'settings')}
                                            title="Settings"
                                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        ><SidebarIcon iconKey="settings" size={12} /></button>
                                    </div>
                                </div>
                                {!domainsCollapsed && (
                                    <div className="sidebar__tree">
                                        {hierarchy.length === 0 && !isAddingDomain && (
                                            <div className="sidebar__empty">
                                                <span className="sidebar__empty-icon"><FolderOpen size={14} /></span>
                                                <p>No domains yet</p>
                                                <button
                                                    className="sidebar__add-domain-btn"
                                                    onClick={() => setIsAddingDomain(true)}
                                                >
                                                    + Add your first domain
                                                </button>
                                            </div>
                                        )}

                                        {hierarchy.map(item => (
                                            <TreeNode key={item.id} item={item} />
                                        ))}

                                        {isAddingDomain && (
                                            <div className="sidebar__add-domain-row">
                                                <span className="sidebar__add-domain-icon"><FolderOpen size={14} /></span>
                                                <input
                                                    ref={domainInputRef}
                                                    className="tree-node__inline-input"
                                                    placeholder="Domain name…"
                                                    value={domainName}
                                                    onChange={e => setDomainName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') confirmAddDomain();
                                                        if (e.key === 'Escape') { setDomainName(''); setIsAddingDomain(false); }
                                                    }}
                                                    onBlur={confirmAddDomain}
                                                />
                                            </div>
                                        )}

                                        {hierarchy.length > 0 && !isAddingDomain && (
                                            <button
                                                className="sidebar__add-domain-trigger"
                                                onClick={() => setIsAddingDomain(true)}
                                            >
                                                + Add Domain
                                            </button>
                                        )}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="sidebar__empty">
                                <span className="sidebar__empty-icon"><Lock size={14} /></span>
                                <p>Domains restricted</p>
                            </div>
                        )}
                    </div>

                    {/* ---- DRAGGABLE DIVIDER ---- */}
                    <div className="sidebar__split-divider" onMouseDown={onSplitResizeStart}>
                        <div className="sidebar__split-divider-handle" />
                    </div>

                    {/* ---- BOTTOM PANEL: Widgets ---- */}
                    <div className="sidebar__split-bottom">
                        <div className="sidebar__split-bottom-header">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span className="sidebar__panel-title">Widgets</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button onClick={() => setExpandedGroups(new Set(['Property Management', 'AI Tools', 'Filing Cabinet']))} title="Expand All" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '10px' }}>▼</button>
                                    <button onClick={() => setExpandedGroups(new Set())} title="Collapse All" style={{ background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '10px' }}>▶</button>
                                </div>
                            </div>
                            <div className="sidebar__search-container" style={{ position: 'relative' }}>
                                <input
                                    ref={searchInputRef}
                                    type="text"
                                    placeholder="AI filter widgets..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%', padding: '6px 24px 6px 8px', borderRadius: '4px', outline: 'none',
                                        border: '1px solid var(--border-subtle)', background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)', fontSize: '12px'
                                    }}
                                />
                                {searchQuery && (
                                    <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px' }}><X size={16} /></button>
                                )}
                            </div>
                        </div>
                        <div className="sidebar__widget-list">
                            {(() => {
                                const query = searchQuery.trim();
                                const searchActive = query.length > 0;
                                // 2026-05-26: exclude control-panel — Settings is now opened from the gear button next to the Domains header, not from the widgets list.
                                const permittedItems = dockItems.filter(item => can(`widget:${item.component}`) && item.component !== 'control-panel' && !hiddenSet.has(item.component));
                                const searchMatches = searchActive
                                    ? rankWidgetSearchResults(permittedItems, query, new Set(windows.map(w => w.component)))
                                    : [];
                                const matchById = new Map(searchMatches.map(match => [match.item.id, match]));
                                const availableItems = searchActive ? searchMatches.map(m => m.item) : permittedItems;

                                const WIDGET_GROUPS = [
                                    { name: 'Property Management', icon: 'building' },
                                    { name: 'AI Tools', icon: 'brain-circuit' },
                                    { name: 'Filing Cabinet', icon: 'archive' }
                                ];

                                // Group the items
                                const groupedMap = new Map<string, typeof availableItems>();
                                const ungroupedItems: typeof availableItems = [];

                                availableItems.forEach(item => {
                                    if (item.group) {
                                        if (!groupedMap.has(item.group)) groupedMap.set(item.group, []);
                                        groupedMap.get(item.group)!.push(item);
                                    } else {
                                        ungroupedItems.push(item);
                                    }
                                });

                                const renderWidget = (
                                    item: typeof availableItems[0],
                                    index: number,
                                    isChild = false,
                                    match?: WidgetSearchMatch
                                ) => {
                                    const isOpen = windows.some(w => w.component === item.component);
                                    const isMinimized = windows.some(w => w.component === item.component && w.minimized);
                                    const isDragging = dragItem?.id === item.id;
                                    const isDragOver = dragOverInfo?.group === item.group && dragOverInfo?.index === index && !isDragging;

                                    return (
                                        <button
                                            key={item.id}
                                            className={`sidebar-widget ${isOpen ? 'sidebar-widget--open' : ''} ${isMinimized ? 'sidebar-widget--minimized' : ''} ${isChild ? 'sidebar-widget--child' : ''} ${isDragging ? 'sidebar-widget--dragging' : ''} ${isDragOver ? 'sidebar-widget--dragover' : ''}`}
                                            onClick={() => handleWidgetClick(item.component, item.label, item.icon)}
                                            onAuxClick={e => {
                                                if (e.button === 1 && isOpen) {
                                                    e.preventDefault();
                                                    const w = windows.find(win => win.component === item.component);
                                                    if (w) closeWindow(w.id);
                                                }
                                            }}
                                            title={`${item.label} (Middle-click to close)`}
                                            draggable={!searchActive}
                                            onDragStart={e => {
                                                if (searchActive) return;
                                                onWidgetDragStart(e, item.id, item.group, index);
                                            }}
                                            onDragOver={e => {
                                                if (searchActive) return;
                                                onWidgetDragOver(e, item.group, index);
                                            }}
                                            onDrop={e => {
                                                if (searchActive) return;
                                                onWidgetDrop(e, item.group, index);
                                            }}
                                            onDragEnd={searchActive ? undefined : onWidgetDragEnd}
                                        >
                                            {!searchActive && <span className="sidebar-widget__drag-handle">≡</span>}
                                            <span className="sidebar-widget__icon"><SidebarIcon iconKey={item.icon} size={16} /></span>
                                            {!collapsed && (
                                                <div className="sidebar-widget__content">
                                                    <span className="sidebar-widget__label">{item.label}</span>
                                                    {match && (
                                                        <span className="sidebar-widget__search-reason">
                                                            {match.reason}
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {!collapsed && match && (
                                                <span className="sidebar-widget__search-score" title="AI search relevance score">
                                                    {Math.round(match.score)}
                                                </span>
                                            )}
                                            {isOpen && <span className="sidebar-widget__dot" />}
                                            {!collapsed && !searchActive && (
                                                <span
                                                    role="button"
                                                    aria-label={`Remove ${item.label} from sidebar`}
                                                    title="Remove from sidebar (closes it)"
                                                    className="sidebar-widget__remove"
                                                    onClick={e => { e.stopPropagation(); removeWidget(item.component); }}
                                                >
                                                    ×
                                                </span>
                                            )}
                                        </button>
                                    );
                                };

                                if (searchActive) {
                                    return (
                                        <>
                                            {searchMatches.map((match, index) => renderWidget(match.item, index, false, match))}
                                            {searchMatches.length === 0 && (
                                                <div className="sidebar__empty-search">
                                                    <div className="sidebar__empty-search-icon"></div>
                                                    No widgets found for "{searchQuery}"
                                                </div>
                                            )}
                                        </>
                                    );
                                }

                                // ── One Front Door (Way 1, decided 2026-06-11): 5 pinned
                                // primary-nav widgets above the groups. Daily-driver set per
                                // Ilya; everything else stays reachable via ⌘K + groups below.
                                const PINNED: Array<{ component: string; label: string; icon: string }> = [
                                    { component: 'ara-console', label: 'ARA', icon: 'brain-circuit' },
                                    { component: 'strata-dashboard', label: 'Strata', icon: 'building-2' },
                                    { component: 'scribe', label: 'Scribe', icon: 'pen-tool' },
                                    { component: 'inbox', label: 'Inbox Zero', icon: 'mail-open' },
                                    { component: 'task-board', label: 'Task Board', icon: 'layout-grid' },
                                ];
                                const pinnedItems = PINNED.filter(p => can(`widget:${p.component}`));

                                return (
                                    <>
                                        <div className="sidebar__widget-group sidebar__pinned">
                                            {!collapsed && <div className="sidebar__widget-group-label sidebar__pinned-label">Pinned</div>}
                                            {pinnedItems.map(p => {
                                                const isOpen = windows.some(w => w.component === p.component);
                                                const isMinimized = windows.some(w => w.component === p.component && w.minimized);
                                                return (
                                                    <button
                                                        key={`pin-${p.component}`}
                                                        className={`sidebar-widget sidebar-widget--pinned ${isOpen ? 'sidebar-widget--open' : ''} ${isMinimized ? 'sidebar-widget--minimized' : ''}`}
                                                        onClick={() => handleWidgetClick(p.component, p.label, p.icon)}
                                                        title={p.label}
                                                    >
                                                        <span className="sidebar-widget__icon"><SidebarIcon iconKey={p.icon} size={18} /></span>
                                                        {!collapsed && <span className="sidebar-widget__label">{p.label}</span>}
                                                        {isOpen && <span className="sidebar-widget__dot" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {WIDGET_GROUPS.map(group => {
                                            const items = groupedMap.get(group.name) || [];
                                            const isExpanded = expandedGroups.has(group.name);
                                            return (
                                                <div
                                                    key={group.name}
                                                    className="sidebar__widget-group"
                                                    onDragOver={e => {
                                                        if (items.length === 0) onWidgetDragOver(e, group.name, 0);
                                                    }}
                                                    onDrop={e => {
                                                        if (items.length === 0) onWidgetDrop(e, group.name, 0);
                                                    }}
                                                >
                                                    <button
                                                        className="sidebar__widget-group-header"
                                                        onClick={() => toggleGroup(group.name)}
                                                        title={group.name}
                                                    >
                                                        <span className="sidebar__widget-group-toggle">{isExpanded ? '−' : '+'}</span>
                                                        {!collapsed && <span className="sidebar__widget-group-icon"><SidebarIcon iconKey={group.icon} size={14} /></span>}
                                                        {!collapsed && <span className="sidebar__widget-group-label">{group.name}</span>}
                                                    </button>
                                                    {(!collapsed && isExpanded) && items.length > 0 && (
                                                        <div className="sidebar__widget-group-children">
                                                            {items.map((item, index) => renderWidget(item, index, true))}
                                                        </div>
                                                    )}
                                                    {(!collapsed && isExpanded) && items.length === 0 && (
                                                        <div className="sidebar__widget-group-children" style={{ padding: '8px 12px', color: 'var(--text-tertiary)', fontSize: '11px', fontStyle: 'italic' }}>
                                                            Empty group. Drop widgets here.
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {ungroupedItems.length > 0 && Array.from(groupedMap.keys()).length > 0 && !collapsed && (
                                            <div className="sidebar__widget-divider" />
                                        )}

                                        {ungroupedItems.map((item, index) => renderWidget(item, index, false, matchById.get(item.id)))}

                                        {availableItems.length === 0 && searchQuery && (
                                            <div className="sidebar__empty-search">
                                                <div className="sidebar__empty-search-icon"><Search size={20} aria-hidden /></div>
                                                No widgets found for "{searchQuery}"
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
                            {!searchQuery && (
                                <button
                                    className="sidebar__add-widget"
                                    onClick={() => setGalleryOpen(true)}
                                    title="Add or remove widgets"
                                >
                                    <span className="sidebar__add-widget-plus">+</span>
                                    {!collapsed && <span>Add widget{hidden.length > 0 ? ` · ${hidden.length} hidden` : ''}</span>}
                                </button>
                            )}
                        </div>

                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="sidebar__footer">
                <span className="sidebar__status-dot" />
                {!iconOnly && !collapsed && <span className="sidebar__status-text">System Online</span>}
                {!iconOnly && (
                    <button
                        className={`sidebar__options-btn ${showOptions ? 'sidebar__options-btn--active' : ''}`}
                        onClick={() => { setShowOptions(!showOptions); setShowSavePopover(false); setShowLoadDropdown(false); }}
                        title="Options"
                    >
                        {collapsed ? <Settings size={14} /> : 'Options'}
                    </button>
                )}

                {/* Options Popup */}
                {showOptions && (
                    <div className="sidebar__options-popup">
                        <button
                            className="sidebar__options-item sidebar__options-item--danger"
                            onClick={() => { windows.forEach(w => closeWindow(w.id)); setShowOptions(false); }}
                        >
                            <X size={14} aria-hidden /> Close All
                        </button>

                        {canSaveLayout && (
                            <>
                                <button
                                    className={`sidebar__options-item ${saveFlash ? 'sidebar__options-item--flash' : ''}`}
                                    onClick={() => {
                                        saveLayout();
                                        setSaveFlash(true);
                                        setTimeout(() => setSaveFlash(false), 1200);
                                    }}
                                >
                                    Quick Save
                                </button>
                                <button
                                    className="sidebar__options-item"
                                    onClick={() => {
                                        setShowSavePopover(!showSavePopover);
                                        setShowLoadDropdown(false);
                                    }}
                                >
                                    + Save As...
                                </button>
                                <button
                                    className="sidebar__options-item"
                                    onClick={() => {
                                        setShowLoadDropdown(!showLoadDropdown);
                                        setShowSavePopover(false);
                                    }}
                                >
                                    <FolderOpen size={14} aria-hidden /> Load Layout
                                </button>
                            </>
                        )}

                        {/* Save Popover */}
                        {showSavePopover && (
                            <div className="sidebar__options-sub">
                                <input
                                    type="text"
                                    value={saveName}
                                    onChange={e => setSaveName(e.target.value)}
                                    placeholder="Layout name..."
                                    className="sidebar__popover-input"
                                    autoFocus
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && saveName.trim()) {
                                            saveNamedLayout(saveName.trim());
                                            setSaveName('');
                                            setShowSavePopover(false);
                                        }
                                        if (e.key === 'Escape') setShowSavePopover(false);
                                    }}
                                />
                                <button
                                    className="sidebar__popover-submit"
                                    aria-label="Save layout"
                                    onClick={() => {
                                        if (saveName.trim()) {
                                            saveNamedLayout(saveName.trim());
                                            setSaveName('');
                                            setShowSavePopover(false);
                                        }
                                    }}
                                >
                                    <Check size={14} aria-hidden />
                                </button>
                            </div>
                        )}

                        {/* Load Dropdown */}
                        {showLoadDropdown && (
                            <div className="sidebar__options-sub">
                                <div className="sidebar__popover-header">Saved Layouts ({savedLayouts.length}/10)</div>
                                {savedLayouts.length === 0 ? (
                                    <div className="sidebar__popover-empty">No saved layouts.</div>
                                ) : (
                                    savedLayouts.map(l => (
                                        <div key={l.id} className="sidebar__popover-item">
                                            <button
                                                className="sidebar__popover-item-name"
                                                onClick={() => {
                                                    loadNamedLayout(l.id);
                                                    setShowLoadDropdown(false);
                                                    setShowOptions(false);
                                                }}
                                            >
                                                {l.name}
                                            </button>
                                            <button
                                                className="sidebar__popover-item-delete"
                                                onClick={() => deleteNamedLayout(l.id)}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Resize Handle (horizontal width) — hidden in icon-only mode */}
            {!iconOnly && <div className="sidebar__resize-handle" onMouseDown={onResizeStart} />}

            {/* Add / remove widgets gallery */}
            {galleryOpen && (
                <div className="widget-gallery-overlay" onClick={() => setGalleryOpen(false)}>
                    <div className="widget-gallery" onClick={e => e.stopPropagation()}>
                        <div className="widget-gallery__head">
                            <span className="widget-gallery__title">Widgets</span>
                            <button className="widget-gallery__close" onClick={() => setGalleryOpen(false)} aria-label="Close">×</button>
                        </div>
                        <div className="widget-gallery__sub">Add widgets to your sidebar, or remove ones you don’t use. Hidden widgets are dimmed.</div>
                        <div className="widget-gallery__grid">
                            {dockItems
                                .filter(it => can(`widget:${it.component}`) && it.component !== 'control-panel')
                                .map(it => {
                                    const isHidden = hiddenSet.has(it.component);
                                    return (
                                        <div key={it.id} className={`widget-gallery__card ${isHidden ? 'widget-gallery__card--hidden' : ''}`}>
                                            <span className="widget-gallery__icon"><SidebarIcon iconKey={it.icon} size={20} /></span>
                                            <span className="widget-gallery__label" title={it.label}>{it.label}</span>
                                            {isHidden ? (
                                                <button
                                                    className="widget-gallery__btn widget-gallery__btn--add"
                                                    onClick={() => { unhideWidget(it.component); openWindow(it.component, it.label, it.icon); }}
                                                >+ Add</button>
                                            ) : (
                                                <button
                                                    className="widget-gallery__btn"
                                                    onClick={() => removeWidget(it.component)}
                                                >Remove</button>
                                            )}
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}
