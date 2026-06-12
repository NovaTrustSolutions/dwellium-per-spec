/**
 * morningBriefStore — P12-6 morning brief (gap item 4, 2026-06-12).
 *
 * "A short morning brief every day with a couple of suggestions" — one brief
 * per calendar day, composed by the background runner's nightly cycle from
 * the deep dream + hard data lines (usage, goals, artifacts). Works WITHOUT
 * an LLM key (data lines only; insights/suggestions need the key).
 *
 * Per-user One Save ('morning-brief'), tabGroupStore sister shape incl.
 * `.reset()`. Delivery: MorningBriefBanner (first open of the day) → ARA
 * posts the brief as an assistant message via the pending-slot + event bus
 * (spawn.ts sister shape — survives the open-ARA mount race).
 */
import { useContext, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { UserContext } from '../context/UserContext';
import { integrationsUserIdHolder } from '../utils/integrationsStore';
import { dayKey } from './dailySynthesis';

export interface MorningBrief {
    /** Calendar day this brief is FOR (YYYY-MM-DD). */
    date: string;
    insights: Array<{ title: string; text: string }>;
    suggestions: string[];
    /** Hard-data lines (always present, no LLM needed). */
    dataLines: string[];
    createdAt: string;
    seen: boolean;
}

export const morningBriefUserIdHolder = integrationsUserIdHolder; // shared identity

function resolveKey(): string {
    const uid = morningBriefUserIdHolder.current;
    return uid ? `morningbrief:${uid}` : 'morningbrief:_anonymous';
}

function isBrief(b: unknown): b is MorningBrief {
    return !!b && typeof (b as MorningBrief).date === 'string' && Array.isArray((b as MorningBrief).dataLines);
}

function deserialize(raw: string | null): MorningBrief[] {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isBrief).slice(0, 30) : [];
    } catch {
        return [];
    }
}

export const morningBriefStore = withSync(
    createLocalStorageStore<MorningBrief[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'morning-brief', holder: morningBriefUserIdHolder, resolveKey },
);

function persist(next: MorningBrief[]): void {
    morningBriefStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Create/replace the brief for its date (newest first, 30-day retention). */
export function upsertBrief(brief: Omit<MorningBrief, 'createdAt' | 'seen'>): MorningBrief {
    const full: MorningBrief = { ...brief, createdAt: new Date().toISOString(), seen: false };
    const rest = morningBriefStore.getSnapshot().filter(b => b.date !== brief.date);
    persist([full, ...rest].slice(0, 30));
    return full;
}

export function todaysBrief(): MorningBrief | null {
    return morningBriefStore.getSnapshot().find(b => b.date === dayKey()) ?? null;
}

export function markBriefSeen(date: string): void {
    persist(morningBriefStore.getSnapshot().map(b => (b.date === date ? { ...b, seen: true } : b)));
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetMorningBriefs(): void {
    morningBriefStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/** Render the brief as the markdown ARA posts. */
export function formatBrief(b: MorningBrief): string {
    const lines: string[] = [`**🌅 Morning brief — ${b.date}**`];
    if (b.insights.length > 0) {
        lines.push('', ...b.insights.map(i => `**${i.title}** — ${i.text}`));
    }
    if (b.suggestions.length > 0) {
        lines.push('', '**Suggestions:**', ...b.suggestions.map(s => `- ${s}`));
    }
    if (b.dataLines.length > 0) {
        lines.push('', ...b.dataLines.map(l => `- ${l}`));
    }
    return lines.join('\n');
}

/* ─── Delivery bus (spawn.ts pending-slot sister shape) ─── */

export const MORNING_BRIEF_EVENT = 'dwellium:morning-brief';

let pendingBriefDate: string | null = null;

/** Banner → ARA hand-off: stash the date, fire the event; ARA consumes. */
export function requestBriefInAra(date: string): void {
    pendingBriefDate = date;
    try { window.dispatchEvent(new CustomEvent(MORNING_BRIEF_EVENT)); } catch { /* SSR */ }
}

/** ARA-side consumption (mount-race safe: also called on mount). */
export function consumePendingBrief(): MorningBrief | null {
    if (!pendingBriefDate) return null;
    const date = pendingBriefDate;
    pendingBriefDate = null;
    return morningBriefStore.getSnapshot().find(b => b.date === date) ?? null;
}

/** Hook for the banner. */
export function useMorningBrief() {
    const userCtx = useContext(UserContext);
    morningBriefUserIdHolder.current = userCtx?.user?.id ?? morningBriefUserIdHolder.current ?? null;
    const briefs = useSyncExternalStore(
        morningBriefStore.subscribe,
        morningBriefStore.getSnapshot,
        morningBriefStore.getServerSnapshot,
    );
    return { briefs, today: briefs.find(b => b.date === dayKey()) ?? null };
}
