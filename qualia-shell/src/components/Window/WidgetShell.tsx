/**
 * WidgetShell — the single host wrapper every widget renders inside
 * (assessment sweep 2026-06-12; STRUCTURAL FIX same day). Installed in
 * Window.tsx's content slot, it delivers the Widget Enhancement Layer to all
 * 48 registered widgets:
 *
 *   Functional (C3):
 *     1 error boundary (WidgetErrorBoundary) · 4 surface errors · 5 crash
 *     recovery — via the boundary.
 *     3 perf telemetry — logs slow first-mount.
 *     6 escape-to-close · 7 auto-focus-on-open — opt-in (default OFF).
 *     8 reduced-motion — reflected as a data-attr for CSS.
 *     9 mount fade-in — additive CSS class.
 *
 *   UI (C4): the `we-*` classes, consumed by widgetShell.css.
 *
 * 🔴 ZERO-DOM CONTRACT (the structural fix): this component renders NO
 * elements of its own. The original version wrapped children in a div (and
 * the boundary added another), which broke every `.window__content > X`
 * direct-child CSS contract in global.css (23 selectors) + the
 * `:has(> .ara-console)` flex rules in Window.css — widget roots collapsed to
 * 0 height (blank ARA video, dead widgets). Enhancement classes are instead
 * applied by Window.tsx DIRECTLY on `.window__content` via
 * useWidgetEnhancementFlags() + enhancementClasses(); the error boundary
 * renders a keyed Fragment when healthy. The widget root stays the literal
 * first DOM child of `.window__content`, byte-for-byte as before the sweep.
 */

import { useEffect, useRef, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { widgetEnhancementsStore, type WidgetEnhancementFlags } from '../../lib/widgetEnhancementsStore';
import WidgetErrorBoundary from './WidgetErrorBoundary';
import './widgetShell.css';

/** Subscribe to the enhancement flags (useSyncExternalStore-shaped store). */
export function useWidgetEnhancementFlags(): WidgetEnhancementFlags {
    return useSyncExternalStore(
        widgetEnhancementsStore.subscribe,
        widgetEnhancementsStore.getSnapshot,
        widgetEnhancementsStore.getServerSnapshot,
    );
}

/**
 * The flag-gated class list for the window content host. Applied by
 * Window.tsx to `.window__content` itself — NOT to a wrapper element
 * (zero-DOM contract above).
 */
export function enhancementClasses(flags: WidgetEnhancementFlags): string {
    return [
        flags.mountFadeIn ? 'widget-shell--fade' : '',
        flags.uiDensity ? 'we-density' : '',
        flags.uiScrollbars ? 'we-scrollbars' : '',
        flags.uiFocusRings ? 'we-focus-rings' : '',
        flags.uiFontClamp ? 'we-font-clamp' : '',
        flags.uiMinSizeGuard ? 'we-min-guard' : '',
        flags.uiSelectionColor ? 'we-selection' : '',
        flags.uiScrollGutter ? 'we-gutter' : '',
        flags.uiMotionSafe || flags.reducedMotion ? 'we-motion-safe' : '',
    ].filter(Boolean).join(' ');
}

export interface WidgetShellProps {
    widgetId: string;
    widgetLabel: string;
    /** Closes the owning window (for escape-to-close). */
    onRequestClose?: () => void;
    /** True when this window currently has focus (gates Esc handling). */
    isFocused?: boolean;
    /** The `.window__content` element (owned by Window.tsx) — used for
     *  auto-focus-on-open. Optional: effects degrade gracefully without it. */
    contentRef?: RefObject<HTMLDivElement | null>;
    children: ReactNode;
}

const PERF_WARN_MS = 400; // first-mount slower than this gets a debug log

export default function WidgetShell({
    widgetId,
    widgetLabel,
    onRequestClose,
    isFocused,
    contentRef,
    children,
}: WidgetShellProps) {
    const flags = useWidgetEnhancementFlags();
    const mountStart = useRef<number>(Date.now());

    // #3 perf telemetry — log first-mount cost once.
    useEffect(() => {
        if (!flags.perfTelemetry) return;
        const cost = Date.now() - mountStart.current;
        if (cost > PERF_WARN_MS) {
            // eslint-disable-next-line no-console
            console.debug(`[widget:${widgetId}] slow mount ${cost}ms`);
        }
        // mount-only
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // #7 auto-focus first focusable on open (opt-in).
    useEffect(() => {
        if (!flags.autoFocusOnOpen) return;
        const el = contentRef?.current?.querySelector<HTMLElement>(
            'input, textarea, button, [tabindex]:not([tabindex="-1"]), a[href]',
        );
        el?.focus();
        // mount-only
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // #6 escape-to-close (opt-in; only the focused window responds).
    useEffect(() => {
        if (!flags.escapeToClose || !onRequestClose) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || !isFocused) return;
            // Don't steal Escape from an active text field / dialog.
            const active = document.activeElement as HTMLElement | null;
            const tag = active?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || active?.isContentEditable) return;
            onRequestClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [flags.escapeToClose, onRequestClose, isFocused]);

    // ZERO-DOM: the boundary is the only thing rendered, and its healthy path
    // is a keyed Fragment — children stay direct DOM children of
    // `.window__content`.
    return (
        <WidgetErrorBoundary
            widgetLabel={widgetLabel}
            enabled={flags.errorBoundary}
            surfaceErrors={flags.surfaceErrors}
        >
            {children}
        </WidgetErrorBoundary>
    );
}
