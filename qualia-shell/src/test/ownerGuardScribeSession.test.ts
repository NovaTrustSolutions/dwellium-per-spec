/**
 * Owner-race guard: Scribe's open tabs live in a module-level zustand store that outlives a
 * sign-out (logout clears tokens, it does not reload). Without a reset, the next account opens
 * Scribe on the previous account's tabs — unsaved content included — and useAutoSave would PUT a
 * dirty one to the new account. dropTabsFromAnotherAccount() clears tabs populated under a
 * different owner; Scribe calls it before first paint.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useScribeStore, dropTabsFromAnotherAccount } from '../components/Scribe/scribeStore';
import { setPerUserIdentity } from '../lib/perUserIdentity';

const empty = { openFiles: [], activeFilepath: null, comments: [], editingCommentId: null, redlines: [], loading: false, error: null };
const st = () => useScribeStore.getState();

describe("owner-race guard — Scribe's open tabs across an account switch", () => {
    beforeEach(() => { setPerUserIdentity(null); useScribeStore.setState(empty); setPerUserIdentity('user-a'); });
    afterEach(() => setPerUserIdentity(null));

    it("tabs opened by A (unsaved edit included) are cleared when B signs in", () => {
        st().openInMemoryFile('a-private.md', 'A secret');
        st().updateContent('a-private.md', 'A secret, edited');
        setPerUserIdentity(null); setPerUserIdentity('user-b');
        expect(dropTabsFromAnotherAccount()).toBe(true);
        expect(st().openFiles).toEqual([]);
        expect(st().activeFilepath).toBeNull();
    });

    it('sign-out alone also clears them (nothing of A is left on the login screen)', () => {
        st().openInMemoryFile('a-private.md', 'A secret');
        setPerUserIdentity(null);
        expect(dropTabsFromAnotherAccount()).toBe(true);
        expect(st().openFiles).toEqual([]);
    });

    it('control: the same account keeps its tabs', () => {
        st().openInMemoryFile('a-notes.md', 'mine');
        expect(dropTabsFromAnotherAccount()).toBe(false);
        expect(st().openFiles.map((f) => f.filepath)).toEqual(['a-notes.md']);
    });

    it('sign-out drops the tabs once it lands (the login screen holds nobody\'s tabs); A\'s remembered session reopens them later', async () => {
        st().openInMemoryFile('a-notes.md', 'mine');
        setPerUserIdentity(null);
        await Promise.resolve(); // onOwnerChange runs one microtask after the owner changes
        expect(st().openFiles).toEqual([]);
    });

    it('control: an owner flip that returns to A before it lands (same tick) keeps A\'s tabs', async () => {
        st().openInMemoryFile('a-notes.md', 'mine');
        setPerUserIdentity(null); setPerUserIdentity('user-a');
        await Promise.resolve();
        expect(dropTabsFromAnotherAccount()).toBe(false);
        expect(st().openFiles).toHaveLength(1);
    });

    it("B's own tabs, opened after the clear, belong to B", () => {
        st().openInMemoryFile('a-private.md', 'A secret');
        setPerUserIdentity(null); setPerUserIdentity('user-b');
        dropTabsFromAnotherAccount();
        st().openInMemoryFile('b-notes.md', 'B text');
        expect(dropTabsFromAnotherAccount()).toBe(false);
        expect(st().openFiles.map((f) => f.filepath)).toEqual(['b-notes.md']);
    });
});
