/**
 * Interactive Docs — Wave 3A mergeDocs (pure).
 */
import { describe, it, expect } from 'vitest';
import { mergeDocs } from '../components/Scribe/idocs/idocsMerge';
import { flattenCards } from '../components/Scribe/idocs/idocsStore';
import { createEmptyCard, createEmptyDoc, type Card } from '../components/Scribe/idocs/idocTypes';

const card = (id: string, children?: Card[]): Card => createEmptyCard({ id, title: id, blocks: [{ id: `${id}-b`, type: 'text', md: id }], children });

describe('mergeDocs', () => {
    it('appends source cards in order, keeps target theme/title, re-ids collisions only', () => {
        const target = createEmptyDoc({ title: 'T', theme: 'forest', cards: [card('a'), card('b', [card('b1')])] });
        const s1 = createEmptyDoc({ title: 'S1', theme: 'neon', cards: [card('c'), card('a')] }); // 'a' collides
        const s2 = createEmptyDoc({ title: 'S2', cards: [card('d', [card('b1')])] }); // nested 'b1' collides
        const merged = mergeDocs(target, [s1, s2]);
        expect(merged.title).toBe('T');
        expect(merged.theme).toBe('forest');
        expect(merged.id).toBe(target.id);
        expect(merged.cards.map((c) => c.title)).toEqual(['a', 'b', 'c', 'a', 'd']);
        const ids = flattenCards(merged.cards).map((f) => f.card.id);
        expect(new Set(ids).size).toBe(ids.length); // all unique
        expect(merged.cards[2].id).toBe('c'); // no collision → id kept
        expect(merged.cards[3].id).not.toBe('a');
        expect(merged.cards[4].id).not.toBe('d'); // subtree collision → whole card re-id'd
        expect(merged.cards[4].children?.[0].id).not.toBe('b1');
        expect(merged.cards[4].children?.[0].title).toBe('b1');
        // block ids unique too
        const bids = flattenCards(merged.cards).flatMap((f) => f.card.blocks.map((b) => b.id));
        expect(new Set(bids).size).toBe(bids.length);
    });
    it('does not mutate inputs and handles empty sources', () => {
        const target = createEmptyDoc({ cards: [card('a')] });
        const before = JSON.stringify(target);
        const merged = mergeDocs(target, []);
        expect(merged.cards).toHaveLength(1);
        expect(JSON.stringify(target)).toBe(before);
        const src = createEmptyDoc({ cards: [card('a')] });
        mergeDocs(target, [src]);
        expect(src.cards[0].id).toBe('a');
    });
});
