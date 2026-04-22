/**
 * UniversalShell — F-1 Option C renderer.
 *
 * Canary: [CT-3H-HANDOFF-M4Q7]
 * Canary: [CT-3E-ARCH-W8K3]
 *
 * Source of truth:
 *   [SOURCE: Phase3H_Engineer_Handoff.docx, §3 Table 1 R1]
 *   [SOURCE: Phase3E_Architecture_Spec.docx, §1.3]
 *
 * Responsibilities:
 *   1. Render the persistent 4-column frame (Filing Cabinet / Scratch Pad
 *      / Canvas / Orchestrator).
 *   2. Host a container switcher that lists every ContainerAdapter
 *      registered in ADAPTER_REGISTRY (filtered by surface + RBAC).
 *   3. Route the active adapter's column contributions into the frame,
 *      each wrapped in an AdapterBoundary for RT-01 graceful degradation.
 *
 * Non-responsibilities:
 *   • Data fetching — adapters own their own hooks.
 *   • RBAC enforcement — containers enforce their own checks; the shell
 *     merely hides container buttons when the permKey is denied.
 *   • Navigation persistence — single useState for now; a router-backed
 *     version can replace it without changing the adapter contract.
 */

import { useMemo, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { AdapterBoundary } from './AdapterBoundary';
import { adaptersForSurface } from './adapterRegistry';
import {
    SHELL_COLUMN_LABELS,
    SHELL_COLUMN_ORDER,
    type AdapterContext,
    type AdapterSurface,
    type ContainerAdapter,
    type ShellColumnId,
} from './types';
import './UniversalShell.css';

interface UniversalShellProps {
    /** Which surface to load adapters for. Defaults to "any". */
    surface?: AdapterSurface;
    /** Optional initial container id — overrides the first adapter. */
    initialContainerId?: string;
}

function EmptyColumn({ columnId }: { columnId: ShellColumnId }) {
    return (
        <div className="us-column-empty">
            <div className="us-column-empty__label">{SHELL_COLUMN_LABELS[columnId]}</div>
            <div className="us-column-empty__body">
                This container doesn&apos;t populate this column.
            </div>
        </div>
    );
}

export default function UniversalShell({
    surface = 'any',
    initialContainerId,
}: UniversalShellProps) {
    const { hasPermission } = useUser();

    // Compute the set of adapters the user is allowed to see.
    const visibleAdapters = useMemo<ContainerAdapter[]>(
        () =>
            adaptersForSurface(surface).filter(a =>
                a.permKey ? hasPermission(a.permKey) : true,
            ),
        [surface, hasPermission],
    );

    const [activeId, setActiveId] = useState<string>(() => {
        if (initialContainerId && visibleAdapters.some(a => a.id === initialContainerId)) {
            return initialContainerId;
        }
        return visibleAdapters[0]?.id ?? '';
    });

    if (visibleAdapters.length === 0) {
        return (
            <div className="us-shell us-shell--empty">
                <div className="us-empty-state">
                    <div className="us-empty-state__title">No containers available</div>
                    <div className="us-empty-state__body">
                        Your role has no adapters on the <strong>{surface}</strong> surface.
                    </div>
                </div>
            </div>
        );
    }

    const active =
        visibleAdapters.find(a => a.id === activeId) ?? visibleAdapters[0];

    const ctx: AdapterContext = {
        activeContainerId: active.id,
        setActiveContainer: setActiveId,
        surface,
    };

    return (
        <div className="us-shell">
            <header className="us-header">
                <div className="us-header__brand">
                    <span className="us-header__glyph">◫</span>
                    <span className="us-header__title">Universal Shell</span>
                    <span className="us-header__surface">{surface.toUpperCase()}</span>
                </div>
                <nav className="us-switcher" aria-label="Container switcher">
                    {visibleAdapters.map(a => (
                        <button
                            key={a.id}
                            type="button"
                            className={`us-switcher__item${
                                a.id === active.id ? ' us-switcher__item--active' : ''
                            }`}
                            onClick={() => setActiveId(a.id)}
                            aria-pressed={a.id === active.id}
                        >
                            {a.label}
                        </button>
                    ))}
                </nav>
            </header>

            <div className="us-columns">
                {SHELL_COLUMN_ORDER.map(columnId => {
                    const col = active.columns[columnId];
                    return (
                        <section
                            key={columnId}
                            className={`us-column us-column--${columnId}`}
                            aria-label={SHELL_COLUMN_LABELS[columnId]}
                        >
                            <header className="us-column__header">
                                <div className="us-column__label">
                                    {SHELL_COLUMN_LABELS[columnId]}
                                </div>
                                {col?.subtitle && (
                                    <div className="us-column__subtitle">{col.subtitle}</div>
                                )}
                            </header>
                            <div className="us-column__body">
                                <AdapterBoundary
                                    containerId={active.id}
                                    columnId={columnId}
                                    columnLabel={SHELL_COLUMN_LABELS[columnId]}
                                >
                                    {col ? col.render(ctx) : <EmptyColumn columnId={columnId} />}
                                </AdapterBoundary>
                            </div>
                        </section>
                    );
                })}
            </div>
        </div>
    );
}
