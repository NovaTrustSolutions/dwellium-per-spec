/**
 * speakerSettings — user-tunable speaker-ID knobs, persisted locally so the
 * user can calibrate accuracy: match threshold, top1-vs-top2 margin, the
 * minimum window duration to embed, and the smoothing switch-streak.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { DEFAULT_MATCH_THRESHOLD, DEFAULT_MARGIN } from './speakerLibrary';

export interface SpeakerSettings {
    threshold: number;       // cosine match threshold (0..1)
    margin: number;          // required top1 − top2 gap
    minMs: number;           // minimum window length to embed
    minSwitchStreak: number; // segments a new speaker must win before switching
}

export const SPEAKER_SETTINGS_DEFAULTS: SpeakerSettings = {
    threshold: DEFAULT_MATCH_THRESHOLD,
    margin: DEFAULT_MARGIN,
    minMs: 800,
    minSwitchStreak: 2,
};

const KEY = 'tw:speaker-settings';

function deserialize(raw: string | null): SpeakerSettings {
    if (!raw) return { ...SPEAKER_SETTINGS_DEFAULTS };
    try {
        const p = JSON.parse(raw);
        return {
            threshold: typeof p.threshold === 'number' ? p.threshold : SPEAKER_SETTINGS_DEFAULTS.threshold,
            margin: typeof p.margin === 'number' ? p.margin : SPEAKER_SETTINGS_DEFAULTS.margin,
            minMs: typeof p.minMs === 'number' ? p.minMs : SPEAKER_SETTINGS_DEFAULTS.minMs,
            minSwitchStreak: typeof p.minSwitchStreak === 'number' ? p.minSwitchStreak : SPEAKER_SETTINGS_DEFAULTS.minSwitchStreak,
        };
    } catch {
        return { ...SPEAKER_SETTINGS_DEFAULTS };
    }
}

export const speakerSettingsStore = createLocalStorageStore<SpeakerSettings>({
    key: KEY,
    deserializer: deserialize,
    defaultValue: SPEAKER_SETTINGS_DEFAULTS,
});

export function getSpeakerSettings(): SpeakerSettings {
    return speakerSettingsStore.getSnapshot();
}

export function updateSpeakerSettings(patch: Partial<SpeakerSettings>): void {
    const next = { ...speakerSettingsStore.getSnapshot(), ...patch };
    speakerSettingsStore.set(next, () => {
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

export function resetSpeakerSettings(): void {
    speakerSettingsStore.set({ ...SPEAKER_SETTINGS_DEFAULTS }, () => {
        try { localStorage.removeItem(KEY); } catch { /* sandboxed */ }
    });
}
