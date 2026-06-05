/**
 * aiActions — discrete one-tap AI writing helpers for Scribe's selection
 * toolbar, matching the helpers in suitenumerique/docs (Rewrite, Summarize,
 * Translate, Fix spelling/grammar).
 *
 * Design choice: the "replacement" helpers (rewrite / fix / translate) reuse
 * Scribe's EXISTING, proven redline flow — the LLM returns proposals against
 * `REDLINE_SYSTEM_PROMPT`'s schema, which the toolbar applies as *pending*
 * redlines the user accepts or rejects. The AI never silently mutates the
 * user's text (consistent with the "never misinterpreted" principle).
 * `summarize` produces NEW text rather than a replacement, so it routes to the
 * ARA panel instead of the redline path.
 *
 * Pure + deterministic → unit-testable without React, an LLM, or a backend.
 */
import { REDLINE_SYSTEM_PROMPT } from './redlinePrompt';

export type AiActionId = 'rewrite' | 'fix' | 'translate' | 'summarize';

export interface AiAction {
    id: AiActionId;
    label: string;
    icon: string;
    /** 'redline' → applied via the redline flow; 'ara' → sent to the ARA panel. */
    mode: 'redline' | 'ara';
    title: string;
}

export const AI_ACTIONS: AiAction[] = [
    { id: 'rewrite', label: 'Rewrite', icon: '✍️', mode: 'redline', title: 'Rewrite the selection for clarity (proposed as redlines you accept/reject)' },
    { id: 'fix', label: 'Fix', icon: '🩹', mode: 'redline', title: 'Fix spelling, grammar & punctuation (proposed as redlines)' },
    { id: 'translate', label: 'Translate', icon: '🌐', mode: 'redline', title: 'Translate the selection (proposed as a redline)' },
    { id: 'summarize', label: 'Summarize', icon: '📝', mode: 'ara', title: 'Summarize the selection in the ARA panel' },
];

const TASK_INSTRUCTIONS: Record<Exclude<AiActionId, 'translate' | 'summarize'>, string> = {
    rewrite:
        'TASK: Rewrite the selected passage to be clearer and more concise while preserving its meaning and the author’s voice. Propose the rewrite as redline(s).',
    fix:
        'TASK: Fix ONLY spelling, grammar, and punctuation in the selected passage. Do not change wording, tone, or meaning beyond mechanical corrections. Propose each correction as a redline.',
};

/**
 * Build the system prompt for a redline-mode action. Appends a task-specific
 * instruction to the shared REDLINE_SYSTEM_PROMPT so the LLM still returns the
 * exact `{ redlines: [...] }` JSON the toolbar already parses.
 */
export function buildActionSystemPrompt(id: AiActionId, opts?: { language?: string }): string {
    if (id === 'translate') {
        const lang = (opts?.language || 'English').trim() || 'English';
        return (
            `TASK: Translate the entire selected passage into ${lang}. Return a SINGLE redline whose ` +
            `originalText is the full selection and proposedText is the ${lang} translation. Preserve any ` +
            `Markdown formatting.\n\n` + REDLINE_SYSTEM_PROMPT
        );
    }
    if (id === 'summarize') {
        throw new Error('summarize is an ARA-mode action; use buildSummarizePreface() instead');
    }
    return TASK_INSTRUCTIONS[id] + '\n\n' + REDLINE_SYSTEM_PROMPT;
}

/** Preface sent with the selection to the ARA panel for the summarize action. */
export function buildSummarizePreface(): string {
    return 'Summarize this passage concisely (3–5 sentences or a short bullet list), preserving the key facts:';
}

/** True for actions applied through the redline flow (everything except summarize). */
export function isRedlineAction(id: AiActionId): boolean {
    return id !== 'summarize';
}
