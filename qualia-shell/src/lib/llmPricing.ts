/**
 * llmPricing — plan 068 single source of truth for $/MTok prices. Unknown
 * model ids return `null` (never a guessed default — see plan 068 defect B1:
 * the old regex table silently priced unknown ids at $1/$3).
 *
 * Anchored matching only: normalize the id, then check an exact-id map, then
 * a small ORDERED list of anchored prefix regexes (`^...`) for close variants
 * (dated/-latest suffixes are stripped by normalizeId, so the prefix rules
 * only need to catch ids the exact map doesn't). No bare substring matching
 * (defect B2: "opus" matched anywhere, mispricing whole families).
 */
import type { LlmProvider } from '../types/integrations';

export interface ModelPrice {
    inPerM: number;
    outPerM: number;
    cacheReadPerM?: number;
    cacheWritePerM?: number;
}

export const PRICES_AS_OF = '2026-09-25';

/** vendor/id (OpenRouter) → id; strip -latest and a trailing -YYYYMMDD date. */
function normalizeId(model: string): string {
    let id = (model ?? '').trim().toLowerCase();
    const slash = id.indexOf('/');
    if (slash !== -1) id = id.slice(slash + 1);
    id = id.replace(/-latest$/, '');
    id = id.replace(/-\d{8}$/, '');
    return id;
}

// Source: claude-api skill table (cached 2026-06-24), cross-checked against
// platform.claude.com/docs/en/docs/about-claude/pricing (fetched 2026-09-25).
// Cache pricing is NOT modelled per-model here — llmUsageStore applies the
// blanket 0.1x read / 1.25x write multiplier from PLAN 068 (the real per-model
// multipliers — e.g. 0.025x on Fable 5.1, 0.05x on Opus 5.5 — are a known
// simplification; see PRICES_AS_OF for when to revisit).
const ANTHROPIC_PRICES: Record<string, ModelPrice> = {
    'claude-fable-5-1': { inPerM: 10, outPerM: 50, cacheReadPerM: 0.25 }, // cache reads $0.25/MTok (claude-api skill, Fable 5.1 section)
    'claude-fable-5': { inPerM: 10, outPerM: 50 },
    'claude-mythos-5-1': { inPerM: 10, outPerM: 50 },
    'claude-mythos-5': { inPerM: 10, outPerM: 50 },
    'claude-opus-5-5': { inPerM: 4, outPerM: 20, cacheReadPerM: 0.2 }, // cache reads $0.20/MTok (claude-api skill, Opus 5.5 section)
    'claude-opus-5': { inPerM: 5, outPerM: 25 },
    'claude-opus-4-8': { inPerM: 5, outPerM: 25 },
    'claude-opus-4-7': { inPerM: 5, outPerM: 25 },
    'claude-opus-4-6': { inPerM: 5, outPerM: 25 },
    'claude-opus-4-5': { inPerM: 5, outPerM: 25 },
    'claude-sonnet-5': { inPerM: 2, outPerM: 10 },
    'claude-sonnet-4-6': { inPerM: 3, outPerM: 15 },
    'claude-sonnet-4-5': { inPerM: 3, outPerM: 15 },
    'claude-haiku-4-5': { inPerM: 1, outPerM: 5 },
};

