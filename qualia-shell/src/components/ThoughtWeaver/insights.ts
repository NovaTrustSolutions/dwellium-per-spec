/**
 * insights — pure, LLM-injectable analysis helpers for ThoughtWeaver's
 * reports + to-do generation + non-obvious insight surfacing (Block B Cycle 12).
 *
 * Design goals:
 *  - PURE + deterministic given inputs: every function takes its data and an
 *    injectable `LlmFn` dependency, never reaches for the integrations bundle,
 *    `window`, `localStorage`, or `new Date()` internally. "Now"/date context
 *    is always passed in by the caller. This makes the whole module unit-
 *    testable with a mocked LLM and no React render (the component needs a
 *    UserProvider; these functions don't).
 *  - GRACEFUL no-LLM: every function works without an LLM via a heuristic
 *    fallback (admin/action-verb detection for to-dos, a counts-based daily
 *    summary). The richer LLM path layers on top. `surfaceInsights` is the one
 *    genuinely LLM-dependent path (non-obvious cross-capture patterns can't be
 *    faked by a heuristic) — it returns [] without an LLM.
 *  - KEEP DATA LOCAL: these helpers return plain data; persistence is the
 *    caller's job via reportStore / todoStore (both local per-user stores).
 *
 * The LLM dependency is a thin function `(req) => Promise<LlmResponse|null>` so
 * call sites wrap `callLlm(req, integrations.llm)` and tests inject a stub.
 */
import type { LlmRequest, LlmResponse } from '../../lib/llmClient';
import type { TodoItem } from './todoStore';

/** Injectable LLM dependency — wraps `callLlm(req, llm)` at the call site. */
export type LlmFn = (req: LlmRequest) => Promise<LlmResponse | null>;

/** Minimal capture shape these helpers operate on (superset = LocalCapture). */
export interface InsightCapture {
    id: string;
    text: string;
    filed_to: string;
    destination_name?: string | null;
    createdAt: string;       // ISO
}

/** A to-do seed ready to hand to `syncTodosFromCaptures`. */
export type TodoSeed = Omit<TodoItem, 'id' | 'done' | 'createdAt' | 'completedAt'>;

const CATEGORIZE_BUCKETS = ['people', 'projects', 'ideas', 'admin', 'needs_review'] as const;
export type Bucket = typeof CATEGORIZE_BUCKETS[number];

export interface Categorization {
    filed_to: Bucket;
    confidence: number;          // 0..1
    destination_name: string | null;
}

// ── Date helpers (pure; date strings in, date strings out) ────────────

/** YYYY-MM-DD slice of an ISO timestamp. */
export function dayKey(iso: string): string {
    return (iso || '').slice(0, 10);
}

/**
 * Monday-anchored week-start (YYYY-MM-DD) for a YYYY-MM-DD date string.
 * Uses UTC math on the date-only string so it's TZ-stable + deterministic.
 */
export function weekStartOf(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return dateStr;
    const dow = d.getUTCDay();                 // 0=Sun..6=Sat
    const backToMon = (dow + 6) % 7;           // days since Monday
    d.setUTCDate(d.getUTCDate() - backToMon);
    return d.toISOString().slice(0, 10);
}

/** Captures whose createdAt day === the given YYYY-MM-DD. */
export function capturesForDay(captures: InsightCapture[], date: string): InsightCapture[] {
    return captures.filter(c => dayKey(c.createdAt) === date);
}

/** Captures whose createdAt week-start === the given Monday YYYY-MM-DD. */
export function capturesForWeek(captures: InsightCapture[], weekStart: string): InsightCapture[] {
    return captures.filter(c => weekStartOf(dayKey(c.createdAt)) === weekStart);
}

// ── Internal: safe JSON parse of an LLM response ──────────────────────

function parseJsonLoose(text: string): any | null {
    try {
        return JSON.parse(text);
    } catch {
        // Some providers wrap JSON in prose or fences — extract the first {...} or [...].
        const m = text.match(/[\[{][\s\S]*[\]}]/);
        if (!m) return null;
        try { return JSON.parse(m[0]); } catch { return null; }
    }
}

// ── (a) Categorize a single capture ───────────────────────────────────

/**
 * Classify one capture into a bucket. LLM-first; returns null if no LLM or the
 * call/parse fails (caller falls back to backend or a heuristic, as the live
 * ThoughtWeaver capture flow already does).
 */
