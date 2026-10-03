/**
 * Voice persona's `hermes` tool (usePersonaCall runTool):
 *  - The speech handlers are bound once per call, so the tool must read the CURRENT integrations
 *    (refs), not the ones captured at startCall — a key added/removed mid-call must reach Hermes.
 *  - On the non-streaming path (Gemini / stream failure), a Hermes answer that arrives after the
 *    call ended must not be added or spoken (the streaming path already guards this).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const state: { integrations: unknown } = { integrations: null };
vi.mock('../hooks/useIntegrations', () => ({ useIntegrations: () => ({ integrations: state.integrations }) }));
const fbCalls: Array<{ llm: unknown; search: unknown }> = [];
vi.mock('../components/HonchoHermesPanel/hermesReact', () => ({
    hermesBrowserFallbacks: (llm: unknown, search: unknown) => { fbCalls.push({ llm, search }); return {}; },
}));
let hermesImpl: () => Promise<unknown> = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' });
vi.mock('../components/StellaAgent/stellaHermesSpawn', () => ({ spawnHermesFromStella: () => hermesImpl() }));
type StreamFn = (req: unknown, llm: unknown, modelOverride: unknown, onDelta: (d: string) => void) => Promise<unknown>;
let streamImpl: StreamFn = async () => { throw new Error('no stream'); };
vi.mock('../components/PersonaStudio/personaStream', () => ({ streamLlm: (...a: Parameters<StreamFn>) => streamImpl(...a) }));
/** A streaming provider that sends `text` as one delta (sentences are queued; TOOL lines run after the stream). */
const streamOnce = (text: string): StreamFn => async (_r, _l, _m, onDelta) => { onDelta(text); return { text, provider: 'openai', model: 'x' }; };
const HERMES_TOOL = 'TOOL: {"name":"hermes","args":{"task":"search the web for lease law"}}';
/** When set, callLlm waits for it — a reply that is still being generated. */
let llmHold: Promise<void> | null = null;
/** When set, callLlm rejects with this message (after any hold). */
let llmFail = '';
let llmReply = 'TOOL: {"name":"hermes","args":{"task":"search the web for lease law"}}';
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<typeof import('../lib/llmClient')>()),
    callLlm: async () => { if (llmHold) await llmHold; if (llmFail) throw new Error(llmFail); return { text: llmReply, provider: 'openai', model: 'x' }; },
}));
vi.mock('../components/PersonaStudio/personaNeuralTts', () => ({ ensureKokoro: async () => {}, synthesizeKokoro: async () => null, getKokoroStatus: () => 'idle' }));

let lastRec: { onresult: (e: unknown) => void } | null = null;
class FakeSR { continuous = false; interimResults = false; lang = ''; maxAlternatives = 1; onresult: (e: unknown) => void = () => {}; onerror = null; onend = null; constructor() { lastRec = this; } start() {} abort() {} stop() {} }
const spoken: string[] = [];
let cancels = 0;                                        // speechSynthesis.cancel() calls (cancel-then-say cuts)
const w = window as unknown as Record<string, unknown>;
w.SpeechRecognition = FakeSR;
/** Utterances still "playing" — the fake voice never ends one on its own; finishSpeaking() ends them in order. */
const utters: Array<{ text: string; onend?: () => void }> = [];
const finishSpeaking = () => { for (const u of utters.splice(0)) u.onend?.(); };
w.speechSynthesis = { speak: (u: { text: string }) => { spoken.push(u.text); utters.push(u); }, cancel: () => { cancels += 1; utters.length = 0; }, getVoices: () => [] };
beforeEach(() => { utters.length = 0; });
w.SpeechSynthesisUtterance = class { text: string; constructor(t: string) { this.text = t; } };

import { usePersonaCall } from '../components/PersonaStudio/usePersonaCall';
import { defaultPersonaConfig } from '../components/PersonaStudio/personaEngine';

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 30)); });

