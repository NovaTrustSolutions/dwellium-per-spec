/**
 * araDailyGlance — plan 046 A2 "Today at a glance": on first ARA open of the
 * day, post ONE assistant message assembled from REAL data (leases, work
 * orders, inbox, task board, goals, morning brief). Silent when nothing is
 * worth saying. Once-per-day throttle is per user (One Save 'ara-glance',
 * morningBriefStore sister shape) and is written AFTER a successful post so a
 * fetch failure simply retries on the next open.
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { araGlanceUserIdHolder } from './perUserIdentity';
import { dayKey } from './dailySynthesis';
import { strataGet } from '../components/StrataDashboard/strataApi';
import { repairBoard } from '../components/TaskBoard/taskBoardModel';
// Side-effect import: registers the board store with One Save at ARA load, so the Global
// board is pulled from the server on login even if the Task Board is never opened here.
import '../components/TaskBoard/taskBoardStore';
import { goalsStore } from './goalsStore';
import { todaysBrief } from './morningBriefStore';

export { araGlanceUserIdHolder };

interface GlanceState { lastShownDay: string | null }
const EMPTY: GlanceState = { lastShownDay: null };

function resolveKey(): string {
    const uid = araGlanceUserIdHolder.current;
    return uid ? `araglance:${uid}` : 'araglance:_anonymous';
}

function deserialize(raw: string | null): GlanceState {
    if (!raw) return EMPTY;
    try {
        const parsed = JSON.parse(raw) as Partial<GlanceState> | null;
        return { lastShownDay: typeof parsed?.lastShownDay === 'string' ? parsed.lastShownDay : null };
    } catch {
        return EMPTY;
    }
}

export const araGlanceStore = withSync(
    createLocalStorageStore<GlanceState>({ key: resolveKey, deserializer: deserialize, defaultValue: EMPTY }),
    { objectType: 'ara-glance', holder: araGlanceUserIdHolder, resolveKey },
);

function persist(next: GlanceState): void {
    araGlanceStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetAraGlance(): void {
    persist(EMPTY);
    try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
}

const plural = (n: number, s: string) => `${n} ${s}${n === 1 ? '' : 's'}`;

/** Each source in its own try/catch — one failing feed never hides the others. */
async function tryLine(fn: () => Promise<string | null> | string | null): Promise<string | null> {
    try { return await fn(); } catch { return null; }
}

/** Open (not in 'done') and high-urgency cards across EVERY local board of this user: Global + each project. */
function localBoardCounts(uid: string | null): { open: number; high: number } {
    const base = `taskboard:${uid ?? '_anonymous'}`;
    const counts = { open: 0, high: 0 };
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || (key !== base && !key.startsWith(`${base}:`))) continue;
        let raw: unknown = null;
        try { raw = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* unreadable board → repairBoard(null) is empty */ }
        for (const c of repairBoard(raw).cards) {
            if (c.columnId === 'done') continue;
            counts.open++;
            if (c.urgency === 'high') counts.high++;
        }
    }
    return counts;
}

/**
 * Pure assembler over real data. Returns the markdown glance (first 3 non-empty
 * lines, source order = priority) or null when there is nothing to say.
 */
export async function assembleGlance(userId: string | null = araGlanceUserIdHolder.current): Promise<string | null> {
    const lines = (await Promise.all([
        tryLine(async () => {
            const { alerts } = await strataGet<{ alerts: Array<{ message: string }> }>('/leasing/alerts');
            if (!alerts?.length) return null;
            return `${plural(alerts.length, 'lease')} need attention — ${alerts.slice(0, 2).map(a => a.message).join('; ')}`;
        }),
        tryLine(async () => {
            const items = await strataGet<Array<{ status?: string; priority?: string }>>('/workitems', { type: 'work_order' });
            const hot = (items ?? []).filter(w => (w.status === 'open' || w.status === 'pending') && (w.priority === 'high' || w.priority === 'critical'));
            return hot.length ? `${plural(hot.length, 'high-priority work order')} open` : null;
        }),
        tryLine(async () => {
            const res = await fetch('/api/inbox/stats');
            const json = await res.json();
            const pending = Number(json?.data?.pending ?? 0);
            return pending > 0 ? `${plural(pending, 'inbox item')} waiting for approval` : null;
        }),
        tryLine(() => {
            const { open, high } = localBoardCounts(userId);
            return open ? `${plural(open, 'task')} not done — ${high} high urgency` : null;
        }),
        tryLine(() => {
            const goals = goalsStore.getSnapshot().filter(g => g.status !== 'done');
            return goals.length ? `${plural(goals.length, 'active goal')}: ${goals[0].title}` : null;
        }),
        tryLine(() => todaysBrief()?.suggestions?.[0] ?? null),
    ])).filter((l): l is string => !!l).slice(0, 3);
    if (!lines.length) return null;
    const k = lines.length;
    return `**Today at a glance — ${k} thing${k === 1 ? '' : 's'} worth doing**\n`
        + lines.map((l, i) => `${i + 1}. ${l}`).join('\n')
        + `\n\nAsk me about any of these, or pick a prompt below.`;
}

/**
 * Post the glance once per calendar day. Returns true when it posted.
 * `assemble` is injectable for component-level tests.
 */
export async function runDailyGlance(
    userId: string | null,
    post: (content: string) => void,
    assemble: (userId: string | null) => Promise<string | null> = assembleGlance,
): Promise<boolean> {
    // The task-board line reads this user's local boards by id; the glance no longer
    // writes the task board's user-id holder (only TaskBoard.tsx does).
    const today = dayKey();
    if (araGlanceStore.getSnapshot().lastShownDay === today) return false;
    const text = await assemble(userId).catch(() => null);
    if (!text) return false;
    post(text);
    persist({ lastShownDay: today });
    return true;
}
