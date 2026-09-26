/**
 * captureOwner — async per-user writers drop their result when the account
 * changed during the await (never write A's data into B / _anonymous).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { captureOwner, setPerUserIdentity, goalsUserIdHolder } from '../lib/perUserIdentity';

function deferred<T>() {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
}

/** The guarded pattern every async write site uses. */
async function guardedWrite(work: Promise<string>, sink: string[][]): Promise<void> {
    const stillOwner = captureOwner();
    const result = await work;
    if (!stillOwner()) return;
    sink.push([goalsUserIdHolder.current ?? '_anonymous', result]);
}

describe('captureOwner (owner-race guard)', () => {
    beforeEach(() => setPerUserIdentity(null));

    it('same owner across the await → the write happens under that owner', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<string>(); const sink: string[][] = [];
        const p = guardedWrite(d.promise, sink);
        d.resolve('a-result'); await p;
        expect(sink).toEqual([['user-a', 'a-result']]);
    });

    it('user switch mid-await (A → logout → B) → A\'s result is dropped, B gets nothing', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<string>(); const sink: string[][] = [];
        const p = guardedWrite(d.promise, sink);
        setPerUserIdentity(null);      // logout render
        setPerUserIdentity('user-b');  // login render
        d.resolve('a-result'); await p;
        expect(sink).toEqual([]);
    });

    it('logout mid-await → nothing lands in _anonymous', async () => {
        setPerUserIdentity('user-a');
        const d = deferred<string>(); const sink: string[][] = [];
        const p = guardedWrite(d.promise, sink);
        setPerUserIdentity(null);
        d.resolve('a-result'); await p;
        expect(sink).toEqual([]);
    });

    it('re-renders with the same user do not invalidate the capture', () => {
        setPerUserIdentity('user-a');
        const stillOwner = captureOwner();
        setPerUserIdentity('user-a');
        setPerUserIdentity('user-a');
        expect(stillOwner()).toBe(true);
    });
});
