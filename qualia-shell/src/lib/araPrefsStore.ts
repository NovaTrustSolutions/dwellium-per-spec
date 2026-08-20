/**
 * araPrefsStore — ARA console UX preferences (assessment sweep 2026-06-12,
 * upgrade #6 + #10). Per-device flags. `streamTokens` defaults ON since plan
 * 046-A3/A4 (real SSE landed); the rest default OFF until their console wiring
 * lands:
 *
 *   streamTokens     — render replies token-by-token (lib/llmStream + /chat/stream).
 *   showToolActivity — show a "running: web search…" activity line.
 *   holdToTalk       — push-to-talk mic loop (reuses TranscriptionHub's
 *                      SpeechRecognition) feeding the composer.
 *   introSeen        — the ARA intro video has ended or been skipped once on
 *                      this device (045-D1c: once per user, not per session).
 *
 * useSyncExternalStore-shaped + `.reset()` per repo convention.
 */

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

const STORAGE_KEY = 'dwellium-ara-prefs';

function read(): AraPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_ARA_PREFS;
        const saved = JSON.parse(raw) as Partial<AraPrefs>;
        // v2 (046-A3): streamTokens flipped default OFF→ON when real SSE landed.
        // Prefs saved before the flip carry streamTokens:false the user never
        // chose — re-default ONCE; later explicit toggles keep prefsVersion 2.
        if ((saved.prefsVersion ?? 1) < 2) {
            saved.streamTokens = true;
            saved.prefsVersion = 2;
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* quota */ }
        }
        return { ...DEFAULT_ARA_PREFS, ...saved };
    } catch {
        return DEFAULT_ARA_PREFS;
    }
}

let current: AraPrefs = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const araPrefsStore = {
    subscribe(l: () => void): () => void {
        listeners.add(l);
        return () => { listeners.delete(l); };
    },
    getSnapshot(): AraPrefs { return current; },
    getServerSnapshot(): AraPrefs { return DEFAULT_ARA_PREFS; },
    set(flag: keyof AraPrefs, value: boolean): void {
        current = { ...current, [flag]: value };
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)); } catch { /* sandboxed */ }
        emit();
    },
    reset(): void {
        current = DEFAULT_ARA_PREFS;
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* sandboxed */ }
        emit();
    },
};
