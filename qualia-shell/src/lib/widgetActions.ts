/**
 * widgetActions — P11-7: the widget-action bus ("open Notepad and draft a
 * letter IN IT"). BACKLOG's "biggest single ease win": per-widget verbs that
 * ARA/skills/chains can invoke to act INSIDE widgets, not just open them.
 *
 * Transport: one generic `dwellium:widget-action` window event with
 * `{ widget, verb, payload }`, plus a per-widget pending-slot (sister to
 * spawn.ts) so an action fired before the target widget's lazy chunk mounts
 * is picked up on mount. `performWidgetAction` opens the widget first.
 *
 * Registry is intentionally small and extensible — widgets opt in by
 * registering a verb here and listening via `useWidgetActionListener`-style
 * effects (see Notepad). React-free module.
 */

export const WIDGET_ACTION_EVENT = 'dwellium:widget-action';

export interface WidgetActionPayload {
    text?: string;
    title?: string;
    [k: string]: unknown;
}

export interface WidgetActionRequest {
    widget: string;
    verb: string;
    payload: WidgetActionPayload;
}

export interface WidgetActionSpec {
    widget: string;
    verb: string;
    description: string;
}

/** Verbs widgets currently honor (extend as widgets opt in). */
export const WIDGET_ACTIONS: ReadonlyArray<WidgetActionSpec> = [
    { widget: 'notepad', verb: 'insert-text', description: 'Create a note containing the given text (title optional)' },
];

export function supportsWidgetAction(widget: string, verb: string): boolean {
    return WIDGET_ACTIONS.some(a => a.widget === widget && a.verb === verb);
}

/** The last widget the Conductor opened — resolves "…in IT" targets. */
export const lastOpenedWidgetHolder: { current: string | null } = { current: null };

// Per-widget pending slot (one action deep — last write wins, mount consumes).
const pending = new Map<string, WidgetActionRequest>();

/** Open the widget and deliver the action (event + mount-race pending slot). */
export function performWidgetAction(widget: string, verb: string, payload: WidgetActionPayload): boolean {
    if (!supportsWidgetAction(widget, verb)) return false;
    const req: WidgetActionRequest = { widget, verb, payload };
    pending.set(widget, req);
    try {
        window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: widget } }));
        window.dispatchEvent(new CustomEvent(WIDGET_ACTION_EVENT, { detail: req }));
    } catch { /* SSR / sandbox */ }
    return true;
}

/** One-shot mount-time pickup for a widget's pending action. */
export function consumePendingWidgetAction(widget: string): WidgetActionRequest | null {
    const req = pending.get(widget) ?? null;
    pending.delete(widget);
    return req;
}

/**
 * Resolve a compose target: explicit name wins; "it"/absent falls back to the
 * last Conductor-opened widget (when it supports the verb), else notepad.
 * Pure — unit-testable.
 */
export function resolveComposeTarget(explicit: string | null | undefined, lastOpened: string | null): string {
    const e = (explicit ?? '').trim().toLowerCase();
    if (e && e !== 'it' && supportsWidgetAction(e, 'insert-text')) return e;
    if (lastOpened && supportsWidgetAction(lastOpened, 'insert-text')) return lastOpened;
    return 'notepad';
}
