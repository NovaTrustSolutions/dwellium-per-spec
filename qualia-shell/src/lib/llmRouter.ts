/**
 * llmRouter — Phase-10 B1: LLM-judged command-intent classification for the
 * Conductor (⌘K / ARA), replacing pure heuristic routing per the Phase-10
 * plan. Cascade per Ilya's 10.5 gate-lock (2026-06-11):
 *
 *   1. Per-user LLM key (browser-direct via llmClient) — JSON classification
 *      with Hermes few-shot from past routing decisions.
 *   2. Backend classifier — injectable hook (`deps.backendClassify`); the
 *      server route does NOT exist yet (carry-forward, sister to the
 *      humanize/test-postgres pattern: frontend-ready, backend pending).
 *   3. Heuristic — derived from the existing exact parsers (parseSpawn /
 *      parseChain / parseCommand / matchSkill). Always answers.
 *
 * An LLM verdict below ROUTER_CONFIDENCE_THRESHOLD falls through to the next
 * leg rather than being trusted (B2 wires the dispatcher at 10.6; this module
 * only classifies). Every decision can be recorded into the per-user Hermes
 * log (tag 'llm-router') so future classifications get few-shot examples of
 * past CORRECT routings (👍-style confirmations arrive at 10.7's mis-route
 * collection).
 */
import { callLlm, hasActiveLlm, type LlmRequest } from './llmClient';
import type { IntegrationsBundle } from '../types/integrations';
import { parseCommand, stripPoliteness } from './dwelliumCommands';
import { parseChain } from './conductorChain';
import { parseSpawn } from './agents/spawn';
import { matchSkill } from './agents/skills';
import { extractJson } from './agents/orchestrator';
import {
    hermesLearningStore,
    rankPastRuns,
    recordRun,
    similarity,
    type HermesRunRecord,
} from '../components/HonchoHermesPanel/hermesLearningStore';

/* ─── Types ─── */

export type RouteIntent = 'spawn' | 'chain' | 'command' | 'skill' | 'chat';

export const ROUTE_INTENTS: ReadonlyArray<RouteIntent> = ['spawn', 'chain', 'command', 'skill', 'chat'];

export interface RouteDecision {
    intent: RouteIntent;
    /** 0..1 — heuristic parser hits report 0.95; bare chat fallback 0.5. */
    confidence: number;
    via: 'llm' | 'backend' | 'heuristic';
    reason?: string;
    /**
     * Canonical rephrasing of a fuzzy utterance ("can you get the strata
     * thing up" → "open strata") so the exact parsers can execute it —
     * classification alone isn't actionable (10.6 B2).
     */
    normalized?: string;
}

export interface LlmRouterDeps {
    llm: IntegrationsBundle['llm'];
    /** Backend classifier hook — server route pending (carry-forward). */
    backendClassify?: (text: string) => Promise<RouteDecision | null>;
    /** Injectable LLM invoker for tests; defaults to callLlm. */
    invoke?: (req: LlmRequest) => Promise<string | null>;
}

/** Below this, an LLM/backend verdict is not trusted (B2 gate value). */
export const ROUTER_CONFIDENCE_THRESHOLD = 0.7;

/** Hermes tag separating routing decisions from chat/lab runs. */
export const ROUTER_TOOL = 'llm-router';

const FEWSHOT_K = 3;

/* ─── Heuristic leg (exact parsers; always answers) ─── */

/**
 * Deterministic routing from the existing parsers. Order mirrors ARA's
 * sendMessage tiers: spawn → chain → command → skill → chat.
 */
