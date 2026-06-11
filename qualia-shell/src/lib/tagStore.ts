/**
 * tagStore — the app-wide "Tag file".
 *
 * One central, per-user registry of everything tagged anywhere in the app. Any
 * widget tags one of its items via setItemTags({source, sourceId, title, url?},
 * tags) and it shows up here — so the Tag File viewer can surface everything
 * tagged across the whole app in one place.
 *
 * Per-user via the established createLocalStorageStore dynamic-key factory
 * (sister to taskBoardStore / speakerLibraryStore). Pure helpers are exported
 * for unit testing; the store wraps them with persistence.
 *
 * Storage key:  tags:<userId>   (anon → tags:_anonymous)
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';

export interface TaggedItem {
    id: string;          // `${source}:${sourceId}` — stable identity of the tagged thing
    source: string;      // widget id, e.g. 'task-board', 'notepad'
    sourceId: string;    // the item's id within that widget
    title: string;       // human label
    url?: string;        // optional open/deep-link hint
    tags: string[];      // normalized, deduped
    createdAt: string;
    updatedAt: string;
}

export interface ItemMeta { source: string; sourceId: string; title: string; url?: string; }
export interface TagCount { tag: string; count: number; }

// ── Pure helpers (no storage) ──────────────────────────────────────
export function itemKey(source: string, sourceId: string): string {
    return `${source}:${sourceId}`;
}

/** Trim, drop empties, dedupe case-insensitively (keeping first-seen casing). */
export function normalizeTags(tags: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tags) {
        const v = (t ?? '').trim();
        if (!v) continue;
        const k = v.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(v);
    }
    return out;
}

/**
 * Upsert an item's tag set. Empty tags → the item is REMOVED from the Tag file
 * (we never keep tag-less entries). Pure: `now` is injected.
 */
export function upsertItem(items: TaggedItem[], meta: ItemMeta, tags: string[], now: string): TaggedItem[] {
    const id = itemKey(meta.source, meta.sourceId);
    const norm = normalizeTags(tags);
    if (norm.length === 0) return items.filter(i => i.id !== id);
    const existing = items.find(i => i.id === id);
    if (existing) {
        return items.map(i => i.id === id
            ? { ...i, source: meta.source, sourceId: meta.sourceId, title: meta.title, url: meta.url, tags: norm, updatedAt: now }
            : i);
    }
    return [...items, { id, source: meta.source, sourceId: meta.sourceId, title: meta.title, url: meta.url, tags: norm, createdAt: now, updatedAt: now }];
}

/** Distinct tags with counts, most-used first (then alphabetical). */
export function tagCounts(items: TaggedItem[]): TagCount[] {
    const counts = new Map<string, { tag: string; count: number }>();
    for (const item of items) {
        for (const t of item.tags) {
            const k = t.toLowerCase();
            const cur = counts.get(k);
            if (cur) cur.count++;
            else counts.set(k, { tag: t, count: 1 });
        }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Items carrying a given tag (case-insensitive). */
export function itemsForTag(items: TaggedItem[], tag: string): TaggedItem[] {
    const k = tag.toLowerCase();
    return items.filter(i => i.tags.some(t => t.toLowerCase() === k));
}

export function tagsForItem(items: TaggedItem[], source: string, sourceId: string): string[] {
    const id = itemKey(source, sourceId);
    return items.find(i => i.id === id)?.tags ?? [];
}

/**
 * Items carrying ANY of the given tags (case-insensitive), optionally excluding
 * one item id. This is the association primitive: a tag that names a project
 * gathers everything linked to it, and because items can hold many tags the
 * same thing can belong to several projects/associations at once.
 */
export function itemsForAnyTag(items: TaggedItem[], tags: string[], excludeId?: string): TaggedItem[] {
    const set = new Set(tags.map(t => (t ?? '').toLowerCase()).filter(Boolean));
    if (set.size === 0) return [];
    return items.filter(i => i.id !== excludeId && i.tags.some(t => set.has(t.toLowerCase())));
}

/** Things that share ≥1 tag with the given item (its associations), excluding itself. */
export function relatedByTags(items: TaggedItem[], source: string, sourceId: string): TaggedItem[] {
    const id = itemKey(source, sourceId);
    const self = items.find(i => i.id === id);
    if (!self) return [];
    return itemsForAnyTag(items, self.tags, id);
}

// ── Per-user store ─────────────────────────────────────────────────
export const tagStoreUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = tagStoreUserIdHolder.current;
    return uid ? `tags:${uid}` : 'tags:_anonymous';
}

function isItem(i: any): i is TaggedItem {
    return i && typeof i.id === 'string' && typeof i.source === 'string' && typeof i.sourceId === 'string' && Array.isArray(i.tags);
}

function deserialize(raw: string | null): TaggedItem[] {
    if (!raw) return [];
    try {
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p.filter(isItem) : [];
    } catch {
        return [];
    }
}

export const tagStore = withSync(
    createLocalStorageStore<TaggedItem[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: [],
    }),
    { objectType: 'tags', holder: tagStoreUserIdHolder, resolveKey },
);

function nowIso(): string { return new Date().toISOString(); }

function persist(next: TaggedItem[]): void {
    tagStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

// ── Public mutators + selectors ────────────────────────────────────
export function getTaggedItems(): TaggedItem[] {
    return tagStore.getSnapshot();
}

/** Set the full tag set for an item (the primary write path used by TagInput). */
export function setItemTags(meta: ItemMeta, tags: string[]): void {
    persist(upsertItem(tagStore.getSnapshot(), meta, tags, nowIso()));
}

export function addTagToItem(meta: ItemMeta, tag: string): void {
    const current = tagsForItem(tagStore.getSnapshot(), meta.source, meta.sourceId);
    setItemTags(meta, [...current, tag]);
}

export function removeTagFromItem(source: string, sourceId: string, tag: string): void {
    const items = tagStore.getSnapshot();
    const current = tagsForItem(items, source, sourceId);
    const meta = items.find(i => i.id === itemKey(source, sourceId));
    if (!meta) return;
    setItemTags({ source, sourceId, title: meta.title, url: meta.url }, current.filter(t => t.toLowerCase() !== tag.toLowerCase()));
}

/** Remove an item entirely (e.g. its source was deleted). */
export function removeTaggedItem(source: string, sourceId: string): void {
    persist(tagStore.getSnapshot().filter(i => i.id !== itemKey(source, sourceId)));
}

export function allTags(): TagCount[] { return tagCounts(tagStore.getSnapshot()); }
export function getItemsForTag(tag: string): TaggedItem[] { return itemsForTag(tagStore.getSnapshot(), tag); }
export function getItemsForAnyTag(tags: string[], excludeId?: string): TaggedItem[] { return itemsForAnyTag(tagStore.getSnapshot(), tags, excludeId); }
export function getRelatedByTags(source: string, sourceId: string): TaggedItem[] { return relatedByTags(tagStore.getSnapshot(), source, sourceId); }
export function getTagsForItem(source: string, sourceId: string): string[] {
    return tagsForItem(tagStore.getSnapshot(), source, sourceId);
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetTags(): void {
    tagStore.set([], () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
