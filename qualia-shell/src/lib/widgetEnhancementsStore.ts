/**
 * widgetEnhancementsStore — master toggles for the Widget Enhancement Layer
 * (assessment sweep 2026-06-12). Because every widget renders through
 * Window.tsx's `window__content`, ONE wrapper there + ONE CSS class lets all
 * 48 registered widgets inherit the same 10 functional + 10 UI improvements —
 * each independently switchable, so the whole layer is reversible at runtime.
 *
 * Defaults: every flag ON except the two with any behavioral risk
 * (`escapeToClose`, `autoFocusOnOpen`) which default OFF so the baseline
 * interaction model is byte-for-byte unchanged until the user opts in.
 *
 * useSyncExternalStore-shaped + `.reset()` per the repo factory convention.
 * Persisted to localStorage (NOT One Save — this is a per-device UI prefs
 * surface, like theme; keeps the object store clean).
 */

export interface WidgetEnhancementFlags {
    // ── Functional layer (C3) ──
    /** 1. Error boundary with retry — a crashing widget shows a recover card
     *     instead of blanking/--white-screening the desktop. */
    errorBoundary: boolean;
    /** 2. Standard loading skeleton while the lazy chunk resolves. */
    loadingSkeleton: boolean;
    /** 3. Mount-time perf telemetry (console.debug on slow mounts). */
    perfTelemetry: boolean;
    /** 4. Surface the last caught error inline (paired with #1). */
    surfaceErrors: boolean;
    /** 5. Crash-recovery remount (retry resets the boundary cleanly). */
    crashRecovery: boolean;
    /** 6. Esc closes the focused widget (OFF by default — behavior change). */
    escapeToClose: boolean;
    /** 7. Auto-focus first focusable on open (OFF by default — behavior change). */
    autoFocusOnOpen: boolean;
    /** 8. Respect prefers-reduced-motion for shell animations. */
    reducedMotion: boolean;
    /** 9. Content fade-in on mount (purely additive). */
    mountFadeIn: boolean;
    /** 10. AI degraded-state contract surfaced to widgets (C2 wiring). */
    aiContract: boolean;

    // ── UI layer (C4) ──
    /** 1. Consistent content padding/density token. */
    uiDensity: boolean;
    /** 2. Themed custom scrollbars inside widget content. */
    uiScrollbars: boolean;
    /** 3. Visible focus rings on interactive elements (a11y). */
    uiFocusRings: boolean;
    /** 4. Consistent hover/active affordance on shell controls. */
    uiHoverAffordance: boolean;
    /** 5. Font-scale safety clamp (prevents layout-setting overrides breaking chrome). */
    uiFontClamp: boolean;
    /** 6. Min-size content guard (no zero-collapse). */
    uiMinSizeGuard: boolean;
    /** 7. Themed text-selection color. */
    uiSelectionColor: boolean;
    /** 8. Consistent empty/error visual treatment. */
    uiConsistentStates: boolean;
    /** 9. Smooth scrollbar gutter (no layout shift on overflow). */
    uiScrollGutter: boolean;
    /** 10. Reduced-motion-aware transitions on shell chrome. */
    uiMotionSafe: boolean;
}

export const DEFAULT_ENHANCEMENT_FLAGS: WidgetEnhancementFlags = {
    errorBoundary: true,
    loadingSkeleton: true,
    perfTelemetry: true,
    surfaceErrors: true,
    crashRecovery: true,
    escapeToClose: false,
    autoFocusOnOpen: false,
    reducedMotion: true,
    mountFadeIn: true,
    aiContract: true,
    uiDensity: true,
    uiScrollbars: true,
    uiFocusRings: true,
    uiHoverAffordance: true,
    uiFontClamp: true,
    uiMinSizeGuard: true,
    uiSelectionColor: true,
    uiConsistentStates: true,
    uiScrollGutter: true,
    uiMotionSafe: true,
};

const STORAGE_KEY = 'dwellium-widget-enhancements';

function read(): WidgetEnhancementFlags {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_ENHANCEMENT_FLAGS;
        const parsed = JSON.parse(raw) as Partial<WidgetEnhancementFlags>;
        // Merge over defaults so newly-added flags get their default value.
        return { ...DEFAULT_ENHANCEMENT_FLAGS, ...parsed };
    } catch {
        return DEFAULT_ENHANCEMENT_FLAGS;
    }
}

let current: WidgetEnhancementFlags = read();
const listeners = new Set<() => void>();

function emit(): void {
    listeners.forEach((l) => l());
}

export const widgetEnhancementsStore = {
    subscribe(listener: () => void): () => void {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
    getSnapshot(): WidgetEnhancementFlags {
        return current;
    },
    getServerSnapshot(): WidgetEnhancementFlags {
        return DEFAULT_ENHANCEMENT_FLAGS;
    },
    set(flag: keyof WidgetEnhancementFlags, value: boolean): void {
        current = { ...current, [flag]: value };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* sandboxed */ }
        emit();
    },
    /** Re-read from storage (used after external mutation). */
    refresh(): void {
        current = read();
        emit();
    },
    /** Standing convention: full reset to defaults. */
    reset(): void {
        current = DEFAULT_ENHANCEMENT_FLAGS;
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* sandboxed */ }
        emit();
    },
};
