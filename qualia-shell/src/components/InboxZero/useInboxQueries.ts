/**
 * useInboxQueries.ts — React Query hooks for all Inbox Zero API calls
 *
 * - 60-second cache TTL prevents duplicate requests when switching tabs rapidly
 * - Centralized query keys for consistent invalidation
 * - On-demand body fetch (security: email body never stored in bulk state)
 */

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { INBOX_API, SECURITY_API, API_BASE } from '../../config/api';
import type { InboxItem, InboxStats, NewsletterSender, AgentSettings, LlmSafetyEvent, LlmSafetyStats, SecurityStatusSnapshot, OperatorMetrics } from './InboxZeroTypes';

/** Stale time for all inbox queries — 60 seconds */
const STALE_TIME = 60_000;

// ─── Query Keys ────────────────────────────────────────
export const inboxKeys = {
    all: ['inbox'] as const,
    items: (filter: string, search: string, offset: number) =>
        ['inbox', 'items', { filter, search, offset }] as const,
    stats: () => ['inbox', 'stats'] as const,
    newsletters: () => ['inbox', 'newsletters'] as const,
    settings: () => ['inbox', 'settings'] as const,
    metrics: () => ['inbox', 'metrics'] as const,
    body: (id: string) => ['inbox', 'body', id] as const,
    auditLog: (itemId: string) => ['inbox', 'audit', itemId] as const,
    threadLinks: (itemId: string) => ['inbox', 'links', itemId] as const,
    security: {
        status: () => ['security', 'status'] as const,
        events: (severity: string, blocked: boolean) =>
            ['security', 'events', { severity, blocked }] as const,
        stats: () => ['security', 'stats'] as const,
    },
};

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Parse a fetch Response as JSON, but turn transport-level failures into clear
 * Error messages instead of an opaque `SyntaxError` from `.json()`. A non-2xx
 * response that returns HTML (proxy error page, 502, etc.) would otherwise throw
 * "Unexpected token <" — useless to the operator. We surface the status instead.
 */
async function parseJson(res: Response, label: string): Promise<any> {
    if (!res.ok) {
        // Best-effort to read a structured error body; fall back to status text.
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `${label} failed (${res.status})`);
    }
    try {
        return await res.json();
    } catch {
        throw new Error(`${label}: invalid response`);
    }
}

// ─── Items ─────────────────────────────────────────────
export function useInboxItems(
    authFetch: AuthFetch,
    filter: string,
    search: string,
    offset: number,
    limit = 50,
    enabled = true
) {
    return useQuery({
        queryKey: inboxKeys.items(filter, search, offset),
        queryFn: async () => {
            const params = new URLSearchParams();
            params.set('status', 'pending');
            if (filter !== 'all') params.set('signalClass', filter);
            if (search.trim()) params.set('search', search.trim());
            params.set('offset', String(offset));
            params.set('limit', String(limit));
            const res = await authFetch(`${INBOX_API}?${params.toString()}`);
            const data = await parseJson(res, 'Inbox items fetch');
            if (!data.success) throw new Error(data.error || 'Failed to fetch items');
            return {
                items: (data.data || []) as InboxItem[],
                hasMore: data.pagination?.hasMore ?? false,
            };
        },
        staleTime: STALE_TIME,
        enabled,
    });
}

// ─── Stats ─────────────────────────────────────────────
export function useInboxStats(authFetch: AuthFetch) {
    return useQuery({
        queryKey: inboxKeys.stats(),
        queryFn: async () => {
            const res = await authFetch(`${INBOX_API}/stats`);
            const data = await parseJson(res, 'Stats fetch');
            if (!data.success) throw new Error('Stats fetch failed');
            return data.data as InboxStats;
        },
        staleTime: STALE_TIME,
    });
}

// ─── Newsletters ───────────────────────────────────────
export function useNewsletters(authFetch: AuthFetch, enabled = true) {
    return useQuery({
        queryKey: inboxKeys.newsletters(),
        queryFn: async () => {
            const res = await authFetch(`${INBOX_API}/newsletters`);
            const data = await parseJson(res, 'Newsletter fetch');
            if (!data.success) throw new Error('Newsletter fetch failed');
            return data.data as NewsletterSender[];
        },
        staleTime: STALE_TIME,
        enabled,
    });
}

// ─── On-demand email body (SECURITY: never stored in bulk state) ──
export function useEmailBody(authFetch: AuthFetch, emailId: string | null) {
    return useQuery({
        queryKey: inboxKeys.body(emailId || ''),
        queryFn: async () => {
            if (!emailId) throw new Error('No email ID');
            const res = await authFetch(`${INBOX_API}/${emailId}/body`);
            const data = await parseJson(res, 'Body fetch');
            if (!data.success) throw new Error('Body fetch failed');
            return data.data as { body: string; subject: string; sender: string };
        },
        staleTime: 5 * 60_000, // Cache body for 5 min
        enabled: !!emailId,
    });
}

// ─── Metrics ───────────────────────────────────────────
export function useOperatorMetrics(authFetch: AuthFetch) {
    return useQuery({
        queryKey: inboxKeys.metrics(),
        queryFn: async () => {
            const res = await authFetch(`${INBOX_API}/metrics`);
            const data = await parseJson(res, 'Metrics fetch');
            if (!data.success) throw new Error('Metrics fetch failed');
            return data.data as OperatorMetrics;
        },
        staleTime: STALE_TIME,
    });
}

// ─── Settings ──────────────────────────────────────────
export function useSettings(authFetch: AuthFetch, enabled = true) {
    return useQuery({
        queryKey: inboxKeys.settings(),
        queryFn: async () => {
            const res = await authFetch(`${API_BASE}/api/settings`);
            const data = await parseJson(res, 'Settings fetch');
            if (!data.success) throw new Error('Settings fetch failed');
            return data.data as AgentSettings;
        },
        staleTime: 5 * 60_000,
        enabled,
    });
}

// ponytail: unused mutation hooks (useArchiveMutation, useApproveMutation,
// useDeleteMutation, useBulkArchiveMutation, useBulkSignalMutation,
// useBulkRouteMutation, useUnsubscribeMutation) deleted at plan 066 §2e —
// InboxZero.tsx calls authFetch directly for all mutations instead.
