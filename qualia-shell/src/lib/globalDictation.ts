/**
 * globalDictation — plan 053 "Dictation to 100%" target 4: the built-in
 * (any-platform, no-install) dictation engine behind the global hotkey.
 * Classifies the focused element, starts a Web Speech API session (reusing
 * ARA's injected-constructor pattern from araDictation.ts), and types the
 * transcript into the field:
 *   - <input>/<textarea>  → native prototype value setter + bubbling 'input'
 *     event (repo prior art: Scribe IDocEditor.tsx `setTextareaValue`) so
 *     React-controlled fields see the change; interim results stream live.
 *   - contenteditable     → `document.execCommand('insertText')` per FINAL
 *     segment (execCommand is deprecated-but-universal for CE insertion;
 *     falls back to a text node + 'input' event where it is missing).
 */
import {
    startDictation,
    type DictationSession,
    type SpeechRecognitionCtor,
    type SpeechRecognitionLike,
} from '../components/ARAConsole/araDictation';

export type { DictationSession } from '../components/ARAConsole/araDictation';
export { getSpeechRecognitionCtor } from '../components/ARAConsole/araDictation';

export type FieldMode = 'value' | 'contenteditable';

/** Text-like input types worth dictating into. No password (never voice a secret), no number/date/etc. */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'url', 'tel']);

/** What kind of dictation target the element is, or null when not dictatable. */
export function classifyField(el: Element | null): FieldMode | null {
    if (!el) return null;
    if (el instanceof HTMLTextAreaElement) return el.disabled || el.readOnly ? null : 'value';
    if (el instanceof HTMLInputElement) {
        return !el.disabled && !el.readOnly && TEXT_INPUT_TYPES.has(el.type) ? 'value' : null;
    }
    return (el as HTMLElement).isContentEditable ? 'contenteditable' : null;
}

/** Set a React-controlled input/textarea from outside (native setter + input event → onChange fires). */
export function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Insert text into a contenteditable at the caret (execCommand), with a plain-append fallback. */
export function insertIntoContentEditable(el: HTMLElement, text: string): void {
    el.focus();
    let ok = false;
    try {
        ok = typeof document.execCommand === 'function' && document.execCommand('insertText', false, text);
    } catch {
        ok = false;
    }
    if (!ok) {
        el.appendChild(document.createTextNode(text));
        el.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

/**
 * Start a dictation session that types into `el`. Returns null when the
 * element is not dictatable or the recognizer refuses to start. `onEnd` fires
 * exactly when the session is over (user stop, recognizer end, or error).
 */
export function startFieldDictation(
    Ctor: SpeechRecognitionCtor,
    el: HTMLElement,
    onEnd: () => void,
): DictationSession | null {
    const mode = classifyField(el);
    if (!mode) return null;

    if (mode === 'value') {
        const field = el as HTMLInputElement | HTMLTextAreaElement;
        // Full reuse of ARA's session logic: cumulative base+finals+interim → value.
        return startDictation(Ctor, field.value, {
            onText: (t) => setNativeValue(field, t),
            onEnd,
        });
    }

    // ponytail: contenteditable gets finals-only insertion (interim streaming
    // would need revisable-region tracking inside arbitrary rich DOM); upgrade
    // path is a marker-node region if live preview in CE ever matters.
    let rec: SpeechRecognitionLike;
    try {
        rec = new Ctor();
    } catch {
        return null;
    }
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = 'en-US';
    rec.onresult = (ev) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) {
                const segment = r[0].transcript.trim();
                if (segment) insertIntoContentEditable(el, `${segment} `);
            }
        }
    };
    rec.onend = () => onEnd();
    rec.onerror = () => { try { rec.stop(); } catch { /* already stopped */ } onEnd(); };
    try {
        rec.start();
    } catch {
        return null;
    }
    return { stop: () => { try { rec.stop(); } catch { /* already stopped */ } } };
}
