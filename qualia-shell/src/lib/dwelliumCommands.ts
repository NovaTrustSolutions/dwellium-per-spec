/**
 * dwelliumCommands — the Conductor's tool registry + a talk-to-customize intent
 * parser (proposal §1 + §4). React-free: tools dispatch events or call stores,
 * so the ⌘K palette AND ARA can drive the whole app through one surface.
 *
 * Tools: openWidget · switchSpace · saveSpace · setTheme · setAccent ·
 * setAnimations · tileWindows · spawnAgent · recall · remember.
 * `parseCommand` maps plain English ("switch to research", "make accent teal",
 * "save space Morning", "open strata") to a runnable command.
 */
import type { Theme } from '../data/types';
import { applyThemeValue, applyAccentValue, applyAnimationsValue } from '../context/ThemeContext';
import { spacesStore, saveCurrentAsSpace, type DwelliumSpace } from './spacesStore';
import { recall, remember, type MemoryHit } from './unifiedMemory';

const VALID_THEMES: Theme[] = ['dark', 'light', 'trust', 'vibrant', 'luxury', 'healthcare', 'creative', 'dark-excellence', 'cosmos', 'deep-dark', 'simple-black', 'cyberpunk', 'synthwave', 'solarized', 'rose-pine', 'mocha', 'dracula', 'obsidian', 'tokyo-night', 'gruvbox', 'apple-dark', 'nord', 'latte', 'corporate'];

const COLOR_NAMES: Record<string, string> = {
    teal: '#14b8a6', blue: '#3b82f6', sky: '#0ea5e9', green: '#22c55e', lime: '#D6FE51',
    amber: '#f59e0b', orange: '#f97316', red: '#ef4444', pink: '#ec4899', purple: '#a855f7',
    violet: '#8b5cf6', indigo: '#6366f1', cyan: '#06b6d4', gold: '#ffb454', white: '#e8e8e8',
    gray: '#808080', grey: '#808080', black: '#0c0c0c',
};

/** Common spoken names → registry component ids. */
const WIDGET_ALIASES: Record<string, string> = {
    scribe: 'scribe', editor: 'scribe', docs: 'doc-viewer', 'doc viewer': 'doc-viewer', notepad: 'notepad', notes: 'notepad',
    strata: 'strata-dashboard', 'strata dashboard': 'strata-dashboard', astra: 'astra-dashboard', 'astra dashboard': 'astra-dashboard',
    'tenant portal': 'tenant-portal-mgmt', tenant: 'tenant-portal-mgmt', tasks: 'task-board', 'task board': 'task-board', 'task menu': 'tasks', trello: 'trello-board',
    wiki: 'wiki', synthesis: 'synthesis', foundry: 'foundry', hive: 'hive', search: 'content-search',
    notebooklm: 'notebooklm-context', notebook: 'notebooklm-context', 'fact check': 'fact-check-log', factcheck: 'fact-check-log', transcribe: 'transcription', transcription: 'transcription',
    inbox: 'inbox', 'inbox zero': 'inbox', ara: 'ara-console', stella: 'stella-agent', honcho: 'honcho', hermes: 'honcho', hydra: 'hydra-ai', 'two brains': 'two-brains',
    'agent lab': 'agent-lab', agents: 'agent-lab', 'ai space': 'agent-lab', lab: 'agent-lab',
    terminal: 'terminal', automation: 'automation-hub', automations: 'automation-hub', 'universal shell': 'universal-shell', shell: 'universal-shell',
    'file manager': 'file-manager', files: 'file-explorer', 'file explorer': 'file-explorer', pdf: 'pdf-gear', 'pdf gear': 'pdf-gear',
    workspace: 'workspace', 'control panel': 'control-panel', settings: 'control-panel',
};

function dispatch(name: string, detail?: unknown): void {
    try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch { /* SSR / sandbox */ }
}
function toast(msg: string): void { dispatch('qualia-toast', msg); }