describe('voice persona — Hermes tool', () => {
    beforeEach(() => { fbCalls.length = 0; spoken.length = 0; streamImpl = async () => { throw new Error('no stream'); }; llmReply = 'TOOL: {"name":"hermes","args":{"task":"search the web for lease law"}}'; });

    it('a spoken request after a mid-call key change gives Hermes the NEW search keys and LLM', async () => {
        const llmA = { active: 'openai', openai: { apiKey: 'sk-old', enabled: true, model: 'gpt-4.1-mini' } };
        state.integrations = { llm: llmA, search: undefined };
        const { result, rerender } = renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true }, 'stella'));
        act(() => { result.current.startCall(); });
        const llmB = { active: 'openai', openai: { apiKey: 'sk-new', enabled: true, model: 'gpt-4.1-mini' } };
        const searchB = { active: 'tavily', tavily: { apiKey: 'tvly-new', enabled: true } };
        state.integrations = { llm: llmB, search: searchB };
        rerender();
        await act(async () => {
            lastRec!.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: 'ask hermes to search the web for lease law' }], { isFinal: true })] });
            await new Promise((r) => setTimeout(r, 50));
        });
        expect(fbCalls).toHaveLength(1);
        expect(fbCalls[0].search).toBe(searchB);
        expect(fbCalls[0].llm).toBe(llmB);
        act(() => { result.current.endCall(); });
    });

    it('non-streaming reply: a Hermes answer that lands after the call ended is not added or spoken', async () => {
        streamImpl = async () => null; // Gemini-style: no stream → callLlm path
        let release!: (v: unknown) => void;
        hermesImpl = () => new Promise((r) => { release = r; });
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
        const { result } = renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await new Promise((r) => setTimeout(r, 20)); });
        act(() => { result.current.endCall(); });
        await act(async () => { release({ result: { outcome: 'success', result: 'Sixty days.' } }); await new Promise((r) => setTimeout(r, 20)); });
        await flush();
        expect(result.current.turns.some((t) => (t.text ?? '').includes('Sixty days.'))).toBe(false);
        expect(spoken.some((s) => s.includes('Sixty days.'))).toBe(false);
        hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' });
    });

    it('control: non-streaming reply that SAYS something and calls Hermes → the Hermes answer is added and spoken', async () => {
        streamImpl = async () => null;
        llmReply = 'Sure — asking Hermes now.\nTOOL: {"name":"hermes","args":{"task":"search the web for lease law"}}';
        hermesImpl = async () => ({ result: { outcome: 'success', result: 'Sixty days.' }, reply: 'x' });
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
        const { result } = renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await new Promise((r) => setTimeout(r, 30)); });
        await flush();
        expect(result.current.turns.some((t) => (t.text ?? '').includes('Hermes finished: Sixty days.'))).toBe(true);
        act(() => { result.current.endCall(); });
        hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' });
    });

    it('control: another reply spoken while Hermes is still working does NOT drop the Hermes answer (non-streaming)', async () => {
        streamImpl = async () => null;
        let release!: (v: unknown) => void;
        hermesImpl = () => new Promise((r) => { release = r; });
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
        const { result } = renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await new Promise((r) => setTimeout(r, 20)); });
        llmReply = 'It is sunny today.'; // the second, unrelated reply is SPOKEN (speak() bumps the speech epoch)
        await act(async () => { result.current.sendText('and what is the weather'); await new Promise((r) => setTimeout(r, 20)); });
        await act(async () => { release({ result: { outcome: 'success', result: 'Sixty days.' } }); await new Promise((r) => setTimeout(r, 20)); });
        await flush();
        expect(result.current.turns.some((t) => (t.text ?? '').includes('Hermes finished: Sixty days.'))).toBe(true);
        act(() => { result.current.endCall(); });
        hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' });
    });

    it('control: the idle nudge firing while Hermes is still working does NOT drop the Hermes answer (non-streaming)', async () => {
        streamImpl = async () => null;
        let release!: (v: unknown) => void;
        hermesImpl = () => new Promise((r) => { release = r; });
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
        // Only timers are faked (not React's scheduler), so the 14 s idle nudge can fire without a 14 s test.
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        try {
            const { result } = renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
            const before = result.current.turns.length;
            await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); // past IDLE_NUDGE_MS (14 s)
            expect(result.current.turns.length).toBe(before + 1); // the nudge really fired (and spoke) mid-Hermes
            await act(async () => { release({ result: { outcome: 'success', result: 'Sixty days.' } }); await vi.advanceTimersByTimeAsync(50); });
            expect(result.current.turns.some((t) => (t.text ?? '').includes('Hermes finished: Sixty days.'))).toBe(true);
            act(() => { result.current.endCall(); });
        } finally {
            vi.useRealTimers();
            hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' });
        }
    });
});

describe('voice persona — Hermes answer delivery: only the call ending drops it (both reply paths)', () => {
    const OPENAI = { active: 'openai', openai: { apiKey: 'sk-x', enabled: true, model: 'gpt-4.1-mini' } };
    const DONE = { result: { outcome: 'success', result: 'Sixty days.' } };
    const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
    const has = (turns: Array<{ text?: string }>, s: string) => turns.some((t) => (t.text ?? '').includes(s));
    const said = (s: string) => spoken.some((x) => x.includes(s));
    const mount = () => renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
    let release!: (v: unknown) => void;
    /** Replies per turn: the first is `first`, later turns are `later`; each on the streaming or the non-streaming path. */
    const script = (mode: 'streaming' | 'non-streaming', first: string, later: string) => {
        let n = 0;
        if (mode === 'streaming') {
            streamImpl = async (...a) => streamOnce(n++ === 0 ? first : later)(...a);
        } else {
            streamImpl = async () => null;
            llmReply = first;
            return () => { llmReply = later; };
        }
        return () => {};
    };
    beforeEach(() => {
        spoken.length = 0; fbCalls.length = 0;
        hermesImpl = () => new Promise((r) => { release = r; });
        state.integrations = { llm: OPENAI, search: undefined };
    });
    afterEach(() => { vi.useRealTimers(); hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' }); });

    it('streaming: a NON-streaming reply spoken while Hermes works (speak() bumps the speech epoch) does not drop the answer', async () => {
        let n = 0;
        streamImpl = async (...a) => (n++ === 0 ? streamOnce(HERMES_TOOL)(...a) : null); // turn 2 falls back to callLlm → speak()
        llmReply = 'It is sunny today.';
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { result.current.sendText('and what is the weather'); await wait(); });
        expect(has(result.current.turns, 'It is sunny today.')).toBe(true);
        await act(async () => { release(DONE); await wait(); });
        expect(has(result.current.turns, 'Hermes finished: Sixty days.')).toBe(true);
        expect(said('Sixty days.')).toBe(true);
        act(() => { result.current.endCall(); });
    });

    it('streaming: the idle nudge firing while Hermes works does not drop the answer', async () => {
        streamImpl = streamOnce(HERMES_TOOL);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // not React's scheduler
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
        const before = result.current.turns.length;
        await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); // past IDLE_NUDGE_MS (14 s)
        expect(result.current.turns.length).toBe(before + 1); // the nudge fired and spoke mid-Hermes
        await act(async () => { release(DONE); await vi.advanceTimersByTimeAsync(50); });
        expect(has(result.current.turns, 'Hermes finished: Sixty days.')).toBe(true);
        expect(said('Sixty days.')).toBe(true);
        act(() => { result.current.endCall(); });
    });

    it('streaming: the normal case — spoken intro + Hermes → the answer is added and spoken', async () => {
        script('streaming', `Sure, asking Hermes now.\n${HERMES_TOOL}`, 'Okay.');
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        expect(said('Sure, asking Hermes now.')).toBe(true);
        await act(async () => { release(DONE); await wait(); });
        expect(has(result.current.turns, 'Hermes finished: Sixty days.')).toBe(true);
        expect(said('Sixty days.')).toBe(true);
        act(() => { result.current.endCall(); });
    });

    for (const mode of ['streaming', 'non-streaming'] as const) {
        it(`${mode}: a barge-in while Hermes works still delivers the answer the user asked for`, async () => {
            const next = script(mode, `Sure, asking Hermes now.\n${HERMES_TOOL}`, 'Okay, noted.');
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            expect(result.current.speaking).toBe(true); // the intro is still playing (the fake voice never ends)
            next();
            await act(async () => { result.current.sendText('also check Ohio'); await wait(); });
            expect(has(result.current.turns, 'User interrupted the stream')).toBe(true);
            await act(async () => { release(DONE); await wait(); });
            expect(has(result.current.turns, 'Hermes finished: Sixty days.')).toBe(true);
            expect(said('Sixty days.')).toBe(true);
            act(() => { result.current.endCall(); });
        });

        it(`${mode} (control): the call ends while Hermes works → the answer is not added or spoken`, async () => {
            script(mode, HERMES_TOOL, 'Okay.');
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            act(() => { result.current.endCall(); });
            await act(async () => { release(DONE); await wait(); });
            expect(has(result.current.turns, 'Sixty days.')).toBe(false);
            expect(said('Sixty days.')).toBe(false);
        });

        it(`${mode} (control): a NEW call started while the old call's Hermes works → the old answer stays out of it`, async () => {
            script(mode, HERMES_TOOL, 'Okay.');
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            act(() => { result.current.endCall(); });
            act(() => { result.current.startCall(); });
            await act(async () => { release(DONE); await wait(); });
            expect(has(result.current.turns, 'Sixty days.')).toBe(false);
            expect(said('Sixty days.')).toBe(false);
            act(() => { result.current.endCall(); });
        });
    }
});

