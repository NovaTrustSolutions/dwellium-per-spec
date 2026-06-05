/**
 * Foundry intake store + heuristic triage (spec §7.4).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    foundryStore, foundryUserIdHolder, captureItem, applyTriage, admitItem, rejectItem,
    updateItem, clearFoundry, heuristicTriage,
} from '../components/Foundry/foundryStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    foundryStore.reset();
    foundryUserIdHolder.current = null;
});

describe('foundry pipeline', () => {
    it('captures an item as status "captured"', () => {
        const it = captureItem({ sourceType: 'paste', rawContent: 'Some notes about HOA compliance.' }, NOW)!;
        expect(it.status).toBe('captured');
        expect(foundryStore.getSnapshot()).toHaveLength(1);
    });

    it('ignores empty captures', () => {
        expect(captureItem({ sourceType: 'paste', rawContent: '   ' }, NOW)).toBeNull();
    });

    it('applyTriage advances to "triaged" with proposed metadata', () => {
        const it = captureItem({ sourceType: 'paste', rawContent: 'content' }, NOW)!;
        applyTriage(it.id, { tags: ['compliance', 'hoa'], target: 'Acme/Compliance', qualityScore: 72, assessment: 'Good.' }, 'llm');
        const updated = foundryStore.getSnapshot().find((x) => x.id === it.id)!;
        expect(updated.status).toBe('triaged');
        expect(updated.tags).toEqual(['compliance', 'hoa']);
        expect(updated.triagedBy).toBe('llm');
    });

    it('admit + reject set terminal statuses', () => {
        const a = captureItem({ sourceType: 'paste', rawContent: 'a' }, NOW)!;
        const b = captureItem({ sourceType: 'paste', rawContent: 'b' }, NOW)!;
        admitItem(a.id); rejectItem(b.id);
        const snap = foundryStore.getSnapshot();
        expect(snap.find((x) => x.id === a.id)!.status).toBe('admitted');
        expect(snap.find((x) => x.id === b.id)!.status).toBe('rejected');
    });

    it('updateItem edits tags/target', () => {
        const it = captureItem({ sourceType: 'paste', rawContent: 'a' }, NOW)!;
        updateItem(it.id, { tags: ['x'], target: 'T' });
        const u = foundryStore.getSnapshot().find((x) => x.id === it.id)!;
        expect(u.tags).toEqual(['x']);
        expect(u.target).toBe('T');
    });

    it('persists per-user and isolates', () => {
        foundryUserIdHolder.current = 'andy';
        captureItem({ sourceType: 'paste', rawContent: 'andy item' }, NOW);
        expect(localStorage.getItem('dwellium:foundry:andy')).toBeTruthy();
        foundryUserIdHolder.current = 'lisa';
        foundryStore.reset();
        expect(foundryStore.getSnapshot()).toEqual([]);
        foundryUserIdHolder.current = 'andy';
        foundryStore.reset();
        expect(foundryStore.getSnapshot()[0].rawContent).toBe('andy item');
    });

    it('clearFoundry wipes', () => {
        captureItem({ sourceType: 'paste', rawContent: 'a' }, NOW);
        clearFoundry();
        expect(foundryStore.getSnapshot()).toEqual([]);
    });
});

describe('heuristicTriage', () => {
    it('extracts frequent meaningful words as tags and scores by length', () => {
        const t = heuristicTriage('Maintenance maintenance vendor vendor vendor compliance inspection report report.');
        expect(t.tags[0]).toBe('vendor'); // most frequent
        expect(t.tags).toContain('maintenance');
        expect(t.qualityScore).toBeGreaterThan(0);
        expect(typeof t.assessment).toBe('string');
    });

    it('flags very short snippets', () => {
        expect(heuristicTriage('hi').assessment).toMatch(/short/i);
    });
});
