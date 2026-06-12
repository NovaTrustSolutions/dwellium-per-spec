/**
 * goalPlanner — P12-5 Mission Control plan generation (gap item 7).
 *
 * One-shot, conversation-state-free flow (deliberately simpler than the
 * video's multi-turn): "new goal grow my channel" → the LLM drafts a brief,
 * splits actions into AGENT vs YOU, and lists clarifying questions. The user
 * refines with "refine goal <title>: <answers>" — the plan regenerates with
 * the answers folded in. Heuristic template fallback when no LLM key.
 */
import { callLlm, hasActiveLlm } from './llmClient';
import type { IntegrationsBundle } from '../types/integrations';
import type { GoalPlan } from './goalsStore';

const SYSTEM = `You are Mission Control for Dwellium, a property-management workspace with AI agents (research teams, web search, document drafting, knowledge graph, transcription).
Given a user GOAL (and optionally their ANSWERS to earlier questions), respond with ONLY JSON:
{"brief":"2-3 sentence understanding of the goal + approach",
 "agentActions":["actions the AI agents can do — research, draft, analyze, monitor"],
 "userActions":["actions only the human can do — record, call, sign, decide"],
 "clarifyingQuestions":["up to 4 SHORT questions whose answers would sharpen this plan; [] if none"]}
3-6 actions per list. Specific, imperative, no fluff.`;

function sanitizePlan(parsed: unknown): GoalPlan | null {
    if (!parsed || typeof parsed !== 'object') return null;
    const p = parsed as Record<string, unknown>;
    const strList = (v: unknown, cap: number): string[] =>
        Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).slice(0, cap) : [];
    const brief = typeof p.brief === 'string' ? p.brief.trim().slice(0, 800) : '';
    const agent = strList(p.agentActions, 6);
    const user = strList(p.userActions, 6);
    if (!brief || (agent.length === 0 && user.length === 0)) return null;
    return {
        brief,
        agentActions: agent.map(text => ({ text: text.slice(0, 200), done: false })),
        userActions: user.map(text => ({ text: text.slice(0, 200), done: false })),
        clarifyingQuestions: strList(p.clarifyingQuestions, 4).map(q => q.slice(0, 200)),
    };
}

/** Template plan when no LLM is configured — honest, still useful. */
export function heuristicPlan(title: string): GoalPlan {
    return {
        brief: `Goal: ${title}. No LLM key is configured, so this is a starter template — add a key in Control Panel → API Keys and use "refine goal" for an agent-drafted plan.`,
        agentActions: [
            { text: `Research approaches and best practices for: ${title}`, done: false },
            { text: 'Draft a first-pass plan document with milestones', done: false },
            { text: 'Monitor progress notes and surface blockers', done: false },
        ],
        userActions: [
            { text: 'Define what success looks like (numbers + date)', done: false },
            { text: 'Block recurring time to work the plan', done: false },
            { text: 'Review the agent drafts and decide next steps', done: false },
        ],
        clarifyingQuestions: [
            'What does success look like, concretely?',
            'What is the deadline or time horizon?',
            'What has been tried already?',
        ],
    };
}

/** Generate (or regenerate with answers) a plan for a goal title. */
export async function generateGoalPlan(
    title: string,
    llm: IntegrationsBundle['llm'],
    answers?: string,
): Promise<GoalPlan> {
    if (!hasActiveLlm(llm)) return heuristicPlan(title);
    try {
        const res = await callLlm({
            systemPrompt: SYSTEM,
            prompt: `GOAL: ${title}${answers ? `\n\nANSWERS TO YOUR EARLIER QUESTIONS:\n${answers}` : ''}`,
            responseFormat: 'json',
            maxTokens: 900,
            temperature: 0.4,
        }, llm);
        const match = res?.text?.match(/\{[\s\S]*\}/);
        const plan = match ? sanitizePlan(JSON.parse(match[0])) : null;
        return plan ?? heuristicPlan(title);
    } catch {
        return heuristicPlan(title);
    }
}

/** ARA tier patterns. */
export const NEW_GOAL_PATTERN = /^(?:new|add|create|set)\s+goal[:,]?\s+(.+)$/i;
export const REFINE_GOAL_PATTERN = /^refine\s+goal\s+(.+?)\s*[:—-]\s*(.+)$/i;

/** Render a plan as a chat-friendly markdown block. */
export function formatPlanForChat(title: string, plan: GoalPlan): string {
    const qa = plan.clarifyingQuestions.length
        ? `\n\n**To sharpen this plan, tell me:**\n${plan.clarifyingQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\n_Reply with_ \`refine goal ${title.slice(0, 40)}: <your answers>\``
        : '';
    return `**Goal created: ${title}**\n\n${plan.brief}\n\n**I'll handle:**\n${plan.agentActions.map(a => `- ${a.text}`).join('\n')}\n\n**Your role:**\n${plan.userActions.map(a => `- ${a.text}`).join('\n')}${qa}\n\n_Track it in Mission Control._`;
}
