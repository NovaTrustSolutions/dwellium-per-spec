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

import { Suspense, lazy } from 'react';
import { Wrench, FileKey2 } from 'lucide-react';
import type { AdapterColumnSpec, ContainerAdapter } from '../types';

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

// ponytail: emailRouter.ts + its review-queue UI deleted at plan 066 §2e
// (dead code — nothing ever set window.__DWELLIUM_C1_ENABLED__). Honest
// placeholder only; no fake data.
const orchestrator: AdapterColumnSpec = {
    subtitle: 'Maintenance agent — C-1 review queue',
    render: () => (
        <div className="us-adapter-stub">
            <Wrench size={18} />
            <div className="us-adapter-stub__title">Maintenance Orchestrator</div>
            <div className="us-adapter-stub__body">
                Not built yet — maintenance email triage will appear here once
                the routing engine ships.
            </div>
        </div>
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
