/**
 * strataDeepLink test (DASH arc, Cycle 5).
 *
 * Pins the module-target drill-down contract (DASH-D6): `openStrataModule`
 * (a) stages the target module in the holder for the cold-open path,
 * (b) surfaces the `strata-dashboard` widget via the open-widget bus, and
 * (c) emits a `dwellium:strata-module` event for the warm-focus path.
 * The two side effects are injected so this needs no DOM listener; one
 * default-path case asserts the real `dwellium:strata-module` dispatch.
 * `consumePendingStrataModule` reads-and-clears (idempotent).
 */
import { describe, it, expect, vi } from 'vitest';
import {
    openStrataModule,
    consumePendingStrataModule,
    pendingStrataModule,
    STRATA_DEEPLINK_EVENT,
} from '../../components/StrataDashboard/strataDeepLink';

describe('strataDeepLink — openStrataModule (injected deps)', () => {
    it('stages the module, opens strata-dashboard, and emits the module', () => {
        const openWidget = vi.fn();
        const emitModule = vi.fn();
        openStrataModule('legal', { openWidget, emitModule });

        // (a) holder staged for the cold-open path.
        expect(pendingStrataModule.current).toBe('legal');
        // (b) surfaces the single strata widget (sub-modules aren't separate widgets).
        expect(openWidget).toHaveBeenCalledWith('strata-dashboard', 'Strata Dashboard', 'layout-dashboard');
        // (c) warm-focus notification carries the module.
        expect(emitModule).toHaveBeenCalledWith('legal');
    });
});

describe('strataDeepLink — consumePendingStrataModule', () => {
    it('reads then clears the holder (idempotent second read)', () => {
        pendingStrataModule.current = 'compliance';
        expect(consumePendingStrataModule()).toBe('compliance');
        expect(pendingStrataModule.current).toBeNull();
        expect(consumePendingStrataModule()).toBeNull();
    });
});

describe('strataDeepLink — default emit path', () => {
    it('dispatches a real dwellium:strata-module CustomEvent', () => {
        const seen: string[] = [];
        const handler = (ev: Event) => seen.push((ev as CustomEvent).detail?.module);
        window.addEventListener(STRATA_DEEPLINK_EVENT, handler);
        try {
            // Only inject openWidget so the default emit path runs.
            openStrataModule('compliance', { openWidget: vi.fn() });
            expect(seen).toEqual(['compliance']);
        } finally {
            window.removeEventListener(STRATA_DEEPLINK_EVENT, handler);
            pendingStrataModule.current = null;
        }
    });
});
