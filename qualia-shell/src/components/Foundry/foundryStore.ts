/**
 * foundryStore — local-first Document Intake / Foundry pipeline (spec §7.4).
 *
 * Capture (paste / URL) → Triage (AI proposes tags, target, quality) → Review
 * (user approves/modifies) → Admit (enters the knowledge pipeline). Foundry
 * items track separately from ingested documents — they live in their own
 * per-user namespace. Adapted from the Electron holocron reference to a
 * browser-first `createLocalStorageStore`.
 *
 * Storage key:  dwellium:foundry:<userId>   (fallback :_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export type FoundryStatus = 'captured' | 'triaged' | 'admitted' | 'rejected';
export type FoundrySourceType = 'paste' | 'url';

export interface FoundryItem {
    id: string;
    createdAt: string;
    sourceType: FoundrySourceType;
    sourceUrl: string | null;
    rawContent: string;
    tags: string[];
    target: string | null;        // proposed target location (domain/project/thread)
    qualityScore: number | null;  // 0–100
    assessment: string | null;
    status: FoundryStatus;
    triagedBy: 'llm' | 'heuristic' | null;
}

export interface TriageResult {
    tags: string[];
    target: string | null;
    qualityScore: number | null;
    assessment: string | null;
}

export const foundryUserIdHolder: { current: string | null } = { current: null };

export function resolveFoundryKey(): string {
    const uid = foundryUserIdHolder.current;
    return uid ? `dwellium:foundry:${uid}` : 'dwellium:foundry:_anonymous';
}

function deserialize(raw: string | null): FoundryItem[] {
    if (!raw) return [];
    try {
        const o = JSON.parse(raw);
        return Array.isArray(o) ? o.filter((x) => x && typeof x.rawContent === 'string') : [];
    } catch {
        return [];
    }
}

export const foundryStore = createLocalStorageStore<FoundryItem[]>({
    key: resolveFoundryKey,
    deserializer: deserialize,
    defaultValue: [],
});

function newId(): string {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID(); } catch { /* */ }
    return `fdy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function persist(next: FoundryItem[]): void {
    foundryStore.set(next, () => {
        try { localStorage.setItem(resolveFoundryKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Capture a new item (status 'captured'). Most-recent-first. */
export function captureItem(
    input: { sourceType: FoundrySourceType; rawContent: string; sourceUrl?: string | null },
    now: Date = new Date(),
): FoundryItem | null {
    if (typeof window === 'undefined') return null;
    if (!input.rawContent.trim()) return null;
    const item: FoundryItem = {
        id: newId(), createdAt: now.toISOString(),
        sourceType: input.sourceType, sourceUrl: input.sourceUrl ?? null,
        rawContent: input.rawContent.trim(),
        tags: [], target: null, qualityScore: null, assessment: null,
        status: 'captured', triagedBy: null,
    };
    persist([item, ...foundryStore.getSnapshot()]);
    return item;
}

export function updateItem(id: string, patch: Partial<FoundryItem>): void {
    if (typeof window === 'undefined') return;
    const next = foundryStore.getSnapshot().map((it) => (it.id === id ? { ...it, ...patch } : it));
    persist(next);
}

/** Apply a triage result (status → 'triaged'). */
export function applyTriage(id: string, t: TriageResult, by: 'llm' | 'heuristic'): void {
    updateItem(id, { ...t, status: 'triaged', triagedBy: by });
}

export function admitItem(id: string): void { updateItem(id, { status: 'admitted' }); }
export function rejectItem(id: string): void { updateItem(id, { status: 'rejected' }); }

export function clearFoundry(): void {
    if (typeof window === 'undefined') return;
    persist([]);
}

const STOPWORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'will', 'into', 'about', 'their', 'your', 'they', 'them', 'then', 'than', 'when', 'what', 'which', 'while', 'would', 'could', 'should']);

/**
 * Heuristic triage used when no LLM is configured — deterministic + testable.
 * Tags = most frequent meaningful words; quality scales with length + structure.
 */
export function heuristicTriage(content: string): TriageResult {
    const words = (content.toLowerCase().match(/[a-z][a-z'-]{3,}/g) ?? []).filter((w) => !STOPWORDS.has(w));
    const freq = new Map<string, number>();
    for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
    const tags = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
    const len = content.trim().length;
    const qualityScore = Math.max(10, Math.min(95, Math.round(len / 20) + (content.includes('\n') ? 10 : 0)));
    const assessment = len < 120
        ? 'Short snippet — may need more context before admitting.'
        : 'Substantive capture — review tags and target, then admit.';
    return { tags, target: null, qualityScore, assessment };
}
