/**
 * welcomeBack — plan 055 phase 3: the one quiet toast after a session restore.
 *
 * The restore paths (WindowContext / HalocronOS / FluidOS) accumulate a
 * RestoreSummary inside sessionRestoreStore; Desktop calls
 * `fireWelcomeBackToast()` once after mount, which consumes the summary and —
 * only when something actually came back — fires the existing string-only
 * `qualia-toast` bus. Fresh login (no snapshot) → no summary → no toast.
 *
 * The toast bus carries strings only (verified in the popout work), so the
 * "Fresh start" escape is a ⌘K command + Control Panel row; the toast text
 * points at it.
 */
import { consumeRestoreSummary, type RestoreSummary } from './sessionRestoreStore';
import { readWidgetMemory } from './widgetMemory';

/** "the most human label available": Scribe's active file basename when a
 *  Scribe window/tab was restored, else the top-z restored window's title. */
export function pickRestoreLabel(summary: RestoreSummary, scribeActiveFile: string | null): string | null {
    if (scribeActiveFile && summary.components.includes('scribe')) {
        const base = scribeActiveFile.split('/').pop();
        if (base) return base;
    }
    return summary.topTitle;
}

export function buildWelcomeBackMessage(summary: RestoreSummary, scribeActiveFile: string | null): string | null {
    const { windows, tabs } = summary;
    if (windows === 0 && tabs === 0) return null;
    const count = windows > 0
        ? `${windows} window${windows === 1 ? '' : 's'}`
        : `${tabs} tab${tabs === 1 ? '' : 's'}`;
    const label = pickRestoreLabel(summary, scribeActiveFile);
    const where = label ? ` — you were in “${label}”` : '';
    return `Restored ${count}${where} · ⌘K → Fresh start for a clean desk`;
}

/**
 * Consume the pending restore summary and fire the toast (once per login).
 * Safe to call unconditionally — a fresh login has no summary and no-ops.
 */
export function fireWelcomeBackToast(): void {
    if (typeof window === 'undefined') return;
    const summary = consumeRestoreSummary();
    if (!summary) return;
    const scribeActiveFile = readWidgetMemory('scribe', { activeFilepath: null as string | null }).activeFilepath;
    const message = buildWelcomeBackMessage(summary, scribeActiveFile);
    if (!message) return;
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail: message }));
}
