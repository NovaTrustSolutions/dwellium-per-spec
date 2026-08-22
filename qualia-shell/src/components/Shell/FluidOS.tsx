/**
 * FluidOS — the "Cockpit" alternate interface layout for Dwellium (2026-08-20).
 *
 * REDESIGN (plan 049): the physics-driven "swap stream" launcher (2026-07-04)
 * is REPLACED by a fixed, calm, IDE-like four-pane cockpit modeled on the
 * Claude Code desktop app layout: left nav (260px, resizable) · center chat
 * (the real ARA Console) · work column (Terminal + Background tasks) · right
 * preview (URL → iframe, collapsible). No floating windows, no springs, no
 * canvas — a static CSS grid built on the app's existing design tokens, so
 * `prefers-reduced-motion` needs no special casing.
 *
 * Entry/exit contract is unchanged from the swap-stream era: `fluidOsStore`
 * is the layout toggle, the FluidLauncher droplet reopens the shell, and
 * Escape / the Home pill collapse back to the classic desktop.
 *
 * 2026-08-22 follow-ups (Ilya): nav rows used to `openWindow` + collapse the
 * cockpit — every click threw you back to the classic desktop. Widgets now
 * open as TABS in the center pane (ARA is the permanent first tab); desktop
 * windows opened while the cockpit is up (e.g. from ⌘K) are adopted as tabs
 * too, and "Open on desktop ↗" is the explicit way out. Sites whose CSP
 * `frame-ancestors` forbids embedding (AppFolio, Google, …) get an honest
 * "can't embed → Open ↗" card instead of a blank iframe.
 *
 * 🔴 ALL WIDGETS ACCESSIBLE: the left-nav "All widgets" section is driven
 * directly by WIDGET_REGISTRY grouped by disclosure tier (`tierOf`), and ⌘K
 * still works above the cockpit — the overlay's z-index (4000) deliberately
 * sits BELOW CommandPalette's 5000 so the palette wins. `restrictedToEmails`
 * entries (e.g. the Andy-only Audit Log) are hidden from non-matching
 * accounts — cosmetic only; the widget itself still hard-gates server-side.
 *
 * Background tasks pane reads the per-user Hermes persona task queue
 * (`personaWorkStore` — the same durable store `useHermesAutonomousRunner`
 * claims work from), rendered read-only; "Clear finished" is a user-initiated
 * UI deletion via the store's own `deleteTask`.
 *
 * A11y: the four panes are labeled `role="region"`s, every nav row is a real
 * <button> with an aria-label, and Escape is ignored while focus is in an
 * input/textarea/iframe/contenteditable.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useContext, Suspense } from 'react';
import {
    ChevronLeft, ChevronRight, ExternalLink, Package, Plus, RotateCw, Settings as SettingsIcon, Wrench, X,
} from 'lucide-react';
import { WIDGET_REGISTRY, WINDOW_COMPONENTS } from '../../registry/widgetRegistry';
import { tierOf, type WidgetTier } from '../../lib/onboardingStore';
import { getIcon } from '../Sidebar/iconMap';
import { fluidOsStore } from '../../lib/fluidOsStore';
import { useWindows } from '../../context/WindowContext';
import { UserContext } from '../../context/UserContext';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import {
    personaWorkStore, personaWorkUserIdHolder, deleteTask, formatDuration, type PersonaTask,
} from '../../lib/agents/personaWorkStore';
import { TOOLS, resolveToolStatus } from '../../data/toolsHub';
import { APP_VERSION } from '../../appVersion';
import AppSuspenseFallback from './AppSuspenseFallback';
import './FluidOS.css';

/* ── Per-user cockpit prefs (column widths + right-pane collapse + last URL) ── */

interface CockpitPrefs {
    navW: number;
    workW: number;
    rightW: number;
    rightCollapsed: boolean;
    lastUrl: string;
}
const DEFAULT_PREFS: CockpitPrefs = { navW: 260, workW: 420, rightW: 380, rightCollapsed: false, lastUrl: '' };

