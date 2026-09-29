/**
 * thoughtWeaverSync — P11-13: phone↔desktop capture sync (injectable fetch,
 * no network). Verifies config gating, pull mapping, offline-first
 * never-throw guarantees, and the one-time-import decision (planImport).
 *
 * twImportedStore — per-user "already imported" id set backing planImport's
 * "deleted stays deleted" guarantee.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { twSyncConfig, pullCaptures, planImport } from '../components/ThoughtWeaver/thoughtWeaverSync';
import { twImportedStore, twImportedUserIdHolder, markImported } from '../components/ThoughtWeaver/twImportedStore';
import type { IntegrationsBundle } from '../types/integrations';
import type { LocalCapture } from '../components/ThoughtWeaver/thoughtWeaverStore';

const CFG = { url: 'https://x.supabase.co', anonKey: 'anon-1' };

function row(id: string, createdAt: string): Omit<LocalCapture, 'source'> {
    return { id, text: `text-${id}`, filed_to: 'admin', confidence: 0.8, destination_name: null, createdAt };
}

describe('twSyncConfig', () => {
    it('requires enabled + url + anonKey', () => {
        expect(twSyncConfig({ supabase: { url: 'https://x.supabase.co', anonKey: 'k', enabled: true } } as IntegrationsBundle)).toEqual(CFG_LIKE('https://x.supabase.co', 'k'));
        expect(twSyncConfig({ supabase: { url: '', anonKey: 'k', enabled: true } } as IntegrationsBundle)).toBeNull();
        expect(twSyncConfig({ supabase: { url: 'https://x.supabase.co', anonKey: 'k', enabled: false } } as IntegrationsBundle)).toBeNull();
        expect(twSyncConfig({} as IntegrationsBundle)).toBeNull();
    });
});

function CFG_LIKE(url: string, anonKey: string) { return { url, anonKey }; }

describe('pullCaptures', () => {
    it('maps rows back to LocalCapture shape (snake_case preserved)', async () => {
        const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
            expect(String(url)).toContain('user_id=eq.user-9');
            return {
                ok: true,
                json: async () => [{ id: 'phone-1', text: 'milk', filed_to: 'admin', confidence: 0.7, destination_name: null, created_at: '2026-06-12T01:00:00Z' }],
            } as unknown as Response;
        });
        const rows = await pullCaptures(CFG, 'user-9', fetchFn as never);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ id: 'phone-1', text: 'milk', filed_to: 'admin', createdAt: '2026-06-12T01:00:00Z' });
    });

    it('bad responses resolve to [] (never throws)', async () => {
        const fetchFn = vi.fn(async () => ({ ok: false } as Response));
        await expect(pullCaptures(CFG, 'u', fetchFn as never)).resolves.toEqual([]);
    });

    it('network failure resolves [] (offline-first, never throws)', async () => {
        const fetchFn = vi.fn(async () => { throw new Error('offline'); });
        await expect(pullCaptures(CFG, 'u', fetchFn as never)).resolves.toEqual([]);
    });
});

describe('planImport', () => {
    it('appends a row that is new (not local, not imported)', () => {
        const pulled = [row('a', '2026-06-12T01:00:00Z')];
        const { toAppend, seenIds } = planImport(pulled, new Set(), {});
        expect(toAppend).toEqual(pulled);
        expect(seenIds).toEqual(['a']);
    });

    it('skips a row already present locally', () => {
        const pulled = [row('a', '2026-06-12T01:00:00Z')];
        const { toAppend, seenIds } = planImport(pulled, new Set(['a']), {});
        expect(toAppend).toEqual([]);
        expect(seenIds).toEqual(['a']); // still marked seen
    });

    it('does NOT re-append a row previously imported then deleted locally (deleted stays deleted)', () => {
        const pulled = [row('a', '2026-06-12T01:00:00Z')];
        const { toAppend, seenIds } = planImport(pulled, new Set(), { a: '2026-06-12T02:00:00Z' });
        expect(toAppend).toEqual([]); // MUTATION CHECK: flipping `row.id in imported` to always-false makes this fail
        expect(seenIds).toEqual(['a']);
    });

    it('dedupes duplicate ids within `pulled`, keeping the row once', () => {
        const a1 = row('a', '2026-06-12T01:00:00Z');
        const a2 = row('a', '2026-06-12T01:00:00Z');
        const { toAppend, seenIds } = planImport([a1, a2], new Set(), {});
        expect(toAppend).toEqual([a1]);
        expect(seenIds).toEqual(['a', 'a']); // every pulled id is recorded as seen
    });

    it('seenIds contains every pulled id regardless of import decision', () => {
        const pulled = [row('local', '2026-06-12T01:00:00Z'), row('imported', '2026-06-12T02:00:00Z'), row('new', '2026-06-12T03:00:00Z')];
        const { seenIds } = planImport(pulled, new Set(['local']), { imported: '2026-06-12T00:00:00Z' });
        expect(seenIds).toEqual(['local', 'imported', 'new']);
    });

    it('returns toAppend oldest-first so sequential prepend preserves newest-first store order', () => {
        // pullCaptures returns newest-first (order=created_at.desc)
        const pulled = [row('newest', '2026-06-12T03:00:00Z'), row('oldest', '2026-06-12T01:00:00Z')];
        const { toAppend } = planImport(pulled, new Set(), {});
        expect(toAppend.map(r => r.id)).toEqual(['oldest', 'newest']);
    });
});

describe('twImportedStore', () => {
    beforeEach(() => {
        twImportedStore.reset();
        twImportedUserIdHolder.current = null;
        localStorage.clear();
    });

    it('markImported unions new ids and persists under the per-user key', () => {
        twImportedUserIdHolder.current = 'user-1';
        markImported(['a', 'b'], '2026-06-12T00:00:00Z');
        expect(twImportedStore.getSnapshot()).toEqual({ a: '2026-06-12T00:00:00Z', b: '2026-06-12T00:00:00Z' });

        markImported(['b', 'c'], '2026-06-13T00:00:00Z'); // 'b' already present — untouched; 'c' added
        expect(twImportedStore.getSnapshot()).toEqual({
            a: '2026-06-12T00:00:00Z', b: '2026-06-12T00:00:00Z', c: '2026-06-13T00:00:00Z',
        });

        const persisted = JSON.parse(localStorage.getItem('thought-weaver:imported:user-1')!);
        expect(persisted).toEqual({ a: '2026-06-12T00:00:00Z', b: '2026-06-12T00:00:00Z', c: '2026-06-13T00:00:00Z' });
    });

    it('markImported is a no-op when every id is already imported', () => {
        twImportedUserIdHolder.current = 'user-1';
        markImported(['a'], '2026-06-12T00:00:00Z');
        const before = twImportedStore.getSnapshot();
        markImported(['a'], '2026-06-13T00:00:00Z');
        expect(twImportedStore.getSnapshot()).toBe(before); // same reference: no re-set
    });

    it('falls back to the anonymous namespace when no user is set', () => {
        markImported(['a'], '2026-06-12T00:00:00Z');
        expect(localStorage.getItem('thought-weaver:imported:_anonymous')).not.toBeNull();
    });

    it('deserializer rejects a non-object payload (array)', () => {
        twImportedUserIdHolder.current = 'user-2';
        localStorage.setItem('thought-weaver:imported:user-2', JSON.stringify(['not', 'an', 'object']));
        expect(twImportedStore.getSnapshot()).toEqual({});
    });

    it('deserializer drops non-string-valued entries, keeps string-valued ones', () => {
        twImportedUserIdHolder.current = 'user-2';
        localStorage.setItem('thought-weaver:imported:user-2', JSON.stringify({ a: 42, b: 'ok' }));
        expect(twImportedStore.getSnapshot()).toEqual({ b: 'ok' });
    });

    it('deserializer rejects unparseable JSON', () => {
        twImportedUserIdHolder.current = 'user-2';
        localStorage.setItem('thought-weaver:imported:user-2', 'not json');
        expect(twImportedStore.getSnapshot()).toEqual({});
    });
});
