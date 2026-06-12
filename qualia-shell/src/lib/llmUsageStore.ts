/**
 * llmUsageStore — P12-1 (gap-analysis item 6, 2026-06-12): the AI-spend
 * ledger. Every callLlm() completion records an ESTIMATED usage entry
 * (browser-direct keys mean every call passes through one chokepoint), so
 * the AI Spend widget can show cost by day / provider and plan advice.
 *
 * Honesty model: token counts are ESTIMATES (chars/4 — LlmResponse doesn't
 * surface provider usage fields) priced off a rough $/MTok table. The UI
 * labels everything "est." — directionally right, not an invoice.
 *
 * Storage: per-user dynamic-key factory + One Save ('llm-usage'), the
 * tabGroupStore sister shape incl. `.reset()`. Bounded: last 1,000 raw
 * entries + unbounded-but-tiny daily rollups.
 *
 * Namespacing rides integrationsUserIdHolder — ALWAYS set during authed
 * renders (UserProvider), and callLlm only fires from authed surfaces.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import type { LlmProvider } from '../types/integrations';

export interface UsageEntry {
    ts: number;
    provider: LlmProvider;
    model: string;
    /** Estimated tokens (chars/4). */
    estIn: number;
    estOut: number;
    /** Estimated USD for this call. */
    estCost: number;
}

export interface DailyRollup {
    date: string; // YYYY-MM-DD local
    calls: number;
    estIn: number;
    estOut: number;
    estCost: number;
    byProvider: Partial<Record<LlmProvider, { calls: number; estCost: number }>>;
}

export interface UsageLedger {
    entries: UsageEntry[];
    days: Record<string, DailyRollup>;
}

const MAX_ENTRIES = 1000;

export const llmUsageUserIdHolder = integrationsUserIdHolder; // shared identity

function resolveKey(): string {
    const uid = llmUsageUserIdHolder.current;
    return uid ? `llmusage:${uid}` : 'llmusage:_anonymous';
}

function emptyLedger(): UsageLedger {
    return { entries: [], days: {} };
}

function deserialize(raw: string | null): UsageLedger {
    if (!raw) return emptyLedger();
    try {
        const parsed = JSON.parse(raw);
        return {
            entries: Array.isArray(parsed?.entries) ? parsed.entries.slice(-MAX_ENTRIES) : [],
            days: parsed?.days && typeof parsed.days === 'object' ? parsed.days : {},
        };
    } catch {
        return emptyLedger();
    }
}

export const llmUsageStore = withSync(
    createLocalStorageStore<UsageLedger>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: emptyLedger(),
    }),
    { objectType: 'llm-usage', holder: llmUsageUserIdHolder, resolveKey },
);

function persist(next: UsageLedger): void {
    llmUsageStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed/full */ }
    });
}

/* ─── Pricing (rough $/MTok, 2026 ballpark; local/custom free) ─── */

const PRICES: Array<{ match: RegExp; inPerM: number; outPerM: number }> = [
    { match: /opus/i, inPerM: 15, outPerM: 75 },
    { match: /sonnet/i, inPerM: 3, outPerM: 15 },
    { match: /haiku/i, inPerM: 0.8, outPerM: 4 },
    { match: /gpt-4o-mini/i, inPerM: 0.15, outPerM: 0.6 },
    { match: /gpt-4o|gpt-4\./i, inPerM: 2.5, outPerM: 10 },
    { match: /o[134](?:-|$)/i, inPerM: 10, outPerM: 40 },
    { match: /flash/i, inPerM: 0.1, outPerM: 0.4 },
    { match: /gemini.*pro|pro.*gemini/i, inPerM: 1.25, outPerM: 5 },
];

export function estimateCost(model: string, estIn: number, estOut: number, provider: LlmProvider): number {
    if (provider === 'local') return 0;
    const p = PRICES.find(x => x.match.test(model));
    if (!p) return (estIn * 1 + estOut * 3) / 1_000_000; // unknown → modest default
    return (estIn * p.inPerM + estOut * p.outPerM) / 1_000_000;
}

