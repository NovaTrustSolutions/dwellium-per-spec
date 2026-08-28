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
import { callLlm, hasActiveLlm, type LlmRequest, type LlmResponse } from '../../lib/llmClient';
import { looksActionable } from '../../lib/llmRouter';
import type { IntegrationsBundle } from '../../types/integrations';

// ponytail: regex heuristic over the reply's opening. False positives cost one
// Hermes run; false negatives leave a refusal on screen. Tuned toward recall on
// the "I can't / I don't have access / not able to" family; excludes idioms;
// trigger: >1 false-escalation per week observed, upgrade to an LLM judge on the user's key.
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

// Imperative openers that mean "DO this", beyond llmRouter.looksActionable's
// ≤10-word heuristic. Gates the (paid) deflection judge so plain questions and
// long prose never trigger it.
const ACTION_OPENER = /^(?:(?:please|pls|can you|could you|would you|will you|go ahead and|ara[,:]?)\s+)*(?:email|e-mail|send|text|sms|call|phone|book|schedule|reschedule|cancel|create|make|build|generate|update|delete|remove|add|set|turn|order|pay|submit|file|upload|download|export|import|post|share|invite|assign|move|renew|run|start|stop|open|close|change|edit|fix|sync|connect|log|record|track|remind|notify|message|reply|forward|print|save|calculate|convert|transfer|deposit|charge|refund|approve|reject|escalate|dispatch|route|publish|archive|restore|rename|copy|attach|tag|label|flag|mark|toggle|enable|disable|install|deploy|push|merge|pull|fetch|scrape|crawl|search|look up|find|check|verify|monitor|watch|alert|ping|trigger|kick off|launch)\b/i;

/** True when the user is asking ARA to DO something (imperative), not asking a question. */
export function looksLikeActionRequest(userText: string): boolean {
    const t = (userText ?? '').trim();
    if (!t) return false;
    if (t.endsWith('?') && !/^(?:can|could|would|will) you\b/i.test(t)) return false;
    return looksActionable(t) || ACTION_OPENER.test(t);
}

// The most common soft deflection, caught without an LLM: user asked ARA to
// SEND/BOOK/… something and ARA handed back a draft/template instead.
const DELIVERY_INTENT = /\b(?:email|e-mail|send|text|sms|message|dm|call|phone|notify|forward|reply to|book|schedule|reserve|order|pay|submit|file|post|publish|invite|dispatch)\b/i;
const AUTHORING_INTENT = /\b(?:draft|write|compose|prepare|word|phrase|show me|give me|help me (?:write|draft)|example of|template for)\b/i;
const SUBSTITUTE_REPLY = /\b(?:draft|template|here(?:'|’)?s (?:a|the|your) (?:quick |rough |short )?(?:draft|template|email|message|note|text)|you can (?:copy|paste|send|use|forward)|copy(?:-| and | & )paste|feel free to (?:send|use|forward)|ready (?:to|for you to) (?:send|copy))\b/i;

/** True when the user asked for DELIVERY (send/book/…) but the reply only offers a draft/template. Free, deterministic. */
export function looksLikeSubstitute(userText: string, reply: string): boolean {
    const u = (userText ?? '').trim();
    if (!u || !DELIVERY_INTENT.test(u) || AUTHORING_INTENT.test(u)) return false;
    return SUBSTITUTE_REPLY.test((reply ?? '').slice(0, 400));
}

/** System prompt for the deflection judge. Exported for tests. */
export const DEFLECTION_JUDGE_SYSTEM =
    'You audit an assistant (ARA) inside a property-management app. The user asked ARA to DO something. ' +
    "Classify ARA's reply with exactly one word:\n" +
    'DID — ARA performed or is performing the requested action itself (opened, sent, created, updated, ran…), or reports the concrete result.\n' +
    'DEFLECTED — ARA did NOT perform the action itself and shows no path to doing it: it offers a substitute ' +
    '(e.g. "I can draft it" when asked to SEND; "here\'s how you can…"; "you\'ll need to do that in…"), says it lacks access/tools/ability, ' +
    'or asks the user to do it elsewhere. Asking for details that only matter for the substitute still counts as DEFLECTED.\n' +
    'NEEDS_INFO — ARA can and will do the EXACT requested action but first needs a missing detail (a recipient, a date, a unit number).\n' +
    'Example: user "email the owner about the leak" / reply "I can help draft the email. What key points do you want? Do you have the owner\'s contact info?" → DEFLECTED (drafting ≠ sending).\n' +
    'Example: user "open strata" / reply "Opening Strata — it\'s on your screen now." → DID.\n' +
    'Example: user "schedule the plumber for unit 4B" / reply "Sure — booking it now; what day and time works?" → NEEDS_INFO.\n' +
    'Answer with one word only.';

/**
 * LLM judge for soft refusals the regex can't see ("I can help draft…" when asked to send).
 * Returns true only on a confident DEFLECTED verdict; any error/ambiguity → false (no escalation).
 */
export async function judgeReplyDeflects(
    userText: string,
    reply: string,
    llm: IntegrationsBundle['llm'],
    callLlmFn: (req: LlmRequest, llm: IntegrationsBundle['llm']) => Promise<LlmResponse | null> = callLlm,
): Promise<boolean> {
    if (!hasActiveLlm(llm)) return false;
    try {
        const res = await callLlmFn({
            systemPrompt: DEFLECTION_JUDGE_SYSTEM,
            prompt: `User asked ARA:\n<<<${userText.slice(0, 400)}>>>\n\nARA replied:\n<<<${reply.slice(0, 700)}>>>\n\nVerdict:`,
            maxTokens: 5,
            temperature: 0,
        }, llm);
        return /^\W*DEFLECTED/i.test(res?.text ?? '');
    } catch { return false; }
}

export type EscalationVerdict = 'refusal' | 'substitute' | 'judge-deflected' | 'judge-ok' | 'not-action' | 'no';

/**
 * Should this reply be escalated? Ladder, cheapest first:
 *   refusal regex (free) → substitute regex (free, action requests only) →
 *   LLM judge (one tiny call, action requests only).
 * `userText` should be the ORIGINAL action request when the conversation has
 * moved on to details (ARAConsole remembers it for a few turns).
 */
export async function classifyForEscalation(
    userText: string,
    reply: string,
    llm: IntegrationsBundle['llm'],
    judgeFn: typeof judgeReplyDeflects = judgeReplyDeflects,
): Promise<EscalationVerdict> {
    if (looksLikeRefusal(reply)) return 'refusal';
    if (!looksLikeActionRequest(userText)) return 'not-action';
    if (looksLikeSubstitute(userText, reply)) return 'substitute';
    return (await judgeFn(userText, reply, llm)) ? 'judge-deflected' : 'judge-ok';
}

export async function shouldEscalate(
    userText: string,
    reply: string,
    llm: IntegrationsBundle['llm'],
    judgeFn: typeof judgeReplyDeflects = judgeReplyDeflects,
): Promise<boolean> {
    const v = await classifyForEscalation(userText, reply, llm, judgeFn);
    return v === 'refusal' || v === 'substitute' || v === 'judge-deflected';
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
        'Integrations already wired that a new tool can build on: per-user Google OAuth tokens on the backend (Gmail + Calendar), ' +
        "Supabase + Postgres connections, the user's LLM providers, Tavily/Brave web search, Open-Meteo weather, the widget-action bus, " +
        'and the /api/hermes/delegate backend tool runner.\n\n' +
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
