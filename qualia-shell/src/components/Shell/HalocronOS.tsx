/**
 * HalocronOS — the alternate interface layout for Dwellium (2026-06-12).
 *
 * A full-screen launcher shell in the Old Republic holocron-archive aesthetic,
 * modeled on the "Claude OS" layout: a left navigation rail (Home, Memory,
 * Workspace, Apps, Skills, Dream, Insights, Settings) over the SAME Dwellium
 * features. It does not replace the window system — opening anything dispatches
 * the existing `dwellium:open-widget` bus and collapses the overlay so the real
 * windowed widget is usable; the launcher rune reopens the shell.
 *
 * 🔴 ALL WIDGETS ACCESSIBLE: the Apps (Archive) panel is driven directly by
 * WIDGET_REGISTRY — every registered widget (all of them, future ones too)
 * appears and opens. No hand-maintained list to drift out of sync.
 *
 * Switchable: halocronOsStore.enabled chooses this layout vs. the Classic
 * desktop; the Settings panel flips it. Nothing is lost either way — same
 * windows, widgets, spaces, memory underneath.
 */
import { Suspense, useEffect, useMemo, useState, useSyncExternalStore, createElement } from 'react';
import { X } from 'lucide-react';
import { WIDGET_REGISTRY, WINDOW_COMPONENTS } from '../../registry/widgetRegistry';
import { getIcon } from '../Sidebar/iconMap';
import { halocronOsStore } from '../../lib/halocronOsStore';
import WidgetErrorBoundary from '../Window/WidgetErrorBoundary';
import HalocronKnowledgeGraph, { KG_AGENTS } from './HalocronKnowledgeGraph';
import HalocronWorkspaces from './HalocronWorkspaces';
import CognitiveHarness from '../CognitiveHarness/CognitiveHarness';
import { useLlmUsage, lastNDays } from '../../lib/llmUsageStore';
import { useSubscriptions, monthlyTotal, saveSubscriptions, subscriptionsStore } from '../../lib/subscriptionsStore';
import { useIntegrations } from '../../hooks/useIntegrations';
import { useContext } from 'react';
import { UserContext } from '../../context/UserContext';
import { integrationsUserIdHolder } from '../../utils/integrationsStore';
import './HalocronOS.css';

type NavId = 'home' | 'memory' | 'kg' | 'workspace' | 'apps' | 'skills' | 'dream' | 'insights' | 'settings';

const NAV: { id: NavId; label: string; glyph: string }[] = [
    { id: 'home', label: 'Home', glyph: '◈' },
    { id: 'kg', label: 'Knowledge Graph', glyph: '⊹' },
    { id: 'memory', label: 'Memory', glyph: '' },
    { id: 'workspace', label: 'Workspace', glyph: '◳' },
    { id: 'apps', label: 'Apps', glyph: '▦' },
    { id: 'skills', label: 'Skills', glyph: '' },
    { id: 'dream', label: 'Dream', glyph: '' },
    { id: 'insights', label: 'Insights', glyph: '▤' },
    { id: 'settings', label: 'Settings', glyph: '' },
];

const SPACES: { id: string; name: string; widgets: string[] }[] = [
    { id: 'write', name: 'Write', widgets: ['scribe', 'doc-viewer', 'notepad'] },
    { id: 'manage', name: 'Manage', widgets: ['strata-dashboard', 'astra-dashboard', 'tenant-portal-mgmt', 'task-board'] },
    { id: 'research', name: 'Research', widgets: ['notebooklm-context', 'fact-check-log', 'transcription', 'content-search'] },
    { id: 'comms', name: 'Comms', widgets: ['inbox', 'honcho', 'ara-console'] },
    { id: 'build', name: 'Build', widgets: ['automation-hub', 'universal-shell'] },
];

const CATEGORY_LABEL: Record<string, string> = {
    core: 'Core', ai: 'AI Tools', filing: 'Filing Cabinet', tools: 'Tools & Utilities', other: 'Archive',
};
const CATEGORY_ORDER = ['core', 'ai', 'filing', 'tools', 'other'];

