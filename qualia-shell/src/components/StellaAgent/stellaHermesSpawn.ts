/**
 * stellaHermesSpawn — Stella's first-class "spawn Hermes" capability (Cycle 17 Part B).
 *
 * Stella can dispatch a Hermes agent run straight from chat with `/hermes <task>`
 * (or "spawn hermes: <task>"). This module is the THIN, PURE, INJECTABLE glue
 * between Stella's chat and the ONE shared self-improving run path
 * (`hermesRunner.runHermes`) — there is NO second `/api/hermes/delegate` fetch
 * path here (reuse invariant; mirrors thoughtWeaverLinkage / araLinkage). The
 * few-shot injection (mechanism a) + proven-tool weighting (mechanism b) +
 * record-back into the LOCAL per-user learning store all live in the runner, so
 * Stella-spawned runs make Hermes better exactly like the standalone widget's do.
 *
 * PURE-AT-THE-SEAMS: `runHermes` is injectable, so the parse/format/orchestrate
 * logic is unit-testable with no DOM, no real fetch, and no learning store.
 */
import { runHermes as defaultRunHermes, type HermesRunResult, type RunHermesDeps } from '../HonchoHermesPanel/hermesRunner';

export interface ParsedHermesCommand {
    /** True when the chat text is a Hermes-spawn command. */
    isHermes: boolean;
    /** The task text after the command prefix (trimmed; '' when none given). */
    task: string;
}

const SLASH_RE = /^\/hermes\b[ \t]*(.*)$/is;
const SPAWN_RE = /^spawn\s+hermes\b[ \t]*:?[ \t]*(.*)$/is;

/**
 * Detect a Hermes-spawn command in a chat line. Pure.
 * Matches `/hermes <task>` and `spawn hermes[:] <task>` (case-insensitive).
 * Returns `{ isHermes: false }` for ordinary chat.
 */
export function parseHermesCommand(text: string): ParsedHermesCommand {
    const raw = (text ?? '').trim();
    const m = SLASH_RE.exec(raw) ?? SPAWN_RE.exec(raw);
    if (!m) return { isHermes: false, task: '' };
    return { isHermes: true, task: (m[1] ?? '').trim() };
}

/**
 * Render a Hermes run result as a chat-friendly Markdown reply. Pure.
 * Surfaces the outcome, the answer, a compact trace, and a learning footer so
 * the user can see the self-improvement loop working.
 */
export function formatHermesReply(result: HermesRunResult): string {
    const head = result.outcome === 'success' ? '⚡ **Hermes** completed the task' : '⚡ **Hermes** could not finish the task';
    const lines: string[] = [head, ''];

    if (result.outcome === 'success') {
        lines.push(result.result || '_(no answer text returned)_');
    } else {
        lines.push(`⚠️ ${result.error || 'The run failed.'}`);
    }

    const trace = result.steps
        .filter(s => s.type !== 'final_answer')
        .map(s => `- _${s.type}_: ${truncate(s.content, 160)}`);
    if (trace.length) {
        lines.push('', '<details><summary>Trace</summary>', '', ...trace, '</details>');
    }

    const footer: string[] = [];
    if (result.fewShotCount > 0) {
        footer.push(`🧠 learned from ${result.fewShotCount} similar past run${result.fewShotCount === 1 ? '' : 's'}`);
    }
    if (result.toolsUsed.length) {
        footer.push(`🔧 ${result.toolsUsed.join(', ')}`);
    }
    if (footer.length) lines.push('', `_${footer.join(' · ')}_`);

    return lines.join('\n');
}

function truncate(s: string, n: number): string {
    const t = (s ?? '').trim();
    return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

export interface SpawnHermesDeps extends Pick<RunHermesDeps, 'authFetch' | 'toolNames' | 'now' | 'record' | 'endpoint' | 'skillFallbackFn' | 'reactLoopFn' | 'llmFallbackFn'> {
    /** Injectable runner (defaults to the shared `runHermes`). */
    run?: (task: string, deps: RunHermesDeps) => Promise<HermesRunResult>;
}

export interface SpawnHermesOutcome {
    /** The raw run result (for callers that want steps/recordId). */
    result: HermesRunResult;
    /** Chat-ready Markdown reply. */
    reply: string;
}

/**
 * Spawn a Hermes run from Stella and return both the raw result and a chat-ready
 * reply. Never throws — the underlying runner resolves failures to an
 * `outcome: 'fail'` result, which `formatHermesReply` renders gracefully.
 */
export async function spawnHermesFromStella(task: string, deps: SpawnHermesDeps): Promise<SpawnHermesOutcome> {
    const run = deps.run ?? defaultRunHermes;
    const result = await run(task, {
        authFetch: deps.authFetch,
        toolNames: deps.toolNames,
        now: deps.now,
        record: deps.record,
        endpoint: deps.endpoint,
        // P11-6: offline chain passthrough (skill → ReAct loop → LLM).
        skillFallbackFn: deps.skillFallbackFn,
        reactLoopFn: deps.reactLoopFn,
        llmFallbackFn: deps.llmFallbackFn,
    });
    return { result, reply: formatHermesReply(result) };
}
