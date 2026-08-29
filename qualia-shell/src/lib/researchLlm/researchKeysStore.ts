/**
 * researchKeysStore — per-user API keys for the Research Lab's free providers.
 *
 * SEPARATE NAMESPACE from integrationsStore's main LLM keys on purpose: the
 * main llmClient/ARA must never see these keys, and this store must never
 * touch the main integrations bundle (asserted by researchLabImportGuard.test.ts).
 *
 * remoteMachinesStore sister shape: dynamic-key `createLocalStorageStore`
 * keyed off a perUserIdentity holder + One Save `withSync('researchKeys')`
 * (keys sync encrypted with the account like the app's other One Save
 * objects), incl. `.reset()`.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../oneSaveStore';
import { researchKeysUserIdHolder } from '../perUserIdentity';

/** providerId → API key (plain in-memory; One Save transports ciphertext). */
export type ResearchKeys = Record<string, string>;

export { researchKeysUserIdHolder };

function resolveKey(): string {
    const uid = researchKeysUserIdHolder.current;
    return uid ? `researchKeys:${uid}` : 'researchKeys:_anonymous';
}

function deserialize(raw: string | null): ResearchKeys {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        const out: ResearchKeys = {};
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string' && v) out[k] = v;
        }
        return out;
    } catch {
        return {};
    }
}

export const researchKeysStore = withSync(
    createLocalStorageStore<ResearchKeys>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: {},
    }),
    { objectType: 'researchKeys', holder: researchKeysUserIdHolder, resolveKey },
);

function persist(next: ResearchKeys): void {
    researchKeysStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function setResearchKey(providerId: string, key: string): void {
    const trimmed = key.trim();
    const next = { ...researchKeysStore.getSnapshot() };
    if (trimmed) next[providerId] = trimmed;
    else delete next[providerId];
    persist(next);
}

export function getResearchKey(providerId: string): string {
    return researchKeysStore.getSnapshot()[providerId] ?? '';
}

/** Test escape hatch (v2.72.1 standing convention). */
export function resetResearchKeys(): void {
    researchKeysStore.reset();
}
