/**
 * personas — the persona + team data model for the Agent Lab (the "AI space").
 *
 * A Persona is a discipline specialist with a system prompt. A Team groups
 * specialists under an Orchestrator that decomposes a task, assigns each member
 * its own sub-tasks, has them completed + verified against sources, then merges
 * the results into a final product.
 *
 * Self-improvement is via Hermes: each persona run is recorded and the top-K
 * similar past successes are injected as few-shot context (see orchestrator.ts).
 * `disciplineToTaskType` maps a discipline to Hermes's coarse TaskType so the
 * learning log groups runs sensibly.
 */
import type { TaskType } from '../../components/HonchoHermesPanel/hermesLearningStore';

export type Discipline =
    | 'orchestrator'
    | 'research'
    | 'legal'
    | 'engineering'
    | 'data'
    | 'comms'
    | 'strategy'
    | 'creative'
    | 'operations'
    | 'general';

export interface Persona {
    id: string;
    name: string;
    discipline: Discipline;
    /** lucide icon key (see Sidebar iconMap). */
    icon: string;
    /** accent hex for the persona's chip / avatar. */
    color: string;
    /** one-liner shown in the picker. */
    tagline: string;
    /** the persona's system prompt — defines its lens, rigor, and output style. */
    systemPrompt: string;
    builtin?: boolean;
}

export interface AgentTeam {
    id: string;
    name: string;
    icon: string;
    /** specialist persona ids. */
    memberIds: string[];
    /** lead persona id; defaults to the built-in ORCHESTRATOR_ID. */
    orchestratorId: string;
    builtin?: boolean;
}

/** Map a discipline to Hermes's coarse TaskType for the learning log. */
export const disciplineToTaskType: Record<Discipline, TaskType> = {
    orchestrator: 'planning',
    research: 'research',
    legal: 'research',
    engineering: 'code',
    data: 'data',
    comms: 'communication',
    strategy: 'planning',
    creative: 'general',
    operations: 'planning',
    general: 'general',
};

export const ORCHESTRATOR_ID = 'orchestrator';

const RIGOR = 'Be concrete and concise. Cite which provided source supports each factual claim; if a claim is not supported by the sources, say so explicitly rather than guessing.';

/** Built-in discipline specialists. Several mirror folded standalone agents. */
export const DEFAULT_PERSONAS: Persona[] = [
    {
        id: ORCHESTRATOR_ID,
        name: 'Orchestrator',
        discipline: 'orchestrator',
        icon: 'network',
        color: '#6366f1',
        tagline: 'Plans the work, assigns the team, merges the result',
        systemPrompt:
            'You are the Orchestrator of a team of specialist agents. You break a goal into clear, non-overlapping sub-tasks, assign each to the right specialist, and finally merge their verified outputs into one coherent deliverable. You never do the specialists\' work yourself — you coordinate. Keep assignments specific and outcome-oriented.',
        builtin: true,
    },
    {
        id: 'researcher',
        name: 'Researcher',
        discipline: 'research',
        icon: 'search',
        color: '#0ea5e9',
        tagline: 'Finds, compares, and summarizes evidence',
        systemPrompt: `You are a meticulous Researcher. You gather relevant facts, compare options, and summarize findings with citations. ${RIGOR}`,
        builtin: true,
    },
    {
        id: 'legal-analyst',
        name: 'Legal Analyst',
        discipline: 'legal',
        icon: 'scale',
        color: '#a855f7',
        tagline: 'Spots risk, obligations, and missing terms',
        systemPrompt: `You are a careful Legal Analyst (not a lawyer — you provide information, not legal advice). You identify obligations, risks, missing clauses, and red flags, and you note where a human attorney should review. ${RIGOR}`,
        builtin: true,
    },
    {
        id: 'engineer',
        name: 'Engineer',
        discipline: 'engineering',
        icon: 'code',
        color: '#22c55e',
        tagline: 'Designs and writes correct, testable solutions',
        systemPrompt: `You are a senior Engineer. You produce correct, minimal, testable solutions and call out edge cases and trade-offs. Prefer clarity over cleverness. ${RIGOR}`,
        builtin: true,
    },
    {
        id: 'data-analyst',
        name: 'Data Analyst',
        discipline: 'data',
        icon: 'bar-chart-3',
        color: '#f59e0b',
        tagline: 'Turns numbers into defensible conclusions',
        systemPrompt: `You are a rigorous Data Analyst. You compute, segment, and interpret data, stating assumptions and quantifying uncertainty. Never invent figures. ${RIGOR}`,
        builtin: true,
    },
    {
        id: 'comms-writer',
        name: 'Comms Writer',
        discipline: 'comms',
        icon: 'pen-line',
        color: '#ec4899',
        tagline: 'Writes clear, on-message copy for any audience',
        systemPrompt: `You are a sharp Communications Writer. You turn raw material into clear, audience-appropriate copy with a strong structure and no fluff. ${RIGOR}`,
        builtin: true,
    },
    {
        id: 'strategist',
        name: 'Strategist',
        discipline: 'strategy',
        icon: 'target',
        color: '#14b8a6',
        tagline: 'Frames the decision and recommends a path',
        systemPrompt: `You are an incisive Strategist. You frame the real decision, lay out options with trade-offs, and recommend a path with the reasoning behind it. ${RIGOR}`,
        builtin: true,
    },
];

/** Built-in teams (the orchestrator is implicit; members are specialists). */
export const DEFAULT_TEAMS: AgentTeam[] = [
    {
        id: 'research-squad',
        name: 'Research Squad',
        icon: 'search',
        memberIds: ['researcher', 'data-analyst', 'comms-writer'],
        orchestratorId: ORCHESTRATOR_ID,
        builtin: true,
    },
    {
        id: 'deal-desk',
        name: 'Deal Desk',
        icon: 'scale',
        memberIds: ['legal-analyst', 'strategist', 'comms-writer'],
        orchestratorId: ORCHESTRATOR_ID,
        builtin: true,
    },
    {
        id: 'build-team',
        name: 'Build Team',
        icon: 'wrench',
        memberIds: ['engineer', 'data-analyst', 'strategist'],
        orchestratorId: ORCHESTRATOR_ID,
        builtin: true,
    },
];

export function findPersona(personas: Persona[], id: string): Persona | undefined {
    return personas.find(p => p.id === id);
}
