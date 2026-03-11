import { useRef, useCallback, useState, useEffect, useMemo, DragEvent } from 'react';
import { useHierarchy } from '../../context/HierarchyContext';
import { useWindows } from '../../context/WindowContext';
import { useUser } from '../../context/UserContext';
import { usePermissions } from '../../context/PermissionsContext';
import { HierarchyItem } from '../../data/types';
import { rankWidgetSearchResults, WidgetSearchMatch } from './widgetSearch';
import './Sidebar.css';

const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const STORAGE_KEY = 'dwellium-sidebar-width';
const SPLIT_STORAGE_KEY = 'dwellium-sidebar-split';

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

    const canSaveLayout = hasMinRole('corporate');

    // Layout UI State
    const [saveFlash, setSaveFlash] = useState(false);
    const [showSavePopover, setShowSavePopover] = useState(false);
    const [saveName, setSaveName] = useState('');
    const [showLoadDropdown, setShowLoadDropdown] = useState(false);
    const [domainsCollapsed, setDomainsCollapsed] = useState(false);
    const [showOptions, setShowOptions] = useState(false);

    // Icon-only collapsed mode
    const [iconOnly, setIconOnly] = useState(() => {
        try {
            return localStorage.getItem('qualia_sidebar_icon_only') === 'true';
        } catch { return false; }
    });
    useEffect(() => {
        localStorage.setItem('qualia_sidebar_icon_only', String(iconOnly));
    }, [iconOnly]);
    const breadcrumb = getBreadcrumb();
    const sidebarRef = useRef<HTMLElement>(null);
    const splitContainerRef = useRef<HTMLDivElement>(null);
    const [dragItem, setDragItem] = useState<{ id: string, group: string | undefined, index: number } | null>(null);
    const [dragOverInfo, setDragOverInfo] = useState<{ group: string | undefined, index: number } | null>(null);

    // Add Domain state
    const [isAddingDomain, setIsAddingDomain] = useState(false);
    const [domainName, setDomainName] = useState('');
    const domainInputRef = useRef<HTMLInputElement>(null);

    // Widget Hierarchy State
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
        try {
            const saved = localStorage.getItem('qualia_sidebar_groups');
            if (saved) return new Set(JSON.parse(saved));
        } catch (e) { }
        return new Set(['Property Management', 'AI Tools', 'Filing Cabinet']);
    });
    const [searchQuery, setSearchQuery] = useState('');
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        localStorage.setItem('qualia_sidebar_groups', JSON.stringify(Array.from(expandedGroups)));
    }, [expandedGroups]);

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
    const [splitRatio, setSplitRatio] = useState(() => {
        const saved = localStorage.getItem(SPLIT_STORAGE_KEY);
        return saved ? Math.max(0.2, Math.min(0.8, parseFloat(saved))) : 0.5;
    });

    useEffect(() => {
        localStorage.setItem(SPLIT_STORAGE_KEY, String(splitRatio));
    }, [splitRatio]);

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
    const [width, setWidth] = useState(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        return saved ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parseInt(saved))) : 240;
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, String(width));
    }, [width]);

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

    // --- Widget launcher ---
    const handleWidgetClick = useCallback((component: string, label: string, icon: string) => {
        const existing = windows.find(w => w.component === component);
        if (existing && existing.minimized) {
            restoreWindow(existing.id);
        } else {
            openWindow(component, label, icon);
        }
    }, [windows, openWindow, restoreWindow]);

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
    const collapsed = iconOnly || width < 200;

    /* ── Personalized greeting + weather ──────────────── */
    const GREETING_MESSAGES: Record<string, string> = {
        'Andy': "Let's build the future 🚀",
        'Lisa': "Command the empire 👑",
        'Wendy': "Leading the way forward 🌟",
        'Candace': "Excellence in motion ✨",
        'Grieve': "Wise counsel, sharp moves 🎯",
        'Baldwin': "Strategy meets precision 🧠",
        'Leo': "Vision without limits 🔭",
        'Lee': "Keeping it all running 🔧",
        'Jose': "Hands that build greatness 🛠️",
        'Marcus Johnson': "Welcome home 🏠",
    };

    const getTimeGreeting = () => {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        return 'Good evening';
    };

    const [temperature, setTemperature] = useState<string | null>(null);

    useEffect(() => {
        // Open-Meteo free API — no key needed. Using Denver, CO coords as default.
        const fetchWeather = async () => {
            try {
                const res = await fetch(
                    'https://api.open-meteo.com/v1/forecast?latitude=39.74&longitude=-104.98&current=temperature_2m&temperature_unit=fahrenheit&timezone=America/Denver'
                );
                const data = await res.json();
                if (data?.current?.temperature_2m != null) {
                    setTemperature(`${Math.round(data.current.temperature_2m)}°F`);
                }
            } catch {
                setTemperature(null);
            }
        };
        fetchWeather();
        const interval = setInterval(fetchWeather, 600_000); // refresh every 10min
        return () => clearInterval(interval);
    }, []);

    const userName = user?.name || 'there';
    const personalMessage = GREETING_MESSAGES[userName] || "Let's get things done 💪";
    const timeGreeting = getTimeGreeting();

    return (
        <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''} ${iconOnly ? 'sidebar--icon-only' : ''}`} ref={sidebarRef} style={{ width: iconOnly ? 48 : width }}>
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
                        {collapsed ? '⏻' : '⏻ Sign Out'}
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

            {/* Personalized greeting + temperature */}
            {!iconOnly && !collapsed && user && (
                <div className="sidebar__greeting">
                    <div className="sidebar__greeting-top">
                        <span className="sidebar__greeting-hello">{timeGreeting}, <strong>{userName}</strong></span>
                        {temperature && (
                            <span className="sidebar__greeting-temp">
                                🌡️ {temperature}
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
                                <span className="sidebar__icon-rail-icon">{item.icon}</span>
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
                                    <span className="sidebar__panel-title">📂 Domains</span>
                                    {!domainsCollapsed && hierarchy.length > 0 && (
                                        <div style={{ display: 'flex', gap: '2px', marginLeft: 'auto' }}>
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
                                        </div>
                                    )}
                                </div>
                                {!domainsCollapsed && (
                                    <div className="sidebar__tree">
                                        {hierarchy.length === 0 && !isAddingDomain && (
                                            <div className="sidebar__empty">
                                                <span className="sidebar__empty-icon">📂</span>
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
                                                <span className="sidebar__add-domain-icon">📂</span>
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
                                <span className="sidebar__empty-icon">🔒</span>
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
                                <span className="sidebar__panel-title">⊞ Widgets</span>
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
                                    <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                                )}
                            </div>
                        </div>
                        <div className="sidebar__widget-list">
                            {(() => {
                                const query = searchQuery.trim();
                                const searchActive = query.length > 0;
                                const permittedItems = dockItems.filter(item => can(`widget:${item.component}`));
                                const searchMatches = searchActive
                                    ? rankWidgetSearchResults(permittedItems, query, new Set(windows.map(w => w.component)))
                                    : [];
                                const matchById = new Map(searchMatches.map(match => [match.item.id, match]));
                                const availableItems = searchActive ? searchMatches.map(m => m.item) : permittedItems;

                                const WIDGET_GROUPS = [
                                    { name: 'Property Management', icon: '🏢' },
                                    { name: 'AI Tools', icon: '🤖' },
                                    { name: 'Filing Cabinet', icon: '🗄️' }
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
                                            <span className="sidebar-widget__icon">{item.icon}</span>
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
                                        </button>
                                    );
                                };

                                if (searchActive) {
                                    return (
                                        <>
                                            {searchMatches.map((match, index) => renderWidget(match.item, index, false, match))}
                                            {searchMatches.length === 0 && (
                                                <div className="sidebar__empty-search">
                                                    <div className="sidebar__empty-search-icon">🧠</div>
                                                    No widgets found for "{searchQuery}"
                                                </div>
                                            )}
                                        </>
                                    );
                                }

                                return (
                                    <>
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
                                                        {!collapsed && <span className="sidebar__widget-group-icon">{group.icon}</span>}
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
                                                <div className="sidebar__empty-search-icon">🔍</div>
                                                No widgets found for "{searchQuery}"
                                            </div>
                                        )}
                                    </>
                                );
                            })()}
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
                        {collapsed ? '⚙' : '⚙ Options'}
                    </button>
                )}

                {/* Options Popup */}
                {showOptions && (
                    <div className="sidebar__options-popup">
                        <button
                            className="sidebar__options-item sidebar__options-item--danger"
                            onClick={() => { windows.forEach(w => closeWindow(w.id)); setShowOptions(false); }}
                        >
                            ✕ Close All
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
                                    💾 Quick Save
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
                                    📂 Load Layout
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
                                    onClick={() => {
                                        if (saveName.trim()) {
                                            saveNamedLayout(saveName.trim());
                                            setSaveName('');
                                            setShowSavePopover(false);
                                        }
                                    }}
                                >
                                    ✓
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
        </aside>
    );
}
