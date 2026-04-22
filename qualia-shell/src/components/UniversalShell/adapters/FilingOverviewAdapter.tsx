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

import { FolderTree, Notebook, LayoutDashboard, Cpu } from 'lucide-react';
import type { AdapterColumnSpec, ContainerAdapter } from '../types';

const filingCabinet: AdapterColumnSpec = {
    subtitle: 'Starting point — pick a container to drill down',
    render: () => (
        <div className="us-adapter-stub">
            <FolderTree size={20} />
            <div className="us-adapter-stub__title">Filing Cabinet</div>
            <div className="us-adapter-stub__body">
                Select a container from the switcher. Each container exposes its
                own domain-scoped file browser in this column. No documents are
                loaded until a container is active — Ilya&apos;s PB15-074 dev priority.
            </div>
        </div>
    ),
};

const scratchPad: AdapterColumnSpec = {
    subtitle: 'Container-scoped brain dump',
    render: () => (
        <div className="us-adapter-stub">
            <Notebook size={20} />
            <div className="us-adapter-stub__title">Scratch Pad</div>
            <div className="us-adapter-stub__body">
                Column 2 is populated by the active container&apos;s adapter. Open
                a container to start a scratch note bound to it.
            </div>
        </div>
    ),
};

const canvas: AdapterColumnSpec = {
    subtitle: 'Canvas — outputs + C-9 hybrid boards',
    render: () => (
        <div className="us-adapter-stub">
            <LayoutDashboard size={20} />
            <div className="us-adapter-stub__title">Canvas</div>
            <div className="us-adapter-stub__body">
                Container output renders here. Per C-9 (Phase 3-E §3.3), project
                boards live inside Column 3 of each container. The hybrid board
                renderer ships in a later session.
            </div>
        </div>
    ),
};

const orchestrator: AdapterColumnSpec = {
    subtitle: 'Agent reasoning + unclassifiable email triage',
    render: () => (
        <div className="us-adapter-stub">
            <Cpu size={20} />
            <div className="us-adapter-stub__title">Orchestrator</div>
            <div className="us-adapter-stub__body">
                Column 4 shows the AI agent reasoning for the active container.
                Per C-1, unclassifiable emails route to a lightweight Triage
                card here instead of to an Inbox Zero UI.
            </div>
        </div>
    ),
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
