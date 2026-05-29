/**
 * hermesLearningStore — Hermes self-improvement ("the more it's used, the
 * better it gets"), LOCAL + per-user. Cycle 16 of the scribe-ingestion arc.
 *
 * Two mechanisms, both fed by ONE local run log (single source of truth):
 *
 *   (a) Run-memory few-shot. Every Hermes run is appended to a per-user log
 *       (prompt, classified task type, tools used, step count, outcome,
 *       optional user rating, short result summary). `relevantPastRuns()`
 *       returns the top-K most-similar PAST SUCCESSES so a new run can inject
 *       them as few-shot context — the agent learns from what worked before.
 *
 *   (b) Tool success-weighting. `toolWeights()` derives, per task type, a
 *       Laplace-smoothed success rate for each tool from the same log;
 *       `rankToolsByWeight()` re-orders a candidate tool list to prefer
 *       proven tools over time.
 *
 * Deriving (b) from the (a) log avoids dual-write drift — the run history IS
 * the model. NO model fine-tuning (not feasible in-app; that is a future
 * Electron/backend-GPU concern — documented, not attempted).
 *
 * Storage key:  hermes:learning:<userId>   (per-user dynamic-key factory,
 * Phase-8+ Task 8.10 Option β; sister-shape to honchoDreamStore /
 * thoughtWeaverStore). SSR-safe: no window/localStorage/new Date at module
 * top-level; browser globals touched only inside getSnapshot / set callbacks.
 *
 * The pure helpers (`classifyTaskType`, `similarity`, `rankPastRuns`,
 * `computeToolWeights`, `rankToolsByWeight`, `formatFewShot`) take their data
 * as arguments and read nothing external — unit-testable with no DOM, no
 * localStorage, no clock.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

/* ─── Types ─── */
export type RunOutcome = 'success' | 'fail';

export type TaskType =
    | 'research'
    | 'code'
    | 'file'
    | 'communication'
    | 'data'
    | 'planning'
    | 'general';

export interface HermesRunRecord {
    id: string;
    prompt: string;
    taskType: TaskType;
    toolsUsed: string[];
    /** Number of reasoning/action steps the run produced. */
    steps: number;
    outcome: RunOutcome;
    /** Optional user feedback: -1 (down) … +1 (up); finer scales allowed. */
    rating?: number;
    /** Short final-answer snippet, kept for few-shot context (truncated). */
    summary?: string;
    createdAt: string;
}

/** Input to recordRun — id/createdAt/taskType are filled in if omitted. */
export interface RunInput {
    prompt: string;
    toolsUsed?: string[];
    steps?: number;
    outcome: RunOutcome;
    rating?: number;
    summary?: string;
    /** Override the auto-classifier when the caller already knows the type. */
    taskType?: TaskType;
}

export interface ToolWeight {
    tool: string;
    /** Laplace-smoothed success rate in [0,1]. */
    weight: number;
    successes: number;
    attempts: number;
}

/* ─── Tunables ─── */
/** Keep the most-recent N runs; older ones are pruned on append. */
const MAX_RUNS = 250;
/** Default few-shot fan-out. */
const DEFAULT_K = 3;
/** Cap the stored summary length to keep localStorage small. */
const SUMMARY_MAX = 280;

/* ─── Pure helpers (no external reads) ─── */

const TASK_KEYWORDS: Array<{ type: TaskType; words: string[] }> = [
    { type: 'code', words: ['code', 'bug', 'function', 'refactor', 'compile', 'test', 'script', 'debug', 'implement', 'typescript', 'python'] },
    { type: 'research', words: ['research', 'find out', 'investigate', 'search', 'look up', 'explain', 'compare', 'summarize', 'who', 'what', 'why', 'how'] },
    { type: 'file', words: ['file', 'folder', 'convert', 'markdown', 'pdf', 'docx', 'rename', 'organize', 'backup', 'directory'] },
    { type: 'communication', words: ['email', 'message', 'reply', 'draft', 'send', 'notify', 'slack', 'call'] },
    { type: 'data', words: ['data', 'csv', 'table', 'spreadsheet', 'chart', 'calculate', 'sum', 'analyze', 'query', 'sql'] },
    { type: 'planning', words: ['plan', 'schedule', 'todo', 'to-do', 'task', 'organize my', 'remind', 'roadmap', 'agenda'] },
];

