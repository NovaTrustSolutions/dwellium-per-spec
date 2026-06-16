/**
 * costAdvisor — "is this worth your time?" engine.
 *
 * For each thing the user is doing (a Hermes/Honcho persona task that's queued
 * or running), estimate what it costs to do it three ways:
 *   - YOURSELF      → estimated minutes × your hourly KPI (costKpiStore)
 *   - AI AUTOMATION → a cheap, ~flat per-task benchmark (when the category is
 *                     plausibly automatable)
 *   - ANOTHER PERSON → estimated minutes × a typical ONLINE OUTSOURCING rate
 *                     for that kind of work
 *
 * If the cheapest delegate option (AI or a person) costs LESS than your own
 * time, we flag it: "you're spending $X of your time on this — it can be done
 * cheaper." The KPI slider is the sensitivity knob.
 *
 * Pure + dependency-light (types-only import of the task shape) so it unit-tests
 * without React or a store. Rates are PUBLIC BALLPARKS, labelled as estimates —
 * directionally useful, not a quote.
 */
import type { PersonaTask, PersonaWorkState } from './agents/personaWorkStore';

export type TaskCategory =
    | 'transcription'
    | 'data-entry'
    | 'writing'
    | 'research'
    | 'design'
    | 'scheduling'
    | 'dev'
    | 'support'
    | 'bookkeeping'
    | 'general';

export interface CategoryBenchmark {
    category: TaskCategory;
    /** Human-readable category label. */
    label: string;
    /** Who you'd hire online for this. */
    role: string;
    /** Typical human minutes to do this kind of task (benchmark). */
    humanMinutes: number;
    /** Typical online outsourcing rate, USD/hour (freelance-marketplace ballpark). */
    onlineRatePerHour: number;
    /** Can AI automation plausibly do this end-to-end? */
    aiCapable: boolean;
    /** Rough one-shot AI-automation cost, USD (tokens + tooling). */
    aiCostUsd: number;
}

/**
 * Benchmarks — public freelance-marketplace ballparks (2026), labelled as
 * estimates. Tunable later; deliberately conservative on what AI can fully
 * own (design/dev are outsource-only so we never over-claim automation).
 */
export const CATEGORY_BENCHMARKS: Record<TaskCategory, CategoryBenchmark> = {
    transcription: { category: 'transcription', label: 'Transcription / notes', role: 'a transcriptionist', humanMinutes: 30, onlineRatePerHour: 20, aiCapable: true, aiCostUsd: 0.10 },
    'data-entry': { category: 'data-entry', label: 'Data entry', role: 'a data-entry VA', humanMinutes: 45, onlineRatePerHour: 15, aiCapable: true, aiCostUsd: 0.05 },
    writing: { category: 'writing', label: 'Writing / drafting', role: 'a copywriter', humanMinutes: 60, onlineRatePerHour: 35, aiCapable: true, aiCostUsd: 0.20 },
    research: { category: 'research', label: 'Research', role: 'a research VA', humanMinutes: 60, onlineRatePerHour: 30, aiCapable: true, aiCostUsd: 0.25 },
    design: { category: 'design', label: 'Design', role: 'a designer', humanMinutes: 90, onlineRatePerHour: 45, aiCapable: false, aiCostUsd: 0 },
    scheduling: { category: 'scheduling', label: 'Scheduling / admin', role: 'a virtual assistant', humanMinutes: 15, onlineRatePerHour: 20, aiCapable: true, aiCostUsd: 0.03 },
    dev: { category: 'dev', label: 'Development', role: 'a developer', humanMinutes: 120, onlineRatePerHour: 65, aiCapable: false, aiCostUsd: 0 },
    support: { category: 'support', label: 'Support / replies', role: 'a support agent', humanMinutes: 20, onlineRatePerHour: 18, aiCapable: true, aiCostUsd: 0.05 },
    bookkeeping: { category: 'bookkeeping', label: 'Bookkeeping', role: 'a bookkeeper', humanMinutes: 60, onlineRatePerHour: 35, aiCapable: true, aiCostUsd: 0.10 },
    general: { category: 'general', label: 'General task', role: 'a virtual assistant', humanMinutes: 30, onlineRatePerHour: 22, aiCapable: true, aiCostUsd: 0.10 },
};

