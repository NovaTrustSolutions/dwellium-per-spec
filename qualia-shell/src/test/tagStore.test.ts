import { describe, it, expect, beforeEach } from 'vitest';
import {
    normalizeTags, upsertItem, tagCounts, itemsForTag, type TaggedItem,
    tagStore, tagStoreUserIdHolder, setItemTags, getTagsForItem, allTags, getItemsForTag,
    removeTagFromItem, removeTaggedItem,
} from '../lib/tagStore';

const NOW = '2030-01-01T00:00:00.000Z';

describe('tagStore — pure helpers', () => {
    it('normalizeTags trims, drops empties, dedupes case-insensitively (first casing wins)', () => {
        expect(normalizeTags([' Urgent ', 'urgent', '', '  ', 'Legal'])).toEqual(['Urgent', 'Legal']);
    });

    it('upsertItem creates, updates, and drops on empty tags', () => {
        const meta = { source: 'task-board', sourceId: 'c1', title: 'Card 1' };
        let items: TaggedItem[] = [];
        items = upsertItem(items, meta, ['a', 'b'], NOW);
        expect(items).toHaveLength(1);
        expect(items[0].id).toBe('task-board:c1');
        expect(items[0].tags).toEqual(['a', 'b']);

        // update (same id) replaces tag set + title
        items = upsertItem(items, { ...meta, title: 'Renamed' }, ['c'], NOW);
        expect(items).toHaveLength(1);
        expect(items[0].title).toBe('Renamed');
        expect(items[0].tags).toEqual(['c']);

        // empty tags removes the item
        items = upsertItem(items, meta, [], NOW);
        expect(items).toHaveLength(0);
    });

    it('tagCounts aggregates across items, most-used first', () => {
        const items: TaggedItem[] = [
            { id: 'a:1', source: 'a', sourceId: '1', title: 'x', tags: ['urgent', 'legal'], createdAt: NOW, updatedAt: NOW },
            { id: 'b:2', source: 'b', sourceId: '2', title: 'y', tags: ['Urgent'], createdAt: NOW, updatedAt: NOW },
        ];
        const counts = tagCounts(items);
        expect(counts[0].count).toBe(2);            // 'urgent' appears twice (case-insensitive)
        expect(counts.map(c => c.tag.toLowerCase())).toContain('legal');
    });

    it('itemsForTag matches case-insensitively', () => {
        const items: TaggedItem[] = [
            { id: 'a:1', source: 'a', sourceId: '1', title: 'x', tags: ['Urgent'], createdAt: NOW, updatedAt: NOW },
        ];
        expect(itemsForTag(items, 'urgent')).toHaveLength(1);
        expect(itemsForTag(items, 'nope')).toHaveLength(0);
    });
});

describe('tagStore — per-user store', () => {
    beforeEach(() => {
        try { localStorage.clear(); } catch { /* ignore */ }
        tagStoreUserIdHolder.current = null;
        tagStore.reset();
    });

    it('setItemTags persists, getTagsForItem + allTags reflect it', () => {
        tagStoreUserIdHolder.current = 'user-andy';
        tagStore.reset();
        setItemTags({ source: 'task-board', sourceId: 'c1', title: 'Fix billing' }, ['finance', 'urgent']);
        expect(getTagsForItem('task-board', 'c1').sort()).toEqual(['finance', 'urgent']);
        expect(allTags().map(t => t.tag).sort()).toEqual(['finance', 'urgent']);
        expect(getItemsForTag('urgent')).toHaveLength(1);
    });

    it('tags are isolated per user', () => {
        tagStoreUserIdHolder.current = 'user-andy';
        tagStore.reset();
        setItemTags({ source: 'notepad', sourceId: 'n1', title: 'Andy note' }, ['private']);
        expect(getItemsForTag('private')).toHaveLength(1);

        tagStoreUserIdHolder.current = 'user-lisa';
        expect(getItemsForTag('private')).toHaveLength(0); // Lisa can't see Andy's tags

        tagStoreUserIdHolder.current = 'user-andy';
        expect(getItemsForTag('private')).toHaveLength(1);
    });

    it('removeTagFromItem and removeTaggedItem update the file', () => {
        tagStoreUserIdHolder.current = 'user-andy';
        tagStore.reset();
        setItemTags({ source: 'task-board', sourceId: 'c1', title: 'T' }, ['a', 'b']);
        removeTagFromItem('task-board', 'c1', 'a');
        expect(getTagsForItem('task-board', 'c1')).toEqual(['b']);
        removeTaggedItem('task-board', 'c1');
        expect(getTagsForItem('task-board', 'c1')).toEqual([]);
    });
});
