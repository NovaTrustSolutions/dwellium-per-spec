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
import { skillIdsForDiscipline } from './skills';

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
    /** Editable avatar-dossier card shown in the Agent Lab persona view. */
    dossier?: PersonaDossier;
    /** Center-circle avatar — an uploaded image (else the wireframe). */
    avatar?: PersonaAvatar;
    /** The looping neural video shown top-right (defaults to a distinct per-persona loop). */
    neuralVideo?: string;
    /** Tool ids (from the Stella tool catalog) this persona is equipped with. */
    tools?: string[];
    /**
     * P12-2 (2026-06-12): per-persona model routing — cheap models take
     * routine personas, big models take the deep thinkers. Falls back to the
     * user's active provider when the preferred one isn't configured.
     */
    preferredModel?: PersonaModelPreference;
}

export interface PersonaModelPreference {
    provider: 'anthropic' | 'openai' | 'gemini' | 'local' | 'custom';
    /** Optional explicit model id; defaults to the provider's configured model. */
    model?: string;
}

export interface PersonaAvatar {
    kind: 'image' | 'wireframe';
    /** image data URL when kind === 'image'. */
    src?: string;
}

/** A label/value pair — every dossier field is editable (label AND value). */
export interface DossierKV { label: string; value: string; }
export interface DossierChannel { label: string; pct: number; }
export interface DossierNote { title: string; body: string; }

/** The editable "neural identity dossier" (wireframe avatar card) for a persona. */
export interface PersonaDossier {
    subjectId: string;
    scanMode: string;
    clearance: string;
    title: string;
    description: string;
    identity: DossierKV[];
    traits: DossierKV[];
    tags: DossierKV[];
    metrics: DossierKV[];
    readout: DossierKV[];
    channels: DossierChannel[];
    notes: DossierNote[];
    /** Keys of dossier fields/sections the user has hidden (restorable). */
    hidden?: string[];
}

