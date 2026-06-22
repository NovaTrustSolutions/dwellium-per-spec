/**
 * conductorChain — Phase-10 A3: multi-step chaining of COMMANDS + SKILLS in
 * one utterance ("open notepad and calculate 15% of 2400"). Closes the
 * BACKLOG gap "command clauses chain, but skills aren't chained with
 * commands" — parseCommand's compound path silently DROPPED skill clauses.
 *
 * Scope (deliberate):
 *  - command-only chains stay with parseCommand (existing behavior, ack UX);
 *    parseChain only claims an input when ≥2 clauses resolve AND ≥1 is a skill.
 *  - ALL clauses must resolve — a chat-shaped clause ("…and tell me a joke")
 *    sends the whole input to the LLM instead of half-running it.
 *  - spawn-claimed inputs are left to the spawn path (checked upstream and
 *    re-guarded here).
 *  - Result piping: a later SKILL clause may reference "the result" / "the
 *    answer" / "that result" — substituted with the previous skill's cleaned
 *    output ("calculate 15% of 2400 and calculate the result + 10" → 370).
 *    Command clauses can't be re-bound (their run() closures capture literal
 *    text) — documented limitation.
 *
 * React-free; ARA hosts execution (skills need the per-user LLM bundle).
 */
import { parseCommand, stripPoliteness, type ParsedCommand } from './dwelliumCommands';
import { matchSkill, type AgentSkill, type SkillContext, type SkillOrigin } from './agents/skills';
import { parseSpawn, type SpawnRequest } from './agents/spawn';

export interface ChainStep {
    kind: 'command' | 'skill' | 'spawn';
    /** The original clause text. */
    clause: string;
    label: string;
    command?: ParsedCommand;
    skill?: { skill: AgentSkill; arg: string };
    /** P11-3: orchestrator run as a chain step ("spawn team on X then …"). */
    spawn?: SpawnRequest;
}

/**
 * P11-3: host-provided runner for spawn steps (the orchestrator needs the
 * Agent Lab catalog + per-user LLM + Hermes wiring — ARA owns those).
 * Returns the run's final deliverable text for result piping.
 */
export type SpawnStepRunner = (req: SpawnRequest) => Promise<{ ok: boolean; text: string }>;

export interface CommandChain {
    label: string;
    steps: ChainStep[];
}

export interface ChainStepOutcome {
    step: ChainStep;
    ok: boolean;
    /** Markdown-ready result/ack text. */
    text: string;
}

/** Verbs whose argument legitimately contains connectors — never split (mirrors parseCommand). */
const NO_SPLIT = /^(?:group|tab|stack|remember|save|put|place|move|dock|send)\b/i;

const CONNECTOR_SPLIT = /\s*(?:,\s*then\s+|;\s*|\s+then\s+|\s+and\s+|,)\s*/i;

/** "the result" / "the answer" / "that result" → previous skill output. */
const RESULT_REF = /\b(?:the\s+result|that\s+result|the\s+answer)\b/gi;

/**
 * Skills that must NEVER receive a PIPED result as their argument. A piped
 * `lastResult` can be web/LLM/spawn-derived (a prior web-search or spawn
 * step), so it is UNTRUSTED — substituting it into the code runner would let
 * model/web text become arbitrary executed JS (`new Function`). The code
 * runner can still be triggered DIRECTLY by a user clause (that path is
 * unchanged); it just can't be fed a cross-step result. The whitelist-only
 * calculator is intentionally NOT here — its `evaluateMath` rejects every
 * identifier, so piping a number into "calculate the result + 10" stays the
 * documented, safe chaining feature.
 */
const NO_PIPE_SKILL_IDS: ReadonlySet<string> = new Set(['skill-code-runner']);

