/**
 * DictationHotkey + globalDictation + dictationHotkeyStore — plan 053
 * target 4: the built-in any-platform dictation. Fake SpeechRecognition
 * constructor (araDictation pattern — no mic, no browser API), so the tests
 * cover: store defaults/persistence, hotkey matching, field classification,
 * native-setter insertion, contenteditable insertion, and the global
 * component's honest unsupported/no-field states.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import DictationHotkey from '../components/Shell/DictationHotkey';
import {
    DEFAULT_DICTATION_HOTKEY, dictationHotkeyStore, dictationUserIdHolder,
    eventToHotkey, formatHotkey, matchesHotkey, setDictationHotkey,
} from '../lib/dictationHotkeyStore';
import {
    classifyField, insertIntoContentEditable, setNativeValue, startFieldDictation,
} from '../lib/globalDictation';
import type { SpeechRecognitionLike } from '../components/ARAConsole/araDictation';

class FakeSR implements SpeechRecognitionLike {
    static instances: FakeSR[] = [];
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: SpeechRecognitionLike['onresult'] = null;
    onend: (() => void) | null = null;
    onerror: SpeechRecognitionLike['onerror'] = null;
    started = 0;
    stopped = 0;
    constructor() { FakeSR.instances.push(this); }
    start() { this.started++; }
    stop() { this.stopped++; this.onend?.(); }
}

function emit(rec: FakeSR, results: Array<{ final: boolean; text: string }>, resultIndex = 0) {
    rec.onresult?.({
        resultIndex,
        results: results.map(r => ({ isFinal: r.final, 0: { transcript: r.text } })) as never,
    });
}

beforeEach(() => {
    localStorage.clear();
    dictationHotkeyStore.reset();
    dictationUserIdHolder.current = null;
    FakeSR.instances = [];
});

afterEach(() => {
    delete (window as { SpeechRecognition?: unknown }).SpeechRecognition;
});

const pressDefault = () => fireEvent.keyDown(window, { code: 'KeyD', altKey: true });

describe('dictationHotkeyStore', () => {
    it('defaults to ⌥D and persists per user namespace', () => {
        expect(dictationHotkeyStore.getSnapshot()).toEqual(DEFAULT_DICTATION_HOTKEY);
        expect(formatHotkey(DEFAULT_DICTATION_HOTKEY)).toBe('⌥D');
        setDictationHotkey({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: true, code: 'KeyM' });
        expect(JSON.parse(localStorage.getItem('dictation-hotkey:_anonymous')!)).toMatchObject({ code: 'KeyM', ctrlKey: true, shiftKey: true });

        // switching users switches the namespace (dynamic key)
        dictationUserIdHolder.current = 'user-andy';
        expect(dictationHotkeyStore.getSnapshot()).toEqual(DEFAULT_DICTATION_HOTKEY); // Andy never rebound
        setDictationHotkey({ ...DEFAULT_DICTATION_HOTKEY, code: 'KeyJ' });
        expect(localStorage.getItem('dictation-hotkey:user-andy')).toContain('KeyJ');
        dictationUserIdHolder.current = null;
        expect(dictationHotkeyStore.getSnapshot().code).toBe('KeyM'); // anonymous binding untouched
    });

    it('deserializes garbage back to the default', () => {
        localStorage.setItem('dictation-hotkey:_anonymous', '{"nope":true}');
        dictationHotkeyStore.reset();
        expect(dictationHotkeyStore.getSnapshot()).toEqual(DEFAULT_DICTATION_HOTKEY);
    });

    it('matchesHotkey requires exact modifiers; eventToHotkey rejects modifier-only and bare keys', () => {
        const hk = DEFAULT_DICTATION_HOTKEY;
        expect(matchesHotkey({ code: 'KeyD', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, hk)).toBe(true);
        expect(matchesHotkey({ code: 'KeyD', altKey: true, ctrlKey: true, metaKey: false, shiftKey: false }, hk)).toBe(false);
        expect(matchesHotkey({ code: 'KeyE', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false }, hk)).toBe(false);
        expect(eventToHotkey({ code: 'AltLeft', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
        expect(eventToHotkey({ code: 'KeyX', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull();
        expect(eventToHotkey({ code: 'Digit1', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false }))
            .toEqual({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, code: 'Digit1' });
    });
});

describe('globalDictation field handling', () => {
    it('classifyField: textarea + text-like inputs + contenteditable yes; password/disabled/readonly/none no', () => {
        const ta = document.createElement('textarea');
        expect(classifyField(ta)).toBe('value');
        ta.readOnly = true;
        expect(classifyField(ta)).toBeNull();

        const input = document.createElement('input');
        input.type = 'text';
        expect(classifyField(input)).toBe('value');
        input.type = 'password';
        expect(classifyField(input)).toBeNull(); // never dictate a secret aloud
        input.type = 'search';
        input.disabled = true;
        expect(classifyField(input)).toBeNull();

        const ce = document.createElement('div');
        Object.defineProperty(ce, 'isContentEditable', { value: true });
        expect(classifyField(ce)).toBe('contenteditable');
        expect(classifyField(document.createElement('div'))).toBeNull();
        expect(classifyField(null)).toBeNull();
    });

    it('setNativeValue uses the prototype setter and fires a bubbling input event', () => {
        const ta = document.createElement('textarea');
        document.body.appendChild(ta);
        const seen: string[] = [];
        document.body.addEventListener('input', (e) => seen.push((e.target as HTMLTextAreaElement).value));
        setNativeValue(ta, 'work order for H12');
        expect(ta.value).toBe('work order for H12');
        expect(seen).toEqual(['work order for H12']);
        ta.remove();
    });

    it('insertIntoContentEditable prefers execCommand and falls back to a text node + input event', () => {
        const ce = document.createElement('div');
        document.body.appendChild(ce);
        // execCommand path
        const exec = vi.fn().mockReturnValue(true);
        (document as { execCommand?: unknown }).execCommand = exec;
        insertIntoContentEditable(ce, 'make-ready ');
        expect(exec).toHaveBeenCalledWith('insertText', false, 'make-ready ');
        expect(ce.textContent).toBe(''); // execCommand handled it (mocked)
        // fallback path (jsdom reality: no execCommand)
        delete (document as { execCommand?: unknown }).execCommand;
        const inputs = vi.fn();
        ce.addEventListener('input', inputs);
        insertIntoContentEditable(ce, 'turnover ');
        expect(ce.textContent).toBe('turnover ');
        expect(inputs).toHaveBeenCalledTimes(1);
        ce.remove();
    });

    it('startFieldDictation streams cumulative transcript into a textarea via the native setter', () => {
        const ta = document.createElement('textarea');
        ta.value = 'note ';
        document.body.appendChild(ta);
        const onEnd = vi.fn();
        const session = startFieldDictation(FakeSR, ta, onEnd)!;
        expect(session).toBeTruthy();
        const rec = FakeSR.instances[0];
        expect(rec.continuous).toBe(true);
        expect(rec.interimResults).toBe(true); // live interim streaming for value fields
        emit(rec, [{ final: false, text: 'send work' }]);
        expect(ta.value).toBe('note send work');
        emit(rec, [{ final: true, text: 'send work order' }]);
        expect(ta.value).toBe('note send work order');
        session.stop();
        expect(onEnd).toHaveBeenCalled();
        ta.remove();
    });

    it('startFieldDictation inserts finals-only into contenteditable', () => {
        const ce = document.createElement('div');
        Object.defineProperty(ce, 'isContentEditable', { value: true });
        document.body.appendChild(ce);
        const session = startFieldDictation(FakeSR, ce, vi.fn())!;
        const rec = FakeSR.instances[0];
        expect(rec.interimResults).toBe(false); // no revisable interim in arbitrary rich DOM
        emit(rec, [{ final: false, text: 'lease ren' }]);
        expect(ce.textContent).toBe('');
        emit(rec, [{ final: true, text: 'lease renewal for Woodland Parc' }]);
        expect(ce.textContent).toBe('lease renewal for Woodland Parc ');
        session.stop();
        ce.remove();
    });

    it('returns null for non-dictatable targets', () => {
        expect(startFieldDictation(FakeSR, document.createElement('div'), vi.fn())).toBeNull();
    });
});

describe('DictationHotkey (global component)', () => {
    it('is honest when the browser has no SpeechRecognition', () => {
        render(<DictationHotkey />);
        pressDefault();
        expect(screen.getByTestId('dictation-hotkey-pill')).toHaveTextContent(/not supported in this browser/);
    });

    it('asks for a focused text field before starting', () => {
        (window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeSR;
        render(<DictationHotkey />);
        (document.activeElement as HTMLElement | null)?.blur?.();
        pressDefault();
        expect(screen.getByTestId('dictation-hotkey-pill')).toHaveTextContent(/Click into a text field, then press ⌥D/);
    });

    it('starts on the hotkey, types the transcript into the focused textarea, stops on second press', () => {
        (window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeSR;
        render(
            <>
                <DictationHotkey />
                <textarea data-testid="ta" defaultValue="unit H12 " />
            </>,
        );
        screen.getByTestId<HTMLTextAreaElement>('ta').focus();
        pressDefault();
        expect(screen.getByTestId('dictation-hotkey-pill')).toHaveTextContent(/Listening — press ⌥D to stop/);
        const rec = FakeSR.instances[0];
        emit(rec, [{ final: true, text: 'needs a make-ready' }]);
        expect(screen.getByTestId<HTMLTextAreaElement>('ta').value).toBe('unit H12 needs a make-ready');
        pressDefault(); // toggle off
        expect(rec.stopped).toBe(1);
        expect(screen.queryByTestId('dictation-hotkey-pill')).not.toBeInTheDocument();
    });

    it('honors a rebound per-user hotkey', () => {
        (window as { SpeechRecognition?: unknown }).SpeechRecognition = FakeSR;
        setDictationHotkey({ altKey: false, ctrlKey: true, metaKey: false, shiftKey: false, code: 'KeyK' });
        render(
            <>
                <DictationHotkey />
                <textarea data-testid="ta" />
            </>,
        );
        screen.getByTestId('ta').focus();
        pressDefault(); // old default — must NOT start
        expect(screen.queryByTestId('dictation-hotkey-pill')).not.toBeInTheDocument();
        fireEvent.keyDown(window, { code: 'KeyK', ctrlKey: true });
        expect(screen.getByTestId('dictation-hotkey-pill')).toHaveTextContent(/Listening — press ⌃K to stop/);
    });
});