describe('voice persona — nothing from an ended call runs or speaks in its place', () => {
    const DONE = { result: { outcome: 'success', result: 'Sixty days.' }, reply: 'x' };
    const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
    const has = (turns: Array<{ text?: string }>, s: string) => turns.some((t) => (t.text ?? '').includes(s));
    const said = (s: string) => spoken.some((x) => x.includes(s));
    const mount = () => renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
    let spawned = 0;
    beforeEach(() => {
        spoken.length = 0; spawned = 0;
        hermesImpl = async () => { spawned += 1; return DONE; };
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
    });
    afterEach(() => { vi.useRealTimers(); llmHold = null; llmReply = HERMES_TOOL; hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' }); });

    for (const how of ['ended', 'ended and a new call started', 'unmounted'] as const) {
        it(`non-streaming: a reply that arrives after the call was ${how} is not added, spoken, or acted on (no Hermes run)`, async () => {
            streamImpl = async () => null;                              // Gemini-style: callLlm path
            let open!: () => void;
            llmHold = new Promise<void>((r) => { open = r; });
            llmReply = `Sure, asking Hermes now.\n${HERMES_TOOL}`;
            const { result, unmount } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            if (how === 'unmounted') unmount();
            else act(() => { result.current.endCall(); });
            if (how === 'ended and a new call started') act(() => { result.current.startCall(); });
            await act(async () => { open(); await wait(50); });
            expect(spawned).toBe(0);                                    // Hermes would spend the user's LLM + search keys
            expect(said('Sure, asking Hermes now.')).toBe(false);
            if (how !== 'unmounted') {
                expect(has(result.current.turns, 'Sure, asking Hermes now.')).toBe(false);
                act(() => { result.current.endCall(); });
            }
        });
    }

    it('control (non-streaming): the same reply during a live call is added, spoken and runs Hermes', async () => {
        streamImpl = async () => null;
        llmReply = `Sure, asking Hermes now.\n${HERMES_TOOL}`;
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(50); });
        expect(has(result.current.turns, 'Sure, asking Hermes now.')).toBe(true);
        expect(spawned).toBe(1);
        expect(has(result.current.turns, 'Hermes finished: Sixty days.')).toBe(true);
        act(() => { result.current.endCall(); });
    });

    it("end_call's delayed hang-up does not end a NEW call started before it fires", async () => {
        streamImpl = streamOnce('Goodbye!\nTOOL: {"name":"end_call","args":{}}\n');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });   // not React's scheduler
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('bye'); await vi.advanceTimersByTimeAsync(50); });
        act(() => { result.current.endCall(); });
        act(() => { result.current.startCall(); });
        await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
        expect(result.current.callState).toBe('live');
        act(() => { result.current.endCall(); });
    });

    it('end_call hangs up once the goodbye has been said — not while it is still playing', async () => {
        streamImpl = streamOnce('Goodbye, it was lovely talking with you!\nTOOL: {"name":"end_call","args":{}}\n');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('bye'); await vi.advanceTimersByTimeAsync(50); });
        await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
        expect(result.current.callState).toBe('live');                  // the goodbye is still playing
        await act(async () => { finishSpeaking(); await vi.advanceTimersByTimeAsync(50); });
        expect(result.current.callState).toBe('idle');
    });

    it('control: end_call still hangs up within 6 s if speech never finishes', async () => {
        streamImpl = streamOnce('Goodbye!\nTOOL: {"name":"end_call","args":{}}\n');
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('bye'); await vi.advanceTimersByTimeAsync(50); });
        expect(result.current.callState).toBe('live');
        await act(async () => { await vi.advanceTimersByTimeAsync(6_100); });
        expect(result.current.callState).toBe('idle');
    });

    it('non-streaming: a goodbye that arrives while a long answer plays cuts it and is said in full, then the call ends (not interruptible, so "bye" is no barge-in)', async () => {
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
        streamImpl = async () => null;
        llmReply = HERMES_TOOL;
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { result } = renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha', interruptible: false }, 'stella'));
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
        expect(spoken.some((x) => x.includes('Sixty days.'))).toBe(true);   // the answer is playing (never ends by itself)
        llmReply = 'Goodbye, talk soon!\nTOOL: {"name":"end_call","args":{}}';
        await act(async () => { result.current.sendText('ok, bye'); await vi.advanceTimersByTimeAsync(50); });
        expect(utters.map((u) => u.text)).toEqual(['Goodbye, talk soon!']);   // the answer was cut; the goodbye plays now
        await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
        expect(result.current.callState).toBe('live');                  // still saying goodbye
        await act(async () => { finishSpeaking(); await vi.advanceTimersByTimeAsync(50); });
        expect(result.current.callState).toBe('idle');
    });

    it('non-streaming: a goodbye queued behind an answer that is still playing is heard, not dropped by the hang-up', async () => {
        state.integrations = { llm: { active: 'gemini', gemini: { apiKey: 'g', enabled: true } }, search: undefined };
        streamImpl = async () => null;
        llmReply = HERMES_TOOL;
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
        expect(spoken.some((x) => x.includes('Sixty days.'))).toBe(true);   // the answer is playing (never ends by itself)
        llmReply = 'Goodbye, talk soon!\nTOOL: {"name":"end_call","args":{}}';
        await act(async () => { result.current.sendText('ok, bye'); await vi.advanceTimersByTimeAsync(50); });
        await act(async () => { await vi.advanceTimersByTimeAsync(1_500); });
        expect(result.current.callState).toBe('live');                  // not hung up over the queued goodbye
        await act(async () => { finishSpeaking(); await vi.advanceTimersByTimeAsync(50); });
        expect(spoken.some((x) => x.includes('Goodbye, talk soon!'))).toBe(true);
        expect(result.current.callState).toBe('idle');
    });
});

