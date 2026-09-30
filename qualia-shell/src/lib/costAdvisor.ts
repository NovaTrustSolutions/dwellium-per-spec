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
import type { TodoItem } from '../components/ThoughtWeaver/todoStore';
import type { UsageLedger } from './llmUsageStore';
import { HERMES_PERSONA_IDS } from './agents/personas';

/** The user's own to-do (ThoughtWeaver "Today" list) shaped for the advisor. */
export interface AdvisorTask { id: string; title: string }

/**
 * To-dos the advisor should evaluate: not done, not dismissed, not currently
 * snoozed, not already delegated to a Hermes persona.
 */
export function advisorCandidates(todos: TodoItem[], now: number = Date.now()): AdvisorTask[] {
    return todos
        .filter(t => !t.done)
        .filter(t => !t.advisor?.dismissed)
        .filter(t => !t.advisor?.delegatedTo)
        .filter(t => !(t.advisor?.snoozedUntil != null && t.advisor.snoozedUntil > now))
        .map(t => ({ id: t.id, title: t.text }));
}

export type TaskCategory =
    | 'transcription'
    | 'data-entry'
    | 'writing'
    | 'research'
    | 'design'
    | 'scheduling'
    | 'phone'
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
    // An AI persona can't place a phone call — a person (VA) can.
    phone: { category: 'phone', label: 'Phone calls', role: 'a virtual assistant', humanMinutes: 15, onlineRatePerHour: 20, aiCapable: false, aiCostUsd: 0 },
    dev: { category: 'dev', label: 'Development', role: 'a developer', humanMinutes: 120, onlineRatePerHour: 65, aiCapable: false, aiCostUsd: 0 },
    support: { category: 'support', label: 'Support / replies', role: 'a support agent', humanMinutes: 20, onlineRatePerHour: 18, aiCapable: true, aiCostUsd: 0.05 },
    bookkeeping: { category: 'bookkeeping', label: 'Bookkeeping', role: 'a bookkeeper', humanMinutes: 60, onlineRatePerHour: 35, aiCapable: true, aiCostUsd: 0.10 },
    general: { category: 'general', label: 'General task', role: 'a virtual assistant', humanMinutes: 30, onlineRatePerHour: 22, aiCapable: true, aiCostUsd: 0.10 },
};

