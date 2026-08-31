/**
 * araResumeContext — plan 055 phase 4: ARA opens knowing where the user
 * left off. Pure derivation, CLIENT-SIDE ONLY, from the two phase-1/2
 * stores (sessionRestoreStore + widgetMemory). No fetches, no new stores.
 *
 * DATA BOUNDARY: only the widget LABEL and the document BASENAME ever leave
 * this module — never file contents and never full file paths. The resume
 * prompt built here carries those same two strings only; ARA's existing
 * context pipeline supplies everything else server-side.
 */
import { readSessionSnapshot } from '../../lib/sessionRestoreStore';
import { readWidgetMemory } from '../../lib/widgetMemory';
import { WIDGET_REGISTRY } from '../../registry/widgetRegistry';

export interface ResumeContext {
    widgetId: string;
    widgetLabel: string;
    /** Active Scribe doc basename (never the full path). */
    docBasename?: string;
}

function basename(p: string): string {
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts[parts.length - 1] ?? p;
}

/**
 * The "last working on" target: the top-z restored Classic window, else the
 * active Holocron/Fluid tab. Null when nothing is restored (fresh account /
 * default stack) — the chip and starter simply don't render then.
 */
export function deriveResumeContext(): ResumeContext | null {
    const snap = readSessionSnapshot();
    if (!snap) return null;
    let widgetId: string | null = null;
    let widgetLabel: string | null = null;
    if (snap.classic.length > 0) {
        const top = snap.classic.reduce((a, b) => (b.zIndex > a.zIndex ? b : a));
        widgetId = top.component;
        widgetLabel = WIDGET_REGISTRY[top.component]?.label ?? top.title ?? top.component;
    } else {
        widgetId = snap.halocron.active ?? snap.fluid.active;
        if (widgetId) widgetLabel = WIDGET_REGISTRY[widgetId]?.label ?? widgetId;
    }
    if (!widgetId || !widgetLabel) return null;
    const ctx: ResumeContext = { widgetId, widgetLabel };
    if (widgetId === 'scribe') {
        const mem = readWidgetMemory('scribe', { activeFilepath: null as string | null });
        if (typeof mem.activeFilepath === 'string' && mem.activeFilepath) {
            ctx.docBasename = basename(mem.activeFilepath);
        }
    }
    return ctx;
}

export const RESUME_STARTER_LABEL = 'Pick up where I left off';

/** The grounded starter prompt — label/basename only (see DATA BOUNDARY above). */
export function buildResumePrompt(ctx: ResumeContext): string {
    return ctx.docBasename
        ? `I was last working on ${ctx.docBasename} in ${ctx.widgetLabel}. Give me a quick re-orientation: what this document is, and suggest the next 2–3 concrete actions to continue.`
        : `I was last working in ${ctx.widgetLabel}. Give me a quick re-orientation: what I was doing there, and suggest the next 2–3 concrete actions to continue.`;
}

/* Chip dismissal lives for the SPA session only — a fresh login/reload
   re-offers the chip. ponytail: module boolean, upgrade to sessionStorage if
   the chip must survive a reload-without-restore. */
let chipDismissed = false;
export const isResumeChipDismissed = (): boolean => chipDismissed;
export const dismissResumeChip = (): void => { chipDismissed = true; };
/** Test escape hatch (v2.72.1 sister convention). */
export const resetResumeChip = (): void => { chipDismissed = false; };
