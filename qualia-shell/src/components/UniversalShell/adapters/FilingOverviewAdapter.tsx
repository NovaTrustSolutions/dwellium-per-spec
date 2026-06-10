/**
 * FilingOverviewAdapter — the landing / "home" container for the Universal Shell.
 *
 * Canary: [CT-3E-ARCH-W8K3]
 *
 * Phase 3-E §1.3 names Column 1 (Filing Cabinet) as the foundation:
 *   "The Hybrid Finder (Column 1) is the foundation. Without a robust,
 *    tabbed filing system that the Agent can see into, the dashboard is
 *    just a glorified chat app." [SOURCE: PB15_AntigravityClone_TechSpec_Batch_1.md,
 *    PB15-074, lines 256–261]
 *
 * This adapter ships a minimal but honest version of all four columns so
 * the shell has a landing state before any other containers are migrated.
 * It is surface-agnostic: both Astra and Strata show it.
 */

import type { AdapterColumnSpec, ContainerAdapter } from '../types';
import { FilingCabinetHome, ScratchPadHome, CanvasHome, OrchestratorHome } from './WorkspaceHomeColumns';

// Home container columns wired to real content (2026-06-09). Each renders a
// functional component that drives the real app via the same events the
// sidebar / ⌘K use. The domain adapters (Strata / Astra) still show their own
// container-scoped columns when selected from the switcher.
const filingCabinet: AdapterColumnSpec = {
    subtitle: 'Your files + documents',
    render: () => <FilingCabinetHome />,
};

const scratchPad: AdapterColumnSpec = {
    subtitle: 'A quick note, saved as you type',
    render: () => <ScratchPadHome />,
};

const canvas: AdapterColumnSpec = {
    subtitle: "What's open right now",
    render: () => <CanvasHome />,
};

const orchestrator: AdapterColumnSpec = {
    subtitle: 'Talk to the Conductor (ARA)',
    render: () => <OrchestratorHome />,
};

export const filingOverviewAdapter: ContainerAdapter = {
    id: 'filing-overview',
    label: 'Overview',
    icon: 'layout-dashboard',
    surface: 'any',
    columns: {
        'filing-cabinet': filingCabinet,
        'scratch-pad': scratchPad,
        'canvas': canvas,
        'orchestrator': orchestrator,
    },
};
