/**
 * araDictation — P11-8: live dictation session over an injected
 * SpeechRecognition constructor (no real mic / browser API).
 */
import { describe, it, expect, vi } from 'vitest';
import { startDictation, getSpeechRecognitionCtor, type SpeechRecognitionLike } from '../components/ARAConsole/araDictation';

class FakeSR implements SpeechRecognitionLike {
    continuous = false;
    interimResults = false;
    lang = '';
    onresult: SpeechRecognitionLike['onresult'] = null;
    onend: SpeechRecognitionLike['onend'] = null;
    onerror: SpeechRecognitionLike['onerror'] = null;
    started = 0;
    stopped = 0;
    start() { this.started++; }
    stop() { this.stopped++; this.onend?.(); }
}

function emit(rec: FakeSR, results: Array<{ final: boolean; text: string }>, resultIndex = 0) {
    rec.onresult?.({
        resultIndex,
        results: results.map(r => ({ isFinal: r.final, 0: { transcript: r.text } })) as never,
    });
}

describe('startDictation', () => {
    it('streams base + finals + interim into onText', () => {
        let last: FakeSR | null = null;
        const Ctor = class extends FakeSR { constructor() { super(); last = this; } };
        const texts: string[] = [];
        const session = startDictation(Ctor, 'open ', { onText: t => texts.push(t), onEnd: () => { } })!;
        expect(session).toBeTruthy();
        const rec = last! as FakeSR;
        expect(rec.continuous).toBe(true);
        expect(rec.interimResults).toBe(true);
        emit(rec, [{ final: false, text: 'stra' }]);
        emit(rec, [{ final: true, text: 'strata dashboard' }]);
        expect(texts[0]).toBe('open stra');
        expect(texts[1]).toBe('open strata dashboard');
    });

    it('stop() ends the session and fires onEnd once', () => {
        let last: FakeSR | null = null;
        const Ctor = class extends FakeSR { constructor() { super(); last = this; } };
        const onEnd = vi.fn();
        const session = startDictation(Ctor, '', { onText: () => { }, onEnd })!;
        session.stop();
        expect((last! as FakeSR).stopped).toBe(1);
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('a throwing constructor yields null (caller falls back to MediaRecorder)', () => {
        const Boom = class { constructor() { throw new Error('no SR'); } } as never;
        expect(startDictation(Boom, '', { onText: () => { }, onEnd: () => { } })).toBeNull();
    });

    it('getSpeechRecognitionCtor picks up webkit-prefixed implementations', () => {
        const w = window as unknown as { webkitSpeechRecognition?: unknown };
        w.webkitSpeechRecognition = FakeSR;
        try {
            expect(getSpeechRecognitionCtor()).toBe(FakeSR);
        } finally {
            delete w.webkitSpeechRecognition;
        }
    });
});

// Voice commands (2026-09-19): saying "open research lab" must RUN, not sit in
// the composer waiting for Enter. onFinal lets the caller consume an utterance.
describe('startDictation — onFinal (voice commands)', () => {
    const make = () => {
        let last: FakeSR | null = null;
        const Ctor = class extends FakeSR { constructor() { super(); last = this; } };
        return { Ctor, rec: () => last! as FakeSR };
    };

    it('a consumed utterance is NOT appended to the text, and is flagged whole-input on an empty composer', () => {
        const { Ctor, rec } = make();
        const texts: string[] = [];
        const finals: Array<[string, boolean]> = [];
        startDictation(Ctor, '', { onText: t => texts.push(t), onEnd: () => { }, onFinal: (u, whole) => { finals.push([u, whole]); return true; } });
        emit(rec(), [{ final: true, text: ' Open research lab. ' }]);
        expect(finals).toEqual([['Open research lab.', true]]);
        expect(texts[texts.length - 1]).toBe('');
    });

    it('an utterance the caller declines dictates normally; later ones are no longer whole-input', () => {
        const { Ctor, rec } = make();
        const texts: string[] = [];
        const wholes: boolean[] = [];
        startDictation(Ctor, '', { onText: t => texts.push(t), onEnd: () => { }, onFinal: (_u, whole) => { wholes.push(whole); return false; } });
        emit(rec(), [{ final: true, text: 'tell the vendor' }]);
        emit(rec(), [{ final: true, text: 'open research lab' }], 0);
        expect(wholes).toEqual([true, false]);
        expect(texts[texts.length - 1]).toBe('tell the vendor open research lab');
    });

    it('typed text already in the composer means a spoken command is never whole-input', () => {
        const { Ctor, rec } = make();
        const wholes: boolean[] = [];
        startDictation(Ctor, 'dear tenant,', { onText: () => { }, onEnd: () => { }, onFinal: (_u, whole) => { wholes.push(whole); return false; } });
        emit(rec(), [{ final: true, text: 'open research lab' }]);
        expect(wholes).toEqual([false]);
    });

    it('without onFinal the session behaves exactly as before', () => {
        const { Ctor, rec } = make();
        const texts: string[] = [];
        startDictation(Ctor, '', { onText: t => texts.push(t), onEnd: () => { } });
        emit(rec(), [{ final: true, text: 'open research lab' }]);
        expect(texts[texts.length - 1]).toBe('open research lab');
    });
});