export function heuristicRoute(text: string): RouteDecision {
    const t = text.trim();
    if (!t) return { intent: 'chat', confidence: 0.5, via: 'heuristic', reason: 'empty input' };
    const stripped = stripPoliteness(t);
    if (parseSpawn(stripped)) return { intent: 'spawn', confidence: 0.95, via: 'heuristic', reason: 'parseSpawn hit' };
    if (parseChain(t)) return { intent: 'chain', confidence: 0.95, via: 'heuristic', reason: 'parseChain hit' };
    if (parseCommand(t)) return { intent: 'command', confidence: 0.95, via: 'heuristic', reason: 'parseCommand hit' };
    if (matchSkill(t)) return { intent: 'skill', confidence: 0.95, via: 'heuristic', reason: 'matchSkill hit' };
    return { intent: 'chat', confidence: 0.5, via: 'heuristic', reason: 'no parser claimed the input' };
}

/* ─── Hermes few-shot over past routing decisions ─── */

function routerRuns(): HermesRunRecord[] {
    return hermesLearningStore
        .getSnapshot()
        .filter(r => (r.toolsUsed || []).includes(ROUTER_TOOL))
        .filter(r => !(typeof r.rating === 'number' && r.rating < 0));
}

/** Markdown few-shot block of similar past routing decisions ('' when none). */
export function routerFewShot(text: string, k: number = FEWSHOT_K): string {
    const similarOnly = routerRuns().filter(r => similarity(text, r.prompt) > 0);
    const top = rankPastRuns(similarOnly, text, k);
    if (!top.length) return '';
    const lines = ['Past routing decisions (input → intent):'];
    for (const r of top) lines.push(`- "${r.prompt}" → ${r.summary ?? 'chat'}`);
    return lines.join('\n');
}

/**
 * Record a routing decision into the per-user Hermes log. `correct=false`
 * (a collected mis-route) records as outcome 'fail' so it never surfaces as
 * a few-shot example; rating may later demote/boost via rateRun.
 */
export function recordRoutingDecision(text: string, decision: RouteDecision, correct: boolean = true): HermesRunRecord {
    return recordRun({
        prompt: text,
        outcome: correct ? 'success' : 'fail',
        summary: decision.intent,
        toolsUsed: [ROUTER_TOOL],
    });
}

/**
 * Collected mis-routes (10.7 B3): router decisions recorded `correct=false`
 * or 👎-rated by the user. These are the re-training inputs — excluded from
 * few-shot by construction, surfaced here for review/weight adjustment.
 */
export function collectMisRoutes(): HermesRunRecord[] {
    return hermesLearningStore
        .getSnapshot()
        .filter(r => (r.toolsUsed || []).includes(ROUTER_TOOL))
        .filter(r => r.outcome === 'fail' || (typeof r.rating === 'number' && r.rating < 0));
}

/* ─── LLM leg ─── */

const SYSTEM_PROMPT =
    'You are the command router for Dwellium, a property-management desktop app. ' +
    'Classify the user\'s input into exactly one intent:\n' +
    '- "spawn": run an AI agent team or solo persona on a goal (e.g. "spawn research squad on rent comps", "have the researcher look into X")\n' +
    '- "chain": MULTIPLE actions chained in one utterance, mixing app actions and tools (e.g. "open notepad and calculate 15% of 2400")\n' +
    '- "command": ONE app action — open/close/place/group a widget, switch theme/space/accent, save layout, remember a note\n' +
    '- "skill": ONE tool invocation — calculate, web search, image generation, weather, run code, recall memory\n' +
    '- "chat": a question or conversation for the assistant (anything that needs an LLM answer)\n' +
    'For non-chat intents ALSO include "normalized": the input rephrased as a canonical imperative the app can parse, using these verb forms: ' +
    '"open <widget>", "close <widget>", "put <widget> on the <left|right|top|bottom>", "group <widgets> into tabs", ' +
    '"theme <name>", "accent <color>", "switch to <space>", "save space <name>", "remember <text>", ' +
    '"spawn <team> on <goal>", "solo <persona> on <goal>", "calculate <expression>", "search <query>".\n' +
    'Respond with ONLY a JSON object: {"intent": "<one of spawn|chain|command|skill|chat>", "confidence": <0..1>, "normalized": "<canonical form>", "reason": "<short>"}';

interface LlmVerdict { intent?: string; confidence?: number; reason?: string; normalized?: string }