/** Resolve a spoken widget name to a registry component id, or null. */
export function resolveWidget(name: string): string | null {
    const n = name.trim().toLowerCase().replace(/^the\s+/, '').replace(/\s+widget$/, '');
    if (WIDGET_ALIASES[n]) return WIDGET_ALIASES[n];
    // direct component-id match (e.g. "strata-dashboard")
    if (/^[a-z][a-z0-9-]+$/.test(n) && Object.values(WIDGET_ALIASES).includes(n)) return n;
    return null;
}

// ── tool primitives ──
export function openWidget(componentId: string): void { dispatch('dwellium:open-widget', { widgetId: componentId }); }
export function spawnAgent(name: string): void { openWidget(WIDGET_ALIASES[name.trim().toLowerCase()] || 'ara-console'); }
export function tileWindows(components?: string[]): void { dispatch('dwellium:tile', { components: components ?? null }); toast('Arranged windows'); }

export function findSpace(q: string): DwelliumSpace | null {
    const spaces = spacesStore.getSnapshot();
    const t = q.trim().toLowerCase();
    return spaces.find(s => s.id === t || s.name.toLowerCase() === t)
        || spaces.find(s => s.name.toLowerCase().includes(t))
        || null;
}
export function switchSpace(idOrName: string): void {
    const sp = findSpace(idOrName);
    if (!sp) { toast(`No Space "${idOrName}"`); return; }
    dispatch('dwellium:apply-space', { widgets: sp.widgets });
    toast(`Switched to ${sp.name}`);
}
function currentOpenWidgets(): string[] {
    try {
        const raw = localStorage.getItem('dwellium-layout');
        if (raw) {
            const l = JSON.parse(raw) as { windows?: Array<{ component?: string; minimized?: boolean }> };
            return (l.windows || []).filter(w => !w.minimized && w.component).map(w => w.component as string);
        }
    } catch { /* ignore */ }
    return [];
}
export function saveSpace(name: string): void {
    const widgets = currentOpenWidgets();
    if (widgets.length === 0) { toast('No open widgets to save as a Space'); return; }
    saveCurrentAsSpace(name, widgets);
    toast(`Saved Space "${name}"`);
}
export function setTheme(name: string): boolean {
    const slug = name.trim().toLowerCase().replace(/\s+/g, '-');
    const resolved = VALID_THEMES.find(t => t === slug) ?? null;
    if (!resolved) { toast(`Unknown theme "${name}"`); return false; }
    applyThemeValue(resolved);
    toast(`Theme → ${resolved}`);
    return true;
}
export function setAccent(color: string): boolean {
    const c = color.trim().toLowerCase();
    const hex = /^#?[0-9a-f]{6}$/.test(c) ? (c.startsWith('#') ? c : `#${c}`) : COLOR_NAMES[c];
    if (!hex) { toast(`Unknown color "${color}"`); return false; }
    applyAccentValue(hex);
    toast(`Accent → ${hex}`);
    return true;
}
export function setAnimations(on: boolean): void { applyAnimationsValue(on); toast(`Animations ${on ? 'on' : 'off'}`); }
export function recallMemory(q: string): MemoryHit[] { return recall(q); }
export function rememberMemory(text: string): void { remember(text); toast('Remembered'); }

// ── spatial + window tools (talk-to-customize, proposal §4) ──
/** Spoken region → the region layout + region id that contains it. */
const REGION_MAP: Record<string, { layout: string; id: string }> = {
    left: { layout: 'halves-h', id: 'left' },
    right: { layout: 'halves-h', id: 'right' },
    top: { layout: 'halves-v', id: 'top' },
    bottom: { layout: 'halves-v', id: 'bottom' },
    center: { layout: 'thirds-h', id: 'center' },
    middle: { layout: 'thirds-h', id: 'center' },
    'top left': { layout: 'quadrants', id: 'tl' }, 'top-left': { layout: 'quadrants', id: 'tl' },
    'top right': { layout: 'quadrants', id: 'tr' }, 'top-right': { layout: 'quadrants', id: 'tr' },
    'bottom left': { layout: 'quadrants', id: 'bl' }, 'bottom-left': { layout: 'quadrants', id: 'bl' },
    'bottom right': { layout: 'quadrants', id: 'br' }, 'bottom-right': { layout: 'quadrants', id: 'br' },
};

