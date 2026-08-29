/**
 * researchLogStore — per-user experiments log for the Research Lab.
 *
 * What the USER typed and what the free providers answered (responses
 * truncated to 4k chars), capped at the newest 50 entries. It may sync via
 * One Save (it is the user's own research data) but must never be read by any
 * other module — researchLabImportGuard.test.ts asserts nothing outside
 * ResearchLab/researchLlm imports this store.
 *
 * remoteMachinesStore sister shape: dynamic-key store + withSync('researchLog').
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../oneSaveStore';
import { researchLogUserIdHolder } from '../perUserIdentity';

export const RESEARCH_LOG_CAP = 50;
export const RESEARCH_RESPONSE_TRUNCATE = 4000;

export interface ResearchLogResponse {
    providerId: string;
    model: string;
    /** Truncated to RESEARCH_RESPONSE_TRUNCATE chars. */
    text: string;
    latencyMs: number;
    /** Verbatim error (e.g. a 429 body) when the run failed. */
    error?: string;
    usage?: { promptTokens?: number; completionTokens?: number };
}

export interface ResearchLogEntry {
    id: string;
    prompt: string;
    systemPreset: string;
    responses: ResearchLogResponse[];
    createdAt: number;
}

export { researchLogUserIdHolder };

function resolveKey(): string {
    const uid = researchLogUserIdHolder.current;
    return uid ? `researchLog:${uid}` : 'researchLog:_anonymous';
}

function deserialize(raw: string | null): ResearchLogEntry[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.filter((e): e is ResearchLogEntry => !!e && typeof e.id === 'string' && typeof e.prompt === 'string' && Array.isArray(e.responses))
            : [];
    } catch {
        return [];
    }
}

export const researchLogStore = withSync(
    createLocalStorageStore<ResearchLogEntry[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'researchLog', holder: researchLogUserIdHolder, resolveKey },
);

function persist(next: ResearchLogEntry[]): void {
    researchLogStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function addLogEntry(input: Omit<ResearchLogEntry, 'id' | 'createdAt'>): ResearchLogEntry {
    const entry: ResearchLogEntry = {
        ...input,
        responses: input.responses.map(r => ({ ...r, text: r.text.slice(0, RESEARCH_RESPONSE_TRUNCATE) })),
        id: `rl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        createdAt: Date.now(),
    };
    persist([entry, ...researchLogStore.getSnapshot()].slice(0, RESEARCH_LOG_CAP));
    return entry;
}

/** UI-initiated only — the delete button in the History tab. */
export function removeLogEntry(id: string): void {
    persist(researchLogStore.getSnapshot().filter(e => e.id !== id));
}

/** Test escape hatch (v2.72.1 standing convention). */
export function resetResearchLog(): void {
    researchLogStore.reset();
}
