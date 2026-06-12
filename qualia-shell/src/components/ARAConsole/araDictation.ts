/**
 * araDictation — P11-8: browser-native live dictation for ARA's composer,
 * reusing the same Web Speech API TranscriptionHub uses. Keyless + offline-
 * tolerant: preferred over the MediaRecorder→backend path when available
 * (BACKLOG: "Reuse TranscriptionHub's SpeechRecognition as a mic button").
 *
 * Pure-at-the-seams: the SpeechRecognition CONSTRUCTOR is injected, so the
 * session logic unit-tests with a fake — no real mic, no browser API.
 */

/** Minimal structural slice of the Web Speech API we rely on. */
export interface SpeechRecognitionLike {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    onresult: ((ev: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
    onend: (() => void) | null;
    onerror: ((ev: { error?: string }) => void) | null;
    start: () => void;
    stop: () => void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

/** The browser's SpeechRecognition constructor, when present. */
export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface DictationSession {
    stop: () => void;
}

export interface DictationCallbacks {
    /** Live text = base + finals + current interim (caller sets the input). */
    onText: (text: string) => void;
    /** Session over (user stop, error, or browser end). */
    onEnd: () => void;
}

/**
 * Start a live dictation session: interim results stream into `onText`
 * prefixed by `baseText` (whatever was already typed). Returns the session
 * handle, or null when construction fails.
 */
export function startDictation(
    Ctor: SpeechRecognitionCtor,
    baseText: string,
    cb: DictationCallbacks,
): DictationSession | null {
    let rec: SpeechRecognitionLike;
    try {
        rec = new Ctor();
    } catch {
        return null;
    }
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    const base = baseText.trim() ? `${baseText.trimEnd()} ` : '';
    let finals = '';
    rec.onresult = (ev) => {
        let interim = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) finals += `${r[0].transcript.trim()} `;
            else interim += r[0].transcript;
        }
        cb.onText((base + finals + interim).trimEnd());
    };
    rec.onend = () => cb.onEnd();
    rec.onerror = () => { try { rec.stop(); } catch { /* already stopped */ } cb.onEnd(); };
    try {
        rec.start();
    } catch {
        return null;
    }
    return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}
