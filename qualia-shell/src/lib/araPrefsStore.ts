/**
 * araPrefsStore — ARA console UX preferences (assessment sweep 2026-06-12,
 * upgrade #6 + #10). Per-device flags, default OFF so ARA behaves exactly as
 * today until the user opts in and the matching console wiring lands:
 *
 *   streamTokens     — render replies token-by-token (uses lib/llmStream).
 *   showToolActivity — show a "running: web search…" activity line.
 *   holdToTalk       — push-to-talk mic loop (reuses TranscriptionHub's
 *                      SpeechRecognition) feeding the composer.
 *
 * useSyncExternalStore-shaped + `.reset()` per repo convention.
 */

export interface AraPrefs {
    streamTokens: boolean;
    showToolActivity: boolean;
    holdToTalk: boolean;
}

export const DEFAULT_ARA_PREFS: AraPrefs = {
    streamTokens: false,
    showToolActivity: false,
    holdToTalk: false,
};

const STORAGE_KEY = 'dwellium-ara-prefs';

function read(): AraPrefs {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return DEFAULT_ARA_PREFS;
        return { ...DEFAULT_ARA_PREFS, ...(JSON.parse(raw) as Partial<AraPrefs>) };
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
