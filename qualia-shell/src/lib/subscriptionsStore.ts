/**
 * subscriptionsStore — the user's REAL recurring AI subscriptions (2026-06-14).
 *
 * Powers the Home "AI Spend" card so the flat monthly figure is the user's
 * actual spend, not a placeholder. Editable from the UI; per-user namespaced +
 * One Save synced via the established createLocalStorageStore factory (sister
 * shape to llmUsageStore / integrationsStore).
 *
 * Token/usage spend is tracked separately in llmUsageStore (real estimates from
 * every callLlm). Together they give: flat monthly (subscriptions) + variable
 * (tokens) = total spend.
 */
import { useMemo, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { subscriptionsUserIdHolder } from './perUserIdentity';

export interface Subscription {
    id: string;
    name: string;     // e.g. "Claude Max 20x"
    vendor: string;   // e.g. "Anthropic"
    monthly: number;  // USD / month (0 for credit/PAYG)
}

function resolveKey(): string {
    const uid = subscriptionsUserIdHolder.current;
    return uid ? `subscriptions:${uid}` : 'subscriptions:_anonymous';
}

// A new user has no subscriptions until they add them — no sample/demo data
// (owner rule). Empty by default; the editor lets them add their real plans.
function defaults(): Subscription[] {
    return [];
}

/**
 * Plan 068: the sample list this store used to ship as defaults. One Save's
 * migrate() uploaded it for every existing user who never edited, so hydrate
 * would bring the fake $220/mo straight back. A list that is EXACTLY this
 * (same ids, names, prices) was never confirmed by the user → treated as
 * empty. Nothing is deleted: the stored copy is overwritten only when the user
 * saves their own plans.
 */
const OLD_SHIPPED_DEFAULTS = [
    { id: 'claude-max', name: 'Claude Max 20x', monthly: 200 },
    { id: 'chatgpt-plus', name: 'ChatGPT Plus', monthly: 20 },
    { id: 'codex', name: 'Codex', monthly: 0 },
];

export function withoutUnconfirmedDefaults(list: Subscription[]): Subscription[] {
    const isOldDefaults = list.length === OLD_SHIPPED_DEFAULTS.length
        && OLD_SHIPPED_DEFAULTS.every((d, i) => list[i]?.id === d.id && list[i]?.name === d.name && Number(list[i]?.monthly) === d.monthly);
    return isOldDefaults ? [] : list;
}

/** Prorates a flat monthly figure to `days` days (30-day month). */
export function prorateMonthly(monthly: number, days: number): number {
    return (monthly * days) / 30;
}

/**
 * Applies one window.prompt() answer per existing row (parallel array, same
 * order as `list`). `null` (user cancelled) leaves the row unchanged;
 * "remove" (case-insensitive) drops it; anything else is parsed as the new
 * monthly price (blank/"0" both resolve to 0 and the row is kept).
 */
export function applyPlanEdits(list: Subscription[], answers: (string | null)[]): Subscription[] {
    const result: Subscription[] = [];
    list.forEach((s, i) => {
        const v = answers[i];
        if (v == null) { result.push(s); return; }
        if (v.trim().toLowerCase() === 'remove') return;
        result.push({ ...s, monthly: Number(v.replace(/[^0-9.]/g, '')) || 0 });
    });
    return result;
}

/** Parses "Name, 20" from the add-subscription prompt. Blank/no name → null (skip). */
export function parseNewSubscription(answer: string | null): Subscription | null {
    if (!answer) return null;
    const [namePart, pricePart] = answer.split(',');
    const name = (namePart ?? '').trim();
    if (!name) return null;
    const monthly = Number(String(pricePart ?? '').replace(/[^0-9.]/g, '')) || 0;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'sub';
    return { id: `${slug}-${Date.now()}`, name, vendor: '', monthly };
}

function deserialize(raw: string | null): Subscription[] {
    if (!raw) return defaults();
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed
                .filter((s) => s && typeof s.name === 'string')
                .map((s) => ({ id: String(s.id ?? s.name), name: String(s.name), vendor: String(s.vendor ?? ''), monthly: Number(s.monthly) || 0 }));
        }
    } catch { /* fall through */ }
    return defaults();
}

export const subscriptionsStore = withSync(
    createLocalStorageStore<Subscription[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: defaults(),
    }),
    { objectType: 'subscriptions', holder: subscriptionsUserIdHolder, resolveKey },
);

export function saveSubscriptions(list: Subscription[]): void {
    subscriptionsStore.set(list, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(list)); } catch { /* sandboxed */ }
    });
}

export function monthlyTotal(list: Subscription[]): number {
    return list.reduce((s, x) => s + (Number(x.monthly) || 0), 0);
}

// A Gemini API key is not proof of a paid plan — never synthesize a
// subscription row. useSubscriptions returns the store snapshot directly
// (stable reference; existing 'google-max' rows some users already
// persisted via the old bug are left alone — that's real user data now).
export function useSubscriptions(): Subscription[] {
    const list = useSyncExternalStore(subscriptionsStore.subscribe, subscriptionsStore.getSnapshot, subscriptionsStore.getServerSnapshot);
    return useMemo(() => withoutUnconfirmedDefaults(list), [list]);
}