/** Chars/4 — the standard rough token estimate. */
export function estTokens(text: string): number {
    return Math.ceil((text?.length ?? 0) / 4);
}

function localDate(ts: number): string {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Record one completion. NEVER throws (called from inside callLlm). */
export function recordLlmUsage(input: { provider: LlmProvider; model: string; promptChars: number; responseChars: number }): void {
    try {
        const estIn = Math.ceil(input.promptChars / 4);
        const estOut = Math.ceil(input.responseChars / 4);
        const entry: UsageEntry = {
            ts: Date.now(),
            provider: input.provider,
            model: input.model,
            estIn,
            estOut,
            estCost: estimateCost(input.model, estIn, estOut, input.provider),
        };
        const cur = llmUsageStore.getSnapshot();
        const date = localDate(entry.ts);
        const day: DailyRollup = cur.days[date] ?? { date, calls: 0, estIn: 0, estOut: 0, estCost: 0, byProvider: {} };
        const prov = day.byProvider[entry.provider] ?? { calls: 0, estCost: 0 };
        const next: UsageLedger = {
            entries: [...cur.entries, entry].slice(-MAX_ENTRIES),
            days: {
                ...cur.days,
                [date]: {
                    ...day,
                    calls: day.calls + 1,
                    estIn: day.estIn + estIn,
                    estOut: day.estOut + estOut,
                    estCost: day.estCost + entry.estCost,
                    byProvider: { ...day.byProvider, [entry.provider]: { calls: prov.calls + 1, estCost: prov.estCost + entry.estCost } },
                },
            },
        };
        persist(next);
    } catch { /* ledger must never break an LLM call */ }
}

/* ─── Read helpers (widget + morning brief) ─── */

export function lastNDays(n: number, ledger?: UsageLedger): DailyRollup[] {
    const l = ledger ?? llmUsageStore.getSnapshot();
    const out: DailyRollup[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const date = localDate(Date.now() - i * 86_400_000);
        out.push(l.days[date] ?? { date, calls: 0, estIn: 0, estOut: 0, estCost: 0, byProvider: {} });
    }
    return out;
}

export function todayRollup(ledger?: UsageLedger): DailyRollup {
    return lastNDays(1, ledger)[0];
}

/**
 * Plan advice heuristic (the video's "you're only using 20% — downgrade"):
 * compares 7-day estimated spend against common subscription tiers.
 */
export function planAdvice(ledger?: UsageLedger): string {
    const week = lastNDays(7, ledger);
    const weekCost = week.reduce((s, d) => s + d.estCost, 0);
    const weekCalls = week.reduce((s, d) => s + d.calls, 0);
    if (weekCalls === 0) return 'No LLM usage recorded this week yet.';
    const monthly = (weekCost / 7) * 30;
    if (monthly < 5) return `Pace ≈ $${monthly.toFixed(2)}/mo (est.) — pay-as-you-go API keys are cheaper than any subscription at this rate.`;
    if (monthly < 20) return `Pace ≈ $${monthly.toFixed(2)}/mo (est.) — a ~$20 tier would roughly break even.`;
    if (monthly < 100) return `Pace ≈ $${monthly.toFixed(2)}/mo (est.) — mid-tier plan territory; watch the big-model calls.`;
    return `Pace ≈ $${monthly.toFixed(0)}/mo (est.) — heavy usage; route routine work to cheaper models (per-persona models help).`;
}

export function clearLlmUsage(): void {
    persist(emptyLedger());
}

export function resetLlmUsage(): void {
    llmUsageStore.set(emptyLedger(), () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

export function useLlmUsage(): UsageLedger {
    return useSyncExternalStore(
        llmUsageStore.subscribe,
        llmUsageStore.getSnapshot,
        llmUsageStore.getServerSnapshot,
    );
}
