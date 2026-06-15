/**
 * IndexedDB handle-persistence follow-up — ingestionHandleStore + fsAccess
 * permission helpers.
 *
 * Robust to environments with or without IndexedDB (jsdom may or may not provide
 * it): round-trip assertions are gated on availability, while no-throw + the
 * permission-helper assertions hold everywhere.
 */
import { describe, it, expect } from 'vitest';
import {
    saveIngestionHandle,
    loadIngestionHandle,
    deleteIngestionHandles,
} from '../components/Scribe/ingestion/ingestionHandleStore';
import {
    queryDirectoryPermission,
    requestDirectoryPermission,
    type FsDirectoryHandle,
    type FsPermissionState,
} from '../components/Scribe/ingestion/fsAccess';

const hasIDB = typeof indexedDB !== 'undefined';

/** Plain, structured-cloneable stand-in (no functions) for an IDB round-trip. */
function plainHandle(name: string): FsDirectoryHandle {
    return { kind: 'directory', name } as unknown as FsDirectoryHandle;
}

function permHandle(name: string, state: FsPermissionState): FsDirectoryHandle {
    return {
        kind: 'directory',
        name,
        async queryPermission() { return state; },
        async requestPermission() { return state; },
    } as unknown as FsDirectoryHandle;
}

describe('ingestionHandleStore', () => {
    it('round-trips a handle when IndexedDB is available, else no-ops safely', async () => {
        await expect(saveIngestionHandle('u1', 'source', plainHandle('Src'))).resolves.toBeUndefined();
        const got = await loadIngestionHandle('u1', 'source');
        if (hasIDB) expect(got?.name).toBe('Src');
        else expect(got).toBeNull();
        await deleteIngestionHandles('u1');
        expect(await loadIngestionHandle('u1', 'source')).toBeNull();
    });

    it('isolates handles by user id', async () => {
        if (!hasIDB) return; // nothing to isolate without a real IndexedDB
        await saveIngestionHandle('andy', 'source', plainHandle('AndyFolder'));
        await saveIngestionHandle('archi', 'source', plainHandle('ArchiFolder'));
        expect((await loadIngestionHandle('andy', 'source'))?.name).toBe('AndyFolder');
        expect((await loadIngestionHandle('archi', 'source'))?.name).toBe('ArchiFolder');
        await deleteIngestionHandles('andy');
        await deleteIngestionHandles('archi');
    });
});

describe('fsAccess permission helpers', () => {
    it('treats a handle without the permission API as granted', async () => {
        const h = plainHandle('NoPermApi');
        expect(await queryDirectoryPermission(h, 'read')).toBe('granted');
        expect(await requestDirectoryPermission(h, 'readwrite')).toBe('granted');
    });

    it('reports the handle’s permission state', async () => {
        expect(await queryDirectoryPermission(permHandle('P', 'prompt'), 'read')).toBe('prompt');
        expect(await requestDirectoryPermission(permHandle('G', 'granted'), 'readwrite')).toBe('granted');
        expect(await queryDirectoryPermission(permHandle('D', 'denied'), 'read')).toBe('denied');
    });
});
