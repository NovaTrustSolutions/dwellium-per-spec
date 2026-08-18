/**
 * Interactive Docs — per-user store CRUD, analytics, import/export round-trip.
 * Factory-produced store → `.reset()` in beforeEach (v2.72.1 convention).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    idocsStore, idocsUserIdHolder, resolveIdocsKey,
    createDoc, updateDoc, replaceDoc, deleteDoc, duplicateDoc, setActive, setView,
    recordView, addCardSeconds, exportDoc, importDoc,
    updateCard, moveCard, nestCard, unnestCard, insertCards, relocateCards, findCard, findCardParent, flattenCards, cloneCard, removeCards,
    pushSnapshot, undo, redo, restoreSnapshot, listSnapshots,
} from '../components/Scribe/idocs/idocsStore';
import { createEmptyCard, type Card } from '../components/Scribe/idocs/idocTypes';

const card = (id: string, children?: Card[]): Card => createEmptyCard({ id, title: id, blocks: [{ id: `${id}-b`, type: 'text', md: id }], children });
const tree = () => [card('a', [card('a1'), card('a2', [card('a2x')])]), card('b'), card('c')];
const ids = (cards: Card[]) => flattenCards(cards).map((f) => f.card.id);
const docCards = () => idocsStore.getSnapshot().docs[0].cards;

beforeEach(() => {
    localStorage.clear();
    idocsStore.reset();
    idocsUserIdHolder.current = 'u1';
});

describe('idocsStore', () => {
    it('resolves a per-user key with anonymous fallback', () => {
        expect(resolveIdocsKey()).toBe('scribe-idocs:u1');
        idocsUserIdHolder.current = null;
        expect(resolveIdocsKey()).toBe('scribe-idocs:_anonymous');
    });

    it('createDoc → active + edit view, persisted to localStorage', () => {
        const d = createDoc({ title: 'Hello' });
        const s = idocsStore.getSnapshot();
        expect(s.docs[0].id).toBe(d.id);
        expect(s.activeId).toBe(d.id);
        expect(s.view).toBe('edit');
        expect(JSON.parse(localStorage.getItem('scribe-idocs:u1')!).docs[0].title).toBe('Hello');
    });

    it('updateDoc / replaceDoc patch and bump updatedAt', async () => {
        const d = createDoc({ title: 'A' });
        const before = idocsStore.getSnapshot().docs[0].updatedAt;
        await new Promise((r) => setTimeout(r, 5));
        updateDoc(d.id, { title: 'B', theme: 'neon' });
        const after = idocsStore.getSnapshot().docs[0];
        expect(after.title).toBe('B');
        expect(after.theme).toBe('neon');
        expect(after.updatedAt >= before).toBe(true);
        replaceDoc({ ...after, title: 'C' });
        expect(idocsStore.getSnapshot().docs[0].title).toBe('C');
        // replaceDoc adds unknown docs
        replaceDoc({ ...after, id: 'doc-new', title: 'New' });
        expect(idocsStore.getSnapshot().docs.some((x) => x.id === 'doc-new')).toBe(true);
    });

    it('deleteDoc clears active + returns to library; duplicateDoc copies with fresh id + zeroed analytics', () => {
        const d = createDoc({ title: 'Orig' });
        recordView(d.id);
        const copy = duplicateDoc(d.id)!;
        expect(copy.id).not.toBe(d.id);
        expect(copy.title).toBe('Orig (copy)');
        expect(copy.analytics.views).toBe(0);
        expect(idocsStore.getSnapshot().docs).toHaveLength(2);
        deleteDoc(d.id);
        const s = idocsStore.getSnapshot();
        expect(s.docs).toHaveLength(1);
        expect(s.activeId).toBeNull();
        expect(s.view).toBe('library');
        expect(duplicateDoc('nope')).toBeNull();
    });

    it('setActive / setView guard against presenting nothing', () => {
        setView('present');
        expect(idocsStore.getSnapshot().view).toBe('library');
        const d = createDoc();
        setView('present');
        expect(idocsStore.getSnapshot().view).toBe('present');
        setActive(null);
        expect(idocsStore.getSnapshot().view).toBe('library');
        setActive(d.id);
        expect(idocsStore.getSnapshot().activeId).toBe(d.id);
    });

    it('recordView + addCardSeconds accumulate analytics', () => {
        const d = createDoc();
        const cardId = d.cards[0].id;
        recordView(d.id); recordView(d.id);
        addCardSeconds(d.id, cardId, 3.25);
        addCardSeconds(d.id, cardId, 1.5);
        addCardSeconds(d.id, cardId, -4); // ignored
        const a = idocsStore.getSnapshot().docs[0].analytics;
        expect(a.views).toBe(2);
        expect(a.lastViewedAt).toBeTruthy();
        expect(a.cardSeconds[cardId]).toBeCloseTo(4.8, 1);
    });

    it('exportDoc / importDoc round-trip; id collision gets a fresh id', () => {
        const d = createDoc({ title: 'RT', theme: 'forest' });
        const json = exportDoc(d.id);
        expect(JSON.parse(json).title).toBe('RT');
        const imported = importDoc(json)!;
        expect(imported).not.toBeNull();
        expect(imported.id).not.toBe(d.id); // collision → new id
        expect(imported.title).toBe('RT');
        expect(imported.theme).toBe('forest');
        expect(idocsStore.getSnapshot().docs).toHaveLength(2);
        expect(idocsStore.getSnapshot().activeId).toBe(imported.id);
        expect(importDoc('not json')).toBeNull();
        expect(importDoc('{"nope":true}')).toBeNull();
        expect(exportDoc('missing')).toBe('');
    });

    it('deserializer drops malformed docs and invalid active/view', () => {
        localStorage.setItem('scribe-idocs:u1', JSON.stringify({ docs: [{ id: 'x' }, { id: 'ok', title: 'ok', cards: [] }], activeId: 'ghost', view: 'edit' }));
        idocsStore.reset();
        const s = idocsStore.getSnapshot();
        expect(s.docs.map((d) => d.id)).toEqual(['ok']);
        expect(s.activeId).toBeNull();
        expect(s.view).toBe('library');
        expect(s.history).toEqual({}); // pre-wave-1 payload (no history) loads fine
    });
});

describe('idocsStore · wave 1 card tree', () => {
    it('pure helpers: findCard/findCardParent/flattenCards/removeCards/cloneCard', () => {
        const t = tree();
        expect(ids(t)).toEqual(['a', 'a1', 'a2', 'a2x', 'b', 'c']);
        expect(findCard(t, 'a2x')?.title).toBe('a2x');
        expect(findCard(t, 'zz')).toBeUndefined();
        const loc = findCardParent(t, 'a2x')!;
        expect(loc.parent?.id).toBe('a2');
        expect(loc.index).toBe(0);
        expect(findCardParent(t, 'b')!.parent).toBeNull();
        expect(flattenCards(t).find((f) => f.card.id === 'a2x')?.depth).toBe(2);
        const { cards, removed } = removeCards(t, new Set(['a1', 'a2x', 'c']));
        expect(ids(cards)).toEqual(['a', 'a2', 'b']);
        expect(removed.map((c) => c.id)).toEqual(['a1', 'a2x', 'c']);
        expect(findCard(cards, 'a2')?.children).toBeUndefined(); // emptied children dropped
        const clone = cloneCard(t[0]);
        expect(clone.id).not.toBe('a');
        expect(clone.blocks[0].id).not.toBe('a-b');
        expect(clone.children![1].children![0].id).not.toBe('a2x');
        expect(clone.children![1].children![0].title).toBe('a2x');
    });

    it('updateCard patches nested cards deeply', () => {
        const d = createDoc({ cards: tree() });
        updateCard(d.id, 'a2x', { title: 'Deep', notes: 'n' });
        expect(findCard(docCards(), 'a2x')).toMatchObject({ title: 'Deep', notes: 'n' });
        updateCard(d.id, 'ghost', { title: 'x' }); // no-op
        expect(ids(docCards())).toEqual(['a', 'a1', 'a2', 'a2x', 'b', 'c']);
    });

    it('moveCard reorders within the top level or within a parent; bad indices are no-ops', () => {
        const d = createDoc({ cards: tree() });
        moveCard(d.id, 0, 2);
        expect(docCards().map((c) => c.id)).toEqual(['b', 'c', 'a']);
        moveCard(d.id, 1, 0, 'a');
        expect(findCard(docCards(), 'a')!.children!.map((c) => c.id)).toEqual(['a2', 'a1']);
        moveCard(d.id, 0, 9);
        moveCard(d.id, 1, 1);
        expect(docCards().map((c) => c.id)).toEqual(['b', 'c', 'a']);
    });

    it('nestCard / unnestCard / relocateCards move subtrees and refuse cycles', () => {
        const d = createDoc({ cards: tree() });
        nestCard(d.id, 'c', 'b');
        expect(findCard(docCards(), 'b')!.children!.map((c) => c.id)).toEqual(['c']);
        expect(docCards().map((c) => c.id)).toEqual(['a', 'b']);
        nestCard(d.id, 'a', 'a2x'); // into own descendant → refused
        nestCard(d.id, 'a', 'a');   // into itself → refused
        expect(ids(docCards())).toEqual(['a', 'a1', 'a2', 'a2x', 'b', 'c']);
        unnestCard(d.id, 'a2x'); // lifts to right after its parent a2
        expect(findCard(docCards(), 'a')!.children!.map((c) => c.id)).toEqual(['a1', 'a2', 'a2x']);
        unnestCard(d.id, 'a'); // top level → no-op
        expect(docCards().map((c) => c.id)).toEqual(['a', 'b']);
        relocateCards(d.id, ['a1', 'c'], null, 0); // group move to top, order preserved
        expect(docCards().map((c) => c.id)).toEqual(['a1', 'c', 'a', 'b']);
        relocateCards(d.id, ['a'], 'a2', 0); // into own descendant → refused
        expect(docCards().map((c) => c.id)).toEqual(['a1', 'c', 'a', 'b']);
    });

    it('insertCards inserts at a top-level index (clamped)', () => {
        const d = createDoc({ cards: tree() });
        insertCards(d.id, [card('n1'), card('n2')], 1);
        expect(docCards().map((c) => c.id)).toEqual(['a', 'n1', 'n2', 'b', 'c']);
        insertCards(d.id, [card('n3')], 99);
        expect(docCards()[docCards().length - 1].id).toBe('n3');
        insertCards(d.id, [], 0);
        expect(docCards()).toHaveLength(6);
    });
});

describe('idocsStore · wave 1 history', () => {
    it('pushSnapshot dedupes; undo/redo/restore walk the ring; history persists and survives reload', () => {
        const d = createDoc({ title: 'v1' });
        pushSnapshot(d.id, 1);
        pushSnapshot(d.id, 2); // identical → skipped
        expect(listSnapshots(d.id).snapshots).toHaveLength(1);
        updateDoc(d.id, { title: 'v2' });
        pushSnapshot(d.id, 3);
        updateDoc(d.id, { title: 'v3' }); // pending (not snapshotted)
        expect(undo(d.id, 4)).toBe(true); // flushes v3, steps back to v2
        expect(idocsStore.getSnapshot().docs[0].title).toBe('v2');
        expect(listSnapshots(d.id).snapshots.map((s) => s.doc.title)).toEqual(['v1', 'v2', 'v3']);
        expect(undo(d.id, 5)).toBe(true);
        expect(idocsStore.getSnapshot().docs[0].title).toBe('v1');
        expect(undo(d.id, 6)).toBe(false);
        expect(redo(d.id)).toBe(true);
        expect(idocsStore.getSnapshot().docs[0].title).toBe('v2');
        expect(restoreSnapshot(d.id, 2)).toBe(true);
        expect(idocsStore.getSnapshot().docs[0].title).toBe('v3');
        expect(restoreSnapshot(d.id, 7)).toBe(false);
        expect(redo(d.id)).toBe(false);
        // persisted + reload
        idocsStore.reset();
        expect(listSnapshots(d.id).snapshots).toHaveLength(3);
        expect(listSnapshots(d.id).cursor).toBe(2);
        expect(listSnapshots('nope')).toEqual({ snapshots: [], cursor: -1 });
        expect(undo('nope')).toBe(false);
        expect(redo('nope')).toBe(false);
    });

    it('caps at 30 snapshots per doc; deleteDoc drops its history', () => {
        const d = createDoc({ title: 't0' });
        for (let i = 1; i <= 40; i++) { updateDoc(d.id, { title: `t${i}` }); pushSnapshot(d.id, i); }
        const h = listSnapshots(d.id);
        expect(h.snapshots).toHaveLength(30);
        expect(h.snapshots[0].doc.title).toBe('t11');
        expect(h.cursor).toBe(29);
        deleteDoc(d.id);
        expect(idocsStore.getSnapshot().history[d.id]).toBeUndefined();
    });
});