/** Keyword → category. First match wins, so order from specific to broad. */
const MATCHERS: Array<{ category: TaskCategory; re: RegExp }> = [
    { category: 'transcription', re: /transcrib|caption|subtitle|meeting note|minutes\b|dictat/i },
    { category: 'bookkeeping', re: /invoice|expense|reconcil|bookkeep|receipt|payroll|ledger|accounts? payable|accounts? receivable/i },
    { category: 'data-entry', re: /data entry|data-entry|spreadsheet|copy.?paste|enter (?:the )?data|csv|fill (?:in|out).*form|scrape|categoriz/i },
    { category: 'design', re: /\bdesign|logo|graphic|mockup|figma|banner|thumbnail|illustrat|wireframe/i },
    { category: 'dev', re: /\bcode\b|coding|bug|debug|deploy|\bapi\b|script|refactor|\bbuild\b|implement|pull request|\bpr\b/i },
    { category: 'scheduling', re: /schedul|calendar|\bbook\b|appointment|remind|follow.?up|coordinat/i },
    { category: 'support', re: /support|reply|respond|ticket|customer|inbox|triage|answer/i },
    { category: 'research', re: /research|find |look up|look-up|compile|gather|investigat|comparison|benchmark|sourc/i },
    { category: 'writing', re: /write|writing|draft|blog|email|copy\b|content|\bpost\b|article|summar|proposal|outline|newsletter/i },
];

export function categorizeTask(title: string): TaskCategory {
    const t = (title ?? '').trim();
    if (!t) return 'general';
    for (const m of MATCHERS) if (m.re.test(t)) return m.category;
    return 'general';
}

export type CheapestOption = 'ai' | 'outsource';

/** Where the online outsourcing rate came from. */
export type RateSource = 'benchmark' | 'live';

export interface Recommendation {
    taskId: string;
    title: string;
    category: TaskCategory;
    humanMinutes: number;
    /** Cost of doing it yourself: minutes × KPI. */
    manualCostUsd: number;
    /** AI-automation cost, or null when the category isn't automatable. */
    aiCostUsd: number | null;
    /** Online outsourcing cost: minutes × online rate. */
    outsourceCostUsd: number;
    onlineRatePerHour: number;
    role: string;
    cheapest: CheapestOption;
    cheapestCostUsd: number;
    /** manual − cheapest (>0 means delegating saves money/time). */
    savingsUsd: number;
    /** Whether the online rate is a static benchmark or a live LLM estimate. */
    rateSource: RateSource;
    /** One-line, ready to show or drop in the morning brief. */
    message: string;
}

