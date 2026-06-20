import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { withSync } from './oneSaveStore';

export interface KgProject {
    id: string;
    name: string;
    lang: string;
    files: number;
    clusters: number;
    blurb: string;
}

export interface KgGraphData {
    files: number;
    edges: number;
    clusters: number;
    tokens: number;
    usdPerSession: number;
    importantFiles: { name: string; score: number; pct: number }[];
    nodes: { label: string; cluster: number; importance: number; deg: number }[];
    links: [number, number][];
    builtAt: string;
}

export interface HalocronKnowledgeGraphState {
    /** User-added graph tabs. Shipped defaults stay in DEFAULT_KG_PROJECTS. */
    extras: KgProject[];
    /** Last selected graph tab. */
    activeId: string;
    /** Generated graph payloads for user-added repos, keyed by project id. */
    graphs: Record<string, KgGraphData>;
}

// files/clusters are REAL counts from the static import-graph build
// (Scripts/kg_analyze -> public/data/kg/<id>.json). Each project loads its real
// graph JSON (nodes/edges/important files/savings) on selection.
export const DEFAULT_KG_PROJECTS: KgProject[] = [
    { id: 'hermes', name: 'Hermes Agent', lang: 'PYTHON', files: 3278, clusters: 18, blurb: 'NousResearch/hermes-agent — graphed from the repo.' },
    { id: 'stella', name: 'Stella', lang: 'PYTHON', files: 179, clusters: 4, blurb: 'ultraworkers/claw-code — graphed from the repo.' },
    { id: 'claude', name: 'Claude Code', lang: 'TYPESCRIPT', files: 99, clusters: 3, blurb: 'anthropics/claude-code-action — graphed from the repo.' },
    { id: 'antigravity', name: 'AntiGravity', lang: 'PYTHON', files: 68, clusters: 2, blurb: 'google-antigravity/antigravity-sdk-python — graphed from the repo.' },
    { id: 'chatgpt', name: 'ChatGPT', lang: 'TYPESCRIPT', files: 39, clusters: 3, blurb: 'lencx/ChatGPT — graphed from the repo.' },
    { id: 'codex', name: 'Codex', lang: 'RUST', files: 2931, clusters: 6, blurb: 'openai/codex — graphed from the repo.' },
];

export const DEFAULT_KG_STATE: HalocronKnowledgeGraphState = {
    extras: [],
    activeId: DEFAULT_KG_PROJECTS[0].id,
    graphs: {},
};

const LEGACY_PROJECTS_KEY = 'dwellium:kg-projects';
const LEGACY_ACTIVE_KEY = 'dwellium:kg-active-project';
const LEGACY_GDATA_PREFIX = 'dwellium:kg-gdata:';

function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `dwellium:kg:${uid}` : 'dwellium:kg:_anonymous';
}

function defaultIds(): Set<string> {
    return new Set(DEFAULT_KG_PROJECTS.map((project) => project.id));
}

function isProject(value: unknown): value is KgProject {
    if (!value || typeof value !== 'object') return false;
    const project = value as Partial<KgProject>;
    return typeof project.id === 'string'
        && typeof project.name === 'string'
        && typeof project.lang === 'string'
        && typeof project.blurb === 'string';
}

function normalizeProject(value: KgProject): KgProject {
    return {
        id: String(value.id),
        name: String(value.name || 'Project'),
        lang: String(value.lang || 'CODE'),
        files: Number(value.files) || 0,
        clusters: Number(value.clusters) || 0,
        blurb: String(value.blurb || ''),
    };
}

function isGraphData(value: unknown): value is KgGraphData {
    return !!value && typeof value === 'object'
        && Array.isArray((value as KgGraphData).nodes)
        && Array.isArray((value as KgGraphData).links)
        && Array.isArray((value as KgGraphData).importantFiles);
}

function normalizeGraphs(value: unknown): Record<string, KgGraphData> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const graphs: Record<string, KgGraphData> = {};
    for (const [id, graph] of Object.entries(value as Record<string, unknown>)) {
        if (isGraphData(graph)) graphs[id] = graph;
    }
    return graphs;
}

