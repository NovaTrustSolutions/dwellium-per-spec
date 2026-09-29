/**
 * Plan 067 — ThoughtWeaver data is tied to the signed-in user even when the
 * widget never rendered: readers like unifiedMemory/ConnectionsPanel use the
 * store directly, so the holders must follow setPerUserIdentity (the shell's
 * single identity writer), not only the widget's own render.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setPerUserIdentity } from '../lib/perUserIdentity';
import { thoughtWeaverStore, appendLocalCapture } from '../components/ThoughtWeaver/thoughtWeaverStore';
import { todoStore } from '../components/ThoughtWeaver/todoStore';
import { reportStore } from '../components/ThoughtWeaver/reportStore';
import { twImportedStore, markImported } from '../components/ThoughtWeaver/twImportedStore';

vi.mock('../lib/oneSaveClient', () => ({
    ONE_SAVE_ENABLED: false,
    oneSaveClient: { get: vi.fn().mockResolvedValue(null), put: vi.fn(), remove: vi.fn(), putBatch: vi.fn() },
}));

const capture = (id: string, text: string) => ({ id, text, filed_to: 'ideas', confidence: 0.9, destination_name: null, createdAt: '2026-09-25T00:00:00.000Z' });

describe('ThoughtWeaver per-user identity', () => {
    beforeEach(() => { localStorage.clear(); setPerUserIdentity(null); });

    it("a switch through setPerUserIdentity alone shows each user only their own thoughts", () => {
        setPerUserIdentity('alice');
        appendLocalCapture(capture('a1', 'alice private thought'));
        markImported(['a-imported']);

        setPerUserIdentity('bob');
        expect(thoughtWeaverStore.getSnapshot()).toEqual([]);
        expect(twImportedStore.getSnapshot()).toEqual({});
        appendLocalCapture(capture('b1', 'bob private thought'));
        expect(thoughtWeaverStore.getSnapshot().map(c => c.text)).toEqual(['bob private thought']);

        setPerUserIdentity('alice');
        expect(thoughtWeaverStore.getSnapshot().map(c => c.text)).toEqual(['alice private thought']);
        expect(Object.keys(twImportedStore.getSnapshot())).toEqual(['a-imported']);
    });

    it('to-dos and reports follow the same identity', () => {
        setPerUserIdentity('alice');
        localStorage.setItem('thought-weaver:todo:alice', JSON.stringify([{ id: 't1', text: 'alice todo', priority: 'high', done: false, createdAt: '2026-09-25T00:00:00.000Z', source: 'manual' }]));
        setPerUserIdentity('bob');
        expect(todoStore.getSnapshot()).toEqual([]);
        expect(localStorage.getItem('thought-weaver:reports:bob')).toBeNull();
        expect(reportStore.getSnapshot()).toEqual(reportStore.getServerSnapshot());
    });
});