export const cockpitPrefsUserIdHolder: { current: string | null } = { current: null };
function prefsKey(): string {
    const uid = cockpitPrefsUserIdHolder.current;
    return uid ? `dwellium-cockpit:${uid}` : 'dwellium-cockpit:_anonymous';
}
function deserializePrefs(raw: string | null): CockpitPrefs {
    if (!raw) return { ...DEFAULT_PREFS };
    try {
        const p = JSON.parse(raw) as Partial<CockpitPrefs> | null;
        if (!p || typeof p !== 'object') return { ...DEFAULT_PREFS };
        return {
            navW: typeof p.navW === 'number' ? p.navW : DEFAULT_PREFS.navW,
            workW: typeof p.workW === 'number' ? p.workW : DEFAULT_PREFS.workW,
            rightW: typeof p.rightW === 'number' ? p.rightW : DEFAULT_PREFS.rightW,
            rightCollapsed: Boolean(p.rightCollapsed),
            lastUrl: typeof p.lastUrl === 'string' ? p.lastUrl : '',
        };
    } catch {
        return { ...DEFAULT_PREFS };
    }
}
/** Exported for tests (`.reset()` in beforeEach — repo standing convention). */
export const cockpitPrefsStore = createLocalStorageStore<CockpitPrefs>({
    key: prefsKey,
    deserializer: deserializePrefs,
    defaultValue: { ...DEFAULT_PREFS },
});
function savePrefs(patch: Partial<CockpitPrefs>): void {
    const next = { ...cockpitPrefsStore.getSnapshot(), ...patch };
    cockpitPrefsStore.set(next, () => {
        try { localStorage.setItem(prefsKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ── Left-nav widget grouping ─────────────────────────────────────────────── */

const TIER_ORDER: readonly WidgetTier[] = ['core', 'daily', 'ai', 'tools', 'labs'];
const TIER_LABEL: Record<WidgetTier, string> = {
    core: 'Core', daily: 'Daily', ai: 'AI', tools: 'Tools', labs: 'Labs',
};

interface NavWidget { id: string; label: string; icon: string }

/* ── Preview quick links (Tools hub `ready` tools with a URL + Argyle) ────── */

function buildQuickLinks(): Array<{ id: string; label: string; url: string }> {
    const env = import.meta.env as Record<string, string | undefined>;
    const links: Array<{ id: string; label: string; url: string }> = [];
    TOOLS.forEach((t) => {
        if (resolveToolStatus(t, (id) => Boolean(WIDGET_REGISTRY[id]), env) !== 'ready') return;
        // Only iframe-able tools (a URL exists): env-gated tools use their env
        // URL; Penpot defaults to its free cloud (same default the widget uses).
        const url = t.envVar ? env[t.envVar] : t.id === 'design-studio' ? 'https://design.penpot.app' : undefined;
        if (url) links.push({ id: t.id, label: t.label, url });
    });
    links.push({ id: 'argyle-holocron', label: 'Argyle Holocron', url: 'https://argyleholocron.netlify.app' });
    return links;
}

/* ── Preview: sites that refuse to be framed ────────────────────────────── */

// ponytail: a static list of hosts whose CSP frame-ancestors / X-Frame-Options
// forbid embedding (verified 2026-08-22: www.appfolio.com sends
// `frame-ancestors 'self' *.appfolio.com …`). A no-cors fetch can't read those
// headers, so this is the cheapest honest signal; upgrade path = a backend
// HEAD probe (`/api/preview/probe`) if the list ever gets long.
const FRAME_BLOCKED_HOSTS = [
    'appfolio.com', 'google.com', 'gmail.com', 'youtube.com', 'office.com', 'live.com',
    'microsoft.com', 'github.com', 'linkedin.com', 'facebook.com', 'instagram.com', 'x.com',
    'twitter.com', 'dropbox.com', 'apple.com', 'icloud.com',
];
export function isKnownFrameBlocked(url: string): boolean {
    try {
        const host = new URL(url).hostname.toLowerCase();
        return FRAME_BLOCKED_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
        return false;
    }
}

/* ── Component ────────────────────────────────────────────────────────────── */

export default function FluidOS() {
    const state = useSyncExternalStore(fluidOsStore.subscribe, fluidOsStore.getSnapshot, fluidOsStore.getServerSnapshot);
    const { windows, openWindow, focusWindow, restoreWindow } = useWindows();

    const catalogUser = useContext(UserContext)?.user;
    const catalogEmail = catalogUser?.email?.trim().toLowerCase() ?? '';

    // Holder-before-useSyncExternalStore pattern (WindowContext savedLayouts
    // sister-shape): resolve per-user keys during render.
    cockpitPrefsUserIdHolder.current = catalogUser?.id ?? null;
    personaWorkUserIdHolder.current = catalogUser?.id ?? null;

    const prefs = useSyncExternalStore(cockpitPrefsStore.subscribe, cockpitPrefsStore.getSnapshot, cockpitPrefsStore.getServerSnapshot);
    const personaWork = useSyncExternalStore(personaWorkStore.subscribe, personaWorkStore.getSnapshot, personaWorkStore.getServerSnapshot);

    /* Widget catalog, restricted-filtered + tier-grouped. */
    const widgetsByTier = useMemo(() => {
        const out = new Map<WidgetTier, NavWidget[]>();
        Object.values(WIDGET_REGISTRY).forEach((w) => {
            if (w.restrictedToEmails && !w.restrictedToEmails.includes(catalogEmail)) return;
            const tier = tierOf(w.id);
            if (!out.has(tier)) out.set(tier, []);
            out.get(tier)!.push({ id: w.id, label: w.label, icon: w.icon });
        });
        out.forEach((list) => list.sort((a, b) => a.label.localeCompare(b.label)));
        return out;
    }, [catalogEmail]);

    /* Background tasks, flattened across personas. */
    const tasks = useMemo(() => {
        const rows: Array<{ personaId: string; task: PersonaTask }> = [];
        Object.entries(personaWork).forEach(([personaId, w]) => {
            (w?.tasks ?? []).forEach((task) => rows.push({ personaId, task }));
        });
        return rows;
    }, [personaWork]);
    const runningTasks = tasks.filter((r) => r.task.status === 'running' || r.task.status === 'todo');
    const finishedTasks = tasks.filter((r) => r.task.status === 'done' || r.task.status === 'failed');
    const [finishedOpen, setFinishedOpen] = useState(false);

    /* Preview pane. */
    const [draftUrl, setDraftUrl] = useState('');
    const [reach, setReach] = useState<'checking' | 'up' | 'down'>('checking');
    const [iframeKey, setIframeKey] = useState(0);
    const previewUrl = prefs.lastUrl;
    useEffect(() => { setDraftUrl(previewUrl); }, [previewUrl]);

    // Best-effort reachability (LangFlowPanel pattern): a no-cors fetch
    // resolves if the server answers at all, rejects on connection errors.
    useEffect(() => {
        if (!state.enabled || !state.open || !previewUrl) return;
        let alive = true;
        setReach('checking');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        fetch(previewUrl, { mode: 'no-cors', signal: ctrl.signal })
            .then(() => { if (alive) setReach('up'); })
            .catch(() => { if (alive) setReach('down'); })
            .finally(() => clearTimeout(t));
        return () => { alive = false; ctrl.abort(); };
    }, [state.enabled, state.open, previewUrl, iframeKey]);

    const loadUrl = useCallback((raw: string) => {
        const trimmed = raw.trim();
        if (!trimmed) { savePrefs({ lastUrl: '' }); return; }
        const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
        savePrefs({ lastUrl: url });
        setIframeKey((k) => k + 1);
    }, []);

    const quickLinks = useMemo(buildQuickLinks, []);

    /* Center-pane tabs: ARA is permanent; every other widget opens as a tab
       here instead of kicking the user back to the classic desktop. Session
       state only (not persisted) — reopening the cockpit starts on ARA. */
    const [tabs, setTabs] = useState<NavWidget[]>([]);
    const [activeTab, setActiveTab] = useState<string>('ara-console');
    const openInCockpit = useCallback((id: string, label: string, icon: string) => {
        if (id !== 'ara-console') {
            setTabs((prev) => (prev.some((t) => t.id === id) ? prev : [...prev, { id, label, icon }]));
        }
        setActiveTab(id);
    }, []);
    const closeTab = useCallback((id: string) => {
        setTabs((prev) => prev.filter((t) => t.id !== id));
        setActiveTab((cur) => (cur === id ? 'ara-console' : cur));
    }, []);
    /* The explicit way OUT: pop the active tab onto the classic desktop. */
    const popOut = useCallback((id: string, label: string, icon: string) => {
        const winId = openWindow(id, label, icon);
        if (winId) { restoreWindow(winId); focusWindow(winId); }
        fluidOsStore.setOpen(false);
    }, [openWindow, restoreWindow, focusWindow]);

    /* Adopt desktop windows opened while the cockpit is up (⌘K, deep links)
       as tabs — otherwise they'd land invisibly behind the overlay. */
    const seenWindowIds = useRef<Set<string>>(new Set(windows.map((w) => w.id)));
    useEffect(() => {
        if (!state.enabled || !state.open) {
            seenWindowIds.current = new Set(windows.map((w) => w.id));
            return;
        }
        windows.forEach((w) => {
            if (seenWindowIds.current.has(w.id)) return;
            seenWindowIds.current.add(w.id);
            openInCockpit(w.component, w.title, w.icon);
        });
    }, [windows, state.enabled, state.open, openInCockpit]);

    /* Splitters (Sidebar resize-handle pattern: mousedown → window listeners). */
    const startDrag = useCallback((which: 'nav' | 'work' | 'right') => (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const snap = cockpitPrefsStore.getSnapshot();
        const startW = which === 'nav' ? snap.navW : which === 'work' ? snap.workW : snap.rightW;
        const onMove = (ev: MouseEvent) => {
            const dx = ev.clientX - startX;
            if (which === 'nav') savePrefs({ navW: clamp(startW + dx, 220, 360) });
            else if (which === 'work') savePrefs({ workW: clamp(startW - dx, 300, 640) });
            else savePrefs({ rightW: clamp(startW - dx, 260, 640) });
        };
        const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            document.body.style.cursor = '';
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        document.body.style.cursor = 'col-resize';
    }, []);

    /* Escape closes the cockpit — unless focus is in an editable/iframe. ⌘K is
       untouched: CommandPalette owns its own global listener and overlays us. */
    useEffect(() => {
        if (!state.enabled || !state.open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const el = document.activeElement as HTMLElement | null;
            const tag = el?.tagName ?? '';
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'IFRAME' || el?.isContentEditable) return;
            fluidOsStore.setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [state.enabled, state.open]);

    if (!state.enabled || !state.open) return null;

    const AraConsole = WINDOW_COMPONENTS['ara-console'];
    const Terminal = WINDOW_COMPONENTS['terminal'];
    const activeTabWidget = activeTab === 'ara-console' ? null : (tabs.find((t) => t.id === activeTab) ?? null);
    const ActiveTabComponent = activeTabWidget ? WINDOW_COMPONENTS[activeTabWidget.id] : null;

    const focusedWindowId = windows
        .filter((w) => !w.minimized)
        .reduce<{ id: string; z: number } | null>((top, w) => (!top || w.zIndex > top.z ? { id: w.id, z: w.zIndex } : top), null)?.id;

    const workspaceLabel = (catalogUser?.name?.trim() || catalogEmail.split('@')[0] || 'dwellium')
        .toLowerCase().replace(/\s+/g, '-');
    const initials = (catalogUser?.name?.trim() || catalogEmail || 'D')
        .split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s.charAt(0).toUpperCase()).join('') || 'D';

    const gridColumns = [
        `${prefs.navW}px`, '5px', 'minmax(480px, 1fr)', '5px', `${prefs.workW}px`,
        ...(prefs.rightCollapsed ? ['0px', '28px'] : ['5px', `${prefs.rightW}px`]),
    ].join(' ');

    return (
        <div className="fos" role="dialog" aria-label="Cockpit" style={{ gridTemplateColumns: gridColumns }}>
            {/* ── Pane 1: left nav ─────────────────────────────────────── */}
            <div className="fos-nav" role="region" aria-label="Navigation">
                <div className="fos-nav__pill" role="group" aria-label="Layout">
                    <button type="button" className="fos-nav__pill-btn" aria-pressed="false"
                        onClick={() => fluidOsStore.setOpen(false)}>Home</button>
                    <button type="button" className="fos-nav__pill-btn fos-nav__pill-btn--on" aria-pressed="true">Cockpit</button>
                </div>

                <div className="fos-nav__actions">
                    <button type="button" className="fos-nav__action" aria-label="New (command palette)"
                        onClick={() => window.dispatchEvent(new CustomEvent('dwellium:open-palette'))}>
                        <Plus size={14} aria-hidden /> New
                    </button>
                    <button type="button" className="fos-nav__action" aria-label="Open Artifacts"
                        onClick={() => openInCockpit('artifact-gallery', WIDGET_REGISTRY['artifact-gallery']?.label ?? 'Artifacts', WIDGET_REGISTRY['artifact-gallery']?.icon ?? '')}>
                        <Package size={14} aria-hidden /> Artifacts
                    </button>
                    <button type="button" className="fos-nav__action" aria-label="Open Tools hub"
                        onClick={() => openInCockpit('tools-hub', WIDGET_REGISTRY['tools-hub']?.label ?? 'Tools hub', WIDGET_REGISTRY['tools-hub']?.icon ?? '')}>
                        <Wrench size={14} aria-hidden /> Tools hub
                    </button>
                    <button type="button" className="fos-nav__action" aria-label="Open Settings"
                        onClick={() => openInCockpit('control-panel', WIDGET_REGISTRY['control-panel']?.label ?? 'Settings', WIDGET_REGISTRY['control-panel']?.icon ?? '')}>
                        <SettingsIcon size={14} aria-hidden /> Settings
                    </button>
                </div>

                <div className="fos-nav__scroll">
                    <div className="fos-nav__section">
                        <div className="fos-nav__section-head">{workspaceLabel}</div>
                        {windows.length === 0 && <div className="fos-nav__hint">No open windows.</div>}
                        {windows.map((w) => {
                            const Icon = getIcon(w.icon);
                            return (
                                <button key={w.id} type="button" className="fos-nav__row"
                                    aria-label={`Focus ${w.title}`}
                                    onClick={() => openInCockpit(w.component, w.title, w.icon)}>
                                    <span className="fos-nav__row-icon">{Icon ? <Icon size={14} aria-hidden /> : '◈'}</span>
                                    <span className="fos-nav__row-label">{w.title}</span>
                                    {w.id === focusedWindowId && <span className="fos-nav__row-dot" aria-label="Focused">·</span>}
                                </button>
                            );
                        })}
                    </div>

                    <div className="fos-nav__section" aria-label="All widgets">
                        <div className="fos-nav__section-head">All widgets</div>
                        {TIER_ORDER.filter((t) => widgetsByTier.has(t)).map((tier) => (
                            <div key={tier} className="fos-nav__tier">
                                <div className="fos-nav__tier-head">{TIER_LABEL[tier]}</div>
                                {widgetsByTier.get(tier)!.map((w) => {
                                    const Icon = getIcon(w.icon);
                                    return (
                                        <button key={w.id} type="button" className="fos-nav__row"
                                            aria-label={`Open ${w.label}`}
                                            onClick={() => openInCockpit(w.id, w.label, w.icon)}>
                                            <span className="fos-nav__row-icon">{Icon ? <Icon size={14} aria-hidden /> : '◈'}</span>
                                            <span className="fos-nav__row-label">{w.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="fos-nav__user">
                    <span className="fos-nav__avatar" aria-hidden>{initials}</span>
                    <span className="fos-nav__user-name">{catalogUser?.name ?? 'Guest'}</span>
                    <span className="fos-nav__version">v{APP_VERSION}</span>
                </div>
            </div>

            {/* role="presentation" + mousedown = the repo's Sidebar resize-handle pattern */}
            <div className="fos-splitter" role="presentation" onMouseDown={startDrag('nav')} />

            {/* ── Pane 2: center — ARA Console + widget tabs ───────────── */}
            <div className="fos-chat" role="region" aria-label="Chat">
                {tabs.length > 0 && (
                    <div className="fos-tabs" role="tablist" aria-label="Open in cockpit">
                        <button type="button" role="tab" aria-selected={activeTab === 'ara-console'}
                            className={`fos-tab${activeTab === 'ara-console' ? ' fos-tab--on' : ''}`}
                            onClick={() => setActiveTab('ara-console')}>ARA</button>
                        {tabs.map((t) => (
                            <span key={t.id} className={`fos-tab-wrap${activeTab === t.id ? ' fos-tab-wrap--on' : ''}`}>
                                <button type="button" role="tab" aria-selected={activeTab === t.id}
                                    className={`fos-tab${activeTab === t.id ? ' fos-tab--on' : ''}`}
                                    onClick={() => setActiveTab(t.id)}>{t.label}</button>
                                <button type="button" className="fos-tab__close" aria-label={`Close ${t.label}`}
                                    onClick={() => closeTab(t.id)}><X size={11} aria-hidden /></button>
                            </span>
                        ))}
                        {activeTabWidget && (
                            <button type="button" className="fos-tab__pop" aria-label={`Open ${activeTabWidget.label} on desktop`}
                                title="Open on the classic desktop"
                                onClick={() => popOut(activeTabWidget.id, activeTabWidget.label, activeTabWidget.icon)}>
                                <ExternalLink size={12} aria-hidden />
                            </button>
                        )}
                    </div>
                )}
                {/* ARA stays mounted (hidden) behind other tabs so the chat keeps its state. */}
                <div className="fos-chat__body" hidden={activeTab !== 'ara-console'}>
                    {AraConsole ? (
                        <Suspense fallback={<AppSuspenseFallback variant="popup" label="Loading ARA Console…" />}>
                            <AraConsole />
                        </Suspense>
                    ) : (
                        <div className="fos-missing">ARA Console isn’t registered.</div>
                    )}
                </div>
                {activeTabWidget && (
                    <div className="fos-chat__body" data-tab={activeTabWidget.id}>
                        {ActiveTabComponent ? (
                            <Suspense fallback={<AppSuspenseFallback variant="popup" label={`Loading ${activeTabWidget.label}…`} />}>
                                <ActiveTabComponent />
                            </Suspense>
                        ) : (
                            <div className="fos-missing">{activeTabWidget.label} isn’t registered.</div>
                        )}
                    </div>
                )}
            </div>

            <div className="fos-splitter" role="presentation" onMouseDown={startDrag('work')} />

            {/* ── Pane 3: work column (Terminal over Background tasks) ─── */}
            <div className="fos-work" role="region" aria-label="Work">
                {/* ponytail: fixed 55/45 split — a draggable row splitter is overkill here */}
                <div className="fos-work__terminal">
                    {Terminal ? (
                        <Suspense fallback={<AppSuspenseFallback variant="popup" label="Loading Terminal…" />}>
                            <Terminal />
                        </Suspense>
                    ) : (
                        <div className="fos-missing">Terminal isn’t registered.</div>
                    )}
                </div>
                <div className="fos-tasks">
                    <div className="fos-tasks__head">
                        <span className="fos-tasks__title">Background tasks</span>
                        <button type="button" className="fos-tasks__btn"
                            aria-label={finishedOpen ? 'Collapse finished tasks' : 'Expand finished tasks'}
                            onClick={() => setFinishedOpen((v) => !v)}>
                            Finished {finishedTasks.length}
                        </button>
                        {finishedTasks.length > 0 && (
                            <button type="button" className="fos-tasks__btn" aria-label="Clear finished tasks"
                                onClick={() => finishedTasks.forEach((r) => deleteTask(r.personaId, r.task.id))}>
                                Clear
                            </button>
                        )}
                    </div>
                    <div className="fos-tasks__list">
                        {tasks.length === 0 && (
                            <div className="fos-tasks__empty">No background tasks yet — Hermes runs will appear here.</div>
                        )}
                        {runningTasks.map(({ personaId, task }) => (
                            <div key={`${personaId}-${task.id}`} className="fos-tasks__row">
                                <span className={`fos-tasks__status fos-tasks__status--${task.status}`}>{task.status === 'running' ? 'Running' : 'Queued'}</span>
                                <span className="fos-tasks__name" title={task.title}>{task.title}</span>
                                <span className="fos-tasks__age">{formatDuration(Date.now() - (task.startedAt ?? task.createdAt))} ago</span>
                            </div>
                        ))}
                        {finishedOpen && finishedTasks.map(({ personaId, task }) => (
                            <div key={`${personaId}-${task.id}`} className="fos-tasks__row fos-tasks__row--dim">
                                <span className={`fos-tasks__status fos-tasks__status--${task.status}`}>{task.status === 'done' ? 'Done' : 'Failed'}</span>
                                <span className="fos-tasks__name" title={task.title}>{task.title}</span>
                                <span className="fos-tasks__age">{formatDuration(Date.now() - (task.completedAt ?? task.createdAt))} ago</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {!prefs.rightCollapsed && (
                <div className="fos-splitter" role="presentation" onMouseDown={startDrag('right')} />
            )}
            {prefs.rightCollapsed && <div aria-hidden />}

            {/* ── Pane 4: right preview ────────────────────────────────── */}
            {prefs.rightCollapsed ? (
                <div className="fos-rail" role="region" aria-label="Preview">
                    <button type="button" className="fos-rail__btn" aria-label="Expand preview"
                        onClick={() => savePrefs({ rightCollapsed: false })}>
                        <ChevronLeft size={15} aria-hidden />
                    </button>
                </div>
            ) : (
                <div className="fos-preview" role="region" aria-label="Preview">
                    <div className="fos-preview__bar">
                        <input
                            className="fos-preview__url"
                            aria-label="Preview URL"
                            placeholder="Type a URL"
                            value={draftUrl}
                            onChange={(e) => setDraftUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') loadUrl(draftUrl); }}
                        />
                        {previewUrl && (
                            <>
                                <button type="button" className="fos-preview__btn" aria-label="Reload preview"
                                    onClick={() => setIframeKey((k) => k + 1)}><RotateCw size={13} aria-hidden /></button>
                                <button type="button" className="fos-preview__btn" aria-label="Open in a new window"
                                    onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}><ExternalLink size={13} aria-hidden /></button>
                            </>
                        )}
                        <button type="button" className="fos-preview__btn" aria-label="Collapse preview"
                            onClick={() => savePrefs({ rightCollapsed: true })}>
                            <ChevronRight size={15} aria-hidden />
                        </button>
                    </div>
                    <div className="fos-preview__body">
                        {!previewUrl ? (
                            <div className="fos-preview__hint">
                                <p className="fos-preview__hint-title">Open a server below, or enter a URL above</p>
                                <div className="fos-quick">
                                    {quickLinks.map((l) => (
                                        <button key={l.id} type="button" className="fos-quick__row"
                                            aria-label={`Preview ${l.label}`}
                                            onClick={() => loadUrl(l.url)}>
                                            <span className="fos-quick__label">{l.label}</span>
                                            <span className="fos-quick__url">{l.url}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : isKnownFrameBlocked(previewUrl) ? (
                            <div className="fos-preview__hint" data-frame-blocked>
                                <p className="fos-preview__hint-title">{new URL(previewUrl).hostname} doesn’t allow embedding</p>
                                <p className="fos-preview__hint-sub">Its security policy (frame-ancestors) blocks other sites from framing it — that’s on their side, not a Dwellium bug. Open it in its own window instead.</p>
                                <div className="fos-preview__hint-actions">
                                    <button type="button" className="fos-preview__btn fos-preview__btn--wide"
                                        onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                                    <button type="button" className="fos-preview__btn fos-preview__btn--wide"
                                        onClick={() => loadUrl('')}>Change URL</button>
                                </div>
                            </div>
                        ) : reach === 'down' ? (
                            <div className="fos-preview__hint">
                                <p className="fos-preview__hint-title">Not reachable at {previewUrl}</p>
                                <div className="fos-preview__hint-actions">
                                    <button type="button" className="fos-preview__btn fos-preview__btn--wide"
                                        onClick={() => setIframeKey((k) => k + 1)}>Re-check</button>
                                    <button type="button" className="fos-preview__btn fos-preview__btn--wide"
                                        onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}>Open ↗</button>
                                </div>
                            </div>
                        ) : (
                            <iframe
                                key={iframeKey}
                                className="fos-preview__frame"
                                src={previewUrl}
                                title="Preview"
                                allow="clipboard-read; clipboard-write"
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
