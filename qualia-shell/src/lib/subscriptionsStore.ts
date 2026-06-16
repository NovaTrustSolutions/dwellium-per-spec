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
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { integrationsUserIdHolder, integrationsStore } from '../utils/integrationsStore';

export interface Subscription {
    id: string;
    name: string;     // e.g. "Claude Max 20x"
    vendor: string;   // e.g. "Anthropic"
    monthly: number;  // USD / month (0 for credit/PAYG)
}

function resolveKey(): string {
    const uid = integrationsUserIdHolder.current;
    return uid ? `subscriptions:${uid}` : 'subscriptions:_anonymous';
}

// Sensible default reflecting a common stack; the user edits these to match
// their real plans, at which point the figure is exactly their spend.
function defaults(): Subscription[] {
    return [
        { id: 'claude-max', name: 'Claude Max 20x', vendor: 'Anthropic', monthly: 200 },
        { id: 'chatgpt-plus', name: 'ChatGPT Plus', vendor: 'OpenAI', monthly: 20 },
        { id: 'codex', name: 'Codex', vendor: 'OpenAI · CLI', monthly: 0 },
    ];
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

export const subscriptionsStore = createLocalStorageStore<Subscription[]>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: defaults(),
});

export function saveSubscriptions(list: Subscription[]): void {
    subscriptionsStore.set(list, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(list)); } catch { /* sandboxed */ }
    });
}

export function monthlyTotal(list: Subscription[]): number {
    return list.reduce((s, x) => s + (Number(x.monthly) || 0), 0);
}

export function useSubscriptions(): Subscription[] {
    const list = useSyncExternalStore(subscriptionsStore.subscribe, subscriptionsStore.getSnapshot, subscriptionsStore.getServerSnapshot);
    const integrations = useSyncExternalStore(integrationsStore.subscribe, integrationsStore.getSnapshot, integrationsStore.getServerSnapshot);
    
    const hasGoogleKey = !!(integrations?.llm?.gemini?.enabled && integrations?.llm?.gemini?.apiKey);
    const hasGoogleSub = list.some(s => s.id === 'google-max');
    if (hasGoogleKey && !hasGoogleSub) {
        return [
            ...list,
            { id: 'google-max', name: 'Google Max plan', vendor: 'Google', monthly: 200 }
        ];
    }
    return list;
}