/** Keyword → category. First match wins, so order from specific to broad. */
const MATCHERS: Array<{ category: TaskCategory; re: RegExp }> = [
    { category: 'transcription', re: /transcrib|caption|subtitle|meeting note|minutes\b|dictat/i },
    { category: 'bookkeeping', re: /invoice|expense|reconcil|bookkeep|receipt|payroll|ledger|accounts? payable|accounts? receivable|\bbills?\b/i },
    { category: 'data-entry', re: /data entry|data-entry|spreadsheet|copy.?paste|enter (?:the )?data|csv|fill (?:in|out).*form|scrape|categoriz/i },
    { category: 'design', re: /\bdesign|logo|graphic|mockup|figma|banner|thumbnail|illustrat|wireframe/i },
    // ponytail: bare "script"/"build" swallowed non-dev tasks ("write a video
    // script", "build a checklist") — dropped in favor of the unambiguous dev
    // signals below (bug/debug/deploy/api/refactor/implement/pr).
    // Unambiguous dev words, OR a generic verb (debug/bug/implement/fix) only when a
    // technical noun is present — "debug why the kitchen sink leaks" is not dev work.
    { category: 'dev', re: /\bcode\b|coding|deploy|\bapi\b|refactor|pull request|\bpr\b|(?=.*\b(?:app|apps|site|website|web ?page|login|server|database|feature|endpoint|frontend|backend|code|plugin|css|html|webhooks?|repo|repository|scripts?|widgets?|dashboard|integration|build|ci|tests?)\b).*\b(?:bugs?|debug\w*|implement\w*|fix\w*)\b/i },
    { category: 'phone', re: /\b(?:call|phone|ring)\b/i },
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
    /** Whether the AI cost is the static category benchmark or this device's measured Hermes average. */
    aiCostSource: 'benchmark' | 'measured';
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
    /** Replaces the benchmark AI-automation cost for AI-capable categories (e.g. measuredHermesTaskCost().perTaskUsd). */
    aiCostOverrideUsd?: number;
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
    const aiCostSource: 'benchmark' | 'measured' = opts.aiCostOverrideUsd != null ? 'measured' : 'benchmark';
    const aiCostUsd = b.aiCapable
        ? round2(opts.aiCostOverrideUsd ?? b.aiCostUsd)
        : null;

    const candidates: Array<{ kind: CheapestOption; cost: number }> = [{ kind: 'outsource', cost: outsourceCostUsd }];
    if (aiCostUsd != null) candidates.push({ kind: 'ai', cost: aiCostUsd });
    candidates.sort((a, c) => a.cost - c.cost);
    const best = candidates[0];

    const savingsUsd = round2(manualCostUsd - best.cost);
    // Your own time is already the cheapest, or the gap is too small to bother.
    if (best.cost >= manualCostUsd || savingsUsd < minSavings) return null;

    const rateNote = `~$${Math.round(onlineRatePerHour)}/hr online${rateSource === 'live' ? ', current' : ''}`;
    const aiCostNote = aiCostSource === 'measured'
        ? `~${money(best.cost)} measured per Hermes task`
        : `~${money(best.cost)} (benchmark)`;
    const message = best.kind === 'ai'
        ? `“${task.title}” ≈ ${b.humanMinutes} min — about ${money(manualCostUsd)} of your time at $${Math.round(kpiPerHour)}/hr. ` +
          `AI automation would do it for ${aiCostNote}, saving ≈ ${money(savingsUsd)} (or ${b.role} at ${rateNote}).`
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
        aiCostSource,
        message,
    };
}

/**
 * Evaluate the user's own active to-dos (see advisorCandidates). Sorted by
 * biggest savings first, capped.
 */