function validateVerdict(v: LlmVerdict | null, via: 'llm' | 'backend'): RouteDecision | null {
    if (!v || typeof v.intent !== 'string') return null;
    const intent = v.intent.toLowerCase() as RouteIntent;
    if (!ROUTE_INTENTS.includes(intent)) return null;
    const confidence = typeof v.confidence === 'number' && v.confidence >= 0 && v.confidence <= 1 ? v.confidence : 0;
    const normalized = typeof v.normalized === 'string' && v.normalized.trim() ? v.normalized.trim().slice(0, 200) : undefined;
    return { intent, confidence, via, normalized, reason: typeof v.reason === 'string' ? v.reason : undefined };
}

/**
 * Pre-filter for the LLM-on-miss leg (10.6 wiring): only short, imperative-
 * looking inputs are worth a classification round-trip. Questions and long
 * texts go straight to chat — keeps chat latency unchanged for the common
 * case (classify-then-chat would double the LLM round-trips).
 */
export function looksActionable(text: string): boolean {
    const t = text.trim();
    if (!t || t.length < 3) return false;
    if (t.split(/\s+/).length > 10) return false;
    if (/^(?:what|who|why|how|when|where|which|is|are|am|was|were|do|does|did|should|would|tell|explain|write|draft|help|summarize|describe|compare)\b/i.test(t)) return false;
    if (t.endsWith('?')) return false;
    return true;
}

/* ─── ⌘K → ARA prompt hand-off bus (B2) ─── */

export const ARA_PROMPT_EVENT = 'dwellium:ara-prompt';

let pendingPrompt: string | null = null;

/**
 * Hand an unparseable palette query to ARA: pending-slot + live event,
 * sister-shape to spawn.ts's requestSpawn (covers the ARA-mount race when
 * the widget's lazy chunk is still loading).
 */
export function requestAraPrompt(text: string): void {
    pendingPrompt = text;
    try { window.dispatchEvent(new CustomEvent(ARA_PROMPT_EVENT, { detail: { text } })); } catch { /* SSR / sandbox */ }
}

/** One-shot read of the pending prompt (ARA mount-time pickup). */
export function consumePendingAraPrompt(): string | null {
    const p = pendingPrompt;
    pendingPrompt = null;
    return p;
}

/* ─── Cascade ─── */

/**
 * Classify `text` per the locked cascade. Always resolves to a decision —
 * the heuristic leg is total. Low-confidence LLM/backend verdicts fall
 * through (threshold exported for B2's dispatcher).
 */
export async function classifyIntent(text: string, deps: LlmRouterDeps): Promise<RouteDecision> {
    const t = text.trim();
    if (!t) return heuristicRoute(t);

    // Leg 1 — per-user LLM key, browser-direct.
    const invoke = deps.invoke
        ?? (hasActiveLlm(deps.llm)
            ? async (req: LlmRequest) => (await callLlm(req, deps.llm))?.text ?? null
            : null);
    if (invoke) {
        try {
            const fewShot = routerFewShot(t);
            const raw = await invoke({
                systemPrompt: SYSTEM_PROMPT + (fewShot ? `\n\n${fewShot}` : ''),
                prompt: t,
                maxTokens: 200,
                temperature: 0,
                responseFormat: 'json',
            });
            const decision = validateVerdict(extractJson<LlmVerdict>(raw), 'llm');
            if (decision && decision.confidence >= ROUTER_CONFIDENCE_THRESHOLD) return decision;
        } catch { /* fall through to next leg */ }
    }

    // Leg 2 — backend classifier (route pending server-side; injectable).
    if (deps.backendClassify) {
        try {
            const backend = validateVerdict(await deps.backendClassify(t), 'backend');
            if (backend && backend.confidence >= ROUTER_CONFIDENCE_THRESHOLD) return backend;
        } catch { /* fall through to heuristic */ }
    }

    // Leg 3 — heuristic (total).
    return heuristicRoute(t);
}
