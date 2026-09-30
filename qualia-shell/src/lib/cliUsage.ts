/**
 * cliUsage — plan 068 Phase 3: Claude Code (CLI) usage as an API-EQUIVALENT
 * figure in the AI Spend widget. This is NEVER real spend — Ilya's Max
 * subscription already covers Claude Code CLI usage, so it must never be
 * added to any spend total (see plans/068-ai-spend-widget.md, Phase 3
 * decision). It only exists to show "what this would have cost at API
 * rates", for context.
 *
 * Dev-only: reuses the exact same fetch path TokenSaver.tsx already uses
 * (`token-saver-stats.json`, dwellium scope). There is no second scope route
 * to request — the plan says not to add one — so this reads whatever that
 * one route serves.
 *
 * The stats schema (see ~/.token-saver/refresh.sh output) never names a
 * model today (confirmed: no `model` / per-model field in stats-dwellium.json
 * or stats-claude.json). So apiEquivalentUsd is null unless a future stats
 * version adds one — never guessed.
 */
import { useEffect, useState } from 'react';
import { priceFor } from './llmPricing';

export interface CliUsageTotals {
    freshInputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
    outputTokens: number;
}

export interface CliUsage {
    totals: CliUsageTotals;
    periodLabel: string;
    /** null = model not recorded in the stats file, so no guess was made. */
    apiEquivalentUsd: number | null;
}

const STATS_URL = 'token-saver-stats.json'; // relative — same path TokenSaver.tsx fetches

function num(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
}

function periodLabelFrom(generatedAt: unknown): string {
    const d = new Date(String(generatedAt ?? ''));
    if (Number.isNaN(d.getTime())) return 'all time';
    return `as of ${d.toLocaleDateString()}`;
}

/** The stats file has no model field today (ponytail: real support added
 * when refresh.sh actually names one — see module comment above). */
function modelFrom(raw: Record<string, unknown>): string | null {
    const totals = raw.totals as Record<string, unknown> | undefined;
    const m = raw.model ?? totals?.model;
    return typeof m === 'string' && m.length > 0 ? m : null;
}

function computeApiEquivalentUsd(totals: CliUsageTotals, model: string | null): number | null {
    if (!model) return null;
    const price = priceFor(model, 'anthropic');
    if (!price) return null;
    const cacheReadPerM = price.cacheReadPerM ?? price.inPerM * 0.1;
    const cacheWritePerM = price.cacheWritePerM ?? price.inPerM * 1.25;
    const usd = (
        totals.freshInputTokens * price.inPerM
        + totals.cacheReadTokens * cacheReadPerM
        + totals.cacheCreationTokens * cacheWritePerM
        + totals.outputTokens * price.outPerM
    ) / 1_000_000;
    return Math.round(usd * 100) / 100;
}

/** Pure parser, exported for tests. Tolerant of missing/garbage fields;
 * returns null only when the payload isn't a usable stats object at all. */
export function parseCliUsageStats(raw: unknown): CliUsage | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    const t = r.totals as Record<string, unknown> | undefined;
    if (!t || typeof t !== 'object') return null;
    const totals: CliUsageTotals = {
        freshInputTokens: num(t.fresh_input_tokens),
        cacheReadTokens: num(t.cache_read_tokens),
        cacheCreationTokens: num(t.cache_creation_tokens),
        outputTokens: num(t.output_tokens),
    };
    return {
        totals,
        periodLabel: periodLabelFrom(r.generated_at),
        apiEquivalentUsd: computeApiEquivalentUsd(totals, modelFrom(r)),
    };
}

/** null in production (no fetch is made), while the file is loading, when
 * it's missing (404), or when it's not valid JSON / not a usable shape. */
export function useClaudeCodeUsage(): CliUsage | null {
    const [usage, setUsage] = useState<CliUsage | null>(null);

    useEffect(() => {
        if (!import.meta.env.DEV) return;
        let cancelled = false;
        fetch(STATS_URL)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
            .then((d: unknown) => { if (!cancelled) setUsage(parseCliUsageStats(d)); })
            .catch(() => { if (!cancelled) setUsage(null); });
        return () => { cancelled = true; };
    }, []);

    return usage;
}
