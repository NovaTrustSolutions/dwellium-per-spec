/**
 * strataDeepLink — open the Strata Dashboard ON a specific module (DASH-D6).
 *
 * The Strata sub-modules (legal, compliance, maintenance, …) are NOT separate
 * registry widgets; they are tabs inside the single `strata-dashboard` widget,
 * and the cross-widget `dwellium:open-widget` bus only carries a widget id.
 * So a module-target drill-down needs a second, additive channel:
 *
 *   1. a module-level holder (`pendingStrataModule`) the StrataDashboard reads
 *      ONCE on mount → covers the COLD case (window not open yet: openWindow
 *      mounts it fresh and it lands on the deep-linked module), and
 *   2. a `dwellium:strata-module` CustomEvent the mounted StrataDashboard
 *      listens for → covers the WARM case (window already open/minimised).
 *
 * `openStrataModule` does both, then fires the existing open-widget bus to
 * surface the window. The single side effect (DOM dispatch) is injected as
 * `deps` so this is unit-testable without a listener (mirrors araLinkage.ts /
 * workspaceScribe.ts). Fully additive + removable: delete this file and the
 * StrataDashboard mount effect to fall back to opening the overview.
 */
import type { StrataModule } from './strataTypes';
import { dispatchOpenWidget } from '../Workspace/workspaceScribe';

export const STRATA_DEEPLINK_EVENT = 'dwellium:strata-module';

/** Set during render-free drill-down; consumed once by StrataDashboard on mount. */
export const pendingStrataModule: { current: StrataModule | null } = { current: null };

/** Read and clear the pending module (cold-open path). Idempotent: returns null once consumed. */
export function consumePendingStrataModule(): StrataModule | null {
    const m = pendingStrataModule.current;
    pendingStrataModule.current = null;
    return m;
}

export interface StrataDeepLinkDeps {
    /** Surface the Strata window. Defaults to the `dwellium:open-widget` bus. */
    openWidget: (widgetId: string, label?: string, icon?: string) => void;
    /** Notify an already-open StrataDashboard. Defaults to a `dwellium:strata-module` event. */
    emitModule: (module: StrataModule) => void;
}

function defaultEmitModule(module: StrataModule): void {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(STRATA_DEEPLINK_EVENT, { detail: { module } }));
}

/**
 * Open the Strata Dashboard focused on `module`. Stages the module in the
 * holder (cold case), surfaces the window, then emits the module event (warm
 * case). Both `deps` default to the real bus; inject them in tests.
 */
export function openStrataModule(module: StrataModule, deps?: Partial<StrataDeepLinkDeps>): void {
    pendingStrataModule.current = module;
    const open = deps?.openWidget ?? dispatchOpenWidget;
    open('strata-dashboard', 'Strata Dashboard', 'layout-dashboard');
    const emit = deps?.emitModule ?? defaultEmitModule;
    emit(module);
}
