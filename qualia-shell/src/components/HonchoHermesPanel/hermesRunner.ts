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
    /** Which path produced the result (LibreChat skills arc 2026-06-10;
     *  'react' = P11-6 multi-step browser loop). */
    via?: 'backend' | 'skill' | 'react' | 'llm' | 'none';
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
    /**
     * LibreChat skills arc (2026-06-10): offline fallbacks. When the backend
     * delegate fails, Hermes first tries a direct browser-side skill match
     * (calculator / web search / weather / image gen / memory — see
     * lib/agents/skills.ts), then a single-shot run through the user's own
     * LLM key. Injectable so the runner stays unit-testable with no network.
     */
    skillFallbackFn?: (task: string) => Promise<{ ok: boolean; text: string; skillName: string } | null>;
    llmFallbackFn?: (task: string, fewShot: string) => Promise<string | null>;
    /**
     * P11-6: multi-step ReAct loop (reason → act via browser skills →
     * observe → repeat) on the user's LLM key. Tried AFTER the direct skill
     * match (free + instant) and BEFORE the single-shot LLM fallback.
     */
    reactLoopFn?: (task: string, fewShot: string) => Promise<{ steps: HermesRunStep[]; result: string; ok: boolean; toolsUsed: string[] } | null>;
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
    let via: 'backend' | 'skill' | 'react' | 'llm' | 'none' = 'none';

    /** Offline chain: browser-side skill → user's own LLM key. */
    const tryFallbacks = async (reason: string): Promise<void> => {
        if (deps.skillFallbackFn) {
            try {
                const hit = await deps.skillFallbackFn(task);
                if (hit && hit.ok) {
                    steps.push({ type: 'action', content: `Backend unavailable (${reason}) — ran the ${hit.skillName} skill locally.`, timestamp: now() });
                    steps.push({ type: 'final_answer', content: hit.text, timestamp: now() });
                    result = hit.text; outcome = 'success'; via = 'skill';
                    usedTools = [hit.skillName]; error = undefined;
                    return;
                }
            } catch { /* fall through to LLM */ }
        }
        if (deps.reactLoopFn) {
            try {
                const loop = await deps.reactLoopFn(task, fewShot);
                if (loop && loop.ok) {
                    steps.push({ type: 'thought', content: `Backend unavailable (${reason}) — running the multi-step browser loop.`, timestamp: now() });
                    steps.push(...loop.steps);
                    result = loop.result; outcome = 'success'; via = 'react';
                    usedTools = loop.toolsUsed; error = undefined;
                    return;
                }
            } catch { /* fall through to single-shot LLM */ }
        }
        if (deps.llmFallbackFn) {
            try {
                const answer = await deps.llmFallbackFn(task, fewShot);
                if (answer) {
                    steps.push({ type: 'action', content: `Backend unavailable (${reason}) — answered via your LLM key.`, timestamp: now() });
                    steps.push({ type: 'final_answer', content: answer, timestamp: now() });
                    result = answer; outcome = 'success'; via = 'llm'; error = undefined;
                    return;
                }
            } catch { /* keep original failure */ }
        }
    };

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
            if (outcome === 'success') via = 'backend';
            usedTools = Array.isArray(d.toolsUsed) ? d.toolsUsed : deriveUsedTools(steps, toolNames);
        } else {
            const msg: string = data?.error || 'Task failed.';
            error = msg;
            await tryFallbacks(msg);
            if (outcome === 'fail') steps.push({ type: 'final_answer', content: msg, timestamp: now() });
        }
    } catch (err: any) {
        error = err?.message || String(err);
        await tryFallbacks(error ?? 'network error');
        if (outcome === 'fail') steps.push({ type: 'final_answer', content: `Error: ${error}`, timestamp: now() });
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
        via,
    };
}
