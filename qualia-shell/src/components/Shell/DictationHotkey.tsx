/**
 * DictationHotkey — plan 053 "Dictation to 100%" target 4: the built-in,
 * any-platform dictation fallback (the gap report scored non-Mac dictation
 * 0%). Press the per-user hotkey (default ⌥D, configurable in Control Panel →
 * Dictation) with a text field focused and the Web Speech API types the
 * transcript into it; press again to stop. Mounted once in AdminShell
 * (TagHotkey sister). Honest states: a transient bubble explains when the
 * browser has no SpeechRecognition (e.g. Firefox) or no field is focused.
 */
import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import {
    matchesHotkey, formatHotkey, useDictationHotkey, useDictationIdentity,
} from '../../lib/dictationHotkeyStore';
import {
    classifyField, getSpeechRecognitionCtor, startFieldDictation, type DictationSession,
} from '../../lib/globalDictation';

const BUBBLE_MS = 3200;

export default function DictationHotkey() {
    useDictationIdentity();
    const hotkey = useDictationHotkey();
    const [listening, setListening] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const sessionRef = useRef<DictationSession | null>(null);
    const hotkeyRef = useRef(hotkey);
    hotkeyRef.current = hotkey;
    const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const flash = (msg: string) => {
            setNotice(msg);
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
            noticeTimer.current = setTimeout(() => setNotice(null), BUBBLE_MS);
        };
        const endSession = () => { // idempotent — recognizer may fire end+error
            sessionRef.current = null;
            setListening(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (!matchesHotkey(e, hotkeyRef.current)) return;
            e.preventDefault();
            e.stopPropagation();
            if (sessionRef.current) {
                sessionRef.current.stop(); // endSession runs via onEnd
                return;
            }
            const Ctor = getSpeechRecognitionCtor();
            if (!Ctor) {
                flash('Dictation is not supported in this browser — try Chrome or Edge, or use FluidVoice on a Mac.');
                return;
            }
            const target = document.activeElement;
            if (!classifyField(target)) {
                flash(`Click into a text field, then press ${formatHotkey(hotkeyRef.current)} to dictate.`);
                return;
            }
            const session = startFieldDictation(Ctor, target as HTMLElement, endSession);
            if (!session) {
                flash('Could not start dictation — the microphone may be blocked.');
                return;
            }
            sessionRef.current = session;
            setListening(true);
        };
        window.addEventListener('keydown', onKey, true);
        return () => {
            window.removeEventListener('keydown', onKey, true);
            sessionRef.current?.stop();
            if (noticeTimer.current) clearTimeout(noticeTimer.current);
        };
    }, []);

    if (!listening && !notice) return null;

    const pillStyle: React.CSSProperties = {
        position: 'fixed', bottom: 18, left: '50%', transform: 'translateX(-50%)', zIndex: 9999,
        display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
        background: 'var(--bg-secondary, #1a1a1a)', border: '1px solid var(--border, #333)',
        color: 'var(--text-primary, #eee)', fontSize: 12, boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
        pointerEvents: 'none',
    };

    return (
        <div role="status" style={pillStyle} data-testid="dictation-hotkey-pill">
            <Mic size={13} aria-hidden style={listening ? { color: 'var(--accent, #d6fe51)' } : undefined} />
            {listening
                ? <span>Listening — press {formatHotkey(hotkey)} to stop.</span>
                : <span>{notice}</span>}
        </div>
    );
}
