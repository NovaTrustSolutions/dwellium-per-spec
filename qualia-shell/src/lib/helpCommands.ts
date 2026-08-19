/**
 * helpCommands — plan 047 §6 ⌘K help rows. React-free, pure builder so the
 * palette stays thin and the rows are unit-testable.
 *
 *   "help:" / "?"  → Guide · Keyboard shortcuts · Tools hub · help: <widget>
 *                    (opens the widget AND re-arms its first-open tip)
 *   "labs:"        → every `labs`-tier widget (hidden from the sidebar by design)
 *
 * Each row runs through the same `ParsedCommand`-shaped `{label, run}` the
 * palette already executes for the COMMAND tier.
 */
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { openWidget } from './dwelliumCommands';
import { tierOf, unmarkTipSeen } from './onboardingStore';

export interface HelpRow {
    id: string;
    icon: string;
    title: string;
    subtitle: string;
    run: () => void;
}

/** Event WidgetTip listens for — forces the tip open on the named widget. */
export const SHOW_TIP_EVENT = 'dwellium:show-tip';

export function showWidgetTip(widgetId: string): void {
    unmarkTipSeen(widgetId);
    // Deferred so a freshly opened window's WidgetTip is mounted and listening.
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(SHOW_TIP_EVENT, { detail: { widgetId } })), 350);
}

const HELP_PREFIX = /^(help:|\?)\s*/i;
const LABS_PREFIX = /^labs:\s*/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const matches = (needle: string, ...hay: string[]) => !needle || hay.some(h => norm(h).includes(needle));

/** Pure: rows for a palette query, or [] when the query is not a help/labs query. */
export function buildHelpRows(query: string, email?: string | null): HelpRow[] {
    const q = query.trim();
    if (LABS_PREFIX.test(q)) {
        const rest = norm(q.replace(LABS_PREFIX, ''));
        return Object.values(WIDGET_REGISTRY)
            .filter(w => tierOf(w.id) === 'labs')
            .filter(w => !w.restrictedToEmails || (email && w.restrictedToEmails.includes(email.toLowerCase())))
            .filter(w => matches(rest, w.id, w.label, w.description))
            .map(w => ({ id: `labs:${w.id}`, icon: w.icon, title: `labs: ${w.label}`, subtitle: w.description, run: () => openWidget(w.id) }));
    }
    if (!HELP_PREFIX.test(q)) return [];
    const rest = norm(q.replace(HELP_PREFIX, ''));
    const statics: HelpRow[] = [
        { id: 'help:guide', icon: 'book-open', title: 'help: Guide', subtitle: WIDGET_REGISTRY['guide']?.description ?? 'Getting started', run: () => openWidget('guide') },
        { id: 'help:shortcuts', icon: 'settings', title: 'help: Keyboard shortcuts', subtitle: 'Every global hotkey (also on the ? key)', run: () => window.dispatchEvent(new CustomEvent('dwellium:open-shortcuts')) },
        { id: 'help:tools', icon: 'layout-grid', title: 'help: Tools hub', subtitle: WIDGET_REGISTRY['tools-hub']?.description ?? 'Open-source tools and their status', run: () => openWidget('tools-hub') },
    ].filter(r => matches(rest, r.title, r.subtitle));
    const widgets: HelpRow[] = Object.values(WIDGET_REGISTRY)
        .filter(w => w.tip && w.id !== 'guide' && w.id !== 'tools-hub')
        .filter(w => !w.restrictedToEmails || (email && w.restrictedToEmails.includes(email.toLowerCase())))
        .filter(w => rest ? matches(rest, w.id, w.label) : false) // bare "help:" lists only the statics
        .map(w => ({ id: `help:${w.id}`, icon: w.icon, title: `help: ${w.label}`, subtitle: w.description, run: () => { openWidget(w.id); showWidgetTip(w.id); } }));
    return [...statics, ...widgets];
}