/** Open `componentId` and dock it into a named region (left/right/top/quadrant). */
export function placeWidget(componentId: string, region: string): void {
    const r = REGION_MAP[region.trim().toLowerCase()] ?? REGION_MAP.left;
    dispatch('dwellium:place-widget', { widgetId: componentId, regionId: r.id, layout: r.layout });
}

/** Open the given widgets and stack them as browser-style tabs in one region. */
export function groupWidgets(componentIds: string[]): void {
    if (componentIds.length === 0) return;
    dispatch('dwellium:apply-space', { widgets: componentIds, mode: 'tabbed' });
    toast(`Grouped ${componentIds.length} into tabs`);
}

export function closeWidget(componentId: string): void { dispatch('dwellium:close-widget', { widgetId: componentId }); }
export function minimizeWidget(componentId: string): void { dispatch('dwellium:minimize-widget', { widgetId: componentId }); }
export function maximizeWidget(componentId: string): void { dispatch('dwellium:maximize-widget', { widgetId: componentId }); }

/** Resolve a comma/and-separated widget list ("strata, scribe and inbox") to ids. */
function resolveWidgetList(s: string): string[] {
    return s.split(/\s*(?:,|&|\band\b)\s*/i)
        .map(part => resolveWidget(part))
        .filter((id): id is string => !!id);
}

// ── intent parser ──
export interface ParsedCommand {
    label: string;
    run: () => void;
}

const REGION_WORDS = 'top left|top right|bottom left|bottom right|top-left|top-right|bottom-left|bottom-right|top|bottom|left|right|center|middle';

