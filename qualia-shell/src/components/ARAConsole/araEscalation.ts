/**
 * araEscalation — turn an ARA refusal into a solution (2026-08-16, Ilya).
 *
 * ARA's chat reply is LLM prose; when it says "I can't do that" the user got a
 * dead end. This module gives `sendPrompt` a two-rung ladder to climb instead:
 *
 *   1. Hermes — hand the ORIGINAL request to the Hermes runner (backend
 *      /api/hermes/delegate → browser skills → ReAct loop → LLM). If any rung
 *      answers, that becomes the reply.
 *   2. Tool proposal — if Hermes can't either, ask the user's LLM to propose the
 *      concrete tool/skill that WOULD make it possible (name, triggers, inputs,
 *      integration point, effort) plus a `new goal:` line that queues it in
 *      Mission Control. A solution, not a refusal.
 *
 * Pure except for the injected deps, so the branching is unit-testable
 * (src/test/araEscalation.test.ts).
 */

import { runHermes, type HermesRunResult } from '../HonchoHermesPanel/hermesRunner';
import { buildReactLoopFn, mergedToolNames } from '../HonchoHermesPanel/hermesReact';
import { formatHermesReply } from '../StellaAgent/stellaHermesSpawn';
import { runSkillForInput, describeSkillsForPrompt } from '../../lib/agents/skills';
import { WIDGET_ACTIONS } from '../../lib/widgetActions';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import type { IntegrationsBundle } from '../../types/integrations';

