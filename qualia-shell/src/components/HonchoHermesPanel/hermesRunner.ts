/**
 * hermesRunner — the ONE shared, injectable Hermes run path.
 *
 * Cycle 17. Both the standalone Honcho/Hermes widget and Stella's "spawn Hermes"
 * capability call this — there is no second copy of the `/api/hermes/delegate`
 * fetch + response-normalize + self-improvement learning glue (reuse invariant;
 * mirrors the reportEngine.ts "one engine, thin callers" discipline from
 * Cycle 13/14).
 *
 * Self-improvement is built in (Cycle 16 store):
 *   (a) run-memory few-shot — relevant PAST SUCCESSES are injected as context;
 *   (b) tool success-weighting — the candidate tool list is re-ranked so proven
 *       tools are preferred, sent to the backend as a soft `preferredTools` hint.
 * Every run is recorded back into the LOCAL per-user store (failures included —
 * they keep bad paths down and proven tools up).
 *
 * PURE-AT-THE-SEAMS: the network call, the clock, and every learning-store
 * function are injectable, so the whole path is unit-testable with no DOM, no
 * real fetch, no localStorage, and no wall clock. The React components are thin
 * callers that map the returned shape onto their own state.
 */
import {
    recordRun as defaultRecordRun,
    relevantPastRuns as defaultRelevantPastRuns,
    formatFewShot as defaultFormatFewShot,
    rankToolsByWeight as defaultRankToolsByWeight,
    classifyTaskType as defaultClassifyTaskType,
    hermesLearningStore,
    type HermesRunRecord,
    type RunInput,
    type TaskType,
} from './hermesLearningStore';

export interface HermesRunStep {
    type: 'thought' | 'action' | 'observation' | 'final_answer';
    content: string;
    timestamp: string;
}

export interface HermesRunResult {
    steps: HermesRunStep[];
    /** Final answer text (empty string when the run failed). */
    result: string;
    outcome: 'success' | 'fail';
    /** Tools the run used (backend-reported, else inferred from the trace). */
    toolsUsed: string[];
    /** Coarse task type used for few-shot + tool weighting. */
    taskType: TaskType;
    /** How many past successes were injected as few-shot context. */
    fewShotCount: number;
    /** Id of the learning-store record written for this run (when recorded). */
    recordId?: string;
    /** Error message when the network/parse failed. */
    error?: string;
}

/** Minimal `fetch`-shaped function (UserContext.authFetch satisfies this). */
type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface RunHermesDeps {
    /** Required: how to reach the backend (auth headers attached by the caller). */
    authFetch: AuthFetch;
    /** Registered tool names, used for weighting + trace inference. */
    toolNames?: string[];
    /** Injectable clock for deterministic step timestamps in tests. */
    now?: () => string;
    /** Set false to skip writing to the learning store (default true). */
    record?: boolean;
    /** Endpoint override (default '/api/hermes/delegate'). */
    endpoint?: string;
    // Injectable learning-store seams (default to the real per-user store):
    relevantPastRunsFn?: (prompt: string) => HermesRunRecord[];
    formatFewShotFn?: (runs: HermesRunRecord[]) => string;
    rankToolsByWeightFn?: (tools: string[], runs: HermesRunRecord[], taskType: TaskType) => string[];
    classifyTaskTypeFn?: (prompt: string) => TaskType;
    recordRunFn?: (input: RunInput) => HermesRunRecord;
    learningSnapshot?: () => HermesRunRecord[];
}

/**
 * Infer which tools a run used by scanning the ReAct trace for tool names.
 * Pure — used when the backend doesn't report `toolsUsed`.
 */
export function deriveUsedTools(steps: { content: string }[], toolNames: string[]): string[] {
    const haystack = steps.map(s => (s.content || '').toLowerCase()).join('\n');
    const seen = new Set<string>();
    for (const name of toolNames) {
        const n = (name || '').toLowerCase();
        if (n && haystack.includes(n)) seen.add(name);
    }
    return [...seen];
}

/**
 * Run a Hermes task through the shared self-improving path. Never throws — a
 * network/parse failure resolves to an `outcome: 'fail'` result with `.error`
 * set (and is still recorded, so the failure informs future weighting).
 */
export async function runHermes(task: string, deps: RunHermesDeps): Promise<HermesRunResult> {
    const now = deps.now ?? (() => new Date().toISOString());
    const toolNames = deps.toolNames ?? [];
    const endpoint = deps.endpoint ?? '/api/hermes/delegate';
    const classify = deps.classifyTaskTypeFn ?? defaultClassifyTaskType;
    const relevant = deps.relevantPastRunsFn ?? defaultRelevantPastRuns;
    const fewShotFmt = deps.formatFewShotFn ?? defaultFormatFewShot;
    const rankTools = deps.rankToolsByWeightFn ?? defaultRankToolsByWeight;
    const record = deps.recordRunFn ?? defaultRecordRun;
    const snapshot = deps.learningSnapshot ?? hermesLearningStore.getSnapshot;
    const shouldRecord = deps.record !== false;

    const taskType = classify(task);
    const pastRuns = relevant(task);
    const fewShot = fewShotFmt(pastRuns);
    const preferredTools = rankTools(toolNames, snapshot(), taskType);

    const steps: HermesRunStep[] = [
        { type: 'thought', content: `Processing: "${task}"`, timestamp: now() },
    ];
    let result = '';
    let outcome: 'success' | 'fail' = 'fail';
    let usedTools: string[] = [];
    let error: string | undefined;

    try {
        const res = await deps.authFetch(endpoint, {
            method: 'POST',
            body: JSON.stringify({ task, context: fewShot, preferredTools }),
        });
        const data = await res.json();
        if (data?.success && data.data) {
            const d = data.data;
            if (d.thought) steps.push({ type: 'thought', content: d.thought, timestamp: now() });
            if (d.action) steps.push({ type: 'action', content: d.action, timestamp: now() });
            if (d.observation) steps.push({ type: 'observation', content: d.observation, timestamp: now() });
            result = d.answer || d.result || '';
            steps.push({ type: 'final_answer', content: result || 'Task completed.', timestamp: now() });
            outcome = result ? 'success' : 'fail';
            usedTools = Array.isArray(d.toolsUsed) ? d.toolsUsed : deriveUsedTools(steps, toolNames);
        } else {
            const msg: string = data?.error || 'Task failed.';
            error = msg;
            steps.push({ type: 'final_answer', content: msg, timestamp: now() });
        }
    } catch (err: any) {
        error = err?.message || String(err);
        steps.push({ type: 'final_answer', content: `Error: ${error}`, timestamp: now() });
    }

    let recordId: string | undefined;
    if (shouldRecord) {
        try {
            const rec = record({
                prompt: task,
                taskType,
                toolsUsed: usedTools,
                steps: steps.length,
                outcome,
                summary: result || undefined,
            });
            recordId = rec.id;
        } catch { /* learning store never blocks a run */ }
    }

    return {
        steps,
        result,
        outcome,
        toolsUsed: usedTools,
        taskType,
        fewShotCount: pastRuns.length,
        recordId,
        error,
    };
}
