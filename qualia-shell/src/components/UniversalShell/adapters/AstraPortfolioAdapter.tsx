/**
 * AstraPortfolioAdapter — first Astra-tier (executive) proof adapter.
 *
 * Canary: [CT-3E-ARCH-W8K3]
 *
 * Per Phase 3-E §1.3 build order: Strata adapters first, then Astra.
 * Shipping one Astra adapter now confirms the shell is surface-agnostic.
 *
 * Scope: executive portfolio container. Filing Cabinet lists properties,
 * Canvas shows the portfolio heatmap (stub until live data lands),
 * Orchestrator shows high-level AI narration, Scratch Pad reserved.
 */

import { Building2, Flame, LineChart, Sparkles } from 'lucide-react';
import type { AdapterColumnSpec, ContainerAdapter } from '../types';

const filingCabinet: AdapterColumnSpec = {
    subtitle: 'Properties — portfolio roster',
    render: () => (
        <div className="us-adapter-stub">
            <Building2 size={18} />
            <div className="us-adapter-stub__title">Portfolio Filing Cabinet</div>
            <div className="us-adapter-stub__body">
                Property roster with filters (by status, market, owner entity).
                Binds to <code>/api/dwellium/properties</code>. Same endpoint
                powers StrataDashboard&apos;s OverviewContent today — Astra&apos;s
                view applies owner-entity grouping per Pillar F §4.1.
            </div>
        </div>
    ),
};

const scratchPad: AdapterColumnSpec = {
    subtitle: 'Executive scratch (placeholder)',
    render: () => (
        <div className="us-adapter-stub">
            <div className="us-adapter-stub__title">Executive Scratch Pad</div>
            <div className="us-adapter-stub__body">
                Column 2 reserved for executive brain dump — decisions in
                progress, quick notes. Persistence arrives with the shared
                brain-dump store migration.
            </div>
        </div>
    ),
};

const canvas: AdapterColumnSpec = {
    subtitle: 'Portfolio heatmap + quick-viz',
    render: () => (
        <div className="us-adapter-stub">
            <Flame size={18} />
            <div className="us-adapter-stub__title">Portfolio Canvas</div>
            <div className="us-adapter-stub__body">
                Heatmap (occupancy / delinquency / maintenance) + financial
                quick-viz + compliance calendar. The existing
                AstraDashboard Dashboard-tab panels move here under the
                adapter contract in a later session — the mock arrays in
                <code>AstraDashboard.tsx</code> are awaiting a live-data
                wire-up tracked in Phase3D_Gap_Register.
            </div>
            <LineChart size={16} />
        </div>
    ),
};

const orchestrator: AdapterColumnSpec = {
    subtitle: 'Executive agent reasoning',
    render: () => (
        <div className="us-adapter-stub">
            <Sparkles size={18} />
            <div className="us-adapter-stub__title">Executive Orchestrator</div>
            <div className="us-adapter-stub__body">
                High-level AI narration — what moved on the portfolio today,
                which B.L.A.S.T. approvals are pending, 90-day arbitrage
                opportunities. Populates from the existing AstraDashboard
                AIAgentLog + QuickArbitrage sources.
            </div>
        </div>
    ),
};

export const astraPortfolioAdapter: ContainerAdapter = {
    id: 'astra-portfolio',
    label: 'Portfolio',
    icon: 'building-2',
    surface: 'astra',
    columns: {
        'filing-cabinet': filingCabinet,
        'scratch-pad': scratchPad,
        'canvas': canvas,
        'orchestrator': orchestrator,
    },
};
