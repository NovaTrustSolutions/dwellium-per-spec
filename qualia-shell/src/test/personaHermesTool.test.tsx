/**
 * Voice persona's `hermes` tool (usePersonaCall runTool):
 *  - The speech handlers are bound once per call, so the tool must read the CURRENT integrations
 *    (refs), not the ones captured at startCall — a key added/removed mid-call must reach Hermes.
 *  - On the non-streaming path (Gemini / stream failure), a Hermes answer that arrives after the
 *    call ended must not be added or spoken (the streaming path already guards this).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const state: { integrations: unknown } = { integrations: null };
vi.mock('../hooks/useIntegrations', () => ({ useIntegrations: () => ({ integrations: state.integrations }) }));
const fbCalls: Array<{ llm: unknown; search: unknown }> = [];
vi.mock('../components/HonchoHermesPanel/hermesReact', () => ({
    hermesBrowserFallbacks: (llm: unknown, search: unknown) => { fbCalls.push({ llm, search }); return {}; },
}));
let hermesImpl: () => Promise<unknown> = async () => ({ result: { outcome: 'success', result: 'ok' }, reply: 'ok' });
vi.mock('../components/StellaAgent/stellaHermesSpawn', () => ({ spawnHermesFromStella: () => hermesImpl() }));
let streamImpl: () => Promise<unknown> = async () => { throw new Error('no stream'); };
vi.mock('../components/PersonaStudio/personaStream', () => ({ streamLlm: () => streamImpl() }));
let llmReply = 'TOOL: {"name":"hermes","args":{"task":"search the web for lease law"}}';
vi.mock('../lib/llmClient', async (orig) => ({
    ...(await orig<typeof import('../lib/llmClient')>()),
    callLlm: async () => ({ text: llmReply, provider: 'openai', model: 'x' }),
}));
vi.mock('../components/PersonaStudio/personaNeuralTts', () => ({ ensureKokoro: async () => {}, synthesizeKokoro: async () => null, getKokoroStatus: () => 'idle' }));

let lastRec: { onresult: (e: unknown) => void } | null = null;
class FakeSR { continuous = false; interimResults = false; lang = ''; maxAlternatives = 1; onresult: (e: unknown) => void = () => {}; onerror = null; onend = null; constructor() { lastRec = this; } start() {} abort() {} stop() {} }
const spoken: string[] = [];
const w = window as unknown as Record<string, unknown>;
w.SpeechRecognition = FakeSR;
w.speechSynthesis = { speak: (u: { text: string }) => spoken.push(u.text), cancel: () => {}, getVoices: () => [] };
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
});
