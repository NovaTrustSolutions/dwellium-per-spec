/**
 * idocsMerge — Wave 3A: append the cards of `sources` onto `target` (pure).
 * Keeps target's theme/chrome/title; any incoming card whose subtree reuses an
 * id already present gets fresh ids (cloneCard). Card-link buttons inside
 * re-id'd cards keep pointing at the old id — ponytail: acceptable for v1.
 */
import { cloneCard } from './idocsStore';
import type { Card, IDoc } from './idocTypes';

function collectIds(cards: Card[], into: Set<string>): Set<string> {
    for (const c of cards) {
        into.add(c.id);
        c.blocks.forEach((b) => into.add(b.id));
        c.footnotes?.forEach((f) => into.add(f.id));
        if (c.children) collectIds(c.children, into);
    }
    return into;
}

export function mergeDocs(target: IDoc, sources: IDoc[]): IDoc {
    const seen = collectIds(target.cards, new Set<string>());
    const cards = [...target.cards];
    for (const src of sources) {
        for (const c of src.cards) {
            const ids = collectIds([c], new Set<string>());
            const next = [...ids].some((id) => seen.has(id)) ? cloneCard(c) : structuredClone(c);
            collectIds([next], seen);
            cards.push(next);
        }
    }
    return { ...target, cards, updatedAt: new Date().toISOString() };
}