export async function categorizeCapture(text: string, llm: LlmFn): Promise<Categorization | null> {
    let res: LlmResponse | null;
    try {
        res = await llm({
            systemPrompt: `You are a thought-categorization assistant. Classify the user's text into exactly one bucket and respond with JSON only.
Buckets:
  - "people": mentions of meeting/talking-to/about a specific person
  - "projects": project status, milestones, deliverables, deadlines
  - "ideas": speculative thoughts, "what if", new concepts to explore
  - "admin": tasks, todos, things that need to be done
  - "needs_review": ambiguous text that doesn't clearly fit a bucket
Schema: { "filed_to": "people"|"projects"|"ideas"|"admin"|"needs_review", "confidence": number 0-1, "destination_name": "short descriptive label (3-6 words)" }`,
            prompt: text,
            responseFormat: 'json',
            maxTokens: 256,
            temperature: 0.2,
        });
    } catch {
        return null;
    }
    if (!res) return null;
    const parsed = parseJsonLoose(res.text);
    if (!parsed) return null;
    const filed_to = (CATEGORIZE_BUCKETS as readonly string[]).includes(parsed.filed_to)
        ? parsed.filed_to as Bucket : 'needs_review';
    const confidence = typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;
    const destination_name = typeof parsed.destination_name === 'string' && parsed.destination_name.trim()
        ? parsed.destination_name.trim() : null;
    return { filed_to, confidence, destination_name };
}

// ── (b) Draft a daily report ──────────────────────────────────────────

/** Heuristic daily summary used when no LLM is configured (or it fails). */
export function heuristicDailySummary(captures: InsightCapture[]): string {
    if (captures.length === 0) return 'No thoughts captured.';
    const byBucket = new Map<string, number>();
    for (const c of captures) byBucket.set(c.filed_to, (byBucket.get(c.filed_to) || 0) + 1);
    const breakdown = [...byBucket.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([b, n]) => `${n} ${b}`)
        .join(', ');
    const noun = captures.length === 1 ? 'thought' : 'thoughts';
    return `${captures.length} ${noun} captured (${breakdown}).`;
}

/**
 * Draft a narrative daily report for the given captures. LLM-first; falls back
 * to `heuristicDailySummary` if no LLM or the call fails. Never returns null —
 * there's always *something* to show.
 */
export async function draftDailyReport(captures: InsightCapture[], dateLabel: string, llm: LlmFn): Promise<string> {
    if (captures.length === 0) return 'No thoughts captured on this day.';
    let res: LlmResponse | null = null;
    try {
        const bullets = captures.map(c => `- [${c.filed_to}] ${c.text}`).join('\n');
        res = await llm({
            systemPrompt: `You are a concise personal-productivity assistant. Write a short (2-4 sentence) reflective daily report summarizing the user's captured thoughts for ${dateLabel}. Group related items, note what got attention, and keep it warm but brief. Plain prose, no markdown headers, no preamble.`,
            prompt: bullets,
            maxTokens: 320,
            temperature: 0.4,
        });
    } catch {
        return heuristicDailySummary(captures);
    }
    const text = res?.text?.trim();
    return text ? text : heuristicDailySummary(captures);
}

/** Draft a weekly rollup summary. LLM-first; heuristic fallback. */
export async function draftWeeklySummary(captures: InsightCapture[], weekLabel: string, llm: LlmFn): Promise<string> {
    if (captures.length === 0) return 'No thoughts captured this week.';
    let res: LlmResponse | null = null;
    try {
        const bullets = captures.map(c => `- [${c.filed_to}] ${c.text}`).join('\n');
        res = await llm({
            systemPrompt: `You are a concise personal-productivity assistant. Write a short (3-5 sentence) weekly summary of the user's captured thoughts for ${weekLabel}. Highlight recurring themes, progress, and anything that seems to be lingering. Plain prose, no markdown headers, no preamble.`,
            prompt: bullets,
            maxTokens: 420,
            temperature: 0.4,
        });
    } catch {
        return heuristicDailySummary(captures);
    }
    const text = res?.text?.trim();
    return text ? text : heuristicDailySummary(captures);
}

// ── (c) Generate to-do seeds ──────────────────────────────────────────

const ACTION_VERBS = [
    'call', 'email', 'send', 'finish', 'fix', 'review', 'schedule', 'book',
    'buy', 'pay', 'submit', 'write', 'follow up', 'follow-up', 'remind',
    'check', 'update', 'prepare', 'draft', 'ask', 'confirm', 'cancel',
];

