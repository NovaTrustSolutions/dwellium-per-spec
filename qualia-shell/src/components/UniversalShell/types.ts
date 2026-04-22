/**
 * UniversalShell — F-1 Option C (Universal Shell) types.
 *
 * ═════════════════════════════════════════════════════════════════════
 * Canary: [CT-3H-HANDOFF-M4Q7]  (references Phase3H_Engineer_Handoff.docx)
 * Canary: [CT-3E-ARCH-W8K3]     (references Phase3E_Architecture_Spec.docx)
 * ═════════════════════════════════════════════════════════════════════
 *
 * Source of truth:
 *   [SOURCE: Phase3E_Architecture_Spec.docx, §1.3 "Recommendation: Option C — Universal Shell"]
 *   [SOURCE: Phase3H_Engineer_Handoff.docx, §3 Table 1 R1 (F-1)]
 *
 * The 4-column layout is the persistent interaction frame. Each container
 * (the ~14 domain containers reconciled in Phase 3-A) binds to the shell
 * by providing a ContainerAdapter that populates four columns:
 *
 *   Column 1 — Filing Cabinet   (domain-scoped file browser)
 *   Column 2 — Scratch Pad      (domain-scoped brain dump)
 *   Column 3 — Canvas           (domain-scoped output; C-9 boards live here)
 *   Column 4 — Orchestrator     (domain-scoped agent reasoning)
 *
 * RBAC stays at the container level. The shell does not override access
 * controls — adapters are expected to gate their own render via the
 * UserContext's hasPermission helper.
 *
 * Red Team mitigation RT-01 is enforced via AdapterBoundary, which isolates
 * column failures so a crashed adapter column degrades in-place rather than
 * taking the shell down.
 *   [SOURCE: Phase3H_Engineer_Handoff.docx, §5 Table 5 R1 (RT-01)]
 *
 * Build sequence (per PB15-074):
 *   Column 1 (Filing Cabinet) → Column 4 (Orchestrator) → Column 3 (Canvas)
 *   → Column 2 (Scratch Pad). Strata adapters first, then Astra.
 */

import type { ReactNode } from 'react';

/**
 * The four persistent columns of the Universal Shell.
 * Order matches the build sequence described in Phase 3-E §1.3.
 */
export type ShellColumnId = 'filing-cabinet' | 'scratch-pad' | 'canvas' | 'orchestrator';

export const SHELL_COLUMN_ORDER: ShellColumnId[] = [
    'filing-cabinet',
    'scratch-pad',
    'canvas',
    'orchestrator',
];

export const SHELL_COLUMN_LABELS: Record<ShellColumnId, string> = {
    'filing-cabinet': 'Filing Cabinet',
    'scratch-pad': 'Scratch Pad',
    'canvas': 'Canvas',
    'orchestrator': 'Orchestrator',
};

/**
 * Surface identifies which dashboard tier owns the adapter. Per the
 * Phase 3-D/3-E container model, "strata" is operations-tier and
 * "astra" is executive-tier. A few adapters may be surface-agnostic.
 */
export type AdapterSurface = 'strata' | 'astra' | 'any';

/**
 * Context passed to every column renderer. Intentionally small: the
 * shell owns navigation + active-container state; data + RBAC come
 * from the adapter's own hooks (see UserContext, strataApi, etc.).
 */
export interface AdapterContext {
    /** The container the user is currently inspecting. */
    activeContainerId: string;
    /** Focus another container (sibling navigation within the shell). */
    setActiveContainer(id: string): void;
    /** Surface the adapter is rendering on. */
    surface: AdapterSurface;
}

/**
 * A single column contribution from a container adapter. Each column
 * is optional; containers may fill 1–4 columns depending on their
 * domain. Missing columns render the shell's default placeholder.
 */
export interface AdapterColumnSpec {
    /** Subtitle shown under the column's section header. */
    subtitle?: string;
    /** Render fn — returns the JSX for this column. */
    render(ctx: AdapterContext): ReactNode;
}

/**
 * ContainerAdapter — the standard interface every container exposes
 * to the Universal Shell. Per Phase 3-E §1.3: "Each of the 6 (now 14)
 * containers binds to it by providing a content adapter."
 */
export interface ContainerAdapter {
    /** Stable unique id — used for routing + persistence. */
    id: string;
    /** Display label shown in the container switcher. */
    label: string;
    /** Lucide icon name (see iconMap). */
    icon: string;
    /** Which surface(s) this adapter appears on. */
    surface: AdapterSurface;
    /**
     * RBAC permission key the adapter needs. The shell checks this via
     * UserContext.hasPermission before rendering the adapter. If the
     * user does not have the permission, the container is hidden from
     * the switcher. Per §1.3: "RBAC stays at the container level."
     */
    permKey?: string;
    /** Column contributions. All four are optional. */
    columns: Partial<Record<ShellColumnId, AdapterColumnSpec>>;
}

/**
 * Shape returned when an adapter column errors out. Used by
 * AdapterBoundary to keep RT-01's "graceful degradation" promise.
 */
export interface AdapterColumnError {
    columnId: ShellColumnId;
    containerId: string;
    message: string;
}
