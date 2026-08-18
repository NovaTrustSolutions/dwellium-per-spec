/**
 * Interactive Docs — per-user store CRUD, analytics, import/export round-trip.
 * Factory-produced store → `.reset()` in beforeEach (v2.72.1 convention).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    idocsStore, idocsUserIdHolder, resolveIdocsKey,
    createDoc, updateDoc, replaceDoc, deleteDoc, duplicateDoc, setActive, setView,
    recordView, addCardSeconds, exportDoc, importDoc,
} from '../components/Scribe/idocs/idocsStore';

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
    });
});
