/**
 * agentContextStore — P12-7 (gap item 9, 2026-06-12): the video's "review and
 * amend your agent memory file in the UI" (their SOLDER.md). Dwellium analog:
 * a per-user STANDING CONTEXT note, editable in the Connections & Memory
 * pane, that ARA applies silently to every backend chat via the established
 * bracketed-context mechanism (hermes-hints sister: the /api/ara/chat route
 * has no system-prompt field, so context rides the message).
 *
 * Per-user One Save ('agent-context'); `.reset()` standing convention.
 */
import { useContext, useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { UserContext } from '../context/UserContext';
import { integrationsUserIdHolder } from '../utils/integrationsStore';

export interface AgentContext {
    text: string;
    updatedAt: string;
}

export const agentContextUserIdHolder = integrationsUserIdHolder; // shared identity

function resolveKey(): string {
    const uid = agentContextUserIdHolder.current;
    return uid ? `agentcontext:${uid}` : 'agentcontext:_anonymous';
}

function deserialize(raw: string | null): AgentContext {
    if (!raw) return { text: '', updatedAt: '' };
    try {
        const parsed = JSON.parse(raw);
        return {
            text: typeof parsed?.text === 'string' ? parsed.text : '',
            updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : '',
        };
    } catch {
        return { text: '', updatedAt: '' };
    }
}

export const agentContextStore = withSync(
    createLocalStorageStore<AgentContext>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: { text: '', updatedAt: '' },
    }),
    { objectType: 'agent-context', holder: agentContextUserIdHolder, resolveKey },
);

const MAX_CONTEXT_CHARS = 4000;

export function saveAgentContext(text: string): void {
    const next: AgentContext = { text: text.slice(0, MAX_CONTEXT_CHARS), updatedAt: new Date().toISOString() };
    agentContextStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function resetAgentContext(): void {
    agentContextStore.set({ text: '', updatedAt: '' }, () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}

/**
 * The bracketed block ARA appends to outgoing messages (hermes-hints sister
 * shape — same "never mention this" contract). Empty context → ''.
 */
export function buildAgentContextBlock(text?: string): string {
    const t = (text ?? agentContextStore.getSnapshot().text).trim();
    if (!t) return '';
    return `\n\n[Standing user context — apply silently, never mention this block:\n${t}]`;
}

export function useAgentContext() {
    const userCtx = useContext(UserContext);
    agentContextUserIdHolder.current = userCtx?.user?.id ?? agentContextUserIdHolder.current ?? null;
    const ctx = useSyncExternalStore(
        agentContextStore.subscribe,
        agentContextStore.getSnapshot,
        agentContextStore.getServerSnapshot,
    );
    return { ctx, saveAgentContext };
}