export function evaluateTasks(
    tasks: AdvisorTask[],
    kpiPerHour: number,
    opts: AdvisorOptions = {},
): Recommendation[] {
    const max = opts.max ?? 8;
    const recs: Recommendation[] = [];
    for (const t of tasks) {
        const r = evaluateTask(t, kpiPerHour, {
            minSavingsUsd: opts.minSavingsUsd,
            outsourceRatePerHour: opts.rateOverrides?.[t.id],
            aiCostOverrideUsd: opts.aiCostOverrideUsd,
        });
        if (r) recs.push(r);
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
    tasks: AdvisorTask[],
    kpiPerHour: number,
    max = 3,
): string[] {
    return evaluateTasks(tasks, kpiPerHour, { max }).map(r => r.message);
}

/* ─── Live online rates (the morning brief asks the LLM per flagged task) ─── */

export const LIVE_RATE_SYSTEM =
    'You estimate current freelance-marketplace rates. For each task, give the typical CURRENT rate to ' +
    'hire a competent freelancer ONLINE (Upwork/Fiverr-style) to do it, in US dollars per hour, based on ' +
    'widely-known recent market ranges. Respond as STRICT JSON only — no preamble, no code fences: ' +
    '{"rates":[{"id":"<task id>","usdPerHour":<number>}]} with one entry per task id.';

/**
 * Plan 068 (E6, privacy): NO `title` field — a task title is user-typed free
 * text and must never leave the browser. Category + role + benchmark rate are
 * enough for the LLM to estimate a current market rate.
 */
export interface LiveRateRequestItem {
    taskId: string;
    category: TaskCategory;
    role: string;
    benchmarkRatePerHour: number;
}

/** Shape the flagged recommendations into a compact rate-request list. */
export function liveRateRequestItems(recs: Recommendation[]): LiveRateRequestItem[] {
    return recs.map(r => ({
        taskId: r.taskId,
        category: r.category,
        role: r.role,
        benchmarkRatePerHour: r.onlineRatePerHour,
    }));
}

/** Build the per-task live-rate prompt (pairs with LIVE_RATE_SYSTEM). E6: category + role only, never the verbatim task title. */
export function buildLiveRatePrompt(items: LiveRateRequestItem[]): string {
    const lines = items
        .map(it => `- id="${it.taskId}" · type: ${it.category} (hire ${it.role}) · benchmark ~$${it.benchmarkRatePerHour}/hr`)
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

/* ─── Measured Hermes cost (replaces the AI benchmark once you have data) ─── */

export interface MeasuredAiCost {
    perTaskUsd: number;
    samples: number;
}

const HERMES_COST_WINDOW_MS = 30 * 86_400_000;
/** Below this many completed Hermes tasks in the window, an average is too noisy to trust. */
const MIN_HERMES_SAMPLES = 5;

/**
 * This device's actual $/Hermes-task over the last 30 days: ledger spend
 * (source === 'hermes') ÷ Hermes tasks completed in the same window. Null
 * when there's too little data (< 5 completed tasks) — caller falls back to
 * the category benchmark.
 *
 * ponytail: `ledger.entries` is capped at 1,000/device (llmUsageStore), so a
 * very high-volume window can undercount old spend once entries roll off.
 * Upgrade path: sum from the `days` rollups instead of raw `entries` if that
 * ever matters in practice.
 * ponytail: spend (calls in the window) and completed (tasks finished in the
 * window) are different populations — a task spanning the window edge, or a
 * failed run that still burned tokens, skews the ratio a little. Exact per-task
 * cost needs a task id on each ledger entry.
 */
export function measuredHermesTaskCost(
    ledger: UsageLedger | null | undefined,
    work: PersonaWorkState | null | undefined,
    now: number = Date.now(),
): MeasuredAiCost | null {
    const windowStart = now - HERMES_COST_WINDOW_MS;

    let spend = 0;
    for (const e of ledger?.entries ?? []) {
        if (e.source !== 'hermes') continue;
        if (e.ts < windowStart || e.ts > now) continue;
        if (e.estCost != null) spend += e.estCost;
    }

    let completed = 0;
    for (const personaId of HERMES_PERSONA_IDS) {
        for (const t of work?.[personaId]?.tasks ?? []) {
            if (t.status !== 'done' || t.completedAt == null) continue;
            if (t.completedAt < windowStart || t.completedAt > now) continue;
            completed++;
        }
    }

    if (completed < MIN_HERMES_SAMPLES) return null;
    return { perTaskUsd: round2(spend / completed), samples: completed };
}

/* ─── Category → best-fit Hermes persona (for the "Delegate to Hermes" button) ─── */

type HermesPersonaId = (typeof HERMES_PERSONA_IDS)[number];

/**
 * Deterministic category → persona pick, based on each persona's own
 * description (personas.ts): Scribe documents/writes, Mercury executes fast
 * operational checklists, Orpheus is the creative synthesizer, Philosopher is
 * the deep-reasoning researcher, Labyrinth maps systems/dependencies. Mercury
 * is the default for admin-shaped work and anything uncategorized.
 */
const HERMES_PERSONA_FOR_CATEGORY: Record<TaskCategory, HermesPersonaId> = {
    transcription: 'hermes-scribe',
    writing: 'hermes-scribe',
    'data-entry': 'hermes-mercury',
    scheduling: 'hermes-mercury',
    support: 'hermes-mercury',
    bookkeeping: 'hermes-mercury',
    design: 'hermes-orpheus',
    research: 'hermes-philosopher',
    dev: 'hermes-labyrinth',
    general: 'hermes-mercury',
    phone: 'hermes-mercury', // not AI-capable, so never offered for delegation; kept for completeness
};

/** Always a HERMES_PERSONA_IDS member — unknown categories fall back to Mercury. */
export function pickHermesPersona(category: TaskCategory): string {
    return HERMES_PERSONA_FOR_CATEGORY[category] ?? 'hermes-mercury';
}