function startsActionable(text: string): boolean {
    const t = text.trim().toLowerCase();
    return ACTION_VERBS.some(v => t.startsWith(v + ' ') || t.startsWith(v));
}

/**
 * Heuristic to-do seeds: every admin-bucket capture, plus any capture whose
 * text starts with an action verb. Priority: admin → medium; action-verb-only
 * → low. De-dup is the store's job (`syncTodosFromCaptures`).
 */
export function heuristicTodoSeeds(captures: InsightCapture[]): TodoSeed[] {
    const seeds: TodoSeed[] = [];
    for (const c of captures) {
        const isAdmin = c.filed_to === 'admin';
        const actionable = startsActionable(c.text);
        if (!isAdmin && !actionable) continue;
        seeds.push({
            text: c.text.trim(),
            sourceCaptureId: c.id,
            priority: isAdmin ? 'medium' : 'low',
        });
    }
    return seeds;
}

/**
 * Generate to-do seeds from captures. LLM-first (it can phrase a clean
 * imperative task and skip non-actionable musings); falls back to the
 * heuristic. Returns seeds for `syncTodosFromCaptures` (which de-dups + ids).
 */
export async function generateTodoSeeds(captures: InsightCapture[], llm: LlmFn): Promise<TodoSeed[]> {
    if (captures.length === 0) return [];
    let res: LlmResponse | null = null;
    try {
        const bullets = captures.map(c => `(${c.id}) [${c.filed_to}] ${c.text}`).join('\n');
        res = await llm({
            systemPrompt: `You extract actionable to-dos from captured thoughts. Return JSON only: an array of objects { "text": "imperative task phrasing", "sourceId": "the (id) it came from", "priority": "high"|"medium"|"low" }. Only include genuinely actionable items; skip musings, observations, and notes. If nothing is actionable, return [].`,
            prompt: bullets,
            responseFormat: 'json',
            maxTokens: 512,
            temperature: 0.3,
        });
    } catch {
        return heuristicTodoSeeds(captures);
    }
    if (!res) return heuristicTodoSeeds(captures);
    const parsed = parseJsonLoose(res.text);
    if (!Array.isArray(parsed)) return heuristicTodoSeeds(captures);
    const validIds = new Set(captures.map(c => c.id));
    const seeds: TodoSeed[] = [];
    for (const item of parsed) {
        if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;
        const priority: TodoSeed['priority'] =
            item.priority === 'high' || item.priority === 'low' ? item.priority : 'medium';
        const sourceCaptureId = typeof item.sourceId === 'string' && validIds.has(item.sourceId)
            ? item.sourceId : null;
        seeds.push({ text: item.text.trim(), sourceCaptureId, priority });
    }
    return seeds;
}

// ── (d) Surface non-obvious insights ──────────────────────────────────

export interface InsightSeed {
    text: string;
    kind: 'pattern' | 'connection' | 'suggestion';
}

/**
 * Surface NON-OBVIOUS insights — cross-capture patterns/connections the user
 * wouldn't spot at a glance. Genuinely LLM-dependent (no honest heuristic for
 * "non-obvious"), so it returns [] when no LLM is configured; the UI prompts
 * the user to add an LLM key. Needs at least 3 captures to have anything to
 * cross-reference.
 */
export async function surfaceInsights(captures: InsightCapture[], llm: LlmFn): Promise<InsightSeed[]> {
    if (captures.length < 3) return [];
    let res: LlmResponse | null = null;
    try {
        const bullets = captures.map(c => `- [${c.filed_to}] ${c.text}`).join('\n');
        res = await llm({
            systemPrompt: `You are an insight engine. Analyze the user's captured thoughts and surface 1-4 NON-OBVIOUS insights — patterns across time, connections between separate captures, or actionable suggestions the user likely wouldn't notice themselves. Avoid restating any single capture. Return JSON only: an array of { "text": "the insight, one sentence", "kind": "pattern"|"connection"|"suggestion" }. If you find nothing genuinely non-obvious, return [].`,
            prompt: bullets,
            responseFormat: 'json',
            maxTokens: 512,
            temperature: 0.6,
        });
    } catch {
        return [];
    }
    if (!res) return [];
    const parsed = parseJsonLoose(res.text);
    if (!Array.isArray(parsed)) return [];
    const out: InsightSeed[] = [];
    for (const item of parsed) {
        if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;
        const kind: InsightSeed['kind'] =
            item.kind === 'connection' || item.kind === 'suggestion' ? item.kind : 'pattern';
        out.push({ text: item.text.trim(), kind });
    }
    return out;
}