describe('voice persona — a tool answer never cuts into, or lands inside, another reply', () => {
    const DONE = { result: { outcome: 'success', result: 'Sixty days.' } };
    const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
    const mount = () => renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
    const idx = (s: string) => spoken.findIndex((x) => x.includes(s));
    let release!: (v: unknown) => void;
    beforeEach(() => {
        spoken.length = 0; cancels = 0;
        hermesImpl = () => new Promise((r) => { release = r; });
        state.integrations = { llm: { active: 'openai', openai: { apiKey: 'sk-x', enabled: true, model: 'gpt-4.1-mini' } }, search: undefined };
    });
    afterEach(() => { llmHold = null; hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' }); });

    for (const mode of ['streaming', 'non-streaming'] as const) {
        it(`${mode} Hermes turn: its answer waits for a reply that is still streaming — that reply keeps every sentence, nothing is cut, speech order = transcript order`, async () => {
            let n = 0; let resume!: () => void;
            const paused = new Promise<void>((r) => { resume = r; });
            streamImpl = async (r0, l0, m0, onDelta) => {
                n += 1;
                if (n === 1) {
                    if (mode === 'streaming') return streamOnce(`Sure, asking Hermes now.\n${HERMES_TOOL}`)(r0, l0, m0, onDelta);
                    throw new Error('503 before the first byte');   // → the non-streaming path (callLlm)
                }
                onDelta('The weather is sunny. ');
                await paused;                                        // turn 2 is mid-stream when Hermes finishes
                onDelta('It will rain tomorrow though.');
                return { text: 'x', provider: 'openai', model: 'x' };
            };
            llmReply = `Sure, asking Hermes now.\n${HERMES_TOOL}`;
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            await act(async () => { result.current.sendText('and what is the weather'); await wait(); });
            const cutsBefore = cancels;
            await act(async () => { release(DONE); await wait(); });         // Hermes finishes mid-stream
            await act(async () => { resume(); await wait(); });
            const texts = result.current.turns.map((t) => t.text ?? '');
            const reply2 = texts.findIndex((t) => t.includes('The weather is sunny.'));
            expect(texts[reply2]).toContain('It will rain tomorrow though.');   // not truncated by a stopSpeech
            expect(cancels).toBe(cutsBefore);                                  // the answer cut nothing off
            expect(idx('Hermes finished: Sixty days.')).toBeGreaterThan(idx('It will rain tomorrow though.'));
            expect(idx('It will rain tomorrow though.')).toBeGreaterThan(idx('The weather is sunny.'));
            expect(texts.findIndex((t) => t.includes('Hermes finished: Sixty days.'))).toBeGreaterThan(reply2);
            act(() => { result.current.endCall(); });
        });
    }

    for (const mode of ['streaming', 'non-streaming'] as const) {
        it(`${mode}: a second, faster Hermes task's answer is not held back behind a slower first one`, async () => {
            const releases: Array<(v: unknown) => void> = [];
            hermesImpl = () => new Promise((r) => { releases.push(r); });
            const task = (t: string) => `TOOL: {"name":"hermes","args":{"task":"${t}"}}`;
            let n = 0;
            if (mode === 'streaming') streamImpl = async (...a) => streamOnce(`${task((n += 1) === 1 ? 'slow task' : 'fast task')}\n`)(...a);
            else { streamImpl = async () => null; llmReply = task('slow task'); }
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes the slow thing'); await wait(); });
            if (mode === 'non-streaming') llmReply = task('fast task');
            await act(async () => { result.current.sendText('and ask hermes the fast thing'); await wait(); });
            expect(releases).toHaveLength(2);
            await act(async () => { releases[1]({ result: { outcome: 'success', result: 'Fast answer.' } }); await wait(); });
            expect(result.current.turns.some((t) => (t.text ?? '').includes('Hermes finished: Fast answer.'))).toBe(true);
            await act(async () => { releases[0]({ result: { outcome: 'success', result: 'Slow answer.' } }); await wait(); });
            expect(result.current.turns.some((t) => (t.text ?? '').includes('Hermes finished: Slow answer.'))).toBe(true);
            act(() => { result.current.endCall(); });
        });
    }

    it('"Thinking…" stays on while a later turn is still waiting on its LLM, even when a long Hermes run finishes first', async () => {
        streamImpl = async () => null;
        llmReply = HERMES_TOOL;
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        let open!: () => void;
        llmHold = new Promise<void>((r) => { open = r; });
        llmReply = 'It is sunny today.';
        await act(async () => { result.current.sendText('and what is the weather'); await wait(); });
        expect(result.current.thinking).toBe(true);
        await act(async () => { release(DONE); await wait(); });         // turn 1's Hermes run ends first
        expect(result.current.thinking).toBe(true);                       // turn 2 is still thinking
        await act(async () => { open(); await wait(); });
        expect(result.current.thinking).toBe(false);
        expect(result.current.turns.some((t) => (t.text ?? '').includes('Hermes finished: Sixty days.'))).toBe(true);
        act(() => { result.current.endCall(); });
    });

    it('a Hermes answer that lands after the persona said goodbye (end_call) is dropped, not half-spoken before the hang-up', async () => {
        let n = 0;
        streamImpl = async (...a) => streamOnce((n += 1) === 1 ? HERMES_TOOL : 'Goodbye!\nTOOL: {"name":"end_call","args":{}}\n')(...a);
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { result.current.sendText('bye, hang up'); await wait(); });
        expect(result.current.turns.some((t) => t.toolBadge === 'end_call · completed')).toBe(true);
        await act(async () => { release(DONE); await wait(); });         // inside end_call's 1.2 s window
        expect(result.current.turns.some((t) => (t.text ?? '').includes('Sixty days.'))).toBe(false);
        expect(spoken.some((x) => x.includes('Sixty days.'))).toBe(false);
        act(() => { result.current.endCall(); });
    });
});

describe('voice persona — only a reply that can still speak holds tool answers back (review round 2)', () => {
    const DONE = { result: { outcome: 'success', result: 'Sixty days.' } };
    const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
    const count = (turns: Array<{ text?: string }>, s: string) => turns.filter((t) => (t.text ?? '').includes(s)).length;
    const mount = () => renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
    const OPENAI = { active: 'openai', openai: { apiKey: 'sk-x', enabled: true, model: 'gpt-4.1-mini' } };
    const GEMINI = { active: 'gemini', gemini: { apiKey: 'g', enabled: true } };
    let releases: Array<(v: unknown) => void> = [];
    let spawned = 0;
    beforeEach(() => {
        spoken.length = 0; releases = []; spawned = 0; llmFail = ''; llmHold = null;
        hermesImpl = () => { spawned += 1; return new Promise((r) => { releases.push(r); }); };
    });
    afterEach(() => { llmHold = null; llmFail = ''; hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' }); });

    it('non-streaming: a reply still pending from an ENDED call does not hold the next call\'s Hermes answer or its "Thinking…"', async () => {
        state.integrations = { llm: GEMINI, search: undefined };
        streamImpl = async () => null;
        let open!: () => void;
        llmHold = new Promise<void>((r) => { open = r; });
        llmReply = 'Hello.';
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('hello?'); await wait(); });   // call 1's request hangs
        act(() => { result.current.endCall(); });
        expect(result.current.thinking).toBe(false);                                    // a call that ended isn't thinking
        llmHold = null; llmReply = HERMES_TOOL;
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { releases[0](DONE); await wait(); });
        expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);
        expect(result.current.thinking).toBe(false);
        await act(async () => { open(); await wait(); });
        expect(count(result.current.turns, 'Hello.')).toBe(0);                          // call 1's late reply stays out
        act(() => { result.current.endCall(); });
    });

    it('streaming: a stream still open from an ENDED call does not hold the next call\'s Hermes answer', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0; let close!: () => void;
        const stuck = new Promise<void>((r) => { close = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) { await stuck; return { text: '', provider: 'openai', model: 'x' }; }
            return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('hello?'); await wait(); });
        act(() => { result.current.endCall(); });
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { releases[0](DONE); await wait(); });
        expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);
        await act(async () => { close(); await wait(); });
        act(() => { result.current.endCall(); });
    });

    it('a streaming reply the user talked over no longer holds a fast tool answer (it can never speak again)', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0; let close!: () => void;
        const open = new Promise<void>((r) => { close = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) { onDelta('Let me think about that for a moment. '); await open; return { text: 'x', provider: 'openai', model: 'x' }; }
            return streamOnce('TOOL: {"name":"open_widget","args":{"widgetId":"no-such-widget"}}\n')(r0, l0, m0, onDelta);
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('tell me a story'); await wait(); });
        expect(result.current.speaking).toBe(true);
        await act(async () => { result.current.sendText('open the no such widget'); await wait(); });   // barge-in
        expect(count(result.current.turns, "I couldn't find a widget called no-such-widget.")).toBe(1);   // not held behind turn 1
        await act(async () => { close(); await wait(); });
        act(() => { result.current.endCall(); });
    });

    it('an answer held while the persona is still saying goodbye (end_call) is dropped, not flushed and then cut off', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0; let finish!: () => void;
        const rest = new Promise<void>((r) => { finish = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
            onDelta('Goodbye!\n');
            await rest;                                                   // the goodbye reply is still being produced…
            onDelta('TOOL: {"name":"end_call","args":{}}\n');
            return { text: 'x', provider: 'openai', model: 'x' };
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { result.current.sendText('never mind, thanks, bye'); await wait(); });
        await act(async () => { releases[0](DONE); await wait(); });             // …when Hermes finishes (held)
        await act(async () => { finish(); await wait(); });
        expect(result.current.turns.some((t) => t.toolBadge === 'end_call · completed')).toBe(true);
        expect(count(result.current.turns, 'Sixty days.')).toBe(0);
        expect(spoken.some((x) => x.includes('Sixty days.'))).toBe(false);
        act(() => { result.current.endCall(); });
    });

    it('two answers held behind one streaming reply are delivered once each, in the order they finished', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        const task = (t: string) => `TOOL: {"name":"hermes","args":{"task":"${t}"}}\n`;
        let n = 0; let finish!: () => void;
        const rest = new Promise<void>((r) => { finish = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            n += 1;
            if (n === 1) return streamOnce(task('first'))(r0, l0, m0, onDelta);
            if (n === 2) return streamOnce(task('second'))(r0, l0, m0, onDelta);
            if (n === 3) { onDelta('The weather is sunny. '); await rest; onDelta('It will rain later.'); return { text: 'x', provider: 'openai', model: 'x' }; }
            return streamOnce('Okay.')(r0, l0, m0, onDelta);
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes the first thing'); await wait(); });
        await act(async () => { result.current.sendText('ask hermes the second thing'); await wait(); });
        await act(async () => { result.current.sendText('and the weather'); await wait(); });
        await act(async () => { releases[1]({ result: { outcome: 'success', result: 'Second answer.' } }); await wait(); });
        await act(async () => { releases[0]({ result: { outcome: 'success', result: 'First answer.' } }); await wait(); });
        await act(async () => { finish(); await wait(); });
        const texts = result.current.turns.map((t) => t.text ?? '');
        expect(count(result.current.turns, 'Hermes finished: Second answer.')).toBe(1);
        expect(count(result.current.turns, 'Hermes finished: First answer.')).toBe(1);
        expect(texts.findIndex((t) => t.includes('Second answer.'))).toBeLessThan(texts.findIndex((t) => t.includes('First answer.')));
        await act(async () => { result.current.sendText('thanks'); await wait(); });   // a later reply must not re-deliver them
        expect(count(result.current.turns, 'Hermes finished: Second answer.')).toBe(1);
        expect(spoken.filter((x) => x.includes('First answer.'))).toHaveLength(1);
        act(() => { result.current.endCall(); });
    });

    it('a Hermes failure is reported as a Hermes failure (not "I hit a snag reaching the language model")', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        streamImpl = streamOnce(HERMES_TOOL);
        hermesImpl = async () => { throw new Error('backend exploded'); };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        expect(count(result.current.turns, "Hermes couldn't finish that: backend exploded")).toBe(1);
        expect(count(result.current.turns, 'I hit a snag')).toBe(0);
        expect(result.current.turns.some((t) => t.toolBadge === 'hermes · failed')).toBe(true);
        act(() => { result.current.endCall(); });
    });

    for (const [what, restart] of [['Hermes rejects', false], ['the model request rejects', false], ['Hermes rejects', true], ['the model request rejects', true]] as const) {
        it(`after hang-up${restart ? ' and a new call' : ''}, when ${what}, nothing is added or spoken`, async () => {
            let fail!: (e: Error) => void;
            if (what === 'Hermes rejects') {
                state.integrations = { llm: OPENAI, search: undefined };
                streamImpl = streamOnce(HERMES_TOOL);
                hermesImpl = () => new Promise((_r, rej) => { fail = rej; });
            } else {
                state.integrations = { llm: GEMINI, search: undefined };
                streamImpl = async () => null;
                let open!: () => void;
                llmHold = new Promise<void>((r) => { open = r; });
                llmFail = 'network timeout';
                fail = () => open();
            }
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            act(() => { result.current.endCall(); });
            if (restart) act(() => { result.current.startCall(); });
            const said = () => result.current.turns.filter((t) => t.role === 'assistant').length;
            const before = said();
            await act(async () => { fail(new Error('boom')); await wait(); });
            expect(said()).toBe(before);                        // (a tool's status badge may still record the failure)
            expect(spoken.some((x) => /snag|couldn't finish/.test(x))).toBe(false);
        });
    }

    for (const how of ['its model request rejects', 'its stream drops mid-reply'] as const) {
        it(`a later reply whose ${how} still releases the held Hermes answer (delivered once) and clears "Thinking…"`, async () => {
            state.integrations = { llm: how === 'its model request rejects' ? GEMINI : OPENAI, search: undefined };
            let n = 0; let go!: () => void;
            const gate = new Promise<void>((r) => { go = r; });
            if (how === 'its model request rejects') {
                streamImpl = async () => null;
                llmReply = HERMES_TOOL;
            } else {
                streamImpl = async (r0, l0, m0, onDelta) => {
                    if ((n += 1) === 1) return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
                    onDelta('Partly cloudy. '); await gate; throw new Error('connection reset');
                };
            }
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
            if (how === 'its model request rejects') { llmHold = gate; llmFail = 'network timeout'; }
            await act(async () => { result.current.sendText('and the weather'); await wait(); });
            await act(async () => { releases[0](DONE); await wait(); });               // held behind the later reply
            await act(async () => { go(); await wait(); });                             // …which then fails
            expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);
            expect(result.current.thinking).toBe(false);
            act(() => { result.current.endCall(); });
        });
    }

    it('non-streaming: a Hermes answer that lands while a later non-streaming reply is still coming is said at once, and that reply is appended after it — nothing is cut', async () => {
        state.integrations = { llm: GEMINI, search: undefined };
        streamImpl = async () => null;
        llmReply = HERMES_TOOL;
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        let open!: () => void;
        llmHold = new Promise<void>((r) => { open = r; });
        llmReply = 'It is sunny today.';
        await act(async () => { result.current.sendText('and what is the weather'); await wait(); });
        await act(async () => { releases[0](DONE); await wait(); });
        expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);   // not held behind a non-streaming reply
        const cutsBefore = cancels;
        await act(async () => { open(); await wait(); });
        expect(cancels).toBe(cutsBefore);                                               // the weather reply didn't cut it off
        expect(count(result.current.turns, 'It is sunny today.')).toBe(1);
        expect(spoken.filter((x) => x.includes('It is sunny today.'))).toHaveLength(1);
        expect(spoken.findIndex((x) => x.includes('It is sunny today.'))).toBeGreaterThan(spoken.findIndex((x) => x.includes('Sixty days.')));
        act(() => { result.current.endCall(); });
    });

    it('non-streaming: one request that never settles holds no answers and, once a newer reply is out, no "Thinking…"', async () => {
        state.integrations = { llm: GEMINI, search: undefined };
        streamImpl = async () => null;
        llmReply = `Asking Hermes.\n${HERMES_TOOL}`;
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        llmHold = new Promise<void>(() => {});                                          // B: never settles
        await act(async () => { result.current.sendText('hmm, what else?'); await wait(); });
        llmHold = null; llmReply = 'It is sunny today.';
        await act(async () => { releases[0](DONE); await wait(); });
        await act(async () => { result.current.sendText('what is the weather'); await wait(); });
        expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);
        expect(count(result.current.turns, 'It is sunny today.')).toBe(1);
        expect(result.current.thinking).toBe(false);                                   // C superseded the stuck B
        act(() => { result.current.endCall(); });
    });

    it('streaming: an answer held behind a reply that then stalls is still said within 8 s (a stalled stream never settles)', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0;
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
            onDelta('Once upon a time there was a fox. ');
            await new Promise<void>(() => {});                                          // stalls for good
            return null;
        };
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });                   // not React's scheduler
        try {
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
            await act(async () => { result.current.sendText('tell me a story'); await vi.advanceTimersByTimeAsync(50); });
            await act(async () => { releases[0](DONE); await vi.advanceTimersByTimeAsync(50); });
            expect(count(result.current.turns, 'Sixty days.')).toBe(0);                // held: the story is still streaming
            await act(async () => { await vi.advanceTimersByTimeAsync(7_000); });
            expect(count(result.current.turns, 'Sixty days.')).toBe(0);
            await act(async () => { await vi.advanceTimersByTimeAsync(1_200); });      // past the 8 s cap
            expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);
            expect(spoken.filter((x) => x.includes('Sixty days.'))).toHaveLength(1);
            act(() => { result.current.endCall(); });
        } finally { vi.useRealTimers(); }
    });

    it('streaming: an answer that arrives after the idle nudge talked over a still-thinking stream is said at once (that stream can never speak)', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0;
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
            await new Promise<void>(() => {});                                          // thinks forever, says nothing
            return null;
        };
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });                   // not React's scheduler
        try {
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
            await act(async () => { result.current.sendText('and tell me a story'); await vi.advanceTimersByTimeAsync(50); });
            await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });   // the nudge speaks: the story stream is talked over
            expect(spoken.some((x) => x.includes('Are you there?'))).toBe(true);
            await act(async () => { releases[0](DONE); await vi.advanceTimersByTimeAsync(50); });
            expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);   // not held for the 8 s cap
            act(() => { result.current.endCall(); });
        } finally { vi.useRealTimers(); }
    });

    it('answers go out in the order they finished, even when the hold lapses without a release (the holding stream fell back)', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        const task = (t: string) => `TOOL: {"name":"hermes","args":{"task":"${t}"}}\n`;
        let n = 0; let fail!: () => void;
        const failing = new Promise<void>((r) => { fail = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            n += 1;
            if (n === 1) return streamOnce(task('A'))(r0, l0, m0, onDelta);
            if (n === 2) return streamOnce(task('B'))(r0, l0, m0, onDelta);
            await failing; throw new Error('503 before the first byte');   // → the non-streaming path
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes A'); await wait(); });
        await act(async () => { result.current.sendText('ask hermes B'); await wait(); });
        await act(async () => { result.current.sendText('and one more thing'); await wait(); });
        await act(async () => { releases[0]({ result: { outcome: 'success', result: 'Answer A.' } }); await wait(); });   // held (3rd reply streaming)
        let open!: () => void;
        llmHold = new Promise<void>((r) => { open = r; }); llmReply = 'Reply three.';
        await act(async () => { fail(); await wait(); });                                // it falls back: holds nothing now
        await act(async () => { releases[1]({ result: { outcome: 'success', result: 'Answer B.' } }); await wait(); });
        const texts = result.current.turns.map((t) => t.text ?? '');
        expect(texts.findIndex((t) => t.includes('Answer A.'))).toBeGreaterThanOrEqual(0);
        expect(texts.findIndex((t) => t.includes('Answer B.'))).toBeGreaterThan(texts.findIndex((t) => t.includes('Answer A.')));
        expect(spoken.findIndex((x) => x.includes('Answer B.'))).toBeGreaterThan(spoken.findIndex((x) => x.includes('Answer A.')));
        await act(async () => { open(); await wait(); });
        act(() => { result.current.endCall(); });
    });

    it('an older reply still streaming keeps holding the answer even after a newer, faster reply finished (same speech epoch)', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0; let go1!: () => void; let go2!: () => void;
        const g1 = new Promise<void>((r) => { go1 = r; }); const g2 = new Promise<void>((r) => { go2 = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            n += 1;
            if (n === 1) return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
            if (n === 2) { await g1; onDelta('R1 sentence one. '); await g2; onDelta('R1 sentence two.'); return { text: 'x', provider: 'openai', model: 'x' }; }
            return streamOnce('R2 short.')(r0, l0, m0, onDelta);
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { result.current.sendText('tell me two things'); await wait(); });   // R1 (thinking, silent)
        await act(async () => { result.current.sendText('and quickly this'); await wait(); });      // R2 finishes first
        await act(async () => { go1(); await wait(); });                                             // R1 starts speaking
        await act(async () => { releases[0](DONE); await wait(); });
        expect(count(result.current.turns, 'Sixty days.')).toBe(0);                                  // held behind R1
        await act(async () => { go2(); await wait(); });
        expect(spoken.findIndex((x) => x.includes('Sixty days.'))).toBeGreaterThan(spoken.findIndex((x) => x.includes('R1 sentence two.')));
        act(() => { result.current.endCall(); });
    });

    it('a slow but live stream is not a stall: the answer waits for it to end, even past 8 s', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let n = 0;
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) return streamOnce(HERMES_TOOL)(r0, l0, m0, onDelta);
            for (let k = 1; k <= 12; k++) { onDelta(`Slow ${k}. `); await new Promise((r) => setTimeout(r, 1_000)); }
            return { text: 'x', provider: 'openai', model: 'x' };
        };
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });                   // not React's scheduler
        try {
            const { result } = mount();
            act(() => { result.current.startCall(); });
            await act(async () => { result.current.sendText('ask hermes about lease law'); await vi.advanceTimersByTimeAsync(50); });
            await act(async () => { result.current.sendText('tell me a slow story'); await vi.advanceTimersByTimeAsync(50); });
            await act(async () => { releases[0](DONE); await vi.advanceTimersByTimeAsync(900); });
            await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
            expect(count(result.current.turns, 'Sixty days.')).toBe(0);                // still streaming — not a stall
            await act(async () => { await vi.advanceTimersByTimeAsync(4_000); });
            expect(count(result.current.turns, 'Hermes finished: Sixty days.')).toBe(1);
            expect(spoken.findIndex((x) => x.includes('Sixty days.'))).toBeGreaterThan(spoken.findIndex((x) => x.includes('Slow 12.')));
            act(() => { result.current.endCall(); });
        } finally { vi.useRealTimers(); }
    });

    it("streaming: an earlier task's held answer comes before the next task's 'running…' badge", async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        const task = (t: string) => `TOOL: {"name":"hermes","args":{"task":"${t}"}}\n`;
        let n = 0; let finish!: () => void;
        const rest = new Promise<void>((r) => { finish = r; });
        streamImpl = async (r0, l0, m0, onDelta) => {
            if ((n += 1) === 1) return streamOnce(task('lease law'))(r0, l0, m0, onDelta);
            onDelta('Good idea, I will look up deposits too. ');
            await rest;
            onDelta(`\n${task('deposits')}`);
            return { text: 'x', provider: 'openai', model: 'x' };
        };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        await act(async () => { result.current.sendText('also ask about deposits'); await wait(); });
        await act(async () => { releases[0](DONE); await wait(); });                    // task 1 done, held
        await act(async () => { finish(); await wait(); });                             // the reply ends with task 2
        const labels = result.current.turns.map((t) => t.toolBadge ?? t.text ?? '');
        const answer = labels.findIndex((x) => x.includes('Hermes finished: Sixty days.'));
        const running2 = labels.lastIndexOf('hermes · running…');
        expect(answer).toBeGreaterThanOrEqual(0);
        expect(running2).toBeGreaterThan(answer);
        act(() => { result.current.endCall(); });
    });

    it('streaming: a TOOL line received before hang-up does not run once the stream closes after it', async () => {
        state.integrations = { llm: OPENAI, search: undefined };
        let close!: () => void;
        const open = new Promise<void>((r) => { close = r; });
        streamImpl = async (_r, _l, _m, onDelta) => { onDelta(HERMES_TOOL + '\n'); await open; return { text: 'x', provider: 'openai', model: 'x' }; };
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        act(() => { result.current.endCall(); });
        await act(async () => { close(); await wait(); });
        expect(spawned).toBe(0);
        expect(result.current.turns.some((t) => t.toolBadge?.startsWith('hermes'))).toBe(false);
    });
});

