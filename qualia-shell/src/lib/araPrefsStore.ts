/**
 * araPrefsStore — ARA console UX preferences (assessment sweep 2026-06-12,
 * upgrade #6 + #10; per-USER since 2026-08-28 per Ilya: "make linked to user").
 *
 *   streamTokens     — render replies token-by-token (lib/llmStream + /chat/stream).
 *   showToolActivity — show a "running: web search…" activity line.
 *   holdToTalk       — push-to-talk mic loop feeding the composer.
 *   introSeen        — the ARA intro video has ended or been skipped once
 *                      (045-D1c: once per USER — now truly per user, synced).
 *
 * Storage: dynamic-key `createLocalStorageStore` (`dwellium-ara-prefs:<userId>`)
 * + One Save `withSync('araPrefs')` — remoteMachinesStore sister shape — so the
 * prefs follow the account to any machine. One-time adoption: the legacy
 * device-local `dwellium-ara-prefs` value seeds a user's first read, so nobody's
 * existing toggles reset on upgrade. Public API unchanged
 * (subscribe/getSnapshot/getServerSnapshot/set/reset).
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { araPrefsUserIdHolder } from './perUserIdentity';

export interface AraPrefs {
    streamTokens: boolean;
    showToolActivity: boolean;
    holdToTalk: boolean;
    introSeen: boolean;
    /** Migration marker — bump when a saved pref must be re-defaulted once. */
    prefsVersion?: number;
}

export const DEFAULT_ARA_PREFS: AraPrefs = {
    streamTokens: true,
    showToolActivity: false,
    holdToTalk: false,
    introSeen: false,
    prefsVersion: 2,
};

const LEGACY_KEY = 'dwellium-ara-prefs';

function resolveKey(): string {
    const uid = araPrefsUserIdHolder.current;
    return uid ? `${LEGACY_KEY}:${uid}` : `${LEGACY_KEY}:_anonymous`;
}

function normalize(raw: unknown): AraPrefs {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_ARA_PREFS };
    const saved = raw as Partial<AraPrefs>;
    const merged: AraPrefs = { ...DEFAULT_ARA_PREFS, ...saved };
    // v2 (046-A3): streamTokens flipped default OFF→ON when real SSE landed.
    // Prefs saved before the flip carry streamTokens:false the user never chose.
    if ((saved.prefsVersion ?? 1) < 2) {
        merged.streamTokens = true;
        merged.prefsVersion = 2;
    }
    return merged;
}

function deserialize(raw: string | null): AraPrefs {
    // One-time adoption of the pre-per-user device-local value: a user whose
    // per-user key is empty inherits this device's old toggles instead of defaults.
    if (!raw) {
        try {
            const legacy = localStorage.getItem(LEGACY_KEY);
            if (legacy) return normalize(JSON.parse(legacy));
        } catch { /* sandboxed / corrupt */ }
        return { ...DEFAULT_ARA_PREFS };
    }
    try {
        return normalize(JSON.parse(raw));
    } catch {
        return { ...DEFAULT_ARA_PREFS };
    }
}

const syncedStore = withSync(
    createLocalStorageStore<AraPrefs>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: { ...DEFAULT_ARA_PREFS },
    }),
    { objectType: 'araPrefs', holder: araPrefsUserIdHolder, resolveKey },
);

function persist(next: AraPrefs): void {
    syncedStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export const araPrefsStore = {
    subscribe(l: () => void): () => void { return syncedStore.subscribe(l); },
    getSnapshot(): AraPrefs { return syncedStore.getSnapshot(); },
    getServerSnapshot(): AraPrefs { return DEFAULT_ARA_PREFS; },
    set(flag: keyof AraPrefs, value: boolean): void {
        persist({ ...syncedStore.getSnapshot(), [flag]: value });
    },
    reset(): void {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* sandboxed */ }
        syncedStore.reset();
    },
};