type RangeId = 'today' | '7' | '28';

// External AI tools launchable from the Home screen — "access them all from
// one place." Opens the real product in a new tab.
const LAUNCH_TOOLS: { id: string; name: string; sub: string; url: string; color: string; glyph: string }[] = [
    { id: 'claude', name: 'Claude', sub: 'Anthropic · Max 20x', url: 'https://claude.ai', color: '#d97757', glyph: '' },
    { id: 'antigravity', name: 'AntiGravity', sub: 'Google', url: 'https://antigravity.google', color: '#4d8aff', glyph: '◇' },
    { id: 'chatgpt', name: 'ChatGPT', sub: 'OpenAI · Plus', url: 'https://chatgpt.com', color: '#19c37d', glyph: '◉' },
    { id: 'codex', name: 'Codex', sub: 'OpenAI · CLI agent', url: 'https://chatgpt.com/codex', color: '#c9a44c', glyph: '⌘' },
];

interface HosTab { key: string; kind: 'widget' | 'web'; id?: string; label: string; url?: string; color?: string; }

// AI tools that are CLI agents → run them in the in-OS Terminal instead of an
// (un-embeddable) web tab. Maps launchpad id → terminal command + tab label.
const CLI_TOOLS: Record<string, { cmd: string; label: string }> = {
    codex: { cmd: 'codex', label: 'Codex CLI' },
    claude: { cmd: 'claude', label: 'Claude Code' },
    antigravity: { cmd: 'antigravity', label: 'AntiGravity' },
};

// In the Electron desktop build a <webview> fully embeds external sites
// (bypasses X-Frame-Options); the web build falls back to an <iframe>, which
// providers like Claude/ChatGPT block — hence the "Open in browser" affordance.
// NOTE: the Electron main process must set webPreferences.webviewTag = true.
const IS_ELECTRON = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent || '');
function WebFrame({ url, title, color }: { url: string; title: string; color?: string }) {
    // Electron embeds the real site (bypasses X-Frame-Options); web cannot —
    // claude.ai/chatgpt.com/etc send X-Frame-Options: DENY, so an iframe just
    // shows "refused to connect". On web we show a clean launch card instead.
    if (IS_ELECTRON) {
        return createElement('webview', { src: url, class: 'hos-web__frame', style: 'width:100%;height:100%;border:none;', allowpopups: 'true' });
    }
    const host = (() => { try { return new URL(url).host; } catch { return url; } })();
    return (
        <div className="hos-weblaunch">
            <div className="hos-weblaunch__glyph" style={{ color: color || 'var(--accent)', borderColor: color || 'var(--accent)' }}>↗</div>
            <div className="hos-weblaunch__title">{title}</div>
            <div className="hos-weblaunch__host">{host}</div>
            <button className="hos-weblaunch__btn" onClick={() => { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch { /* blocked */ } }}>
                Open {title} ↗
            </button>
            <div className="hos-weblaunch__note">{title} blocks in-browser embedding for security, so it opens in a new tab. (The Dwellium desktop app embeds it inline.)</div>
        </div>
    );
}

// Clicking an agent in the rail opens that agent's actual widget.
const AGENT_WIDGET: Record<string, string> = {
    ara: 'ara-console', stella: 'stella-agent', hydra: 'hydra-ai', honcho: 'honcho', hermes: 'hermes',
};

const RANGE_DAYS: Record<RangeId, number> = { today: 1, '7': 7, '28': 28 };
const RANGE_LABEL: Record<RangeId, string> = { today: 'today', '7': 'last 7 days', '28': 'last 28 days' };