describe('voice persona — what is heard never includes a URL (the transcript keeps the source)', () => {
    const WEB = 'TAVILY-LIVE: Georgia requires 60 days written notice.\nSources:\n[Georgia lease law](https://example.org/ga-lease)';
    const wait = (ms = 20) => new Promise((r) => setTimeout(r, ms));
    const mount = () => renderHook(() => usePersonaCall({ ...defaultPersonaConfig(), skipGreeting: true, voiceId: 'browser-samantha' }, 'stella'));
    const heardUrl = () => spoken.some((x) => /https?:|\]\(|\.\.|:\./.test(x));
    beforeEach(() => { spoken.length = 0; state.integrations = { llm: { active: 'openai', openai: { apiKey: 'sk-x', enabled: true, model: 'gpt-4.1-mini' } }, search: undefined }; });
    afterEach(() => { hermesImpl = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' }); });

    it("Hermes's web answer: heard as '… notice. Sources: Georgia lease law'; the transcript keeps its lines and the link", async () => {
        streamImpl = streamOnce(HERMES_TOOL);
        hermesImpl = async () => ({ result: { outcome: 'success', result: WEB } });
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes about lease law'); await wait(); });
        expect(spoken).toContain('Hermes finished: TAVILY-LIVE: Georgia requires 60 days written notice. Sources: Georgia lease law');
        expect(heardUrl()).toBe(false);
        const shown = result.current.turns.find((t) => (t.text ?? '').startsWith('Hermes finished:'))?.text ?? '';
        expect(shown).toBe(`Hermes finished:\n${WEB}`);
        act(() => { result.current.endCall(); });
    });

    it('a Hermes answer with markdown and a leading code block: shown without markers, heard as "code block" (fences pair correctly)', async () => {
        streamImpl = streamOnce(HERMES_TOOL);
        hermesImpl = async () => ({ result: { outcome: 'success', result: '```py\n# keep this comment\ndef f(**kwargs): return g(**kwargs)\n```\n## Summary\n**Done** — see `a.js`.' } });
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('ask hermes to write it'); await wait(); });
        expect(spoken).toContain('Hermes finished: code block. Summary. Done — see a.js.');
        const shown = result.current.turns.find((t) => (t.text ?? '').startsWith('Hermes finished:'))?.text ?? '';
        expect(shown).toBe('Hermes finished:\n```py\n# keep this comment\ndef f(**kwargs): return g(**kwargs)\n```\nSummary\nDone — see a.js.');   // code verbatim
        act(() => { result.current.endCall(); });
    });

    it.each([
        ['a link whose text has ": " and ". " (streamed sentence by sentence)', 'Read [Section 5.2: Notice. Rules](https://x.org/a) now. Then call me.', 'Read Section 5.2: Notice. Rules now.'],
        ['a bare URL', 'See https://example.org/ga-lease for details.', 'See example.org for details.'],
    ])('the persona\'s own streamed reply with %s', async (_what, reply, heard) => {
        streamImpl = streamOnce(reply);
        const { result } = mount();
        act(() => { result.current.startCall(); });
        await act(async () => { result.current.sendText('where do I read about notice?'); await wait(); });
        expect(spoken).toContain(heard);
        expect(heardUrl()).toBe(false);
        act(() => { result.current.endCall(); });
    });
});
