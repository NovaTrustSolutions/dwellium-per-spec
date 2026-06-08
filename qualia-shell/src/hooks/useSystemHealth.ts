/**
 * useSystemHealth — runs the AI health probes and returns per-item status.
 *
 * Probes the backend (/health), the per-user LLM key (hasActiveLlm), and each
 * external service URL (LangFlow/Paperclip/Open Notebook), then resolves each
 * AI widget's status. Re-runnable on demand.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE } from '../config';
import { useIntegrations } from './useIntegrations';
import { hasActiveLlm } from '../lib/llmClient';
import {
    HEALTH_ITEMS, resolveStatus, summarize, probeBackend, probeUrl, externalUrl,
    type HealthStatus, type HealthItem,
} from '../lib/systemHealth';

export interface HealthResult { item: HealthItem; status: HealthStatus; }

export function useSystemHealth() {
    const { integrations } = useIntegrations();
    const [results, setResults] = useState<HealthResult[]>(
        () => HEALTH_ITEMS.map((item) => ({ item, status: 'checking' as HealthStatus })),
    );
    const [checking, setChecking] = useState(false);
    const runningRef = useRef(false);

    const recheck = useCallback(async () => {
        if (runningRef.current) return;
        runningRef.current = true;
        setChecking(true);
        let llmOk = false;
        try { llmOk = hasActiveLlm(integrations.llm); } catch { llmOk = false; }

        const externalItems = HEALTH_ITEMS.filter((i) => i.requires === 'external');
        const probes = await Promise.all([
            probeBackend(API_BASE),
            ...externalItems.map((i) => probeUrl(externalUrl(i))),
        ]);
        const backendOk = probes[0] as boolean;
        const externalOk: Record<string, boolean> = {};
        externalItems.forEach((i, idx) => { externalOk[i.id] = probes[idx + 1] as boolean; });

        const ctx = { backendOk, llmOk, externalOk };
        setResults(HEALTH_ITEMS.map((item) => ({ item, status: resolveStatus(item, ctx) })));
        setChecking(false);
        runningRef.current = false;
    }, [integrations.llm]);

    useEffect(() => { recheck(); }, [recheck]);

    const summary = summarize(results.map((r) => r.status));
    return { results, summary, checking, recheck };
}
