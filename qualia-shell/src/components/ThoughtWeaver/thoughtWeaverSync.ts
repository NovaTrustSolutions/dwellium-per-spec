/**
 * thoughtWeaverSync — P11-13: phone ↔ desktop capture sync via the user's
 * Supabase project (BACKLOG 2026-05-30 sketch; route chosen over PWA-only).
 *
 * Model REVISED 2026-09-25 (plan 067, Ilya decision): ONE-TIME IMPORT, not
 * write-through. The desktop client used to push every new capture back to
 * Supabase (`pushCapture`, now removed) and pull+merge Supabase rows as
 * non-local (undeletable) records on every load. That meant deleting a local
 * capture never touched Supabase, so the same row reappeared on the next
 * load — a delete that silently didn't stick. Fixed by treating Supabase rows
 * as a one-time seed: `pullCaptures` still fetches this user's rows, but
 * `planImport` (pure) decides which of them the caller should import into the
 * LOCAL store exactly once, keyed by id. The caller then records every seen
 * id in `twImportedStore` (`markImported`) so a row already imported — or
 * imported-then-deleted — is never re-imported, on this device or any other
 * (that set is One-Save-synced). No more desktop writes to Supabase.
 *
 * Table: public.thought_weaver_captures (created 2026-06-12 via Supabase MCP
 * on the "Mind Engine" project; columns mirror LocalCapture). SECURITY NOTE:
 * Dwellium auth ≠ Supabase Auth, so rows are scoped by user_id CLIENT-side;
 * true RLS needs a Supabase Auth adoption (documented in the migration).
 * Phase 2 retires this whole client-side-scoped path once Supabase Auth
 * lands.
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

/** Pull this user's rows (newest first, capped) for the one-time import. */
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
                createdAt: typeof r.created_at === 'string' && !Number.isNaN(Date.parse(r.created_at)) ? r.created_at : new Date().toISOString(),
            }));
    } catch {
        return [];
    }
}

/**
 * Pure decision of which pulled rows to import into the local store, and
 * which ids the caller should mark seen either way (imported now, already
 * local, or already imported-and-since-deleted).
 *
 * `toAppend` is returned OLDEST-first. `pullCaptures` returns newest-first
 * (matching the backend's `order=created_at.desc`), so the caller must walk
 * `toAppend` in order and prepend each one via `appendLocalCapture` — that
 * way the last one prepended (the newest) ends up on top, preserving the
 * store's most-recent-first ordering.
 */
export function planImport(
    pulled: Array<Omit<LocalCapture, 'source'>>,
    localIds: ReadonlySet<string>,
    imported: Readonly<Record<string, string>>,
): { toAppend: Array<Omit<LocalCapture, 'source'>>; seenIds: string[] } {
    const seenIds: string[] = [];
    const dedupe = new Set<string>();
    const toAppend: Array<Omit<LocalCapture, 'source'>> = [];
    for (const row of pulled) {
        seenIds.push(row.id);
        if (dedupe.has(row.id)) continue; // duplicate within `pulled`
        dedupe.add(row.id);
        if (localIds.has(row.id)) continue; // already local
        if (Object.prototype.hasOwnProperty.call(imported, row.id)) continue; // imported before, possibly deleted since — stays deleted
        toAppend.push(row);
    }
    toAppend.reverse(); // pulled is newest-first; return oldest-first per caller contract
    return { toAppend, seenIds };
}
