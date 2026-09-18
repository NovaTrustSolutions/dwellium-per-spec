/**
 * adapterRegistry — central list of ContainerAdapters wired into the
 * Universal Shell (F-1). New containers are added here in one place;
 * the shell auto-discovers them.
 *
 * Canary: [CT-3E-ARCH-W8K3]
 *
 * Source of truth:
 *   [SOURCE: Phase3E_Architecture_Spec.docx, §1.3 Build sequence paragraph]
 *   "Strata adapter first (58.5% of PB15 requirements), then Astra adapter."
 *
 * This scaffold ships with three adapters as proof-of-shape:
 *   • filing-overview (surface-agnostic landing / container switcher home)
 *   • strata-maintenance (Strata operations-tier maintenance container)
 *   • astra-portfolio (Astra executive-tier portfolio container)
 *
 * Remaining ~11 containers from the Phase 3-A reconciliation will be
 * migrated in subsequent sessions per the Phase3D_Gap_Register priority.
 */

import type { ContainerAdapter, AdapterSurface } from './types';
import { filingOverviewAdapter } from './adapters/FilingOverviewAdapter';
import { strataMaintenanceAdapter } from './adapters/StrataMaintenanceAdapter';
// ponytail: astraPortfolioAdapter is placeholder text in all four columns
// (no real data yet) — hidden from the switcher until it has real content.
// Re-enable by re-adding it to ADAPTER_REGISTRY below once wired to real data.

/**
 * Ordered list of registered adapters. Order controls the default
 * appearance in the container switcher.
 */
export const ADAPTER_REGISTRY: ContainerAdapter[] = [
    filingOverviewAdapter,
    strataMaintenanceAdapter,
];

/**
 * Filter adapters by surface. "any" adapters always appear; the "any"
 * surface (the widget's default) lists every adapter — otherwise the
 * switcher shows a single container and there is nothing to switch.
 */
export function adaptersForSurface(surface: AdapterSurface): ContainerAdapter[] {
    if (surface === 'any') return ADAPTER_REGISTRY;
    return ADAPTER_REGISTRY.filter(a => a.surface === surface || a.surface === 'any');
}

/**
 * Look up a single adapter by id.
 */
export function getAdapter(id: string): ContainerAdapter | undefined {
    return ADAPTER_REGISTRY.find(a => a.id === id);
}