// ponytail: regex heuristic over the reply's opening. False positives cost one
// Hermes run; false negatives leave a refusal on screen. Tuned toward recall on
// the "I can't / I don't have access / not able to" family; excludes idioms.
const REFUSAL_PATTERNS: RegExp[] = [
    /\bI\s*(?:can(?:'|’)?t|cannot|can\s+not)\s+(?!wait|believe|stress|say|thank|recommend|emphasi[sz]e|overstate|tell you how)/i,
    /\bI(?:'|’)?m\s+(?:not\s+able|unable|not\s+equipped|not\s+set\s+up|not\s+in\s+a\s+position)\s+to\b/i,
    /\bI\s+(?:am|was)\s+(?:not\s+able|unable)\s+to\b/i,
    /\bI\s+(?:do\s+not|don(?:'|’)?t)\s+(?:currently\s+)?have\s+(?:the\s+)?(?:ability|access|tools?|a\s+way|capability|permission|means|direct\s+access|UI\s+powers?)/i,
    /\b(?:that|this|it)(?:'|’)?s\s+(?:not\s+something\s+I\s+can|beyond\s+(?:my|what\s+I)|outside\s+(?:my|what\s+I))/i,
    /\bnot\s+something\s+I(?:'|’)?m\s+able\s+to\b/i,
    /\bbeyond\s+my\s+(?:current\s+)?(?:capabilities|abilities|scope|reach)\b/i,
    /\bI\s+(?:do\s+not|don(?:'|’)?t)\s+(?:have\s+)?(?:the\s+)?(?:ability|capability)\s+to\b/i,
    /\bno\s+(?:way|tool|integration)\s+(?:for\s+me\s+)?to\b/i,
];

/** True when an ARA reply reads as "I can't do that". Looks at the opening only. */
export function looksLikeRefusal(reply: string): boolean {
    const head = (reply ?? '').trim().slice(0, 500);
    if (!head) return false;
    return REFUSAL_PATTERNS.some(re => re.test(head));
}

export interface AraEscalationOutcome {
    /** Markdown reply to show in chat. */
    text: string;
    /** Which rung answered. */
    via: 'hermes' | 'proposal' | 'none';
    /** Set when a tool proposal was produced (worth recording as an artifact). */
    proposalTitle?: string;
}

export interface AraEscalationDeps {
    authFetch: (url: string, init?: RequestInit) => Promise<Response>;
    llm: IntegrationsBundle['llm'];
    search: IntegrationsBundle['search'];
    /** Test seams — production defaults call the real Hermes runner + LLM. */
    runHermesFn?: (task: string) => Promise<HermesRunResult>;
    proposeFn?: (userText: string, refusal: string) => Promise<string | null>;
    /** Optional progress hook (e.g. update the chat bubble while Hermes works). */
    onProgress?: (note: string) => void;
}

/** System prompt for the tool-proposal rung. Exported for tests. */
export function buildToolProposalSystemPrompt(): string {
    const widgetVerbs = WIDGET_ACTIONS.map(a => `- ${a.widget}.${a.verb}: ${a.description}`).join('\n') || '- (none yet)';
    return (
        'You are the capability planner for ARA, the assistant inside the Dwellium property-management app ' +
        '(React + TypeScript SPA; agent skills live in src/lib/agents/skills.ts as `AgentSkill` objects with ' +
        '{ id, name, description, triggers: RegExp[], run(input, integrations) }; widgets receive verbs over a ' +
        'widget-action bus). ARA just REFUSED a user request because no existing tool covers it. ' +
        'Your job is to turn that refusal into a solution proposal — never repeat the refusal.\n\n' +
        'Tools ARA has today:\n' + describeSkillsForPrompt() + '\n\nWidget verbs available:\n' + widgetVerbs + '\n\n' +
        'Reply in Markdown, under 220 words, with exactly these sections:\n' +
        '1. **What it would take** — one sentence.\n' +
        '2. **Proposed tool** — name (`skill-<kebab>`), what it does, 3 trigger phrases, inputs, and which API/service ' +
        'or widget verb it needs. Prefer extending an existing skill or widget verb over a new backend route.\n' +
        '3. **Effort** — S / M / L with a 5-word reason.\n' +
        '4. **Queue it** — end with one line exactly of the form: `new goal: Build <tool name> so ARA can <capability>`.\n' +
        'If the request is genuinely impossible or unsafe for software to do, say so in one sentence and skip sections 2–4.'
    );
}

async function defaultRunHermes(task: string, deps: AraEscalationDeps): Promise<HermesRunResult> {
    return runHermes(task, {
        authFetch: deps.authFetch,
        toolNames: mergedToolNames([]),
        skillFallbackFn: async (t) => {
            // 'model' origin: Hermes picked the skill, not the human — provenance gate in skills.ts.
            const hit = await runSkillForInput(t, { llm: deps.llm, search: deps.search }, undefined, 'model');
            return hit ? { ok: hit.ok, text: hit.text, skillName: hit.skill.name } : null;
        },
        reactLoopFn: hasActiveLlm(deps.llm) ? buildReactLoopFn(deps.llm) : undefined,
    });
}

async function defaultPropose(userText: string, refusal: string, llm: IntegrationsBundle['llm']): Promise<string | null> {
    if (!hasActiveLlm(llm)) return null;
    const res = await callLlm({
        systemPrompt: buildToolProposalSystemPrompt(),
        prompt: `User asked ARA:\n"""${userText}"""\n\nARA replied (refusal):\n"""${refusal.slice(0, 600)}"""`,
        maxTokens: 600,
        temperature: 0.3,
    }, llm).catch(() => null);
    return res?.text?.trim() || null;
}

/**
 * Climb the ladder: Hermes → tool proposal → honest static note.
 * Never throws; every rung is best-effort.
 */
export async function runAraEscalation(userText: string, refusal: string, deps: AraEscalationDeps): Promise<AraEscalationOutcome> {
    // Rung 1 — Hermes.
    deps.onProgress?.('That’s outside what I can do directly — handing it to Hermes…');
    let hermes: HermesRunResult | null = null;
    try {
        hermes = await (deps.runHermesFn ? deps.runHermesFn(userText) : defaultRunHermes(userText, deps));
    } catch { hermes = null; }
    // A Hermes "success" that is itself a refusal (LLM prose) is not a solution.
    if (hermes && hermes.outcome === 'success' && hermes.result?.trim() && !looksLikeRefusal(hermes.result)) {
        return {
            via: 'hermes',
            text: `I couldn’t do that myself, so Hermes took it:\n\n${formatHermesReply(hermes)}\n\nWhat would you like me to do next?`,
        };
    }

    // Rung 2 — propose the tool that would make it possible.
    deps.onProgress?.('Hermes couldn’t finish it either — working out what tool would make this possible…');
    let proposal: string | null = null;
    try {
        proposal = await (deps.proposeFn ? deps.proposeFn(userText, refusal) : defaultPropose(userText, refusal, deps.llm));
    } catch { proposal = null; }
    if (proposal) {
        const title = `Tool proposal: ${userText.replace(/\s+/g, ' ').trim().slice(0, 48)}`;
        return {
            via: 'proposal',
            proposalTitle: title,
            text: `Neither I nor Hermes can do that with today’s tools — here’s what would make it possible:\n\n${proposal}\n\n` +
                `Say the \`new goal:\` line above (or click it into the composer) and I’ll queue it in Mission Control.`,
        };
    }

    // Rung 3 — nothing available. Still not a bare refusal: name the unblock.
    const hermesNote = hermes?.error ? ` Hermes tried too (${hermes.error}).` : hasActiveLlm(deps.llm) ? ' Hermes tried too and couldn’t finish.' : '';
    return {
        via: 'none',
        text: `I can’t do that with the tools I have today.${hermesNote} ` +
            (hasActiveLlm(deps.llm)
                ? 'I couldn’t draft a tool proposal right now — ask me again in a moment and I’ll spec the skill we’d need to build.'
                : 'Add an LLM key in Control Panel → API Keys and I’ll spec the exact skill we’d need to build for this.'),
    };
}
