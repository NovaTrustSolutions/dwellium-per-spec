/**
 * cardSuggest.ts — C-9 AI card suggestion (Phase 3-H §3 Table 1 R3, Phase 1)
 *
 * Phase-1 stub: deterministic, local suggestion that turns an arbitrary
 * free-text intent into a B.L.A.S.T. card draft. The ratified C-9 plan
 * calls out an LLM-backed suggester as Phase 2 — that plugs in here via
 * `registerSuggester()` without touching callers.
 *
 * Interaction with C-9 B.L.A.S.T. gate (blastGate.ts):
 *   suggestCard() produces a *draft*. Callers still pass the draft through
 *   `enforceBlastGate()` before persisting. Suggestions are a convenience,
 *   not a bypass.
 */

import type { CardDraft, BlastFields } from './blastGate';

export interface SuggestInput {
    intent: string;
    context?: {
        boardId?: string;
        assigneeHint?: string;
        dueHint?: string;
    };
}

export interface Suggester {
    version: string;
    suggest(input: SuggestInput): Promise<CardDraft>;
}

// --- Phase-1 local suggester -----------------------------------------------

const localSuggester: Suggester = {
    version: 'local-deterministic@1.0.0',
    async suggest({ intent, context }) {
        const title = intent.trim().split(/\n/)[0].slice(0, 80) || 'Untitled task';
        const blast: Partial<BlastFields> = {
            benefit: deriveBenefit(intent),
            labor: deriveLabor(intent),
            assignee: context?.assigneeHint || '',
            scope: deriveScope(intent),
            time: context?.dueHint || '',
        };
        return { title, description: intent.trim(), blast };
    },
};

function deriveBenefit(intent: string): string {
    // Heuristic: look for "so that", "because", "to <verb>"
    const soThat = /so that ([^.!?]+)/i.exec(intent);
    if (soThat) return soThat[1].trim();
    const because = /because ([^.!?]+)/i.exec(intent);
    if (because) return because[1].trim();
    const toVerb = /\bto ([a-z]+ [^.!?]+)/i.exec(intent);
    if (toVerb) return toVerb[1].trim();
    return '';
}

function deriveLabor(intent: string): string {
    // Heuristic: match a noun-ish role keyword
    const roleMatch = /\b(engineer|designer|pm|analyst|writer|qa|ops|admin|owner|tenant|vendor)\b/i.exec(intent);
    return roleMatch ? roleMatch[1] : '';
}

function deriveScope(intent: string): string {
    // Heuristic: first sentence minus trailing time hint
    const firstSentence = intent.split(/[.!?]/)[0].trim();
    return firstSentence;
}

// --- Plugin registry -------------------------------------------------------

let active: Suggester = localSuggester;

export function registerSuggester(s: Suggester) {
    active = s;
}

export function getActiveSuggester(): Suggester {
    return active;
}

export async function suggestCard(input: SuggestInput): Promise<CardDraft> {
    return active.suggest(input);
}

// --- Feature flag ----------------------------------------------------------

export function isCardSuggestEnabled(): boolean {
    if (typeof window !== 'undefined') {
        const w = window as unknown as { __DWELLIUM_C9_SUGGEST_ENABLED__?: boolean };
        if (typeof w.__DWELLIUM_C9_SUGGEST_ENABLED__ === 'boolean') return w.__DWELLIUM_C9_SUGGEST_ENABLED__;
    }
    return false;
}
