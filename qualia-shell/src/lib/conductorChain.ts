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
import { matchSkill, type AgentSkill, type SkillContext } from './agents/skills';
import { parseSpawn } from './agents/spawn';

export interface ChainStep {
    kind: 'command' | 'skill';
    /** The original clause text. */
    clause: string;
    label: string;
    command?: ParsedCommand;
    skill?: { skill: AgentSkill; arg: string };
}

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

function resolveClause(clause: string): ChainStep | null {
    const c = clause.trim();
    if (!c) return null;
    const cmd = parseCommand(c); // command verbs win, matching ARA's send order
    if (cmd) return { kind: 'command', clause: c, label: cmd.label, command: cmd };
    const hit = matchSkill(c);
    if (hit) return { kind: 'skill', clause: c, label: `${hit.skill.name}: ${hit.arg.slice(0, 40)}`, skill: hit };
    return null;
}

/**
 * Parse a multi-clause utterance into a command+skill chain, or null when the
 * input is single-intent / command-only / spawn-claimed / partially chat.
 */
export function parseChain(input: string): CommandChain | null {
    const s = input.trim();
    if (!s) return null;
    const l = stripPoliteness(s);
    if (!l || NO_SPLIT.test(l)) return null;
    if (parseSpawn(l)) return null; // spawn path owns it (goal may contain "and")

    const parts = l.split(CONNECTOR_SPLIT).map(p => p.trim()).filter(Boolean);
    if (parts.length < 2) return null;

    const steps: ChainStep[] = [];
    for (const part of parts) {
        const step = resolveClause(part);
        if (!step) return null; // unresolved clause → whole input goes to chat
        steps.push(step);
    }
    if (!steps.some(st => st.kind === 'skill')) return null; // command-only → parseCommand

    return { label: steps.map(st => st.label).join(' · '), steps };
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
): Promise<ChainStepOutcome[]> {
    const outcomes: ChainStepOutcome[] = [];
    let lastResult = '';
    for (let i = 0; i < chain.steps.length; i++) {
        const step = chain.steps[i];
        let outcome: ChainStepOutcome;
        if (step.kind === 'command' && step.command) {
            try {
                step.command.run();
                outcome = { step, ok: true, text: step.command.label };
            } catch (err) {
                outcome = { step, ok: false, text: err instanceof Error ? err.message : String(err) };
            }
        } else if (step.kind === 'skill' && step.skill) {
            const arg = lastResult ? step.skill.arg.replace(RESULT_REF, lastResult) : step.skill.arg;
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
