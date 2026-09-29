/**
 * agentActivityStore — last run per agent source (plan 071 phase 3).
 *
 * Recorded at the LLM chokepoints (llmClient.callLlm, llmStream) for every call
 * that carries a `source`, success or failure. The Hive reads it to show "last
 * run", an error state and a one-line output preview per agent.
 *
 * Storage key: agent-activity:<userId> (fallback :_anonymous). Local to this
 * device on purpose.
 * ponytail: not One Save synced — "last run on this device" is enough for a
 * status card; add withSync + a newest-wins merge if cross-device status matters.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { agentActivityUserIdHolder } from './perUserIdentity';
import { isSensitiveFact } from './sensitiveText';

export interface AgentActivity {
    source: string;
    lastRunAt: number;
    ok: boolean;
    /** Short error message when ok === false. */
    error?: string;
    /** First ~140 chars of the response; replaced when it looks like a secret. */
    snippet?: string;
}

export type AgentActivityMap = Record<string, AgentActivity>;

export { agentActivityUserIdHolder };

const SNIPPET_MAX = 140;
const ERROR_MAX = 120;
export const HIDDEN_SNIPPET = '(preview hidden — looks like a secret or personal data)';

function resolveKey(): string {
    const uid = agentActivityUserIdHolder.current;
    return uid ? `agent-activity:${uid}` : 'agent-activity:_anonymous';
}

function deserialize(raw: string | null): AgentActivityMap {
    if (!raw) return {};
    try {
        const o = JSON.parse(raw);
        if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
        const out: AgentActivityMap = {};
        for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
            const a = v as Partial<AgentActivity>;
            if (a && typeof a.lastRunAt === 'number' && typeof a.ok === 'boolean') out[k] = { ...a, source: k } as AgentActivity;
        }
        return out;
    } catch {
        return {};
    }
}

export const agentActivityStore = createLocalStorageStore<AgentActivityMap>({
    key: resolveKey,
    deserializer: deserialize,
    defaultValue: {},
});

/** The owner right now — call BEFORE awaiting the provider (same contract as currentUsageUserId). */
export function currentAgentActivityUserId(): string | null {
    return agentActivityUserIdHolder.current;
}

function clip(s: string, max: number): string {
    const t = s.replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Record one call. Dropped when `userId` (captured before the await) no longer
 * matches the current owner, so an in-flight call never writes into the next
 * account. Never throws — recording can't break a call.
 */
export function recordAgentActivity(input: { source?: string; ok: boolean; text?: string; error?: string; userId: string | null; now?: number }): void {
    try {
        if (typeof window === 'undefined' || !input.source) return;
        if (input.userId !== agentActivityUserIdHolder.current) return;
        const entry: AgentActivity = { source: input.source, lastRunAt: input.now ?? Date.now(), ok: input.ok };
        if (!input.ok && input.error) entry.error = clip(input.error, ERROR_MAX);
        if (input.ok && input.text) {
            const snip = clip(input.text, SNIPPET_MAX);
            entry.snippet = isSensitiveFact(snip) ? HIDDEN_SNIPPET : snip; // check what is shown, not the whole answer
        }
        const next = { ...agentActivityStore.getSnapshot(), [input.source]: entry };
        agentActivityStore.set(next, () => {
            try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed / full */ }
        });
    } catch { /* never break the caller */ }
}

export function useAgentActivity(): AgentActivityMap {
    return useSyncExternalStore(agentActivityStore.subscribe, agentActivityStore.getSnapshot, agentActivityStore.getServerSnapshot);
}
