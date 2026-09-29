/**
 * twInbox — plan 067 Phase 2 (D3/D4 fix, G1/G2 contract): pull the per-user
 * server-classified inbox that replaces the retired backend `/captures`
 * store and the retired Supabase phone-sync writes.
 *
 * The backend now classifies a phone capture and appends it to a One Save
 * object (`thought-weaver-inbox_<userId>`, type `thought-weaver-inbox`,
 * payload `{ items: InboxItem[] }`) instead of storing it in an in-memory
 * Map shared across every user (the D3 security hole) or writing to
 * Supabase with a client-visible anon key (the D4 hole). The desktop only
 * ever READS this object — it never writes it — and imports new items into
 * the local store exactly once via the same `planImport` + `twImportedStore`
 * path already used for the one-time Supabase import (plan 067 Phase 1).
 *
 * Pure-at-the-seams: no store reads/writes here, matching `pullCaptures` in
 * thoughtWeaverSync.ts. Any malformed row, malformed payload, or fetch
 * failure resolves to `[]` — never throws (`oneSaveClient.get` already
 * swallows network/disabled-flag failures to `null`, but a defensive
 * try/catch remains here for a malformed payload shape).
 */
import { oneSaveClient } from '../../lib/oneSaveClient';
import type { LocalCapture } from './thoughtWeaverStore';

interface InboxPayload {
    items?: unknown;
}

/** Pull this user's server-classified inbox (newest first, per the backend). */
export async function pullInbox(userId: string): Promise<Array<Omit<LocalCapture, 'source'>>> {
    try {
        const obj = await oneSaveClient.get<InboxPayload>('thought-weaver-inbox_' + userId);
        const items = obj?.payload?.items;
        if (!Array.isArray(items)) return [];
        const out: Array<Omit<LocalCapture, 'source'>> = [];
        for (const raw of items) {
            const item = raw as Record<string, unknown>;
            if (typeof item?.id !== 'string' || typeof item?.text !== 'string') continue;
            out.push({
                id: item.id,
                text: item.text,
                filed_to: typeof item.filed_to === 'string' ? item.filed_to : 'needs_review',
                confidence: typeof item.confidence === 'number' ? item.confidence : 0,
                destination_name: typeof item.destination_name === 'string' ? item.destination_name : null,
                createdAt: typeof item.createdAt === 'string' && !Number.isNaN(Date.parse(item.createdAt)) ? item.createdAt : new Date().toISOString(),
            });
        }
        return out;
    } catch {
        return [];
    }
}
