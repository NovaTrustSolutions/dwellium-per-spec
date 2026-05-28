/**
 * contextWindow — shared helper for "you're using N% of your model's context"
 * warnings across the AI assistants (Stella, ARA mini-panel, Hydra).
 *
 * We don't have a real tokenizer in the browser, so we use the standard
 * ~4 chars/token heuristic (OpenAI cookbook), which is conservative enough
 * for warning UI. The estimate counts: system prompt + every message we'd
 * ship to the LLM on the next call.
 *
 * The per-provider context limits below match each provider's published
 * default for their current flagship as of May 2026 and degrade gracefully
 * for unknown models.
 */

import type { IntegrationsBundle } from '../types/integrations';

/** Provider → model → context window (tokens). */
const CONTEXT_WINDOWS: Record<string, Record<string, number>> = {
    anthropic: {
        'claude-sonnet-4-6': 200_000,
        'claude-opus-4-6': 200_000,
        'claude-haiku-4-5': 200_000,
        'claude-3-5-sonnet-20241022': 200_000,
        'claude-3-7-sonnet': 200_000,
        default: 200_000,
    },
    openai: {
        'gpt-4o': 128_000,
        'gpt-4o-mini': 128_000,
        'gpt-4-turbo': 128_000,
        'gpt-5': 256_000,
        default: 128_000,
    },
    gemini: {
        'gemini-1.5-pro': 2_000_000,
        'gemini-1.5-flash': 1_000_000,
        'gemini-2.0-pro': 2_000_000,
        default: 1_000_000,
    },
    local: { default: 8_192 },
    custom: { default: 32_000 },
};

export function getContextWindow(llm: IntegrationsBundle['llm'] | undefined): number {
    if (!llm) return 128_000;
    const provider = (llm as any).active as string | undefined;
    if (!provider) return 128_000;
    const cfg = (llm as any)[provider];
    const model = cfg?.model;
    const table = CONTEXT_WINDOWS[provider] || CONTEXT_WINDOWS.openai;
    if (model && table[model]) return table[model];
    return table.default;
}

/** ~4 chars per token; cheap, browser-safe, conservative for warning use. */
export function estimateTokens(text: string | undefined | null): number {
    if (!text) return 0;
    return Math.ceil(text.length / 4);
}

export interface ContextWarning {
    used: number;          // estimated tokens used by the next request
    limit: number;         // model's published context window
    pct: number;           // 0..1
    level: 'ok' | 'warn' | 'danger'; // ok < 0.8 ≤ warn < 0.95 ≤ danger
    message: string;
}

export function buildContextWarning(usedTokens: number, llm: IntegrationsBundle['llm'] | undefined): ContextWarning {
    const limit = getContextWindow(llm);
    const pct = limit > 0 ? usedTokens / limit : 0;
    let level: ContextWarning['level'] = 'ok';
    if (pct >= 0.95) level = 'danger';
    else if (pct >= 0.8) level = 'warn';
    const provider = (llm as any)?.active || 'LLM';
    const used = Math.round(usedTokens / 1000);
    const cap = Math.round(limit / 1000);
    const message = level === 'ok'
        ? `${used}k / ${cap}k tokens (${Math.round(pct * 100)}%)`
        : level === 'warn'
            ? `${provider} context ${Math.round(pct * 100)}% full (${used}k / ${cap}k). Start a new chat soon to avoid truncation.`
            : `${provider} context ${Math.round(pct * 100)}% full (${used}k / ${cap}k). Older messages may be dropped on the next reply.`;
    return { used: usedTokens, limit, pct, level, message };
}

/** Convenience: sum tokens for a string list (system prompt + each message). */
export function sumTokens(parts: Array<string | undefined | null>): number {
    return parts.reduce<number>((acc, p) => acc + estimateTokens(p), 0);
}