/** Parse a SINGLE imperative ("open strata", "put scribe on the right"). */
function parseSingle(input: string): ParsedCommand | null {
    const s = input.trim();
    if (!s) return null;
    const l = s.toLowerCase();
    let m: RegExpMatchArray | null;

    // theme
    if (l === 'dark mode' || l === 'dark') return { label: 'Theme → dark', run: () => setTheme('dark') };
    if (l === 'light mode' || l === 'light') return { label: 'Theme → light', run: () => setTheme('light') };
    if ((m = l.match(/^(?:switch |set |change )?(?:the )?theme(?: to)?\s+(.+)$/))) {
        const name = m[1]; return { label: `Theme → ${name}`, run: () => setTheme(name) };
    }
    // accent
    if ((m = l.match(/^(?:make |set |change )?(?:the )?accent(?: color)?(?: to)?\s+(.+)$/))) {
        const name = m[1]; return { label: `Accent → ${name}`, run: () => setAccent(name) };
    }
    // animations
    if (/\banimations?\b.*\b(off|disable|stop)\b/.test(l)) return { label: 'Animations off', run: () => setAnimations(false) };
    if (/\banimations?\b.*\b(on|enable|start)\b/.test(l)) return { label: 'Animations on', run: () => setAnimations(true) };
    // save space
    if ((m = s.match(/^save\s+space\s+(.+)$/i)) || (m = s.match(/^save (?:this|the)?\s*(?:canvas|layout)?\s*as\s+(.+)$/i))) {
        const name = m[1].trim(); return { label: `Save Space "${name}"`, run: () => saveSpace(name) };
    }
    // remember
    if ((m = s.match(/^remember\s+(?:that\s+)?(.+)$/i))) {
        const text = m[1].trim(); return { label: `Remember: ${text.slice(0, 40)}`, run: () => rememberMemory(text) };
    }
    // place / dock one or more widgets into named regions
    // ("put strata on the left and scribe on the right")
    if ((m = l.match(/^(?:put|place|move|dock|send)\s+(.+)$/))) {
        const segRe = new RegExp(`^(.+?)\\s+(?:on|to|in|at|into)\\s+(?:the\\s+)?(${REGION_WORDS})$`);
        const placements: Array<{ id: string; region: string }> = [];
        for (const seg of m[1].split(/\s*(?:,\s*|;\s*|\band\b)\s*/i)) {
            const sm = seg.trim().match(segRe);
            if (sm) { const id = resolveWidget(sm[1]); if (id) placements.push({ id, region: sm[2] }); }
        }
        if (placements.length > 0) {
            const regions = placements.map(p => p.region).join(' + ');
            return { label: `Place → ${regions}`, run: () => placements.forEach(p => placeWidget(p.id, p.region)) };
        }
    }
    // group windows into tabs ("group strata and scribe into tabs")
    if ((m = l.match(/^(?:group|tab|stack)\s+(.+?)(?:\s+(?:in|into)\s+tabs?)?$/))) {
        const ids = resolveWidgetList(m[1]);
        if (ids.length >= 2) return { label: `Group ${ids.length} into tabs`, run: () => groupWidgets(ids) };
    }
    // close / minimize / maximize a widget ("close inbox", "maximize scribe")
    if ((m = l.match(/^(close|hide|minimize|minimise|maximize|maximise|expand)\s+(.+)$/))) {
        const id = resolveWidget(m[2]); const verb = m[1];
        if (id) {
            if (verb === 'close') return { label: `Close ${m[2]}`, run: () => closeWidget(id) };
            if (verb === 'maximize' || verb === 'maximise' || verb === 'expand') return { label: `Maximize ${m[2]}`, run: () => maximizeWidget(id) };
            return { label: `Minimize ${m[2]}`, run: () => minimizeWidget(id) };
        }
    }
    // tile / arrange / group (bare)
    if (/^(tile|arrange|group)(?:\s+windows?)?$/.test(l)) return { label: 'Arrange windows', run: () => tileWindows() };
    // switch space ("switch to research", "research space", "go to comms")
    if ((m = l.match(/^(?:switch|go|jump)\s+to\s+(?:the\s+)?(.+?)(?:\s+space)?$/)) || (m = l.match(/^(.+?)\s+space$/))) {
        const name = m[1].trim();
        if (findSpace(name)) return { label: `Switch to ${name}`, run: () => switchSpace(name) };
    }
    // spawn agents / a specialist team → open the Agent Lab (the AI space)
    if ((/^(?:spawn|assemble)\b/.test(l) && /\b(team|agent|agents|squad|crew|persona)\b/.test(l)) || l === 'agent lab' || l === 'agents') {
        return { label: 'Open Agent Lab', run: () => openWidget('agent-lab') };
    }
    // open widget ("open strata", "show inbox", "launch terminal")
    if ((m = l.match(/^(?:open|show|launch|start)\s+(.+)$/))) {
        const id = resolveWidget(m[1]);
        if (id) { return { label: `Open ${m[1]}`, run: () => openWidget(id) }; }
    }
    return null;
}

/**
 * Parse plain English into a runnable command. Supports COMPOUND requests by
 * chaining clauses split on "and" / "," / "then" / ";" — e.g.
 *   "put strata on the left and scribe on the right and save space Morning"
 * runs all three in order. The whole input is tried as one command FIRST so
 * intentional multi-word commands ("group strata and scribe") aren't split.
 */
export function parseCommand(input: string): ParsedCommand | null {
    const s = input.trim();
    if (!s) return null;

    // Verbs whose argument legitimately contains "and" / commas — parse whole,
    // never split (group lists, free-text memory, space names, multi-placement).
    if (/^(?:group|tab|stack|remember|save|put|place|move|dock|send)\b/i.test(s)) {
        return parseSingle(s);
    }

    // Compound: split on connectors and chain ("make accent teal and go to research").
    const parts = s
        .split(/\s*(?:,\s*then\s+|;\s*|\s+then\s+|\s+and\s+|,)\s*/i)
        .map(p => p.trim())
        .filter(Boolean);
    if (parts.length >= 2) {
        const cmds = parts.map(parseSingle).filter((c): c is ParsedCommand => !!c);
        if (cmds.length >= 2) {
            return { label: cmds.map(c => c.label).join(' · '), run: () => cmds.forEach(c => c.run()) };
        }
        if (cmds.length === 1) return cmds[0];
    }
    return parseSingle(s);
}
