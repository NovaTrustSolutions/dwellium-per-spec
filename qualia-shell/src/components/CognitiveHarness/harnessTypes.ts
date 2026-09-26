/**
 * Plan 069 contract — shared by harnessMetrics.ts (pure data), harnessCanvas.ts
 * (decorative renderer) and CognitiveHarness.tsx (integrator). Change only with
 * the plan's module-contract section.
 */
import type { CmnMetrics, CmnProbe } from '../../lib/memoryGraphRag/shared';
import type { HermesRunRecord } from '../HonchoHermesPanel/hermesLearningStore';
import type { PersonaWorkState } from '../../lib/agents/personaWorkStore';

export type HarnessCardId =
    | 'rag' | 'graph-rag' | 'vector-db' | 'memory'
    | 'prompt-opt' | 'tool-use' | 'planning' | 'semantic-routing'
    | 'evaluation' | 'ext-knowledge';

export interface HarnessMetric { label: string; value: string; }

/** ok = backed and healthy · degraded = backed but failing · idle = backed, nothing recorded yet. */
export interface HarnessStatus { state: 'ok' | 'degraded' | 'idle'; label: string; }

export interface HarnessCard {
    metrics: HarnessMetric[];
    status: HarnessStatus;
    /** Plain-language name of where the numbers come from, shown under the metrics. */
    source: string;
}

export interface HarnessInputs {
    cmn: CmnMetrics;
    probe: CmnProbe;
    /** hermesLearningStore snapshot (all Hermes runs for this user). */
    runs: readonly HermesRunRecord[];
    /** personaWorkStore snapshot. */
    work: PersonaWorkState;
    /** allLocalDocuments(uid).length — documents the app could feed the network. */
    availableDocs: number;
}
