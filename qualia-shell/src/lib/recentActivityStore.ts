/**
 * recentActivityStore — plan 055 phase 3: the ⌘K "Resume" trail.
 *
 * A per-user, One Save-synced list of the last widgets/docs touched, capped
 * at 20 entries `{ kind, id, label, at }`, deduped by (kind, id) with
 * newest-first move-to-front. Recorded from ONE central place per source:
 *   - widgets: the `dwellium:open-widget` bus (module-level listener below)
 *     + WindowContext.openWindow (covers sidebar/⌘K/programmatic opens)
 *   - scribe docs: scribeMemory.trackScribeSession's existing subscription
 * — never edits scattered across widgets.
 *
 * widgetMemory sister shape: dynamic-key `createLocalStorageStore` keyed off
 * `recentActivityUserIdHolder` + `withSync('recentActivity')`.
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { recentActivityUserIdHolder } from './perUserIdentity';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

export interface RecentActivityEntry {
    kind: 'widget' | 'scribe-doc';
    id: string;
    label: string;
    at: number;
}

const CAP = 20;

export { recentActivityUserIdHolder };

function resolveKey(): string {
    const uid = recentActivityUserIdHolder.current;
    return uid ? `recentActivity:${uid}` : 'recentActivity:_anonymous';
}

function isEntry(v: unknown): v is RecentActivityEntry {
    if (!v || typeof v !== 'object') return false;
    const e = v as Partial<RecentActivityEntry>;
    return (e.kind === 'widget' || e.kind === 'scribe-doc')
        && typeof e.id === 'string' && e.id.length > 0
        && typeof e.label === 'string'
        && typeof e.at === 'number';
}

function deserialize(raw: string | null): RecentActivityEntry[] {
    if (!raw) return [];
    try {
        const parsed: unknown = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isEntry).slice(0, CAP) : [];
    } catch {
        return [];
    }
}

export const recentActivityStore = withSync(
    createLocalStorageStore<RecentActivityEntry[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'recentActivity', holder: recentActivityUserIdHolder, resolveKey },
);

/** Record one touch: dedupe by (kind, id), move to front, cap at 20. */
export function recordActivity(kind: RecentActivityEntry['kind'], id: string, label: string): void {
    if (typeof window === 'undefined' || !id) return;
    const list = recentActivityStore.getSnapshot();
    const next = [
        { kind, id, label: label || id, at: Date.now() },
        ...list.filter((e) => !(e.kind === kind && e.id === id)),
    ].slice(0, CAP);
    recentActivityStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** The freshest `limit` distinct entries (already deduped by construction). */
export function readRecentActivity(limit = 5): RecentActivityEntry[] {
    return recentActivityStore.getSnapshot().slice(0, limit);
}

/* ── the ONE widget-side recorder: the cross-widget open-widget bus ──────── */

if (typeof window !== 'undefined') {
    window.addEventListener('dwellium:open-widget', (e) => {
        const d = (e as CustomEvent).detail as { widgetId?: string; label?: string } | undefined;
        if (!d?.widgetId) return;
        recordActivity('widget', d.widgetId, d.label ?? WIDGET_REGISTRY[d.widgetId]?.label ?? d.widgetId);
    });
}
