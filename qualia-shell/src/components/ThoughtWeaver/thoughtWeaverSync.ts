/**
 * thoughtWeaverSync — P11-13: phone ↔ desktop capture sync via the user's
 * Supabase project (BACKLOG 2026-05-30 sketch; route chosen over PWA-only).
 *
 * Model: LOCAL-FIRST. The per-browser thoughtWeaverStore stays the source of
 * truth — nothing is ever lost if Supabase is down. When the integrations
 * bundle has Supabase configured:
 *   - every new capture is WRITE-THROUGH pushed (best-effort, fire+forget);
 *   - on load, rows for this user are PULLED and merged by the component as
 *     non-local records (display without the local delete handle — the
 *     verbatim-text + user-only-delete guarantees hold across the sync).
 *
 * Table: public.thought_weaver_captures (created 2026-06-12 via Supabase MCP
 * on the "Mind Engine" project; columns mirror LocalCapture). SECURITY NOTE:
 * Dwellium auth ≠ Supabase Auth, so rows are scoped by user_id CLIENT-side;
 * true RLS needs a Supabase Auth adoption (documented in the migration).
 *
 * Pure-at-the-seams: fetch injectable; no store reads here.
 */
import type { IntegrationsBundle } from '../../types/integrations';
import type { LocalCapture } from './thoughtWeaverStore';

export interface TwSyncConfig {
    url: string;
    anonKey: string;
}

/** The user's Supabase config, when usable for sync. */
export function twSyncConfig(bundle: IntegrationsBundle): TwSyncConfig | null {
    const s = bundle.supabase;
    if (!s?.enabled || !s.url?.trim() || !s.anonKey?.trim()) return null;
    return { url: s.url.trim().replace(/\/$/, ''), anonKey: s.anonKey.trim() };
}

function headers(cfg: TwSyncConfig): Record<string, string> {
    return {
        'Content-Type': 'application/json',
        apikey: cfg.anonKey,
        Authorization: `Bearer ${cfg.anonKey}`,
    };
}

/** Write-through push of one capture (best-effort; duplicate ids ignored). */
export async function pushCapture(
    cfg: TwSyncConfig,
    userId: string,
    c: LocalCapture,
    fetchFn: typeof fetch = fetch,
): Promise<boolean> {
    try {
        const res = await fetchFn(`${cfg.url}/rest/v1/thought_weaver_captures`, {
            method: 'POST',
            headers: { ...headers(cfg), Prefer: 'resolution=ignore-duplicates' },
            body: JSON.stringify({
                id: c.id,
                user_id: userId,
                text: c.text,
                filed_to: c.filed_to ?? null,
                confidence: c.confidence ?? null,
                destination_name: c.destination_name ?? null,
                created_at: c.createdAt ?? new Date().toISOString(),
            }),
        });
        return res.ok;
    } catch {
        return false; // offline-first: local already has it
    }
}

/** Pull this user's rows (newest first, capped) for merge-on-load. */
export async function pullCaptures(
    cfg: TwSyncConfig,
    userId: string,
    fetchFn: typeof fetch = fetch,
): Promise<Array<Omit<LocalCapture, 'source'>>> {
    try {
        const res = await fetchFn(
            `${cfg.url}/rest/v1/thought_weaver_captures?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=200`,
            { headers: headers(cfg) },
        );
        if (!res.ok) return [];
        const rows = await res.json();
        if (!Array.isArray(rows)) return [];
        return rows
            .filter((r: any) => typeof r?.id === 'string' && typeof r?.text === 'string')
            .map((r: any) => ({
                id: r.id,
                text: r.text,
                filed_to: r.filed_to ?? 'needs_review',
                confidence: typeof r.confidence === 'number' ? r.confidence : 0,
                destination_name: r.destination_name ?? null,
                createdAt: r.created_at ?? new Date().toISOString(),
            }));
    } catch {
        return [];
    }
}
