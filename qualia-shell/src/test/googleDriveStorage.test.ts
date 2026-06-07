/**
 * Unit tests for the pure snapshot logic of the Google Drive storage box.
 * (OAuth + Drive REST are user-credentialed and live-only; the serialization
 * that decides WHAT gets backed up — and that secrets never do — is tested here.)
 */
import { describe, it, expect } from 'vitest';
import { backupKeys, buildSnapshot, applySnapshot, type DwelliumSnapshot } from '../services/googleDriveStorage';

function fakeStore(init: Record<string, string> = {}) {
    const m = new Map<string, string>(Object.entries(init));
    return {
        getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
        setItem: (k: string, v: string) => { m.set(k, v); },
    };
}

describe('googleDriveStorage — snapshot (pure)', () => {
    it('backupKeys covers wiki, thought-weaver, workspace, honcho memory + dreams', () => {
        expect(backupKeys('u1')).toEqual([
            'dwellium:wiki:u1',
            'thought-weaver:captures:u1',
            'dwellium:workspace:cache:u1',
            'honcho:memories:u1',
            'honcho:dreams:u1',
        ]);
    });

    it('buildSnapshot gathers only present backup keys — never integration secrets', () => {
        const store = fakeStore({
            'dwellium:wiki:u1': '{"a":1}',
            'honcho:memories:u1': '[]',
            'dwellium:integrations:u1': 'SECRET-API-KEYS', // must NOT be captured
        });
        const snap = buildSnapshot(store, 'u1');
        expect(snap.version).toBe(1);
        expect(snap.uid).toBe('u1');
        expect(Object.keys(snap.data)).toEqual(['dwellium:wiki:u1', 'honcho:memories:u1']);
        expect(snap.data['dwellium:integrations:u1']).toBeUndefined();
    });

    it('applySnapshot writes keys back and reports the count', () => {
        const dest = fakeStore();
        const snap: DwelliumSnapshot = {
            version: 1, uid: 'u1', savedAt: 'x',
            data: { 'dwellium:wiki:u1': '{"a":1}', 'honcho:dreams:u1': '[]' },
        };
        expect(applySnapshot(dest, snap)).toBe(2);
        expect(dest.getItem('dwellium:wiki:u1')).toBe('{"a":1}');
    });

    it('applySnapshot ignores null / wrong-version payloads', () => {
        const dest = fakeStore();
        expect(applySnapshot(dest, null)).toBe(0);
        expect(applySnapshot(dest, { version: 2 as unknown as 1, uid: 'u1', savedAt: 'x', data: { k: 'v' } })).toBe(0);
    });

    it('round-trips data through build → apply', () => {
        const src = fakeStore({ 'dwellium:wiki:u1': '{"x":9}', 'thought-weaver:captures:u1': '[1,2]' });
        const dest = fakeStore();
        const n = applySnapshot(dest, buildSnapshot(src, 'u1'));
        expect(n).toBe(2);
        expect(dest.getItem('dwellium:wiki:u1')).toBe('{"x":9}');
        expect(dest.getItem('thought-weaver:captures:u1')).toBe('[1,2]');
    });
});
