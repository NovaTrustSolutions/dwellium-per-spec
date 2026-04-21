/**
 * QueryProvider.tsx — App-level React Query provider for the Qualia Shell.
 *
 * Provides a single QueryClient instance to all components.
 * - 60-second stale time prevents duplicate requests when switching tabs rapidly
 * - Single retry on failure
 * - Window focus refetch disabled (SSE handles real-time updates)
 *
 * @see Phase 3 — Data Layer migration in docs/code.md (Fix #029)
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** Singleton QueryClient — shared across all components */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60_000,           // 60s — prevents duplicate requests on rapid tab switches
            refetchOnWindowFocus: false,  // SSE handles real-time updates
            retry: 1,                    // Single retry on failure
        },
    },
});

export default function QueryProvider({ children }: { children: ReactNode }) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
        </QueryClientProvider>
    );
}
