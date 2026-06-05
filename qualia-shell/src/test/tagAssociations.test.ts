/**
 * Unit tests for the tag-association primitives in lib/tagStore.ts.
 * Tags are the cross-app association fabric: items can hold many tags, a tag
 * that names a project gathers everything linked to it, and `relatedByTags`
 * surfaces the associations between things that share tags.
 */
import { describe, it, expect } from 'vitest';
import { upsertItem, itemsForAnyTag, relatedByTags, type TaggedItem } from '../lib/tagStore';

const NOW = '2026-06-05T00:00:00.000Z';

function build(): TaggedItem[] {
    let items: TaggedItem[] = [];
    items = upsertItem(items, { source: 'task-board', sourceId: 'c1', title: 'Ship v2' }, ['acme', 'q3'], NOW);
    items = upsertItem(items, { source: 'notepad', sourceId: 'n1', title: 'Acme notes' }, ['acme'], NOW);
    items = upsertItem(items, { source: 'scribe', sourceId: 'd1', title: 'Q3 plan' }, ['q3', 'planning'], NOW);
    items = upsertItem(items, { source: 'wiki', sourceId: 'w1', title: 'Unrelated' }, ['misc'], NOW);
    return items;
}

describe('itemsForAnyTag', () => {
    it('gathers items carrying any of the given tags (case-insensitive)', () => {
        const items = build();
        const acme = itemsForAnyTag(items, ['ACME']);
        expect(acme.map(i => i.sourceId).sort()).toEqual(['c1', 'n1']);
    });
    it('supports multiple tags (union) — the multi-tag association point', () => {
        const items = build();
        const got = itemsForAnyTag(items, ['acme', 'planning']);
        expect(got.map(i => i.sourceId).sort()).toEqual(['c1', 'd1', 'n1']);
    });
    it('excludes a given item id', () => {
        const items = build();
        const got = itemsForAnyTag(items, ['acme'], 'task-board:c1');
        expect(got.map(i => i.sourceId)).toEqual(['n1']);
    });
    it('returns nothing for empty tag list', () => {
        expect(itemsForAnyTag(build(), [])).toEqual([]);
    });
});

describe('relatedByTags', () => {
    it('finds items that share ≥1 tag with the target, excluding itself', () => {
        const items = build();
        // c1 has tags acme+q3 → related: n1 (acme) and d1 (q3), not w1 (misc), not itself.
        const rel = relatedByTags(items, 'task-board', 'c1');
        expect(rel.map(i => i.sourceId).sort()).toEqual(['d1', 'n1']);
    });
    it('returns [] when the target item is not tagged / not present', () => {
        expect(relatedByTags(build(), 'task-board', 'missing')).toEqual([]);
    });
    it('returns [] when the item has tags no one else shares', () => {
        const items = build();
        expect(relatedByTags(items, 'wiki', 'w1')).toEqual([]);
    });
});
