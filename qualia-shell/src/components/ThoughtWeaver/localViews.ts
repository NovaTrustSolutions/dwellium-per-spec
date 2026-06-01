/**
 * localViews — derive ThoughtWeaver's glanceable views (stats, buckets,
 * timeline) directly from the LOCAL trusted store (localStorage captures).
 *
 * Why: the header counts, the Dashboard tab, and the Timeline tab historically
 * read backend-only endpoints (`/stats`, `/people|projects|ideas|admin`,
 * `/timeline`). With no backend (a deployed build, or the backend simply not
 * running) those views were blank — even though the user's captures were safely
 * stored locally. That made the "trusted place I can glance at" feel empty/lost.
 *
 * These pure functions turn the local captures into the exact shapes the UI
 * already renders, so the glanceable views always reflect what's on the device.
 * Backend data (when present) is merged on top by the component.
 *
 * Pure + deterministic → unit-testable with no React/localStorage/backend.
 */
import type { LocalCapture } from './thoughtWeaverStore';

export type GlanceBucketId = 'people' | 'projects' | 'ideas' | 'admin';

export interface GlanceStats {
    totalCaptures: number;
    pendingReviews: number;
    activePeople: number;
    activeProjects: number;
    totalIdeas: number;
    tasksDue: number;
}

/** Shape-compatible with ThoughtWeaver's BucketItem (required fields present). */
export interface GlanceItem {
    id: string;
    name: string;
    notes: string;
    createdAt: string;
    type: GlanceBucketId | 'needs_review';
    tags: string[];
    confidence: number;
    /** Marks rows that came from the local store (user-owned, user-only-delete). */
    source: 'local';
}

function shortLabel(text: string): string {
    const t = (text || '').replace(/\s+/g, ' ').trim();
    if (!t) return 'Untitled';
    return t.length > 48 ? t.slice(0, 45) + '…' : t;
}

function toItem(c: LocalCapture): GlanceItem {
    return {
        id: c.id,
        name: c.destination_name || shortLabel(c.text),
        notes: c.text,
        createdAt: c.createdAt,
        type: (c.filed_to as GlanceItem['type']) ?? 'needs_review',
        tags: [],
        confidence: typeof c.confidence === 'number' ? c.confidence : 0,
        source: 'local',
    };
}

/** Count captures per bucket for the glanceable stat cards. */
export function deriveStats(captures: LocalCapture[]): GlanceStats {
    const count = (b: string) => captures.filter(c => c.filed_to === b).length;
    return {
        totalCaptures: captures.length,
        pendingReviews: count('needs_review'),
        activePeople: count('people'),
        activeProjects: count('projects'),
        totalIdeas: count('ideas'),
        tasksDue: count('admin'),
    };
}

/** Group captures into the four dashboard buckets (most-recent first). */
export function deriveBuckets(captures: LocalCapture[]): Record<GlanceBucketId, GlanceItem[]> {
    const out: Record<GlanceBucketId, GlanceItem[]> = { people: [], projects: [], ideas: [], admin: [] };
    const sorted = [...captures].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    for (const c of sorted) {
        if (c.filed_to === 'people' || c.filed_to === 'projects' || c.filed_to === 'ideas' || c.filed_to === 'admin') {
            out[c.filed_to].push(toItem(c));
        }
    }
    return out;
}

/** All captures as timeline rows, most-recent first (includes needs_review). */
export function deriveTimeline(captures: LocalCapture[]): GlanceItem[] {
    return [...captures]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .map(toItem);
}
