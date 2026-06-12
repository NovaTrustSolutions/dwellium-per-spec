/**
 * hermesReact — P11-6: the browser-side multi-step ReAct loop.
 *
 * Replaces the single-shot LLM fallback as Hermes's primary offline brain:
 * reason → act (run a browser AGENT_SKILL) → observe → repeat (≤ maxSteps)
 * → final answer, driven by the user's own LLM key. Closes the BACKLOG gap
 * "Hermes browser-side fallback is single-shot, not a multi-step ReAct loop".
 *
 * Also owns the MERGED tool registry: when the backend is up, its tool names
 * and the browser skills rank/weight as ONE catalog (`mergedToolNames`) —
 * closing "backend tools + browser skills aren't merged into one registry".
 *
 * PURE-AT-THE-SEAMS like hermesRunner: LLM, skills, and clock are injectable;
 * unit-testable with no network.
 */
import { AGENT_SKILLS, type AgentSkill, type SkillContext } from '../../lib/agents/skills';
import { extractJson } from '../../lib/agents/orchestrator';
import { callLlm, type LlmRequest } from '../../lib/llmClient';
import type { IntegrationsBundle } from '../../types/integrations';
import type { HermesRunStep } from './hermesRunner';

export interface ReactLoopResult {
    steps: HermesRunStep[];
    result: string;
    ok: boolean;
    toolsUsed: string[];
}

export interface ReactLoopDeps {
    /** User-LLM invoker (injectable for tests). */
    invoke: (req: LlmRequest) => Promise<string | null>;
    /** Execute a named browser skill (injectable for tests). */
    runSkill: (name: string, input: string) => Promise<{ ok: boolean; text: string } | null>;
    /** Action catalog shown to the model. */
    skills: ReadonlyArray<{ name: string; description: string }>;
    /** Max reason→act iterations before a final answer is forced (default 4). */
    maxSteps?: number;
    now?: () => string;
}

/** Browser-skill names — the registry half the backend can't see. */
export const BROWSER_SKILL_TOOLS: ReadonlyArray<string> = AGENT_SKILLS.map(s => s.name);

/** ONE catalog: backend tool names + browser skills, deduped (P11-6). */
export function mergedToolNames(backendToolNames: ReadonlyArray<string>): string[] {
    return [...new Set([...backendToolNames, ...BROWSER_SKILL_TOOLS])];
}

interface LoopVerdict { thought?: string; action?: { tool?: string; input?: string }; final?: string }

/**
 * Run the ReAct loop. Resolves ok:false (never throws) when the model is
 * unavailable or produces nothing usable.
 */
export async function runReactLoop(task: string, fewShot: string, deps: ReactLoopDeps): Promise<ReactLoopResult> {
    const now = deps.now ?? (() => new Date().toISOString());
    const maxSteps = deps.maxSteps ?? 4;
    const steps: HermesRunStep[] = [];
    const toolsUsed = new Set<string>();
    const scratchpad: string[] = [];

    const systemPrompt =
        'You are Hermes, a tool-using task agent inside the Dwellium app. Work step by step.\n' +
        `TOOLS available:\n${deps.skills.map(s => `- ${s.name}: ${s.description}`).join('\n')}\n` +
        'Each turn respond with ONLY one JSON object, either\n' +
        '  {"thought": "<reasoning>", "action": {"tool": "<TOOL NAME exactly as listed>", "input": "<tool input>"}}\n' +
        'to use a tool, or\n' +
        '  {"thought": "<reasoning>", "final": "<your complete answer to the task>"}\n' +
        'when you can answer. Prefer tools for facts/calculations; never invent tool output.' +
        (fewShot ? `\n\n${fewShot}` : '');

    for (let i = 0; i < maxSteps; i++) {
        const raw = await deps.invoke({
            systemPrompt,
            prompt:
                `TASK: ${task}\n\n` +
                (scratchpad.length ? `SO FAR:\n${scratchpad.join('\n')}\n\n` : '') +
                'Next JSON:',
            temperature: 0.2,
            maxTokens: 600,
            responseFormat: 'json',
        });
        const v = extractJson<LoopVerdict>(raw);
        if (!v) break;
        if (v.thought) {
            steps.push({ type: 'thought', content: v.thought, timestamp: now() });
            scratchpad.push(`Thought: ${v.thought}`);
        }
        if (typeof v.final === 'string' && v.final.trim()) {
            steps.push({ type: 'final_answer', content: v.final, timestamp: now() });
            return { steps, result: v.final, ok: true, toolsUsed: [...toolsUsed] };
        }
        const tool = v.action?.tool?.trim();
        if (!tool) break;
        steps.push({ type: 'action', content: `${tool}(${v.action?.input ?? ''})`, timestamp: now() });
        let observation = '';
        try {
            const r = await deps.runSkill(tool, v.action?.input ?? '');
            observation = r ? (r.ok ? r.text : `Tool error: ${r.text}`) : `Unknown tool "${tool}".`;
            if (r) toolsUsed.add(tool);
        } catch (err) {
            observation = `Tool threw: ${err instanceof Error ? err.message : String(err)}`;
        }
        steps.push({ type: 'observation', content: observation.slice(0, 1200), timestamp: now() });
        scratchpad.push(`Action: ${tool}(${v.action?.input ?? ''})`, `Observation: ${observation.slice(0, 800)}`);
    }

    // Out of steps (or unusable output) — force a final answer from the scratchpad.
    if (scratchpad.length) {
        const raw = await deps.invoke({
            systemPrompt: 'Summarize the work below into a direct final answer to the task. Plain text.',
            prompt: `TASK: ${task}\n\n${scratchpad.join('\n')}`,
            temperature: 0.2,
            maxTokens: 600,
        });
        if (raw && raw.trim()) {
            steps.push({ type: 'final_answer', content: raw.trim(), timestamp: now() });
            return { steps, result: raw.trim(), ok: true, toolsUsed: [...toolsUsed] };
        }
    }
    return { steps, result: '', ok: false, toolsUsed: [...toolsUsed] };
}

/**
 * Production builder: ReAct over the real AGENT_SKILLS with the user's LLM
 * bundle. Returns null-producing fn when no LLM is configured (runner skips).
 */
export function buildReactLoopFn(llm: IntegrationsBundle['llm']) {
    const ctx: SkillContext = { llm };
    const byName = new Map<string, AgentSkill>(AGENT_SKILLS.map(s => [s.name.toLowerCase(), s]));
    return async (task: string, fewShot: string): Promise<ReactLoopResult | null> => {
        const result = await runReactLoop(task, fewShot, {
            invoke: async (req) => (await callLlm(req, llm))?.text ?? null,
            runSkill: async (name, input) => {
                const skill = byName.get(name.toLowerCase());
                if (!skill) return null;
                const r = await skill.run(input, ctx);
                return { ok: r.ok, text: r.text };
            },
            skills: AGENT_SKILLS.map(s => ({ name: s.name, description: s.description })),
        });
        return result.ok ? result : null;
    };
}