function normalize(raw: unknown): HalocronKnowledgeGraphState {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_KG_STATE, graphs: {} };
    const parsed = raw as Partial<HalocronKnowledgeGraphState> & { projects?: unknown };
    const ids = defaultIds();
    const sourceExtras = Array.isArray(parsed.extras)
        ? parsed.extras
        : Array.isArray(parsed.projects)
            ? parsed.projects
            : [];
    const extras = sourceExtras
        .filter(isProject)
        .map(normalizeProject)
        .filter((project, index, all) => !ids.has(project.id) && all.findIndex((p) => p.id === project.id) === index);
    const validIds = new Set([...ids, ...extras.map((project) => project.id)]);
    const activeId = typeof parsed.activeId === 'string' && validIds.has(parsed.activeId)
        ? parsed.activeId
        : DEFAULT_KG_STATE.activeId;
    return {
        extras,
        activeId,
        graphs: normalizeGraphs(parsed.graphs),
    };
}

function legacyState(): HalocronKnowledgeGraphState {
    if (typeof window === 'undefined') return { ...DEFAULT_KG_STATE, graphs: {} };
    try {
        const projectRaw = window.localStorage.getItem(LEGACY_PROJECTS_KEY);
        const activeRaw = window.localStorage.getItem(LEGACY_ACTIVE_KEY);
        const parsedProjects = projectRaw ? JSON.parse(projectRaw) : [];
        const extras = Array.isArray(parsedProjects)
            ? parsedProjects.filter(isProject).map(normalizeProject)
            : [];
        const graphs: Record<string, KgGraphData> = {};
        for (const project of extras) {
            const graphRaw = window.localStorage.getItem(LEGACY_GDATA_PREFIX + project.id);
            if (!graphRaw) continue;
            try {
                const graph = JSON.parse(graphRaw);
                if (isGraphData(graph)) graphs[project.id] = graph;
            } catch { /* corrupt legacy graph cache */ }
        }
        return normalize({ extras, activeId: activeRaw || DEFAULT_KG_STATE.activeId, graphs });
    } catch {
        return { ...DEFAULT_KG_STATE, graphs: {} };
    }
}

function deserialize(raw: string | null): HalocronKnowledgeGraphState {
    if (!raw) return legacyState();
    try {
        return normalize(JSON.parse(raw));
    } catch {
        return legacyState();
    }
}

export const halocronKnowledgeGraphStore = withSync(
    createLocalStorageStore<HalocronKnowledgeGraphState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: { ...DEFAULT_KG_STATE, graphs: {} },
    }),
    { objectType: 'halocron-knowledge-graph', holder: integrationsUserIdHolder, resolveKey },
);

export function useHalocronKnowledgeGraphState(): HalocronKnowledgeGraphState {
    return useSyncExternalStore(
        halocronKnowledgeGraphStore.subscribe,
        halocronKnowledgeGraphStore.getSnapshot,
        halocronKnowledgeGraphStore.getServerSnapshot,
    );
}

export function saveHalocronKnowledgeGraphState(next: HalocronKnowledgeGraphState): void {
    const normalized = normalize(next);
    halocronKnowledgeGraphStore.set(normalized, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(normalized)); } catch { /* sandboxed */ }
    });
}

export function setKgActiveProject(activeId: string): void {
    const current = halocronKnowledgeGraphStore.getSnapshot();
    saveHalocronKnowledgeGraphState({ ...current, activeId });
}

export function upsertKgProject(project: KgProject, graph?: KgGraphData): void {
    const current = halocronKnowledgeGraphStore.getSnapshot();
    const normalizedProject = normalizeProject(project);
    const extras = current.extras.some((item) => item.id === normalizedProject.id)
        ? current.extras.map((item) => item.id === normalizedProject.id ? normalizedProject : item)
        : [...current.extras, normalizedProject];
    saveHalocronKnowledgeGraphState({
        extras,
        activeId: normalizedProject.id,
        graphs: graph ? { ...current.graphs, [normalizedProject.id]: graph } : current.graphs,
    });
}