export interface AdvisorOptions {
    /** Don't flag savings smaller than this (avoids nagging on trivia). Default $1. */
    minSavingsUsd?: number;
    /** Max recommendations returned. Default 8. */
    max?: number;
    /** Override the online outsourcing rate ($/hr) for a SINGLE task (evaluateTask). */
    outsourceRatePerHour?: number;
    /** Per-taskId online-rate overrides ($/hr) — e.g. live LLM rates (evaluateTasks). */
    rateOverrides?: Record<string, number>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const money = (n: number): string => `$${n.toFixed(2)}`;

/** Evaluate ONE task. Returns a recommendation only when delegating beats your time. */
export function evaluateTask(
    task: Pick<PersonaTask, 'id' | 'title'>,
    kpiPerHour: number,
    opts: AdvisorOptions = {},
): Recommendation | null {
    const minSavings = opts.minSavingsUsd ?? 1;
    const category = categorizeTask(task.title);
    const b = CATEGORY_BENCHMARKS[category];
    const hours = b.humanMinutes / 60;

    const rateSource: RateSource = opts.outsourceRatePerHour != null ? 'live' : 'benchmark';
    const onlineRatePerHour = opts.outsourceRatePerHour ?? b.onlineRatePerHour;

    const manualCostUsd = round2(hours * kpiPerHour);
    const outsourceCostUsd = round2(hours * onlineRatePerHour);
    const aiCostUsd = b.aiCapable ? round2(b.aiCostUsd) : null;

    const candidates: Array<{ kind: CheapestOption; cost: number }> = [{ kind: 'outsource', cost: outsourceCostUsd }];
    if (aiCostUsd != null) candidates.push({ kind: 'ai', cost: aiCostUsd });
    candidates.sort((a, c) => a.cost - c.cost);
    const best = candidates[0];

    const savingsUsd = round2(manualCostUsd - best.cost);
    // Your own time is already the cheapest, or the gap is too small to bother.
    if (best.cost >= manualCostUsd || savingsUsd < minSavings) return null;

    const rateNote = `~$${Math.round(onlineRatePerHour)}/hr online${rateSource === 'live' ? ', current' : ''}`;
    const message = best.kind === 'ai'
        ? `“${task.title}” ≈ ${b.humanMinutes} min — about ${money(manualCostUsd)} of your time at $${Math.round(kpiPerHour)}/hr. ` +
          `AI automation would do it for ~${money(best.cost)}, saving ≈ ${money(savingsUsd)} (or ${b.role} at ${rateNote}).`
        : `“${task.title}” ≈ ${b.humanMinutes} min — about ${money(manualCostUsd)} of your time at $${Math.round(kpiPerHour)}/hr. ` +
          `${b.role} would do it for ~${money(best.cost)} (${rateNote}), saving ≈ ${money(savingsUsd)}.`;

    return {
        taskId: task.id,
        title: task.title,
        category,
        humanMinutes: b.humanMinutes,
        manualCostUsd,
        aiCostUsd,
        outsourceCostUsd,
        onlineRatePerHour,
        role: b.role,
        cheapest: best.kind,
        cheapestCostUsd: best.cost,
        savingsUsd,
        rateSource,
        message,
    };
}

/**
 * Evaluate everything the user is actively doing: queued ('todo') or
 * in-progress ('running') tasks across every Hermes/Honcho persona. Sorted by
 * biggest savings first, capped.
 */
export function evaluateTasks(
    state: PersonaWorkState | null | undefined,
    kpiPerHour: number,
    opts: AdvisorOptions = {},
): Recommendation[] {
    const max = opts.max ?? 8;
    const recs: Recommendation[] = [];
    for (const work of Object.values(state ?? {})) {
        for (const t of work?.tasks ?? []) {
            if (t.status !== 'todo' && t.status !== 'running') continue;
            const r = evaluateTask(t, kpiPerHour, {
                minSavingsUsd: opts.minSavingsUsd,
                outsourceRatePerHour: opts.rateOverrides?.[t.id],
            });
            if (r) recs.push(r);
        }
    }
    recs.sort((a, b) => b.savingsUsd - a.savingsUsd);
    return recs.slice(0, max);
}

/** Total estimated time-value reclaimable if every flagged task were delegated. */
export function totalSavings(recs: Recommendation[]): number {
    return round2(recs.reduce((s, r) => s + r.savingsUsd, 0));
}

/** Brief/dream lines: the top-N recommendation messages. */
export function costAdvisoryLines(
    state: PersonaWorkState | null | undefined,
    kpiPerHour: number,
    max = 3,
): string[] {
    return evaluateTasks(state, kpiPerHour, { max }).map(r => r.message);
}

/* ─── Live online rates (the morning brief asks the LLM per flagged task) ─── */

export const LIVE_RATE_SYSTEM =
    'You estimate current freelance-marketplace rates. For each task, give the typical CURRENT rate to ' +
    'hire a competent freelancer ONLINE (Upwork/Fiverr-style) to do it, in US dollars per hour, based on ' +
    'widely-known recent market ranges. Respond as STRICT JSON only — no preamble, no code fences: ' +
    '{"rates":[{"id":"<task id>","usdPerHour":<number>}]} with one entry per task id.';

export interface LiveRateRequestItem {
    taskId: string;
    title: string;
    category: TaskCategory;
    role: string;
    benchmarkRatePerHour: number;
}

/** Shape the flagged recommendations into a compact rate-request list. */
export function liveRateRequestItems(recs: Recommendation[]): LiveRateRequestItem[] {
    return recs.map(r => ({
        taskId: r.taskId,
        title: r.title,
        category: r.category,
        role: r.role,
        benchmarkRatePerHour: r.onlineRatePerHour,
    }));
}

/** Build the per-task live-rate prompt (pairs with LIVE_RATE_SYSTEM). */
export function buildLiveRatePrompt(items: LiveRateRequestItem[]): string {
    const lines = items
        .map(it => `- id="${it.taskId}" · "${it.title}" · type: ${it.category} (hire ${it.role}) · benchmark ~$${it.benchmarkRatePerHour}/hr`)
        .join('\n');
    return `Give the current online freelance rate (USD/hour) for each task.\n` +
        `Return JSON {"rates":[{"id":"...","usdPerHour":<number>}]} only.\n\nTasks:\n${lines}`;
}

/**
 * Parse the LLM rate reply into a clamped { taskId → $/hr } map. Tolerant:
 * extracts the JSON object, keeps only KNOWN task ids, coerces + clamps each
 * rate to [1, 500]. Garbage / missing → {} (caller falls back to benchmarks).
 */
export function parseLiveRates(raw: string | null | undefined, validIds: Set<string>): Record<string, number> {
    if (!raw) return {};
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
        const parsed = JSON.parse(match[0]) as { rates?: unknown };
        const arr = Array.isArray(parsed.rates) ? parsed.rates : [];
        const out: Record<string, number> = {};
        for (const item of arr) {
            if (!item || typeof item !== 'object') continue;
            const id = (item as { id?: unknown }).id;
            const rate = (item as { usdPerHour?: unknown }).usdPerHour;
            if (typeof id !== 'string' || !validIds.has(id)) continue;
            const n = typeof rate === 'number' ? rate : Number(rate);
            if (!Number.isFinite(n) || n <= 0) continue;
            out[id] = Math.min(500, Math.max(1, Math.round(n)));
        }
        return out;
    } catch {
        return {};
    }
}