/** Strip markdown emphasis/code + collapse whitespace for piping into a next-step arg. */
export function cleanResultForPiping(text: string): string {
    return text
        .replace(/[*_`#]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

/**
 * The value a later step receives for "the result": when the previous output
 * ends in "= <number>" (calculator shape), pipe just the number — so
 * "calculate the result + 10" stays a valid expression; otherwise the cleaned
 * full text.
 */
export function extractPipeValue(text: string): string {
    const cleaned = cleanResultForPiping(text);
    const m = cleaned.match(/=\s*(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)\s*$/i);
    return m ? m[1] : cleaned;
}

/** "then"-class connectors ONLY — never bare "and" (so spawn goals and skill
 *  args containing "and" survive when the user chains with "then"). */
const THEN_SPLIT = /\s*(?:,\s*then\s+|;\s*|\s+then\s+)\s*/i;

function resolveClause(clause: string, origin: SkillOrigin): ChainStep | null {
    const c = clause.trim();
    if (!c) return null;
    // P11-3: spawn FIRST — parseCommand's own spawn rule would otherwise turn
    // the clause into a command step that fires the spawn EVENT (double-run).
    const spawn = parseSpawn(c);
    if (spawn) return { kind: 'spawn', clause: c, label: `Spawn ${spawn.name} → ${spawn.goal.slice(0, 32)}`, spawn };
    const cmd = parseCommand(c); // command verbs win, matching ARA's send order
    if (cmd) return { kind: 'command', clause: c, label: cmd.label, command: cmd };
    // PROVENANCE GATE: skill clauses only resolve for human-composer input.
    const hit = matchSkill(c, undefined, origin);
    if (hit) return { kind: 'skill', clause: c, label: `${hit.skill.name}: ${hit.arg.slice(0, 40)}`, skill: hit };
    return null;
}

function buildChain(parts: string[], origin: SkillOrigin): CommandChain | null {
    if (parts.length < 2) return null;
    const steps: ChainStep[] = [];
    for (const part of parts) {
        const step = resolveClause(part, origin);
        if (!step) return null; // unresolved clause → whole input goes to chat
        steps.push(step);
    }
    // command-only chains stay with parseCommand's compound path.
    if (!steps.some(st => st.kind === 'skill' || st.kind === 'spawn')) return null;
    return { label: steps.map(st => st.label).join(' · '), steps };
}

/**
 * Parse a multi-clause utterance into a command+skill+spawn chain, or null
 * when the input is single-intent / command-only / spawn-claimed / partially
 * chat. "then"-split is tried FIRST so chained spawn goals keep their "and"s
 * ("spawn build team on caching and bundles THEN remember the result").
 */
export function parseChain(input: string, origin: SkillOrigin = 'user'): CommandChain | null {
    // PROVENANCE GATE: the command+skill chain executes COMMANDS (open / move /
    // dock / send …) and pipes results, so it is a HUMAN-composer surface only.
    // The Option-B allowlist lets autonomous agents run a SAFE skill DIRECTLY
    // (runSkillForInput / runSkill), but untrusted model/web/tool/file text must
    // never drive a multi-step chain — keep the whole parser user-origin-only.
    if (origin !== 'user') return null;
    const s = input.trim();
    if (!s) return null;
    const l = stripPoliteness(s);
    if (!l || NO_SPLIT.test(l)) return null;

    // P11-3 pass 0 — "then"-only split (and-preserving; allows spawn steps).
    const thenChain = buildChain(l.split(THEN_SPLIT).map(p => p.trim()).filter(Boolean), origin);
    if (thenChain) return thenChain;

    if (parseSpawn(l)) return null; // whole-input spawn owns and-in-goal

    return buildChain(l.split(CONNECTOR_SPLIT).map(p => p.trim()).filter(Boolean), origin);
}

/**
 * Execute a chain sequentially: commands fire their run(); skills run with
 * the supplied context, with "the result" references substituted from the
 * previous successful skill output. Outcomes stream via onStep.
 */
export async function executeChain(
    chain: CommandChain,
    ctx: SkillContext,
    onStep?: (index: number, outcome: ChainStepOutcome) => void,
    runSpawnStep?: SpawnStepRunner,
): Promise<ChainStepOutcome[]> {
    const outcomes: ChainStepOutcome[] = [];
    let lastResult = '';
    for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];
        let outcome: ChainStepOutcome;
        if (step.kind === 'spawn' && step.spawn) {
            // P11-3: long-running orchestrator step — the chain WAITS for the
            // run (sequential semantics), then pipes its final deliverable.
            if (!runSpawnStep) {
                outcome = { step, ok: false, text: 'Spawn steps need the ARA host (no runner supplied).' };
            } else {
                try {
                    const r = await runSpawnStep(step.spawn);
                    outcome = { step, ok: r.ok, text: r.text };
                    if (r.ok) lastResult = extractPipeValue(r.text);
                } catch (err) {
                    outcome = { step, ok: false, text: err instanceof Error ? err.message : String(err) };
                }
            }
        } else if (step.kind === 'command' && step.command) {
            try {
                step.command.run();
                outcome = { step, ok: true, text: step.command.label };
            } catch (err) {
                outcome = { step, ok: false, text: err instanceof Error ? err.message : String(err) };
            }
        } else if (step.kind === 'skill' && step.skill) {
            // Result piping carries (possibly web/LLM/spawn-derived) text from a
            // prior step. Never let that untrusted value reach an arbitrary-exec
            // skill (the code runner) — those run their literal clause instead.
            const allowPipe = lastResult && !NO_PIPE_SKILL_IDS.has(step.skill.skill.id);
            const arg = allowPipe ? step.skill.arg.replace(RESULT_REF, lastResult) : step.skill.arg;
            try {
                const r = await step.skill.skill.run(arg, ctx);
                outcome = { step, ok: r.ok, text: r.text };
                if (r.ok) lastResult = extractPipeValue(r.text);
            } catch (err) {
                outcome = { step, ok: false, text: err instanceof Error ? err.message : String(err) };
            }
        } else {
            outcome = { step, ok: false, text: 'Unresolvable step.' };
        }
        outcomes.push(outcome);
        onStep?.(i, outcome);
    }
    return outcomes;
}
