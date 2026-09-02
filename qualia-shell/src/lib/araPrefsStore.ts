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
    /** Voice/TTS prefs — moved here from raw browser-wide localStorage keys
     *  (`dwellium-ara-voice` etc.) so they follow the user across machines. */
    voice: string;
    gender: 'female' | 'male';
    avatar: boolean;
    ttsEnabled: boolean;
    humanize: boolean;
    /** Docked tools-drawer width, px; clamped to SIDE_WIDTH_MIN..MAX. */
    sideWidth: number;
    /** Migration marker — bump when a saved pref must be re-defaulted once. */
    prefsVersion?: number;
}

export const SIDE_WIDTH_MIN = 280;
export const SIDE_WIDTH_MAX = 640;

export const DEFAULT_ARA_PREFS: AraPrefs = {
    streamTokens: true,
    showToolActivity: false,
    holdToTalk: false,
    introSeen: false,
    voice: 'female',
    gender: 'female',
    avatar: false,
    ttsEnabled: true,
    humanize: true,
    sideWidth: 380,
    prefsVersion: 2,
};

const LEGACY_KEY = 'dwellium-ara-prefs';

/** Raw pre-prefs-store keys ARAConsole wrote; adopted once per field, never removed. */
const LEGACY_VOICE_KEYS = {
    voice: 'dwellium-ara-voice',
    gender: 'dwellium-ara-gender',
    avatar: 'dwellium-ara-avatar',
    ttsEnabled: 'dwellium-ara-tts',
    humanize: 'dwellium-ara-humanize',
    sideWidth: 'dwellium-ara-side-w',
} as const;

function resolveKey(): string {
    const uid = araPrefsUserIdHolder.current;
    return uid ? `${LEGACY_KEY}:${uid}` : `${LEGACY_KEY}:_anonymous`;
}

function clampSideWidth(n: unknown): number {
    const v = Number(n);
    return Math.min(SIDE_WIDTH_MAX, Math.max(SIDE_WIDTH_MIN, Number.isFinite(v) && v > 0 ? v : DEFAULT_ARA_PREFS.sideWidth));
}

function readLegacyRaw(key: string): string | null {
    try { return localStorage.getItem(key); } catch { return null; }
}

/** Fill in voice fields the saved value lacks from the raw legacy keys (one-time adoption). */
function adoptLegacyVoice(saved: Partial<AraPrefs>, merged: AraPrefs): void {
    for (const field of Object.keys(LEGACY_VOICE_KEYS) as Array<keyof typeof LEGACY_VOICE_KEYS>) {
        if (saved[field] !== undefined) continue;
        const raw = readLegacyRaw(LEGACY_VOICE_KEYS[field]);
        if (raw === null || raw === '') continue;
        switch (field) {
            case 'voice': merged.voice = raw; break;
            case 'gender': merged.gender = raw === 'male' ? 'male' : 'female'; break;
            case 'avatar': merged.avatar = raw === 'true'; break;
            case 'ttsEnabled': merged.ttsEnabled = raw === 'true'; break;
            case 'humanize': merged.humanize = raw === 'true'; break;
            case 'sideWidth': merged.sideWidth = clampSideWidth(raw); break;
        }
    }
}

function normalize(raw: unknown): AraPrefs {
    if (!raw || typeof raw !== 'object') {
        const merged = { ...DEFAULT_ARA_PREFS };
        adoptLegacyVoice({}, merged);
        return merged;
    }
    const saved = raw as Partial<AraPrefs>;
    const merged: AraPrefs = { ...DEFAULT_ARA_PREFS, ...saved };
    // v2 (046-A3): streamTokens flipped default OFF→ON when real SSE landed.
    // Prefs saved before the flip carry streamTokens:false the user never chose.
    if ((saved.prefsVersion ?? 1) < 2) {
        merged.streamTokens = true;
        merged.prefsVersion = 2;
    }
    adoptLegacyVoice(saved, merged);
    merged.gender = merged.gender === 'male' ? 'male' : 'female';
    merged.sideWidth = clampSideWidth(merged.sideWidth);
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
        return normalize(null);
    }
    try {
        return normalize(JSON.parse(raw));
    } catch {
        return normalize(null);
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
    set<K extends keyof AraPrefs>(flag: K, value: AraPrefs[K]): void {
        persist(normalize({ ...syncedStore.getSnapshot(), [flag]: value }));
    },
    patch(partial: Partial<AraPrefs>): void {
        persist(normalize({ ...syncedStore.getSnapshot(), ...partial }));
    },
    reset(): void {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
        try { localStorage.removeItem(LEGACY_KEY); } catch { /* sandboxed */ }
        syncedStore.reset();
    },
};
