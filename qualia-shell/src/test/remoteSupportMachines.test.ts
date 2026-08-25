/**
 * remoteMachinesStore (plan 053) — Andy's RustDesk address book.
 *
 * CRUD, per-user namespace isolation (dynamic-key store on
 * remoteMachinesUserIdHolder), merge-only JSON import/export, and the
 * `rustdesk://` deep-link builder (URI scheme verified 2026-08-23 from
 * rustdesk/rustdesk `src/core_main.rs` + `flutter/lib/common.dart`).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    addMachine,
    buildRustdeskLink,
    exportMachinesJson,
    importMachinesJson,
    remoteMachinesStore,
    remoteMachinesUserIdHolder,
    removeMachine,
    resetRemoteMachines,
    seedMachines,
    updateMachine,
} from '../components/RemoteSupport/remoteMachinesStore';

beforeEach(() => {
    localStorage.clear();
    remoteMachinesUserIdHolder.current = null;
    resetRemoteMachines(); // v2.72.1 standing convention
});

describe('seeds', () => {
    it('ships placeholder rows for Andy’s properties, clearly marked example with no invented IDs', () => {
        const seeds = remoteMachinesStore.getSnapshot();
        expect(seeds).toHaveLength(3);
        expect(seeds.every(m => m.example === true)).toBe(true);
        expect(seeds.every(m => m.rustdeskId === '')).toBe(true);
        expect(seeds.every(m => m.notes.includes('example — replace with your machines'))).toBe(true);
        const names = seeds.map(m => m.name).join(' | ');
        expect(names).toMatch(/Woodland Parc/);
        expect(names).toMatch(/Riverwood Club/);
        expect(seeds.map(m => m.tags[0])).toEqual(['Office', 'Kiosk', 'Resident']);
    });
});

describe('CRUD', () => {
    it('add → update (clears example flag) → remove', () => {
        const m = addMachine({ name: '  Office PC  ', rustdeskId: ' 123456789 ', notes: 'front desk', tags: ['Office'] });
        expect(m.name).toBe('Office PC');
        expect(m.rustdeskId).toBe('123456789');
        expect(remoteMachinesStore.getSnapshot()).toHaveLength(4);

        updateMachine(m.id, { rustdeskId: '987654321', tags: ['Office', 'Kiosk'] });
        const updated = remoteMachinesStore.getSnapshot().find(x => x.id === m.id)!;
        expect(updated.rustdeskId).toBe('987654321');
        expect(updated.tags).toEqual(['Office', 'Kiosk']);
        expect(updated.example).toBeUndefined();

        removeMachine(m.id);
        expect(remoteMachinesStore.getSnapshot().find(x => x.id === m.id)).toBeUndefined();
        expect(remoteMachinesStore.getSnapshot()).toHaveLength(3);
    });

    it('editing a seed drops its example marker', () => {
        const seed = remoteMachinesStore.getSnapshot()[0];
        updateMachine(seed.id, { rustdeskId: '111222333' });
        const edited = remoteMachinesStore.getSnapshot().find(x => x.id === seed.id)!;
        expect(edited.example).toBeUndefined();
        expect(edited.rustdeskId).toBe('111222333');
    });
});

describe('per-user isolation', () => {
    it('Andy’s machines never leak into Lisa’s namespace', () => {
        remoteMachinesUserIdHolder.current = 'user-andy';
        addMachine({ name: 'Andy office PC', rustdeskId: '123456789', tags: ['Office'] });
        expect(remoteMachinesStore.getSnapshot()).toHaveLength(4);

        remoteMachinesUserIdHolder.current = 'user-lisa';
        expect(remoteMachinesStore.getSnapshot()).toHaveLength(3); // seeds only
        expect(remoteMachinesStore.getSnapshot().some(m => m.name === 'Andy office PC')).toBe(false);

        remoteMachinesUserIdHolder.current = 'user-andy';
        expect(remoteMachinesStore.getSnapshot().some(m => m.name === 'Andy office PC')).toBe(true);
    });
});

describe('buildRustdeskLink', () => {
    it('rustdesk://connect/<id> with whitespace stripped; file-transfer authority; null on empty', () => {
        expect(buildRustdeskLink('123 456 789')).toBe('rustdesk://connect/123456789');
        expect(buildRustdeskLink('123456789', 'file-transfer')).toBe('rustdesk://file-transfer/123456789');
        expect(buildRustdeskLink('')).toBeNull();
        expect(buildRustdeskLink('   ')).toBeNull();
    });
});

describe('import / export JSON', () => {
    it('round-trips, merges by id, and NEVER removes existing rows', () => {
        const mine = addMachine({ name: 'Keep me', rustdeskId: '111111111', tags: ['Office'] });
        const exported = exportMachinesJson();
        expect(JSON.parse(exported)).toHaveLength(4);

        const incoming = [
            { ...mine, name: 'Keep me (renamed)' },
            { id: 'imported-1', name: 'Imported kiosk', rustdeskId: '222222222', notes: '', tags: ['Kiosk'], createdAt: 1, updatedAt: 1 },
        ];
        const n = importMachinesJson(JSON.stringify(incoming));
        expect(n).toBe(2);

        const after = remoteMachinesStore.getSnapshot();
        expect(after).toHaveLength(5); // 3 seeds + upserted mine + imported-1: nothing wiped
        expect(after.find(m => m.id === mine.id)?.name).toBe('Keep me (renamed)');
        expect(after.find(m => m.id === 'imported-1')?.name).toBe('Imported kiosk');
    });

    it('throws on malformed JSON and on non-array payloads; skips invalid rows', () => {
        expect(() => importMachinesJson('not json')).toThrow();
        expect(() => importMachinesJson('{"a":1}')).toThrow(/array/);
        expect(importMachinesJson('[{"nope":true}]')).toBe(0);
        expect(remoteMachinesStore.getSnapshot()).toHaveLength(3); // untouched
    });
});

describe('deserializer resilience', () => {
    it('falls back to seeds on garbage localStorage; respects an explicitly emptied list', () => {
        localStorage.setItem('remoteMachines:_anonymous', '{broken');
        resetRemoteMachines();
        expect(remoteMachinesStore.getSnapshot()).toEqual(seedMachines());

        localStorage.setItem('remoteMachines:_anonymous', '[]');
        resetRemoteMachines();
        expect(remoteMachinesStore.getSnapshot()).toEqual([]);
    });
});
