/**
 * StrataMaintenanceAdapter — first Strata-tier proof adapter.
 *
 * Canary: [CT-3E-ARCH-W8K3]
 *
 * Picked as the first Strata adapter per Phase 3-E §1.3:
 *   "Strata adapter first (58.5% of PB15 requirements)"
 *
 * This adapter demonstrates the shell's adapter contract by wrapping two
 * existing Strata modules (MaintenanceModule → Canvas, WorkOrdersModule →
 * Filing Cabinet) without modifying their source. The adapter does not
 * yet scope those modules to a single property — that migration is
 * tracked in Phase3D_Gap_Register as C-2 "Module relocation."
 */

import { Suspense, lazy, useEffect, useState } from 'react';
import { Wrench, FileKey2 } from 'lucide-react';
import type { AdapterColumnSpec, ContainerAdapter } from '../types';
import {
    getReviewQueue,
    isBackgroundEngineEnabled,
    type RoutingDecision,
} from '../../../services/emailRouter';

// Lazy-load the legacy modules so the adapter doesn't drag them into
// the shell's initial bundle.
const MaintenanceModule = lazy(
    () => import('../../StrataDashboard/modules/MaintenanceModule'),
);
const WorkOrdersModule = lazy(
    () => import('../../StrataDashboard/modules/WorkOrdersModule'),
);

function LoadingStub({ label }: { label: string }) {
    return (
        <div className="us-adapter-loading">Loading {label}…</div>
    );
}

const filingCabinet: AdapterColumnSpec = {
    subtitle: 'Work orders — filing view',
    render: () => (
        <Suspense fallback={<LoadingStub label="work orders" />}>
            <div className="us-adapter-legacy">
                <WorkOrdersModule />
            </div>
        </Suspense>
    ),
};

const scratchPad: AdapterColumnSpec = {
    subtitle: 'Maintenance notes (placeholder)',
    render: () => (
        <div className="us-adapter-stub">
            <div className="us-adapter-stub__title">Maintenance scratch pad</div>
            <div className="us-adapter-stub__body">
                Column 2 for this container will host free-form maintenance notes
                (per PB2 NEED-008). Persistence ships with the brain-dump store
                migration in a later session.
            </div>
        </div>
    ),
};

const canvas: AdapterColumnSpec = {
    subtitle: 'Maintenance canvas',
    render: () => (
        <Suspense fallback={<LoadingStub label="maintenance" />}>
            <div className="us-adapter-legacy">
                <MaintenanceModule />
            </div>
        </Suspense>
    ),
};

/**
 * Orchestrator column now consumes the C-1 emailRouter human-review queue
 * (src/services/emailRouter.ts). When the background engine feature flag
 * is off, the column renders the original placeholder. When on, it lists
 * routing decisions below the 95% confidence threshold so a human can
 * triage. This is the proof-of-pattern for "C-1 plugs into F-1 without
 * either side knowing about the other."
 */
function MaintenanceOrchestratorLive() {
    const [queue, setQueue] = useState<ReadonlyArray<RoutingDecision>>(() => getReviewQueue());
    useEffect(() => {
        // Lightweight polling until the router exposes an event stream.
        const handle = window.setInterval(() => setQueue(getReviewQueue().slice()), 3000);
        return () => window.clearInterval(handle);
    }, []);
    return (
        <div className="us-adapter-stub">
            <Wrench size={18} />
            <div className="us-adapter-stub__title">Maintenance Orchestrator</div>
            <div className="us-adapter-stub__body">
                {queue.length === 0 ? (
                    <span>No maintenance emails awaiting human review.</span>
                ) : (
                    <>
                        <strong>{queue.length}</strong> email(s) below the 95% confidence gate.
                        <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                            {queue.slice(0, 5).map(d => (
                                <li key={d.emailId}>
                                    {d.emailId} → <code>{d.targetProjectId}</code>{' '}
                                    <span style={{ opacity: 0.6 }}>
                                        ({Math.round(d.confidence * 100)}% · {d.classifierVersion})
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
            </div>
        </div>
    );
}

const orchestrator: AdapterColumnSpec = {
    subtitle: 'Maintenance agent — C-1 review queue',
    render: () => (
        isBackgroundEngineEnabled() ? (
            <MaintenanceOrchestratorLive />
        ) : (
            <div className="us-adapter-stub">
                <Wrench size={18} />
                <div className="us-adapter-stub__title">Maintenance Orchestrator</div>
                <div className="us-adapter-stub__body">
                    Column 4 surfaces the maintenance agent&apos;s reasoning —
                    prioritization, vendor dispatch suggestions, and unclassifiable
                    maintenance emails triaged per C-1 Option C. The routing
                    engine is implemented in <code>src/services/emailRouter.ts</code>;
                    enable via <code>window.__DWELLIUM_C1_ENABLED__ = true</code>.
                </div>
            </div>
        )
    ),
};

void FileKey2; // icon reserved for future filing-cabinet header

export const strataMaintenanceAdapter: ContainerAdapter = {
    id: 'strata-maintenance',
    label: 'Maintenance',
    icon: 'wrench',
    surface: 'strata',
    permKey: 'strata:module:maintenance',
    columns: {
        'filing-cabinet': filingCabinet,
        'scratch-pad': scratchPad,
        'canvas': canvas,
        'orchestrator': orchestrator,
    },
};