/**
 * Classify a prompt into a coarse task type by keyword scoring. Deterministic,
 * lowercase, falls back to 'general' when nothing matches. Pure.
 */
export function classifyTaskType(prompt: string): TaskType {
    const p = (prompt || '').toLowerCase();
    let best: TaskType = 'general';
    let bestScore = 0;
    for (const { type, words } of TASK_KEYWORDS) {
        let score = 0;
        for (const w of words) {
            if (p.includes(w)) score += 1;
        }
        if (score > bestScore) {
            bestScore = score;
            best = type;
        }
    }
    return best;
}

const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'is',
    'are', 'be', 'this', 'that', 'it', 'my', 'i', 'me', 'you', 'do', 'can',
    'please', 'how', 'what', 'why', 'all', 'from', 'by', 'at', 'as',
]);

function tokenize(text: string): Set<string> {
    return new Set(
        (text || '')
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 2 && !STOP_WORDS.has(t)),
    );
}

/**
 * Jaccard token-overlap similarity in [0,1] between two prompts. Pure.
 */
export function similarity(a: string, b: string): number {
    const ta = tokenize(a);
    const tb = tokenize(b);
    if (ta.size === 0 || tb.size === 0) return 0;
    let inter = 0;
    for (const t of ta) if (tb.has(t)) inter += 1;
    const union = ta.size + tb.size - inter;
    return union === 0 ? 0 : inter / union;
}

/**
 * Rank past runs by relevance to `prompt`, SUCCESSES ONLY, returning the top-K.
 * Same-task-type runs get a small boost; ties broken by recency. Pure (operates
 * on the supplied array, reads no store).
 */
export function rankPastRuns(
    runs: HermesRunRecord[],
    prompt: string,
    k: number = DEFAULT_K,
): HermesRunRecord[] {
    const wantType = classifyTaskType(prompt);
    const scored = runs
        .filter(r => r.outcome === 'success')
        .map(r => {
            const sim = similarity(prompt, r.prompt);
            const typeBoost = r.taskType === wantType ? 0.15 : 0;
            const ratingBoost = typeof r.rating === 'number' ? Math.max(0, r.rating) * 0.1 : 0;
            return { r, score: sim + typeBoost + ratingBoost };
        })
        .filter(s => s.score > 0);
    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Recency tiebreak (ISO strings sort lexicographically by time).
        return (b.r.createdAt || '').localeCompare(a.r.createdAt || '');
    });
    return scored.slice(0, Math.max(0, k)).map(s => s.r);
}

/**
 * Compute per-tool success weighting for a task type from the run log. Each
 * tool's weight is the Laplace-smoothed success rate (successes+1)/(attempts+2),
 * sorted high→low. Pure.
 */
export function computeToolWeights(
    runs: HermesRunRecord[],
    taskType: TaskType,
): ToolWeight[] {
    const stats = new Map<string, { successes: number; attempts: number }>();
    for (const run of runs) {
        if (run.taskType !== taskType) continue;
        for (const tool of run.toolsUsed || []) {
            if (!tool) continue;
            const s = stats.get(tool) || { successes: 0, attempts: 0 };
            s.attempts += 1;
            if (run.outcome === 'success') s.successes += 1;
            stats.set(tool, s);
        }
    }
    const out: ToolWeight[] = [];
    for (const [tool, s] of stats) {
        out.push({
            tool,
            weight: (s.successes + 1) / (s.attempts + 2),
            successes: s.successes,
            attempts: s.attempts,
        });
    }
    out.sort((a, b) => (b.weight !== a.weight ? b.weight - a.weight : b.attempts - a.attempts));
    return out;
}

/**
 * Re-order a candidate tool list to prefer proven tools for this task type.
 * Tools with learned weight come first (by weight); unseen tools keep their
 * original relative order at the end. Pure.
 */