export default function HalocronOS() {
    const state = useSyncExternalStore(halocronOsStore.subscribe, halocronOsStore.getSnapshot, halocronOsStore.getServerSnapshot);
    const [nav, setNav] = useState<NavId>('home');
    const [query, setQuery] = useState('');
    const [range, setRange] = useState<RangeId>('28');
    // 🔴 In-OS host: the currently-open widget renders INSIDE the shell (full
    // panel) instead of being delegated to the classic windowed desktop.
    // Classic-OS-style tabs: every opened app/web view becomes a tab; all stay
    // mounted (hidden when inactive) so you keep your place when switching.
    const [tabs, setTabs] = useState<HosTab[]>([]);
    const [activeKey, setActiveKey] = useState<string | null>(null);

    const grouped = useMemo(() => {
        const out: Record<string, { id: string; label: string; icon: string }[]> = {};
        Object.values(WIDGET_REGISTRY).forEach((w) => {
            const cat = (w.category && CATEGORY_ORDER.includes(w.category)) ? w.category : 'other';
            (out[cat] ||= []).push({ id: w.id, label: w.label, icon: w.icon });
        });
        Object.values(out).forEach((arr) => arr.sort((a, b) => a.label.localeCompare(b.label)));
        return out;
    }, []);

    const totalWidgets = Object.keys(WIDGET_REGISTRY).length;
    const greeting = (() => {
        const h = new Date().getHours();
        return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    })();

    // ── Real Home figures, scoped to the LOGGED-IN account ──────────────
    // Set the per-user id holder BEFORE reading the usage/subscription stores
    // (same pattern as useIntegrations) so Tokens/Activity/Spend always
    // reference THIS account's data — never a stale or anonymous namespace.
    const userCtx = useContext(UserContext);
    integrationsUserIdHolder.current = userCtx?.user?.id ?? null;
    const { integrations } = useIntegrations();
    const usage = useLlmUsage();
    const subs = useSubscriptions();
    const days = lastNDays(RANGE_DAYS[range], usage);
    const tokenSpend = days.reduce((s, d) => s + d.estCost, 0);   // real est. $ from the ledger
    const calls = days.reduce((s, d) => s + d.calls, 0);          // real LLM turns
    const flatMonthly = monthlyTotal(subs);                       // real subscriptions / month
    const totalSpend = flatMonthly + tokenSpend;
    const fmt = (n: number) => n >= 100 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

    // Edit subscriptions inline so the figure is EXACTLY the user's spend.
    const editPlans = () => {
        const next = subs.map((s) => {
            const v = window.prompt(`${s.name} (${s.vendor}) — monthly $`, String(s.monthly));
            return v == null ? s : { ...s, monthly: Number(v.replace(/[^0-9.]/g, '')) || 0 };
        });
        saveSubscriptions(next);
        subscriptionsStore.set(next, () => {}); // ensure snapshot update for SSR-store consumers
    };

    // Bus listener MUST be declared before the early return below so the hook
    // count is identical whether the OS is enabled or not — otherwise toggling
    // the layout throws "Rendered fewer hooks than expected" and blanks the app
    // until reload. (setTabs/setActiveKey are stable; safe to register always.)
    useEffect(() => {
        const onOpen = (e: Event) => {
            const id = (e as CustomEvent).detail?.widgetId;
            if (!id || !WINDOW_COMPONENTS[id]) return;
            if (!halocronOsStore.getSnapshot().enabled) return;
            const key = `w:${id}`;
            setTabs((t) => (t.some((x) => x.key === key) ? t : [...t, { key, kind: 'widget', id, label: WIDGET_REGISTRY[id]?.label ?? id }]));
            setActiveKey(key);
            halocronOsStore.setOpen(true);
        };
        window.addEventListener('dwellium:open-widget', onOpen);
        return () => window.removeEventListener('dwellium:open-widget', onOpen);
    }, []);

    if (!state.enabled || !state.open) return null;

    // Open a widget as a tab inside the OS (classic-OS tab logic): focus it if
    // already open, otherwise add a new tab. All tabs stay mounted.
    const openWidget = (id: string, label: string) => {
        if (!WINDOW_COMPONENTS[id]) return;
        const key = `w:${id}`;
        // Relabel on reopen (e.g. the shared Terminal tab → "Codex CLI"/"Claude Code").
        setTabs((t) => (t.some((x) => x.key === key) ? t.map((x) => (x.key === key ? { ...x, label } : x)) : [...t, { key, kind: 'widget', id, label }]));
        setActiveKey(key);
    };
    // Open an external AI tool (Claude/AntiGravity/Codex/ChatGPT) as a web tab
    // inside the OS instead of a separate browser tab.
    const openWeb = (tool: { id: string; name: string; url: string; color: string }) => {
        const key = `web:${tool.id}`;
        setTabs((t) => (t.some((x) => x.key === key) ? t : [...t, { key, kind: 'web', label: tool.name, url: tool.url, color: tool.color }]));
        setActiveKey(key);
    };
    // Codex and Claude are CLI agents — run them inside the OS via the Terminal
    // widget's real backend shell (their web pages can't be embedded). Queues
    // the CLI command to run as soon as the live session connects.
    const openCliTool = (label: string, cmd: string) => {
        // Queue for a FRESH session (createSession runs it on connect)…
        try {
            sessionStorage.setItem('dwellium-terminal-initial-tab', 'terminal');
            sessionStorage.setItem('dwellium-terminal-initial-cmd', cmd);
        } catch { /* sandboxed */ }
        openWidget('terminal', label);
        // …and if a live session is ALREADY open, run it there now.
        setTimeout(() => window.dispatchEvent(new CustomEvent('dwellium:terminal-run', { detail: { cmd } })), 450);
    };
    const openCliToolExternal = (label: string, cmd: string) => {
        try {
            const popupKey = `dwellium-popup-terminal`;
            localStorage.setItem(popupKey, JSON.stringify({
                title: label,
                icon: '',
            }));
            sessionStorage.setItem('dwellium-terminal-initial-tab', 'terminal');
            sessionStorage.setItem('dwellium-terminal-initial-cmd', cmd);
        } catch (e) { /* ignore */ }
        const popupW = Math.min(800, screen.availWidth * 0.5);
        const popupH = Math.min(600, screen.availHeight * 0.7);
        const left = Math.round((screen.availWidth - popupW) / 2);
        const top = Math.round((screen.availHeight - popupH) / 4);
        window.open(
            `/?popup=terminal`,
            `qualia-popup-terminal-${cmd}`,
            `width=${popupW},height=${popupH},left=${left},top=${top},resizable=yes,scrollbars=no`
        );
    };
    const closeTab = (key: string) => {
        setTabs((t) => {
            const next = t.filter((x) => x.key !== key);
            setActiveKey((cur) => (cur === key ? (next.length ? next[next.length - 1].key : null) : cur));
            return next;
        });
    };

    const q = query.trim().toLowerCase();
    const filterCard = (label: string) => !q || label.toLowerCase().includes(q);

    return (
        <div className="hos" role="dialog" aria-label="Halocron OS">
            <nav className="hos-rail">
                <div className="hos-brand"><span className="hos-brand__rune">◈</span><span>Halocron</span></div>
                {NAV.map((n) => (
                    <button key={n.id} type="button"
                        className={`hos-nav ${nav === n.id ? 'on' : ''}`}
                        onClick={() => { setNav(n.id); setActiveKey(null); }} aria-current={nav === n.id}>
                        <span className="hos-nav__g" aria-hidden="true">{n.glyph}</span>{n.label}
                    </button>
                ))}
                <div className="hos-agents">
                    <div className="hos-agents__h">AGENTS</div>
                    {KG_AGENTS.map((a) => (
                        <button key={a.id} type="button" className="hos-agent"
                            onClick={() => { const wid = AGENT_WIDGET[a.id]; if (wid && WINDOW_COMPONENTS[wid]) openWidget(wid, a.name); else { setNav('kg'); setActiveKey(null); } }}
                            title={`Open ${a.name}`}>
                            <span className="hos-agent__orb" style={{ background: a.color }} />
                            <span className="hos-agent__name">{a.name}</span>
                            <span className={`hos-agent__dot ${a.online ? 'on' : ''}`} />
                        </button>
                    ))}
                </div>
                <div className="hos-rail__foot">
                    <button type="button" className="hos-min" onClick={() => halocronOsStore.setOpen(false)}>
                        ⤓ Minimize shell
                    </button>
                </div>
            </nav>

            <main className="hos-main">
                {/* ── Tab strip (classic-OS browser-tab logic) ── */}
                {tabs.length > 0 && (
                    <div className="hos-tabs">
                        {tabs.map((t) => (
                            <div key={t.key} className={`hos-tab ${activeKey === t.key ? 'on' : ''}`} onClick={() => setActiveKey(t.key)}>
                                {t.kind === 'web' && <span className="hos-tab__dot" style={{ background: t.color }} />}
                                <span className="hos-tab__label">{t.label}</span>
                                <button className="hos-tab__x" onClick={(e) => { e.stopPropagation(); closeTab(t.key); }} aria-label={`Close ${t.label}`}><X size={12} /></button>
                            </div>
                        ))}
                        <button className="hos-tab__home" onClick={() => setActiveKey(null)} title="Show Halocron home">＋</button>
                    </div>
                )}
                {/* Stage sits BELOW the tab strip; hosted panels (absolute) cover
                    only this region so they never overlap the tabs. */}
                <div className="hos-stage-wrap">
                {/* All tabs stay mounted; only the active one is visible (keeps state). */}
                {activeKey && tabs.map((t) => (
                    <div key={t.key} className="hos-hosted" style={{ display: activeKey === t.key ? 'flex' : 'none' }}>
                        <div className="hos-hosted__bar">
                            <button type="button" className="hos-hosted__back" onClick={() => setActiveKey(null)}>← Archive</button>
                            <span className="hos-hosted__title">{t.label}</span>
                            {t.kind === 'web' && t.url && <a className="hos-hosted__ext" href={t.url} target="_blank" rel="noopener noreferrer">Open in browser ↗</a>}
                            <span className="hos-layoutpill">HALOCRON OS</span>
                        </div>
                        {t.kind === 'web' ? (
                            <div className="hos-hosted__body hos-web">
                                <WebFrame url={t.url!} title={t.label} color={t.color} />
                            </div>
                        ) : (
                            <div className="hos-hosted__body hos-hosted__body--widget window__content" data-widget-id={t.id}>
                                <WidgetErrorBoundary widgetLabel={t.label} enabled surfaceErrors>
                                    <Suspense fallback={<div className="hos-hosted__loading">Igniting {t.label}…</div>}>
                                        {(() => { const C = t.id ? WINDOW_COMPONENTS[t.id] : null; return C ? <C /> : null; })()}
                                    </Suspense>
                                </WidgetErrorBoundary>
                            </div>
                        )}
                    </div>
                ))}
                <header className="hos-head">
                    <span className="hos-crumb">archive / {nav}</span>
                    <span className="hos-layoutpill">HALOCRON OS</span>
                </header>

                {nav === 'kg' ? (
                    <div className="hos-panel hos-panel--kg">
                        <HalocronKnowledgeGraph />
                    </div>
                ) : nav === 'memory' ? (
                    <div className="hos-panel hos-panel--memory">
                        <div className="hos-memory-layout">
                            <div className="hos-memory-main">
                                <h1 className="hos-h">Memory</h1>
                                <p className="hos-sub">Your stored knowledge and connections.</p>
                                <div className="hos-quick">
                                    <button type="button" className="hos-step" onClick={() => setNav('kg')}>Open the Knowledge Graph →</button>
                                    <button type="button" className="hos-step" onClick={() => openWidget('connections', 'Connections & Memory')}>Open Connections →</button>
                                    <button type="button" className="hos-step" onClick={() => openWidget('honcho', 'Honcho Memory')}>Open Honcho →</button>
                                </div>
                            </div>
                            <div className="hos-memory-sidebar">
                                <div className="hos-memory-sidebar-h">Cognitive Parameter Harness</div>
                                <CognitiveHarness />
                            </div>
                        </div>
                    </div>
                ) : (
                <div className="hos-panel">
                    {nav === 'home' && (
                        <>
                            <div className="hos-home__top">
                                <div>
                                    <h1 className="hos-h hos-home__greet">{greeting}, Ilya. <span className="hos-home__glance">Today at a glance.</span></h1>
                                    <p className="hos-sub">Currently in your archive · {totalWidgets} holocrons · {SPACES.length} spaces</p>
                                </div>
                                <div className="hos-seg hos-home__range">
                                    {([['today', 'Today'], ['7', '7 Days'], ['28', '28 Days']] as [RangeId, string][]).map(([id, label]) => (
                                        <button key={id} className={range === id ? 'on' : ''} onClick={() => setRange(id)}>{label}</button>
                                    ))}
                                </div>
                            </div>

                            <div className="hos-glance">
                                <button type="button" className="hos-glance__card hos-glance__card--spend" onClick={editPlans} title="Click to edit your real plans">
                                    <div className="hos-glance__cap">AI SPEND</div>
                                    <div className="hos-glance__val">{fmt(totalSpend)}</div>
                                    <div className="hos-glance__sub">{fmt(flatMonthly)} subscriptions + {fmt(tokenSpend)} tokens ({RANGE_LABEL[range]}) · click to edit</div>
                                </button>
                                <div className="hos-glance__card hos-glance__card--save">
                                    <div className="hos-glance__cap">TOKENS · EST</div>
                                    <div className="hos-glance__val">{fmt(tokenSpend)}</div>
                                    <div className="hos-glance__sub">{calls.toLocaleString()} LLM calls · {RANGE_LABEL[range]} · from usage ledger</div>
                                </div>
                                <div className="hos-glance__card hos-glance__card--act">
                                    <div className="hos-glance__cap">ACTIVITY</div>
                                    <div className="hos-glance__val">{calls.toLocaleString()}</div>
                                    <div className="hos-glance__sub">{calls.toLocaleString()} turns · {RANGE_LABEL[range]} · {totalWidgets} widgets</div>
                                </div>
                            </div>

                            <div className="hos-launch__h">Launchpad · your AI tools in one place</div>
                            <div className="hos-launch">
                                {LAUNCH_TOOLS.map((t) => {
                                    const cli = CLI_TOOLS[t.id];
                                    const hasGoogleKey = !!(integrations?.llm?.gemini?.enabled && integrations?.llm?.gemini?.apiKey);
                                    const sub = (t.id === 'antigravity' && hasGoogleKey) ? 'Google · Max plan' : t.sub;
                                    const handleLaunch = () => {
                                        cli ? openCliTool(cli.label, cli.cmd) : openWeb(t);
                                    };
                                    const handleExternal = () => {
                                        if (cli) {
                                            openCliToolExternal(cli.label, cli.cmd);
                                        } else {
                                            window.open(t.url, '_blank', 'noopener,noreferrer');
                                        }
                                    };
                                    return (
                                        <div key={t.id} className="hos-launch__card" onClick={handleLaunch}
                                            title={cli ? `Run ${cli.label} in a terminal` : `Open ${t.name} in Halocron`}>
                                            <span className="hos-launch__glyph" style={{ color: t.color, borderColor: t.color }}>{t.glyph}</span>
                                            <span className="hos-launch__body">
                                                <span className="hos-launch__name">{t.name}</span>
                                                <span className="hos-launch__sub">{sub}</span>
                                            </span>
                                            <div className="hos-launch__actions" onClick={(e) => e.stopPropagation()}>
                                                <button type="button" className="hos-launch__open-btn" onClick={handleLaunch} title="Open inside OS">
                                                    Open
                                                </button>
                                                <button type="button" className="hos-launch__popout-btn" onClick={handleExternal} title="Open in separate window">
                                                    Popout ↗
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="hos-quick">
                                <button className="hos-step" onClick={() => setNav('kg')}>Open the Knowledge Graph →</button>
                                <button className="hos-step" onClick={() => setNav('apps')}>Open the Apps archive →</button>
                                <button className="hos-step" onClick={() => setNav('workspace')}>Ignite a Space →</button>
                            </div>
                        </>
                    )}

                    {nav === 'apps' && (
                        <>
                            <h1 className="hos-h">Apps · the full archive</h1>
                            <p className="hos-sub">All {totalWidgets} holocrons. Select one to open it here, inside the OS.</p>
                            <input className="hos-search" placeholder="Search the archive…" value={query}
                                onChange={(e) => setQuery(e.target.value)} aria-label="Search widgets" />
                            {CATEGORY_ORDER.filter((c) => grouped[c]?.some((w) => filterCard(w.label))).map((cat) => (
                                <section key={cat} className="hos-cat">
                                    <div className="hos-cat__h">{CATEGORY_LABEL[cat]}</div>
                                    <div className="hos-grid">
                                        {grouped[cat].filter((w) => filterCard(w.label)).map((w) => {
                                            const Icon = getIcon(w.icon);
                                            return (
                                                <button key={w.id} type="button" className="hos-app"
                                                    onClick={() => openWidget(w.id, w.label)} aria-label={`Open ${w.label}`}>
                                                    <span className="hos-app__icon">{Icon ? <Icon size={20} /> : '◈'}</span>
                                                    <span className="hos-app__label">{w.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </>
                    )}

                    {nav === 'workspace' && <HalocronWorkspaces />}

                    {nav === 'skills' && (
                        <>
                            <h1 className="hos-h">Skills</h1>
                            <p className="hos-sub">Bound abilities. Open the lab to manage or invoke them.</p>
                            <div className="hos-quick">
                                <button className="hos-step" onClick={() => openWidget('agent-lab', 'Agent Lab')}>Open Agent Lab →</button>
                                <button className="hos-step" onClick={() => openWidget('builder-agents', 'Builder Agents')}>Open Builder Agents →</button>
                            </div>
                        </>
                    )}

                    {nav === 'dream' && (
                        <>
                            <h1 className="hos-h">When should we Dream?</h1>
                            <p className="hos-sub">Nightly, we read your day and write the morning brief.</p>
                            <div className="hos-quick">
                                <button className="hos-step" onClick={() => openWidget('automation-hub', 'Automation Hub')}>Open the scheduler →</button>
                                <button className="hos-step" onClick={() => openWidget('mission-control', 'Mission Control')}>Open Mission Control →</button>
                            </div>
                        </>
                    )}

                    {nav === 'insights' && (
                        <>
                            <h1 className="hos-h">Insights</h1>
                            <p className="hos-sub">What the archive is costing and learning.</p>
                            <div className="hos-quick">
                                <button className="hos-step" onClick={() => openWidget('ai-spend', 'AI Spend')}>Open AI Spend →</button>
                                <button className="hos-step" onClick={() => openWidget('system-health', 'System Health')}>Open System Health →</button>
                            </div>
                        </>
                    )}

                    {nav === 'settings' && (
                        <>
                            <h1 className="hos-h">Settings</h1>
                            <p className="hos-sub">Same Dwellium, two layouts. Switch the whole shell here.</p>
                            <div className="hos-card hos-layout-toggle">
                                <div className="hos-card__cap">INTERFACE LAYOUT</div>
                                <div className="hos-seg">
                                    <button type="button" onClick={() => halocronOsStore.setEnabled(false)}>Classic desktop</button>
                                    <button type="button" className="on">Halocron OS</button>
                                </div>
                                <p className="hos-note">Same windows, widgets, spaces and memory — reskinned and re-navigated. Toggle anytime; nothing is lost.</p>
                            </div>
                            <div className="hos-quick">
                                <button className="hos-step" onClick={() => openWidget('control-panel', 'Control Panel')}>Open full Control Panel →</button>
                            </div>
                        </>
                    )}
                </div>
                )}
                </div>{/* /hos-stage-wrap */}
            </main>
        </div>
    );
}
