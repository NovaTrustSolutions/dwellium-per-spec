/**
 * thoughtWeaverSync — P11-13: phone↔desktop capture sync (injectable fetch,
 * no network). Verifies config gating, push payload shape, pull mapping, and
 * the offline-first never-throw guarantees.
 */
import { describe, it, expect, vi } from 'vitest';
import { twSyncConfig, pushCapture, pullCaptures } from '../components/ThoughtWeaver/thoughtWeaverSync';
import type { IntegrationsBundle } from '../types/integrations';
import type { LocalCapture } from '../components/ThoughtWeaver/thoughtWeaverStore';

const CFG = { url: 'https://x.supabase.co', anonKey: 'anon-1' };
const CAPTURE: LocalCapture = {
    id: 'local-1', text: 'call the roofer', filed_to: 'admin', confidence: 0.8,
    destination_name: 'Maintenance', source: 'local', createdAt: '2026-06-12T00:00:00Z',
};

describe('twSyncConfig', () => {
    it('requires enabled + url + anonKey', () => {
        expect(twSyncConfig({ supabase: { url: 'https://x.supabase.co', anonKey: 'k', enabled: true } } as IntegrationsBundle)).toEqual(CFG_LIKE('https://x.supabase.co', 'k'));
        expect(twSyncConfig({ supabase: { url: '', anonKey: 'k', enabled: true } } as IntegrationsBundle)).toBeNull();
        expect(twSyncConfig({ supabase: { url: 'https://x.supabase.co', anonKey: 'k', enabled: false } } as IntegrationsBundle)).toBeNull();
        expect(twSyncConfig({} as IntegrationsBundle)).toBeNull();
    });
});

function CFG_LIKE(url: string, anonKey: string) { return { url, anonKey }; }

describe('pushCapture', () => {
    it('POSTs the snake_case row with the user id', async () => {
        let captured: { url: string; body: any } | null = null;
        const fetchFn = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
            captured = { url: String(url), body: JSON.parse(String(init?.body)) };
            return { ok: true } as Response;
        });
        const ok = await pushCapture(CFG, 'user-9', CAPTURE, fetchFn as never);
        expect(ok).toBe(true);
        expect(captured!.url).toContain('/rest/v1/thought_weaver_captures');
        expect(captured!.body).toMatchObject({
            id: 'local-1', user_id: 'user-9', text: 'call the roofer',
            filed_to: 'admin', destination_name: 'Maintenance',
        });
    });

    it('network failure resolves false (offline-first, never throws)', async () => {
        const fetchFn = vi.fn(async () => { throw new Error('offline'); });
        await expect(pushCapture(CFG, 'u', CAPTURE, fetchFn as never)).resolves.toBe(false);
    });
});

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
});