// Source: developers.openai.com/api/docs/pricing (fetched 2026-09-25).
const OPENAI_PRICES: Record<string, ModelPrice> = {
    'gpt-4o': { inPerM: 2.5, outPerM: 10 },
    'gpt-4o-mini': { inPerM: 0.15, outPerM: 0.6 },
    'gpt-4.1': { inPerM: 2, outPerM: 8 },
    'gpt-4.1-mini': { inPerM: 0.4, outPerM: 1.6 },
    'gpt-4.1-nano': { inPerM: 0.1, outPerM: 0.4 },
    o1: { inPerM: 15, outPerM: 60 },
    o3: { inPerM: 2, outPerM: 8 },
    'o3-mini': { inPerM: 1.1, outPerM: 4.4 },
    'o4-mini': { inPerM: 1.1, outPerM: 4.4 },
    // fetched 2026-09-25 from the same page (gpt-5 family confirmed there).
    'gpt-5': { inPerM: 1.25, outPerM: 10, cacheReadPerM: 0.125 },
    'gpt-5-mini': { inPerM: 0.25, outPerM: 2, cacheReadPerM: 0.025 },
    'gpt-5-nano': { inPerM: 0.05, outPerM: 0.4, cacheReadPerM: 0.005 },
    'gpt-4-turbo': { inPerM: 10, outPerM: 30 },
    'gpt-3.5-turbo': { inPerM: 0.5, outPerM: 1.5 },
};

// Source: ai.google.dev/gemini-api/docs/pricing. gemini-1.5-* is no longer
// listed there (retired) — intentionally absent so priceFor() returns null.
const GEMINI_PRICES: Record<string, ModelPrice> = {
    'gemini-2.5-flash': { inPerM: 0.3, outPerM: 2.5 },
    'gemini-2.5-flash-lite': { inPerM: 0.1, outPerM: 0.4 },
    'gemini-2.5-pro': { inPerM: 1.25, outPerM: 10 },
};

// Image models are billed per-image, not per-token — zero-price their token
// rows so recordLlmUsage's "unpriced" counter doesn't flag them, and use
// perCallFeeUsd for the real cost.
const IMAGE_PRICES: Record<string, ModelPrice> = {
    'dall-e-3': { inPerM: 0, outPerM: 0 },
};

const EXACT_PRICES: Record<LlmProvider, Record<string, ModelPrice>> = {
    anthropic: ANTHROPIC_PRICES,
    openai: { ...OPENAI_PRICES, ...IMAGE_PRICES },
    gemini: GEMINI_PRICES,
    local: {},
    custom: { ...ANTHROPIC_PRICES, ...OPENAI_PRICES, ...GEMINI_PRICES, ...IMAGE_PRICES },
};

/** Ordered anchored prefix rules for close variants the exact map misses (never a bare substring). */
const PREFIX_RULES: Array<{ provider: LlmProvider | 'any'; pattern: RegExp; price: ModelPrice }> = [
    { provider: 'anthropic', pattern: /^claude-opus-4-[5-9]/, price: { inPerM: 5, outPerM: 25 } },
    { provider: 'any', pattern: /^image-generation/, price: { inPerM: 0, outPerM: 0 } },
];

/** null = unpriced (never guess). `local` is always free. */
export function priceFor(model: string, provider: LlmProvider): ModelPrice | null {
    if (provider === 'local') return { inPerM: 0, outPerM: 0 };
    const id = normalizeId(model);
    const exact = EXACT_PRICES[provider]?.[id];
    if (exact) return exact;
    for (const rule of PREFIX_RULES) {
        if ((rule.provider === provider || rule.provider === 'any') && rule.pattern.test(id)) return rule.price;
    }
    return null;
}

/**
 * Flat per-call fees not modelled as $/MTok (billed per-search or per-image).
 * null = unconfirmed, never a guess.
 *
 * web_search (Anthropic): $10 per 1,000 searches — confirmed
 * platform.claude.com/docs/en/docs/about-claude/pricing (fetched 2026-09-25),
 * "Web search tool" section.
 * image (dall-e-3): NOT confirmed — dall-e-3 no longer appears on
 * developers.openai.com/api/docs/pricing (fetched 2026-09-25); the legacy
 * per-image rate could not be verified there, so this returns null.
 */
export function perCallFeeUsd(kind: 'web_search' | 'image', model: string): number | null {
    const id = normalizeId(model);
    if (kind === 'web_search') {
        if (id.startsWith('claude-')) return 10 / 1000;
        return null;
    }
    // kind === 'image'
    return null;
}
