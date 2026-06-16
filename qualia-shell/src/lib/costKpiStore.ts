/**
 * costKpiStore — the user's "value of my time" KPI, in USD per hour.
 *
 * Drives the cost advisor (costAdvisor.ts): a task is flagged when AI
 * automation or online outsourcing would cost LESS than doing it yourself at
 * this hourly rate. The user sets it with the slider in the AI Spend widget.
 *
 * Per-user dynamic-key factory + One Save ('cost-kpi'), the llmUsageStore
 * sister shape incl. `.reset()`. Namespacing rides integrationsUserIdHolder,
 * set during authed renders (UserProvider).
 *
 * Storage key:  costkpi:<userId>   (anon → costkpi:_anonymous)
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { integrationsUserIdHolder } from '../utils/integrationsStore';

export const DEFAULT_HOURLY_KPI = 50;
export const MIN_HOURLY_KPI = 5;
export const MAX_HOURLY_KPI = 500;

export const costKpiUserIdHolder = integrationsUserIdHolder; // shared identity

function resolveKey(): string {
    const uid = costKpiUserIdHolder.current;
    return uid ? `costkpi:${uid}` : 'costkpi:_anonymous';
}

/** Clamp to a sane band and snap to whole dollars. */
export function clampKpi(n: number): number {
    if (!Number.isFinite(n)) return DEFAULT_HOURLY_KPI;
    return Math.min(MAX_HOURLY_KPI, Math.max(MIN_HOURLY_KPI, Math.round(n)));
}

function deserialize(raw: string | null): number {
    if (raw == null) return DEFAULT_HOURLY_KPI;
    // Accept both a bare number ("50") and a JSON number (One Save payload).
    const n = Number(raw);
    return Number.isFinite(n) ? clampKpi(n) : DEFAULT_HOURLY_KPI;
}

export const costKpiStore = withSync(
    createLocalStorageStore<number>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: DEFAULT_HOURLY_KPI,
    }),
    { objectType: 'cost-kpi', holder: costKpiUserIdHolder, resolveKey },
);

export function setCostKpi(value: number): void {
    const v = clampKpi(value);
    costKpiStore.set(v, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(v)); } catch { /* sandboxed */ }
    });
}

export function getCostKpi(): number {
    return costKpiStore.getSnapshot();
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetCostKpi(): void {
    costKpiStore.set(DEFAULT_HOURLY_KPI, () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

export function useCostKpi(): number {
    return useSyncExternalStore(
        costKpiStore.subscribe,
        costKpiStore.getSnapshot,
        costKpiStore.getServerSnapshot,
    );
}
