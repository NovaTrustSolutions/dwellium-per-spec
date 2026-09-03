/**
 * stellaPrefsStore — Stella voice prefs (feat/settings-follow-login): per-USER
 * + One Save synced, so they are identical on every machine after login.
 * Sister of araPrefsStore (same shape: dynamic key + withSync + normalize +
 * one-time legacy adoption).
 *
 *   voice       — TTS voice id from TTS_VOICE_CATALOG (StellaAgent default 'openai-alloy').
 *   ttsEnabled  — speak Stella replies aloud (default OFF).
 *   humanize    — prepend HUMANIZE_PREFIX to outgoing prompts (default ON).
 *
 * Storage: dynamic-key `createLocalStorageStore` (`dwellium-stella-prefs:<userId>`)
 * + `withSync('stellaPrefs')`. One-time adoption: the raw browser-wide keys
 * StellaAgent used to write (`dwellium-stella-voice` / `-tts` / `-humanize`)
 * seed any field the per-user value lacks. The raw keys are never removed and a
 * value the user already saved per-user is never reset.
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { stellaPrefsUserIdHolder } from './perUserIdentity';

export interface StellaPrefs {
    voice: string;
    ttsEnabled: boolean;
    humanize: boolean;
}

export const DEFAULT_STELLA_PREFS: StellaPrefs = {
    voice: 'openai-alloy',
    ttsEnabled: false,
    humanize: true,
};

const KEY_PREFIX = 'dwellium-stella-prefs';

/** Raw pre-store keys StellaAgent wrote; adopted once per field, never removed. */
const LEGACY_KEYS = {
    voice: 'dwellium-stella-voice',
    ttsEnabled: 'dwellium-stella-tts',
    humanize: 'dwellium-stella-humanize',
} as const;

function resolveKey(): string {
    const uid = stellaPrefsUserIdHolder.current;
    return uid ? `${KEY_PREFIX}:${uid}` : `${KEY_PREFIX}:_anonymous`;
}

function readLegacyRaw(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

/** Fill in fields the saved value lacks from the raw legacy keys (one-time adoption). */
function adoptLegacy(saved: Partial<StellaPrefs>, merged: StellaPrefs): void {
    for (const field of Object.keys(LEGACY_KEYS) as Array<keyof typeof LEGACY_KEYS>) {
        if (saved[field] !== undefined) continue;
        const raw = readLegacyRaw(LEGACY_KEYS[field]);
        if (raw === null || raw === '') continue;
        switch (field) {
            case 'voice': merged.voice = raw; break;
            case 'ttsEnabled': merged.ttsEnabled = raw === 'true'; break;
            case 'humanize': merged.humanize = raw === 'true'; break;
        }
    }
}

function normalize(raw: unknown): StellaPrefs {
    const saved: Partial<StellaPrefs> = raw && typeof raw === 'object' ? (raw as Partial<StellaPrefs>) : {};
    const merged: StellaPrefs = { ...DEFAULT_STELLA_PREFS, ...saved };
    adoptLegacy(saved, merged);
    if (!merged.voice) merged.voice = DEFAULT_STELLA_PREFS.voice; // legacy `getItem(...) || 'openai-alloy'`
    return merged;
}

function deserialize(raw: string | null): StellaPrefs {
    // ponytail: no static-key JSON predecessor to adopt (ARA had `dwellium-ara-prefs`; Stella never did).
    if (!raw) return normalize(null);
    try { return normalize(JSON.parse(raw)); } catch { return normalize(null); }
}

const syncedStore = withSync(
    createLocalStorageStore<StellaPrefs>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: { ...DEFAULT_STELLA_PREFS },
    }),
    { objectType: 'stellaPrefs', holder: stellaPrefsUserIdHolder, resolveKey },
);

function persist(next: StellaPrefs): void {
    syncedStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export const stellaPrefsStore = {
    subscribe(l: () => void): () => void { return syncedStore.subscribe(l); },
    getSnapshot(): StellaPrefs { return syncedStore.getSnapshot(); },
    getServerSnapshot(): StellaPrefs { return DEFAULT_STELLA_PREFS; },
    set<K extends keyof StellaPrefs>(field: K, value: StellaPrefs[K]): void {
        persist(normalize({ ...syncedStore.getSnapshot(), [field]: value }));
    },
    /** Clears the per-user value only — the raw legacy keys are never removed. */
    reset(): void {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
        syncedStore.reset();
    },
};