export function rankToolsByWeight(
    candidateTools: string[],
    runs: HermesRunRecord[],
    taskType: TaskType,
): string[] {
    const weights = new Map(computeToolWeights(runs, taskType).map(w => [w.tool, w.weight]));
    return [...candidateTools].sort((a, b) => {
        const wa = weights.get(a);
        const wb = weights.get(b);
        if (wa === undefined && wb === undefined) return 0; // stable: keep order
        if (wa === undefined) return 1;
        if (wb === undefined) return -1;
        return wb - wa;
    });
}

/**
 * Render relevant past runs as a Markdown few-shot block for injection into a
 * new Hermes run's context. Empty input → ''. Pure.
 */
export function formatFewShot(runs: HermesRunRecord[]): string {
    if (!runs.length) return '';
    const lines = ['## Past successful runs (for reference)'];
    for (const r of runs) {
        const tools = r.toolsUsed?.length ? ` [tools: ${r.toolsUsed.join(', ')}]` : '';
        lines.push(`- Task: ${r.prompt}${tools}`);
        if (r.summary) lines.push(`  → ${r.summary}`);
    }
    return lines.join('\n');
}

/* ─── Per-user store ─── */
export const hermesLearningUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = hermesLearningUserIdHolder.current;
    return uid ? `hermes:learning:${uid}` : 'hermes:learning:_anonymous';
}

function deserialize(raw: string | null): HermesRunRecord[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((r: any): r is HermesRunRecord =>
            r &&
            typeof r.id === 'string' &&
            typeof r.prompt === 'string' &&
            (r.outcome === 'success' || r.outcome === 'fail'),
        ).map((r: any): HermesRunRecord => ({
            id: r.id,
            prompt: r.prompt,
            taskType: r.taskType ?? 'general',
            toolsUsed: Array.isArray(r.toolsUsed) ? r.toolsUsed.filter((t: any) => typeof t === 'string') : [],
            steps: typeof r.steps === 'number' ? r.steps : 0,
            outcome: r.outcome,
            rating: typeof r.rating === 'number' ? r.rating : undefined,
            summary: typeof r.summary === 'string' ? r.summary : undefined,
            createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
        }));
    } catch {
        return [];
    }
}

export const hermesLearningStore = createLocalStorageStore<HermesRunRecord[]>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: [],
});

function persist(next: HermesRunRecord[]) {
    hermesLearningStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/* ─── Mutators / store-reading API ─── */

/**
 * Append a run to the per-user log. Auto-fills id, createdAt, and (if omitted)
 * the classified task type; truncates the summary; prunes to MAX_RUNS.
 */
export function recordRun(input: RunInput): HermesRunRecord {
    const record: HermesRunRecord = {
        id: `hrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: input.prompt,
        taskType: input.taskType ?? classifyTaskType(input.prompt),
        toolsUsed: (input.toolsUsed || []).filter(Boolean),
        steps: typeof input.steps === 'number' ? input.steps : 0,
        outcome: input.outcome,
        rating: input.rating,
        summary: input.summary ? input.summary.slice(0, SUMMARY_MAX) : undefined,
        createdAt: new Date().toISOString(),
    };
    const current = hermesLearningStore.getSnapshot();
    persist([record, ...current].slice(0, MAX_RUNS));
    return record;
}

/** Attach (or update) a user rating on a recorded run. */
export function rateRun(id: string, rating: number): void {
    const current = hermesLearningStore.getSnapshot();
    persist(current.map(r => (r.id === id ? { ...r, rating } : r)));
}

/** Clear the per-user learning log. */
export function clearLearning(): void {
    hermesLearningStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/**
 * Top-K most-similar PAST SUCCESSES for few-shot injection (reads the store).
 */
export function relevantPastRuns(prompt: string, k: number = DEFAULT_K): HermesRunRecord[] {
    return rankPastRuns(hermesLearningStore.getSnapshot(), prompt, k);
}

/**
 * Per-tool success weighting for a task type (reads the store). Pass a prompt
 * via classifyTaskType when the type is not known.
 */
export function toolWeights(taskType: TaskType): ToolWeight[] {
    return computeToolWeights(hermesLearningStore.getSnapshot(), taskType);
}