/** Build a default dossier for a persona (seeded from the wireframe template). */
export function defaultDossier(p: Persona): PersonaDossier {
    return {
        subjectId: (p.name || 'Subject').slice(0, 14).toUpperCase().replace(/\s+/g, '-'),
        scanMode: 'Wireframe',
        clearance: 'Visual',
        title: p.name || 'Avatar Wireframe',
        description: p.tagline || 'Discipline specialist persona dossier.',
        identity: [
            { label: 'Alias', value: p.name || 'Persona-01' },
            { label: 'Type', value: '3D Persona' },
            { label: 'Status', value: 'Active Mesh' },
            { label: 'Rig', value: 'Humanoid v4' },
            { label: 'Source', value: 'Parametric' },
        ],
        traits: [
            { label: 'Topology Integrity', value: '94%' },
            { label: 'Facial Symmetry', value: '89%' },
            { label: 'Animation Ready', value: 'Yes' },
        ],
        tags: [
            { label: 'Cranial Mesh', value: '27 Nodes' },
            { label: 'Optic Band', value: 'Stabilized' },
            { label: 'Jaw Arc', value: '2.4 Rad' },
            { label: 'Rig Port', value: 'Enabled' },
        ],
        metrics: [
            { label: 'Vertex density', value: '12.8K' },
            { label: 'Tracking fidelity', value: '98.3%' },
            { label: 'Latency', value: '06 ms' },
        ],
        readout: [
            { label: 'Wireframe shell', value: 'Nominal' },
            { label: 'Pose profile', value: 'Neutral A' },
            { label: 'Viewport lock', value: 'Centerline' },
        ],
        channels: [
            { label: 'Biometric contour match', pct: 91 },
            { label: 'Expression calibration', pct: 76 },
            { label: 'Gesture mapping', pct: 84 },
        ],
        notes: [
            { title: 'Operator note', body: 'Use this layout as a landing view for an avatar generator, ID card, or sci-fi profile system.' },
            { title: 'Visual cues', body: 'Built in pure HTML/CSS — swap the center wireframe for a real WebGL avatar later.' },
        ],
    };
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

/**
 * The Hermes workspace roster shown in Honcho's Agents view. Each persona has
 * a distinct provider preference, but `applyModelPreference` honestly falls
 * back to the user's active configured provider when that key is unavailable.
 */
export const HERMES_PERSONA_IDS = [
    'hermes-labyrinth',
    'hermes-mercury',
    'hermes-orpheus',
    'hermes-philosopher',
    'hermes-scribe',
] as const;

/** Built-in discipline specialists. Several mirror folded standalone agents. */
export const DEFAULT_PERSONAS: Persona[] = ([
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
    {
        id: HERMES_PERSONA_IDS[0],
        name: 'Labyrinth',
        discipline: 'strategy',
        icon: 'brain-circuit',
        color: '#8b5cf6',
        tagline: 'Maps complex systems and finds the path through them',
        systemPrompt:
            `You are Labyrinth, Hermes's systems-planning persona. Decompose ambiguous goals, map dependencies, expose hidden constraints, and leave a precise execution path. ${RIGOR}`,
        preferredModel: { provider: 'anthropic' },
        builtin: true,
    },
    {
        id: HERMES_PERSONA_IDS[1],
        name: 'Mercury',
        discipline: 'operations',
        icon: 'zap',
        color: '#38bdf8',
        tagline: 'Moves quickly from instruction to concrete action',
        systemPrompt:
            `You are Mercury, Hermes's fast operations persona. Turn instructions into an ordered checklist, execute the highest-leverage steps first, and report blockers plainly. ${RIGOR}`,
        preferredModel: { provider: 'openai' },
        builtin: true,
    },
    {
        id: HERMES_PERSONA_IDS[2],
        name: 'Orpheus',
        discipline: 'creative',
        icon: 'sparkles',
        color: '#ec4899',
        tagline: 'Synthesizes ideas into memorable creative work',
        systemPrompt:
            `You are Orpheus, Hermes's creative synthesis persona. Find the emotional and conceptual through-line, generate distinctive options, and refine the strongest one into finished work. ${RIGOR}`,
        preferredModel: { provider: 'gemini' },
        builtin: true,
    },
    {
        id: HERMES_PERSONA_IDS[3],
        name: 'Philosopher',
        discipline: 'research',
        icon: 'book-open',
        color: '#f59e0b',
        tagline: 'Challenges assumptions and tests what is actually true',
        systemPrompt:
            `You are Philosopher, Hermes's deep-reasoning persona. Clarify definitions, challenge assumptions, compare competing explanations, and distinguish evidence from inference. ${RIGOR}`,
        preferredModel: { provider: 'local' },
        builtin: true,
    },
    {
        id: HERMES_PERSONA_IDS[4],
        name: 'Scribe',
        discipline: 'comms',
        icon: 'pen-tool',
        color: '#22c55e',
        tagline: 'Turns completed work into clear durable records',
        systemPrompt:
            `You are Scribe, Hermes's documentation persona. Convert work into concise, durable, well-structured records with decisions, evidence, open questions, and next actions. ${RIGOR}`,
        preferredModel: { provider: 'custom' },
        builtin: true,
    },
] as Persona[]).map((p): Persona => ({
    // LibreChat skills arc (2026-06-10): every built-in persona ships equipped
    // with the AI Skills its discipline needs (lib/agents/skills.ts ids exist
    // 1:1 in stellaToolCatalog so PersonaWorkspace renders them as chips).
    ...p,
    tools: [...new Set([...(p.tools ?? []), ...skillIdsForDiscipline(p.discipline)])],
}));

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

/* ─── Neural avatar loops ─── */

/** The 10 looping "neural network" animations (one distinct loop per persona). */
export const NEURAL_VIDEOS: string[] = Array.from({ length: 10 }, (_, i) => `/assets/neural/neural-${i + 1}.mp4`);

// Built-ins get a stable, DISTINCT loop by their position in the default list.
const BUILTIN_VIDEO: Record<string, string> = {};
DEFAULT_PERSONAS.forEach((p, i) => { BUILTIN_VIDEO[p.id] = NEURAL_VIDEOS[i % NEURAL_VIDEOS.length]; });

/** A deterministic neural loop for any persona (custom personas hash to one). */
export function neuralVideoFor(id: string): string {
    if (BUILTIN_VIDEO[id]) return BUILTIN_VIDEO[id];
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return NEURAL_VIDEOS[h % NEURAL_VIDEOS.length];
}

/** Center circle: an uploaded image, else the wireframe. */
export function resolveAvatar(p: Persona): PersonaAvatar {
    if (p.avatar?.kind === 'image' && p.avatar.src) return p.avatar;
    return { kind: 'wireframe' };
}

/** The looping neural video shown in the dossier's top-right corner. */
export function resolveNeuralVideo(p: Persona): string {
    return p.neuralVideo || neuralVideoFor(p.id);
}
