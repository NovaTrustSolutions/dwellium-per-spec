/**
 * onboardingStore — plan 047 "Onboarding for the expanded surface".
 *
 * Per-user One Save ('onboarding'), firstRunStore sister shape. Holds what
 * plan 046 F does NOT: the chosen role (starter set), which per-widget tips
 * were seen, which disclosure tiers were unlocked, and the "done" stamp.
 * The three first-win steps stay in firstRunStore (reuse, not a second copy).
 *
 * Metrics (plan 047 §7) ride the existing activity log under widgetId
 * 'onboarding' — no new telemetry service. Time Travel filter: widgetId ===
 * 'onboarding'.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { onboardingUserIdHolder, usePerUserIdentity } from './perUserIdentity';
import { logActivity } from './activityLogStore';
import { WIDGET_REGISTRY, type WidgetTier } from '../registry/widgetRegistry';
import { PINNED_WIDGETS, STARTER_SETS, type OnboardingRole } from '../components/Shell/defaultStack';
import type { FirstRunState } from './firstRunStore';

export type { OnboardingRole, WidgetTier };

export interface OnboardingState {
    role: OnboardingRole | null;
    seenTips: string[];
    unlockedTiers: WidgetTier[];
    doneAt?: number;
}

export { onboardingUserIdHolder };

const EMPTY: OnboardingState = { role: null, seenTips: [], unlockedTiers: [] };
const TIERS: readonly WidgetTier[] = ['core', 'daily', 'ai', 'tools', 'labs'];
const isTier = (t: unknown): t is WidgetTier => (TIERS as readonly unknown[]).includes(t);
const isRole = (r: unknown): r is OnboardingRole => r === 'owner' || r === 'staff';

/** App-load anchor for the time-to-first-win metric (≈ login for a fresh user). */
const LOADED_AT = Date.now();

function resolveKey(): string {
    const uid = onboardingUserIdHolder.current;
    return uid ? `onboarding:${uid}` : 'onboarding:_anonymous';
}

function deserialize(raw: string | null): OnboardingState {
    if (!raw) return EMPTY;
    try {
        const p = JSON.parse(raw) as Partial<OnboardingState> | null;
        if (!p || typeof p !== 'object') return EMPTY;
        return {
            role: isRole(p.role) ? p.role : null,
            seenTips: Array.isArray(p.seenTips) ? p.seenTips.filter((x): x is string => typeof x === 'string') : [],
            unlockedTiers: Array.isArray(p.unlockedTiers) ? p.unlockedTiers.filter(isTier) : [],
            doneAt: typeof p.doneAt === 'number' ? p.doneAt : undefined,
        };
    } catch {
        return EMPTY;
    }
}

export const onboardingStore = withSync(
    createLocalStorageStore<OnboardingState>({ key: resolveKey, deserializer: deserialize, defaultValue: EMPTY }),
    { objectType: 'onboarding', holder: onboardingUserIdHolder, resolveKey },
);

function persist(next: OnboardingState): void {
    onboardingStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

const log = (action: string, details?: Record<string, unknown>) => logActivity('onboarding', 'Onboarding', action, details);

/* ── Tiers ──────────────────────────────────────────────────────────────── */

const CATEGORY_TIER: Record<string, WidgetTier> = { core: 'daily', ai: 'ai', filing: 'tools', tools: 'tools' };
const PINNED = new Set(PINNED_WIDGETS.map(p => p.component));

/** Disclosure tier of a widget: explicit registry `tier` → pinned = core → restricted = labs → by category. */
export function tierOf(widgetId: string): WidgetTier {
    const reg = WIDGET_REGISTRY[widgetId];
    if (reg?.tier) return reg.tier;
    if (PINNED.has(widgetId)) return 'core';
    if (reg?.restrictedToEmails) return 'labs';
    return CATEGORY_TIER[reg?.category ?? ''] ?? 'tools';
}

/** Owner-operator = management/corporate/god; everyone else who reaches the admin shell = staff. */
export function deriveOnboardingRole(userRole: string | undefined | null): OnboardingRole {
    return userRole === 'management' || userRole === 'corporate' || userRole === 'god' ? 'owner' : 'staff';
}

/* ── Mutators ───────────────────────────────────────────────────────────── */

export function setOnboardingRole(role: OnboardingRole): void {
    const s = onboardingStore.getSnapshot();
    if (s.role === role) return;
    persist({ ...s, role });
    log('onboarding:role', { role, msSinceLoad: Date.now() - LOADED_AT });
}

/** Idempotent: first call per widget persists + logs; later calls are no-ops. */
export function markTipSeen(widgetId: string, dismissed: 'button' | 'timeout' = 'button'): void {
    const s = onboardingStore.getSnapshot();
    if (s.seenTips.includes(widgetId)) return;
    persist({ ...s, seenTips: [...s.seenTips, widgetId] });
    log('onboarding:tip-seen', { widgetId, dismissed });
}

/** Re-arm a tip (titlebar "?" / ⌘K "help: <widget>"). */
export function unmarkTipSeen(widgetId: string): void {
    const s = onboardingStore.getSnapshot();
    if (!s.seenTips.includes(widgetId)) return;
    persist({ ...s, seenTips: s.seenTips.filter(t => t !== widgetId) });
}

/** Set semantics: unlocking an unlocked tier is a no-op. Returns true when it was NEW. */
export function unlockTier(tier: WidgetTier): boolean {
    const s = onboardingStore.getSnapshot();
    if (s.unlockedTiers.includes(tier)) return false;
    persist({ ...s, unlockedTiers: [...s.unlockedTiers, tier] });
    log('onboarding:unlock', { tier });
    return true;
}

/** Replay: clear role/tips/tiers/done (writes the empty default — no key deletion). */
export function resetOnboarding(): void {
    onboardingStore.reset();
    persist(EMPTY);
    log('onboarding:replay');
}

/** Time-to-first-win metric — called by firstRunStore.markDone exactly once per step. */
export function logFirstWin(step: string): void {
    log('onboarding:first-win', { step, msSinceLoad: Date.now() - LOADED_AT });
}

/* ── Done predicate ─────────────────────────────────────────────────────── */

/** Pure: 3/3 first-win AND every starter-set widget's tip seen. */
export function isOnboardingDone(state: OnboardingState, firstRun: FirstRunState): boolean {
    if (!state.role) return false;
    const winOk = (['key', 'data', 'ara'] as const).every(s => firstRun.done.includes(s));
    const tipsOk = STARTER_SETS[state.role].every(p => state.seenTips.includes(p.component));
    return winOk && tipsOk;
}

/** Stamp doneAt once the predicate holds (idempotent). */
export function maybeStampDone(firstRun: FirstRunState): void {
    const s = onboardingStore.getSnapshot();
    if (s.doneAt || !isOnboardingDone(s, firstRun)) return;
    persist({ ...s, doneAt: Date.now() });
    log('onboarding:done', { msSinceLoad: Date.now() - LOADED_AT });
}

/** Hook. Sets every per-user holder first (single writer), then subscribes. */
export function useOnboarding(): OnboardingState {
    usePerUserIdentity();
    return useSyncExternalStore(onboardingStore.subscribe, onboardingStore.getSnapshot, onboardingStore.getServerSnapshot);
}
