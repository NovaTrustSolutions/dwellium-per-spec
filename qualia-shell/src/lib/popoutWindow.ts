/**
 * popoutWindow.ts — the ONE shared "open this widget in its own real browser
 * window" helper. Every shell (Classic Desktop, Holocron OS, Cockpit) routes
 * tear-offs and ⧉ buttons through here.
 *
 * The popup renders via the existing `/?popup=<id>` route (App.tsx Branch 2 →
 * PopupShell). Same-origin popups share localStorage + per-user stores, so
 * store-backed widget state follows into the popup automatically.
 *
 * IMPORTANT: window.open() must be called synchronously inside the user
 * gesture handler (click / dragend / mouseup) — popup blockers kill anything
 * opened after an await. This helper is fully synchronous.
 */
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

export interface PopoutOptions {
    /** Titlebar/document title override (default: registry label). */
    title?: string;
    /** Icon key stored for the popup titlebar. */
    icon?: string;
    /** Preferred size (still clamped to registry mins and the screen). */
    width?: number;
    height?: number;
}

/** Sane defaults when the registry entry has no mins. */
const DEFAULT_W = 800;
const DEFAULT_H = 600;

/** Exported for tests. Builds the window.open features string. */
export function buildPopoutFeatures(widgetId: string, opts: PopoutOptions = {}): string {
    const reg = WIDGET_REGISTRY[widgetId];
    const availW = (typeof screen !== 'undefined' && screen.availWidth) || 1280;
    const availH = (typeof screen !== 'undefined' && screen.availHeight) || 800;
    const width = Math.min(
        Math.max(opts.width ?? 0, reg?.minWidth ?? 0, DEFAULT_W),
        Math.round(availW * 0.9),
    );
    const height = Math.min(
        Math.max(opts.height ?? 0, reg?.minHeight ?? 0, DEFAULT_H),
        Math.round(availH * 0.85),
    );
    // Position near the current window (centered over it), clamped on-screen.
    const baseX = window.screenX || 0;
    const baseY = window.screenY || 0;
    const hostW = window.outerWidth || availW;
    const hostH = window.outerHeight || availH;
    const left = Math.max(0, Math.round(baseX + (hostW - width) / 2));
    const top = Math.max(0, Math.round(baseY + (hostH - height) / 3));
    return `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=no`;
}

/**
 * Open `widgetId` in its own browser window.
 *
 * Returns true when the popup opened; false when the id is unknown or the
 * popup blocker refused it. Callers must handle `false` honestly (keep the
 * in-shell tab/window and show a notice — the control stays clickable as the
 * retry path once the user allows popups).
 */
export function openWidgetPopout(widgetId: string, opts: PopoutOptions = {}): boolean {
    const reg = WIDGET_REGISTRY[widgetId];
    if (!reg) return false;

    // Metadata PopupShell reads for its titlebar + document.title.
    try {
        localStorage.setItem(`dwellium-popup-${widgetId}`, JSON.stringify({
            component: widgetId,
            title: opts.title || reg.label,
            icon: opts.icon ?? reg.icon ?? '',
        }));
    } catch { /* sandboxed storage — popup falls back to registry label */ }

    const features = buildPopoutFeatures(widgetId, opts);
    // Unique name per call → the same widget can be popped out twice.
    const nonce = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const popup = window.open(`/?popup=${widgetId}`, `dwellium-popout-${widgetId}-${nonce}`, features);
    return Boolean(popup);
}

/** Shared blocked-popup notice (existing qualia-toast bus). */
export function notifyPopoutBlocked(): void {
    window.dispatchEvent(new CustomEvent('qualia-toast', {
        detail: 'Pop-out blocked — allow popups for this site, then click ⧉ again',
    }));
}
