/**
 * usePersonaCall — the live-call engine behind Persona Studio.
 *
 * Reproduces the interaction contract recorded on the reference Anam persona
 * (2026-07-05): spoken greeting on connect, live transcript, simultaneous
 * voice + typed input, interruption mid-reply, idle nudges ("Are you there?"),
 * and inline tool execution (end_call / skip_turn / change_language /
 * open_widget / hermes / user-defined HTTP tools) — all on the FREE stack:
 * Web Speech API for STT (with an on-device Whisper fallback via
 * personaWhisperStt where SpeechRecognition is missing — Safari
 * configurations, Firefox) + SpeechSynthesis for TTS, free on-device neural
 * TTS (Kokoro-82M via personaNeuralTts; browser fallback while the model
 * downloads), an OpenAI TTS upgrade path when the user's key is configured,
 * and the per-user integrations LLM (GPT-4.1-mini on OpenAI per product
 * decision 2026-07-05) as the brain.
 *
 * Replies stream sentence-by-sentence: streamLlm feeds deltas through
 * drainSentences, each completed sentence is appended to the transcript turn
 * AND queued for speech immediately (queueSpeech appends without cancelling),
 * so the persona starts talking before the LLM finishes thinking. stopSpeech
 * bumps an epoch counter that invalidates queued chunks + in-flight deltas,
 * keeping interruption instant.
 *
 * SSR/test safety: no browser global is touched at render time — recognition,
 * synthesis, audio, and timers live in refs and are only created inside
 * event handlers / effects, all feature-detected.
 */

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAuthToken, UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm } from '../../lib/llmClient';
import type { LlmResponse } from '../../lib/llmClient';
import type { IntegrationsBundle } from '../../types/integrations';
import { dispatchOpenWidget } from '../Workspace/workspaceScribe';
import { getWidgetMeta, getWidgetKeys } from '../../registry/widgetRegistry';
import { spawnHermesFromStella } from '../StellaAgent/stellaHermesSpawn';
import {
    buildPersonaSystemPrompt,
    drainSentences,
    parseAssistantReply,
    pickIdleNudge,
    stripForSpeech,
    getVoiceOption,
    resolveAutoVoiceId,
    type PersonaConfig,
} from './personaEngine';
import { streamLlm } from './personaStream';
import { ensureKokoro, synthesizeKokoro, getKokoroStatus } from './personaNeuralTts';
import { ensureWhisper, startWhisperSession, type WhisperSessionHandle } from './personaWhisperStt';

// ── Minimal Web Speech typings (mirrors TranscriptionHub.tsx) ─────────
interface SpeechRecognitionEventLike extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}
interface SpeechRecognitionInstance extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
    onerror: ((ev: Event & { error: string }) => void) | null;
    onend: (() => void) | null;
}

export type PersonaCallState = 'idle' | 'live';

/**
 * Live speech progress for lip-sync renderers (PersonaFace). Browser TTS
 * word-boundary events advance `charIndex` into `text`; OpenAI audio has no
 * boundaries (charIndex stays -1 → renderers fall back to amplitude).
 */
export interface SpeechProgressRef {
    active: boolean;
    text: string;
    charIndex: number;
    boundaryAt: number;
    /** Performance cues parsed from the reply — PersonaFace acts them out. */
    cues: string[];
}

/**
 * Live "the user is talking right now" state for the reactive listening
 * face: interim STT fragments stream in here before they become final
 * utterances. PersonaFace reads this every frame.
 */
export interface ListenStateRef {
    active: boolean;
    fragment: string;
    fragmentAt: number;
    speakingSince: number;
}

export interface PersonaTurn {
    id: string;
    role: 'user' | 'assistant' | 'event';
    text: string;
    cues?: string[];
    /** e.g. "skip_turn · completed" — rendered as an Anam-style tool chip. */
    toolBadge?: string;
    timestamp: number;
}

const IDLE_NUDGE_MS = 14000;
const MAX_NUDGES = 3;
const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const MAX_HISTORY_TURNS = 16;

let turnSeq = 0;
function makeTurn(partial: Omit<PersonaTurn, 'id' | 'timestamp'>): PersonaTurn {
    turnSeq += 1;
    return { id: `pturn-${Date.now()}-${turnSeq}`, timestamp: Date.now(), ...partial };
}

export interface UsePersonaCallResult {
    callState: PersonaCallState;
    turns: PersonaTurn[];
    speaking: boolean;
    listening: boolean;
    thinking: boolean;
    /**
     * Which STT engine drives voice input: Web Speech when the browser has
     * it, on-device Whisper otherwise, 'none' when neither is possible.
     */
    sttEngine: 'webspeech' | 'whisper' | 'none';
    /** False when NO STT engine is available (typed chat still works). */
    micAvailable: boolean;
    llmReady: boolean;
    audioRef: React.RefObject<HTMLAudioElement | null>;
    speechRef: React.MutableRefObject<SpeechProgressRef>;
    listenRef: React.MutableRefObject<ListenStateRef>;
    startCall: () => void;
    endCall: () => void;
    sendText: (text: string) => void;
}

export function usePersonaCall(config: PersonaConfig, host: 'ara' | 'stella'): UsePersonaCallResult {
    const { integrations } = useIntegrations();
    const userCtx = useContext(UserContext);
    const userName = userCtx?.user?.name ?? null;

    const [callState, setCallState] = useState<PersonaCallState>('idle');
    const [turns, setTurns] = useState<PersonaTurn[]>([]);
    const [speaking, setSpeaking] = useState(false);
    const [listening, setListening] = useState(false);
    const [thinking, setThinking] = useState(false);

    const liveRef = useRef(false);
    const speakingRef = useRef(false);
    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
    const whisperHandleRef = useRef<WhisperSessionHandle | null>(null);
    /** Bumped on stop — invalidates whisper sessions still resolving getUserMedia. */
    const whisperSeqRef = useRef(0);
    /** change_language (defined above the STT callbacks) restarts whisper through this. */
    const startWhisperRecognitionRef = useRef<() => void>(() => {});
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const speechProgressRef = useRef<SpeechProgressRef>({ active: false, text: '', charIndex: -1, boundaryAt: 0, cues: [] });
    const listenStateRef = useRef<ListenStateRef>({ active: false, fragment: '', fragmentAt: 0, speakingSince: 0 });
    const nudgeCountRef = useRef(0);
    const langRef = useRef('en-US');
    const configRef = useRef(config);
    configRef.current = config;
    const llmRef = useRef(integrations.llm);
    llmRef.current = integrations.llm;

    // ── Speech-queue state (streamed sentences append; stopSpeech flushes) ──
    /** Count of queued/playing speech chunks — speaking stays true until 0. */
    const pendingRef = useRef(0);
    /** FIFO for the OpenAI-TTS path (mp3 chunks play strictly sequentially). */
    const audioQueueRef = useRef<{ text: string; cues: string[] }[]>([]);
    /** Guards against concurrent drainAudioQueue loops. */
    const drainingRef = useRef(false);
    /** Bumped by stopSpeech — chunks/deltas captured under an older epoch are dropped. */
    const epochRef = useRef(0);

    const sttEngine = useMemo<'webspeech' | 'whisper' | 'none'>(() => {
        if (typeof window === 'undefined') return 'none';
        if ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) return 'webspeech';
        // No Web Speech (Safari configurations, Firefox) — on-device Whisper
        // works wherever mic capture + WASM exist.
        const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        const hasAudio = !!((window as any).AudioContext || (window as any).webkitAudioContext);
        const hasWasm = typeof (globalThis as any).WebAssembly !== 'undefined';
        return hasMic && hasAudio && hasWasm ? 'whisper' : 'none';
    }, []);
    const micAvailable = sttEngine !== 'none';

    const llmReady = useMemo(() => {
        const llm = integrations.llm;
        if (!llm.active) return false;
        switch (llm.active) {
            case 'anthropic': return !!(llm.anthropic?.enabled && llm.anthropic.apiKey);
            case 'openai': return !!(llm.openai?.enabled && llm.openai.apiKey);
            case 'gemini': return !!(llm.gemini?.enabled && llm.gemini.apiKey);
            case 'local': return !!(llm.local?.enabled && llm.local.baseUrl);
            case 'custom': return !!(llm.custom?.enabled && llm.custom.baseUrl && llm.custom.apiKey && llm.custom.model);
            default: return false;
        }
    }, [integrations.llm]);

    const turnsRef = useRef<PersonaTurn[]>([]);
    const appendTurn = useCallback((turn: PersonaTurn) => {
        turnsRef.current = [...turnsRef.current, turn];
        setTurns(turnsRef.current);
    }, []);

    /** Grow an existing turn in place — streamed replies update sentence by sentence. */
    const updateTurn = useCallback((id: string, text: string, cues?: string[]) => {
        turnsRef.current = turnsRef.current.map(t => (t.id === id ? { ...t, text, ...(cues ? { cues } : {}) } : t));
        setTurns(turnsRef.current);
    }, []);

    // ── TTS (speech queue: chunks append; stopSpeech flushes everything) ──
    const stopSpeech = useCallback(() => {
        epochRef.current += 1;                          // invalidates queued chunks + in-flight drains/deltas
        audioQueueRef.current = [];
        drainingRef.current = false;
        pendingRef.current = 0;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
        speakingRef.current = false;
        setSpeaking(false);
        speechProgressRef.current = { active: false, text: '', charIndex: -1, boundaryAt: 0, cues: [] };
    }, []);

    const armIdleTimer = useCallback(() => {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (!liveRef.current) return;
        idleTimerRef.current = setTimeout(() => {
            if (!liveRef.current || speakingRef.current) return;
            if (nudgeCountRef.current >= MAX_NUDGES) return;
            const nudge = pickIdleNudge(nudgeCountRef.current);
            nudgeCountRef.current += 1;
            appendTurn(makeTurn({ role: 'assistant', text: nudge }));
            // eslint-disable-next-line @typescript-eslint/no-use-before-define
            speak(nudge);
        }, IDLE_NUDGE_MS);
        // `speak` is defined below; ref-free forward call is safe at runtime
        // because the timeout only fires post-mount.
    }, [appendTurn]);   // eslint-disable-line react-hooks/exhaustive-deps

    /** One queued chunk finished — speaking flips false only when the LAST chunk ends. */
    const finishSpeechChunk = useCallback((epoch: number) => {
        if (epochRef.current !== epoch) return;         // stopSpeech already reset everything
        pendingRef.current = Math.max(0, pendingRef.current - 1);
        if (pendingRef.current > 0) return;
        speakingRef.current = false;
        setSpeaking(false);
        speechProgressRef.current = { active: false, text: '', charIndex: -1, boundaryAt: 0, cues: [] };
        armIdleTimer();
    }, [armIdleTimer]);

    /**
     * Effective voice for the next chunk: 'auto' (the default) resolves to
     * the best tier available RIGHT NOW — OpenAI neural when the user's key
     * exists, on-device Kokoro once its model is ready, else browser.
     */
    const resolveVoice = useCallback(() => {
        const selected = getVoiceOption(configRef.current.voiceId);
        if (selected.provider !== 'auto') return selected;
        return getVoiceOption(resolveAutoVoiceId(!!llmRef.current.openai?.apiKey, getKokoroStatus() === 'ready'));
    }, []);

    /** Browser SpeechSynthesis path — one utterance per chunk, queued natively (no cancel). */
    const speakChunkBrowser = useCallback((cleaned: string, cues: string[], epoch: number) => {
        if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
            finishSpeechChunk(epoch);
            return;
        }
        const cfg = configRef.current;
        const option = resolveVoice();
        const utterance = new SpeechSynthesisUtterance(cleaned);
        utterance.lang = langRef.current;
        utterance.rate = Math.max(0.5, Math.min(2, cfg.speechRate)) * 0.95;
        // Expressivity nudges pitch upward slightly — animated personas sit higher.
        utterance.pitch = 1 + (cfg.expressivity - 0.5) * 0.25;
        const voices = window.speechSynthesis.getVoices();
        let preferred: SpeechSynthesisVoice | undefined;
        if (option.provider === 'browser' && option.browserVoiceMatch) {
            for (const needle of option.browserVoiceMatch) {
                preferred = voices.find(v => v.name.includes(needle));
                if (preferred) break;
            }
        }
        if (!preferred) {
            preferred =
                voices.find(v => v.name.includes('Samantha (Enhanced)')) ||
                voices.find(v => v.name.includes('Samantha')) ||
                voices.find(v => v.name.includes('Google') && v.lang.startsWith(langRef.current.slice(0, 2))) ||
                voices.find(v => v.lang.startsWith(langRef.current.slice(0, 2)));
        }
        if (preferred) utterance.voice = preferred;
        // Word boundaries drive PersonaFace lip-sync (vowel-true visemes).
        utterance.onstart = () => {
            if (epochRef.current !== epoch) return;
            speechProgressRef.current = { active: true, text: cleaned, charIndex: 0, boundaryAt: Date.now(), cues };
        };
        utterance.onboundary = (e: SpeechSynthesisEvent) => {
            if (epochRef.current !== epoch) return;
            speechProgressRef.current.charIndex = e.charIndex ?? 0;
            speechProgressRef.current.boundaryAt = Date.now();
        };
        utterance.onend = () => finishSpeechChunk(epoch);
        utterance.onerror = () => finishSpeechChunk(epoch);
        window.speechSynthesis.speak(utterance);        // NO cancel — the synthesizer queues natively
    }, [finishSpeechChunk]);

    /**
     * Play one synthesized audio Blob (OpenAI mp3 or Kokoro wav) through
     * audioRef, resolving after playback settles. Synthesized audio has no
     * word boundaries — charIndex -1 → amplitude lip-sync fallback.
     */
    const playBlobChunk = useCallback(async (blob: Blob, chunk: { text: string; cues: string[] }, epoch: number) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioRef.current = audio;
        speechProgressRef.current = { active: true, text: chunk.text, charIndex: -1, boundaryAt: Date.now(), cues: chunk.cues };
        await new Promise<void>((resolve) => {
            const settle = () => {
                URL.revokeObjectURL(url);
                if (audioRef.current === audio) audioRef.current = null;
                resolve();
            };
            audio.onended = settle;
            audio.onerror = settle;
            audio.play().catch(settle);
        });
        if (epochRef.current !== epoch) return;
        finishSpeechChunk(epoch);
    }, [finishSpeechChunk]);

    /** Audio path (OpenAI TTS + on-device Kokoro) — drain the FIFO strictly sequentially through audioRef. */
    const drainAudioQueue = useCallback(async (epoch: number) => {
        if (drainingRef.current) return;                // single drain loop at a time
        drainingRef.current = true;
        while (audioQueueRef.current.length > 0) {
            if (epochRef.current !== epoch) return;     // stopSpeech flushed mid-drain
            const chunk = audioQueueRef.current.shift();
            if (!chunk) break;
            const cfg = configRef.current;
            const option = resolveVoice();
            const openaiKey = llmRef.current.openai?.apiKey || null;
            let played = false;
            if (option.provider === 'kokoro' && option.kokoroVoice) {
                // On-device neural synthesis — null (model still downloading /
                // failed) falls through to the browser voice for this chunk.
                const blob = await synthesizeKokoro(chunk.text, option.kokoroVoice, cfg.speechRate);
                if (epochRef.current !== epoch) return;
                if (blob) {
                    await playBlobChunk(blob, chunk, epoch);
                    if (epochRef.current !== epoch) return;
                    played = true;
                }
            } else if (option.provider === 'openai' && openaiKey) {
                try {
                    const res = await fetch(OPENAI_TTS_ENDPOINT, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
                        body: JSON.stringify({
                            model: 'tts-1',
                            input: chunk.text.slice(0, 4000),
                            voice: option.openaiVoice,
                            speed: Math.max(0.5, Math.min(2, cfg.speechRate)),
                            response_format: 'mp3',
                        }),
                    });
                    if (epochRef.current !== epoch) return;
                    if (res.ok) {
                        const blob = await res.blob();
                        if (epochRef.current !== epoch) return;
                        await playBlobChunk(blob, chunk, epoch);
                        if (epochRef.current !== epoch) return;
                        played = true;
                    }
                } catch {
                    /* fetch failed — fall back to the browser path for this chunk */
                }
            }
            if (!played) {
                if (epochRef.current !== epoch) return;
                // The fallback utterance keeps this chunk's pending slot;
                // its onend/onerror settles it via finishSpeechChunk.
                speakChunkBrowser(chunk.text, chunk.cues, epoch);
            }
        }
        if (epochRef.current === epoch) drainingRef.current = false;
    }, [finishSpeechChunk, playBlobChunk, speakChunkBrowser]);

    /**
     * Append a chunk to the speech queue WITHOUT cancelling what's already
     * playing — streamed sentences arrive here one by one. Speaking stays
     * true while ANY queued/playing chunk remains.
     */
    const queueSpeech = useCallback((text: string, cues: string[] = []) => {
        if (typeof window === 'undefined') return;
        const cleaned = stripForSpeech(text);
        if (!cleaned) return;
        const epoch = epochRef.current;
        const option = resolveVoice();
        const openaiKey = llmRef.current.openai?.apiKey || null;
        pendingRef.current += 1;
        speakingRef.current = true;
        setSpeaking(true);
        // Audio FIFO: OpenAI TTS (voice selected AND key exists) or on-device
        // Kokoro (the drain falls back to a browser voice while it downloads).
        if ((option.provider === 'openai' && openaiKey) || option.provider === 'kokoro') {
            audioQueueRef.current.push({ text: cleaned, cues });
            void drainAudioQueue(epoch);
        } else {
            speakChunkBrowser(cleaned, cues, epoch);
        }
    }, [drainAudioQueue, speakChunkBrowser]);

    /** Cancel-then-say — non-streamed voice lines (greeting, nudges, error lines). */
    const speak = useCallback((text: string, cues: string[] = []) => {
        stopSpeech();
        queueSpeech(text, cues);
    }, [stopSpeech, queueSpeech]);

    // ── Tools ─────────────────────────────────────────────────────────
    const runTool = useCallback(async (name: string, args: Record<string, unknown>): Promise<string | null> => {
        const cfg = configRef.current;
        switch (name) {
            case 'end_call': {
                if (!cfg.tools.endCall) return null;
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: 'end_call · completed' }));
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                setTimeout(() => endCallRef.current(), 1200);
                return null;
            }
            case 'skip_turn': {
                if (!cfg.tools.skipTurn) return null;
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: 'skip_turn · completed' }));
                nudgeCountRef.current = 0;
                return null;
            }
            case 'change_language': {
                if (!cfg.tools.changeLanguage) return null;
                const lang = typeof args.lang === 'string' ? args.lang : 'en-US';
                langRef.current = lang;
                if (recognitionRef.current) recognitionRef.current.lang = lang;
                if (whisperHandleRef.current) {
                    // Whisper picks its model + language at session start — restart.
                    try { whisperHandleRef.current.stop(); } catch { /* already stopped */ }
                    whisperHandleRef.current = null;
                    whisperSeqRef.current += 1;
                    startWhisperRecognitionRef.current();
                }
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: `change_language(${lang}) · completed` }));
                return null;
            }
            case 'open_widget': {
                if (!cfg.tools.openWidget) return null;
                const widgetId = typeof args.widgetId === 'string' ? args.widgetId : '';
                const meta = widgetId ? getWidgetMeta(widgetId) : undefined;
                if (!meta) return `I couldn't find a widget called ${widgetId || 'that'}.`;
                dispatchOpenWidget(widgetId, meta.label, meta.icon);
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: `open_widget(${meta.label}) · completed` }));
                return null;
            }
            case 'hermes': {
                if (!cfg.tools.hermes) return null;
                const task = typeof args.task === 'string' ? args.task : '';
                if (!task) return 'What task should I hand to Hermes?';
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: 'hermes · running…' }));
                const authFetch = (input: string, init?: RequestInit) => fetch(input, {
                    ...init,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}),
                        ...((init?.headers as Record<string, string>) ?? {}),
                    },
                });
                const { result } = await spawnHermesFromStella(task, { authFetch, toolNames: [] });
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: `hermes · ${result.outcome === 'success' ? 'completed' : 'failed'}` }));
                return result.outcome === 'success'
                    ? `Hermes finished: ${stripForSpeech(result.result || 'done, but no answer text came back.')}`
                    : `Hermes couldn't finish that: ${result.error || 'the run failed.'}`;
            }
            default: {
                // User-defined HTTP tool from the builder's Tools tab.
                const custom = cfg.customTools.find(t => t.name === name);
                if (!custom) return null;
                appendTurn(makeTurn({ role: 'event', text: '', toolBadge: `${name} · running…` }));
                // 10 s cap via AbortController (AbortSignal.timeout isn't universal).
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 10000);
                try {
                    let res: Response;
                    if (custom.method === 'GET') {
                        const params = new URLSearchParams();
                        for (const [key, value] of Object.entries(args)) params.set(key, String(value));
                        const qs = params.toString();
                        const url = qs ? `${custom.url}${custom.url.includes('?') ? '&' : '?'}${qs}` : custom.url;
                        res = await fetch(url, { method: 'GET', signal: controller.signal });
                    } else {
                        res = await fetch(custom.url, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(args),
                            signal: controller.signal,
                        });
                    }
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const body = (await res.text()).slice(0, 400);
                    appendTurn(makeTurn({ role: 'event', text: '', toolBadge: `${name} · completed` }));
                    return `The ${name} tool returned: ${body}`;
                } catch {
                    appendTurn(makeTurn({ role: 'event', text: '', toolBadge: `${name} · failed` }));
                    return `I couldn't reach your ${name} tool just now — it timed out or refused the call.`;
                } finally {
                    clearTimeout(timer);
                }
            }
        }
    }, [appendTurn]);

    // ── LLM turn ──────────────────────────────────────────────────────
    const widgetCatalog = useMemo(
        () => getWidgetKeys().map(id => ({ id, label: getWidgetMeta(id)?.label ?? id })),
        [],
    );

    const respond = useCallback(async (history: PersonaTurn[]) => {
        const cfg = configRef.current;

        if (cfg.llmDisabled) {
            const msg = 'My language model is switched off — flip the LLM toggle in the builder and I can think again.';
            appendTurn(makeTurn({ role: 'assistant', text: msg }));
            speak(msg);
            return;
        }

        const systemPrompt = buildPersonaSystemPrompt(cfg, { host, widgetCatalog, userName });

        // Apply the OpenAI model override (product decision: GPT-4.1-mini default).
        const llm: IntegrationsBundle['llm'] = (llmRef.current.active === 'openai' && llmRef.current.openai && cfg.modelOverride)
            ? { ...llmRef.current, openai: { ...llmRef.current.openai, model: cfg.modelOverride } }
            : llmRef.current;

        const convo = history
            .filter(t => t.role !== 'event')
            .slice(-MAX_HISTORY_TURNS)
            .map(t => `${t.role === 'user' ? 'User' : cfg.name}: ${t.text}`)
            .join('\n');
        const prompt = `${convo}\n${cfg.name}:`;
        const req = {
            prompt,
            systemPrompt,
            maxTokens: 300,
            temperature: 0.5 + cfg.expressivity * 0.3,
        };

        setThinking(true);
        // Interruption guard: stopSpeech bumps the epoch, so deltas/flushes
        // from an interrupted reply are dropped instead of resurrecting it.
        const epoch = epochRef.current;

        // Progressive stream state — the assistant turn is created lazily on
        // the first displayable sentence and grown in place via updateTurn.
        let buffer = '';
        let spokenAnything = false;
        let assistantTurnId: string | null = null;
        let displayText = '';
        const displayCues: string[] = [];
        const toolLines: string[] = [];

        const consumeSentence = (sentence: string) => {
            if (epochRef.current !== epoch) return;
            const trimmed = sentence.trim();
            if (!trimmed) return;
            if (trimmed.startsWith('TOOL:')) {
                toolLines.push(trimmed);                // never displayed or spoken
                return;
            }
            const parsed = parseAssistantReply(trimmed);
            if (!parsed.display) return;
            if (assistantTurnId === null) {
                const turn = makeTurn({ role: 'assistant', text: '', cues: [] });
                assistantTurnId = turn.id;
                appendTurn(turn);
            }
            displayText = displayText ? `${displayText} ${parsed.display}` : parsed.display;
            displayCues.push(...parsed.cues);
            updateTurn(assistantTurnId, displayText, displayCues);
            queueSpeech(parsed.speech, parsed.cues);    // append — never cancel mid-reply
            spokenAnything = true;
            setThinking(false);                         // first sentence queued — she's talking
        };

        const onDelta = (delta: string) => {
            if (epochRef.current !== epoch) return;
            buffer += delta;
            const { sentences, rest } = drainSentences(buffer);
            buffer = rest;
            for (const sentence of sentences) consumeSentence(sentence);
        };

        try {
            let streamed: LlmResponse | null = null;
            try {
                streamed = await streamLlm(req, llmRef.current, cfg.modelOverride, onDelta);
            } catch {
                if (epochRef.current !== epoch) return;
                if (spokenAnything) {
                    // Connection died mid-reply — what's queued keeps playing.
                    appendTurn(makeTurn({ role: 'event', text: 'connection dropped mid-reply' }));
                    return;
                }
                // Nothing spoken yet — retry silently on the non-streaming path.
            }

            if (streamed !== null) {
                if (epochRef.current !== epoch) return;
                // Flush the tail — the final sentence may lack a terminator.
                const { sentences, rest } = drainSentences(buffer);
                buffer = '';
                for (const sentence of sentences) consumeSentence(sentence);
                if (rest.trim()) consumeSentence(rest);

                let ranTool = false;
                if (toolLines.length > 0) {
                    const toolParsed = parseAssistantReply(toolLines[0]);
                    if (toolParsed.tool) {
                        ranTool = true;
                        const followUp = await runTool(toolParsed.tool.name, toolParsed.tool.args);
                        if (followUp && epochRef.current === epoch) {
                            appendTurn(makeTurn({ role: 'assistant', text: followUp }));
                            queueSpeech(followUp);
                        }
                    }
                }
                if (spokenAnything || ranTool) return;
                // Stream completed but produced nothing displayable and no tool.
                const msg = 'I need an LLM to think with — add an API key under Settings, then call me again.';
                appendTurn(makeTurn({ role: 'assistant', text: msg }));
                speak(msg);
                return;
            }

            // Non-streamable provider (gemini) or pre-speech stream failure —
            // the original non-streaming path.
            const res = await callLlm(req, llm);
            if (!res || !res.text.trim()) {
                const msg = 'I need an LLM to think with — add an API key under Settings, then call me again.';
                appendTurn(makeTurn({ role: 'assistant', text: msg }));
                speak(msg);
                return;
            }
            const parsed = parseAssistantReply(res.text);
            if (parsed.display) {
                appendTurn(makeTurn({ role: 'assistant', text: parsed.display, cues: parsed.cues }));
                speak(parsed.speech, parsed.cues);
            }
            if (parsed.tool) {
                const followUp = await runTool(parsed.tool.name, parsed.tool.args);
                if (followUp) {
                    appendTurn(makeTurn({ role: 'assistant', text: followUp }));
                    speak(followUp);
                }
            }
        } catch (e: any) {
            const msg = `I hit a snag reaching the language model${e?.message ? ` — ${String(e.message).slice(0, 120)}` : ''}.`;
            appendTurn(makeTurn({ role: 'assistant', text: msg }));
            speak(msg);
        } finally {
            setThinking(false);
        }
    }, [appendTurn, host, queueSpeech, runTool, speak, updateTurn, userName, widgetCatalog]);

    // ── User input (voice + text share this path) ─────────────────────
    const handleUserUtterance = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        nudgeCountRef.current = 0;
        if (speakingRef.current && configRef.current.interruptible) {
            stopSpeech();
            appendTurn(makeTurn({ role: 'event', text: 'User interrupted the stream' }));
        }
        appendTurn(makeTurn({ role: 'user', text: trimmed }));
        respond([...turnsRef.current]);
        armIdleTimer();
    }, [appendTurn, armIdleTimer, respond, stopSpeech]);

    // ── STT ───────────────────────────────────────────────────────────
    /**
     * On-device Whisper fallback — browsers with no SpeechRecognition. The
     * session's RMS VAD keeps the listening face alive via onInterim and
     * hands each finished utterance to the same handleUserUtterance path.
     */
    const startWhisperRecognition = useCallback(() => {
        if (typeof window === 'undefined') return;
        // Warm the model in the background; capture starts immediately and
        // the first transcription simply awaits the download.
        void ensureWhisper(langRef.current);
        const seq = whisperSeqRef.current;
        void startWhisperSession({
            lang: langRef.current,
            onInterim: () => {
                // VAD says speech STARTED — with whisper the interrupt must
                // fire NOW (transcription-end would be a beat too late).
                // Mirrors handleUserUtterance's interruption block, without
                // adding a user turn.
                if (speakingRef.current && configRef.current.interruptible) {
                    stopSpeech();
                    appendTurn(makeTurn({ role: 'event', text: 'User interrupted the stream' }));
                }
                const prev = listenStateRef.current;
                listenStateRef.current = {
                    active: true,
                    fragment: prev.fragment,
                    fragmentAt: Date.now(),
                    speakingSince: prev.active ? prev.speakingSince : Date.now(),
                };
            },
            onUtterance: (text) => {
                listenStateRef.current = { active: false, fragment: '', fragmentAt: 0, speakingSince: 0 };
                handleUserUtterance(text);
            },
            onError: () => setListening(false),
        }).then((handle) => {
            if (!handle) { setListening(false); return; }
            if (!liveRef.current || whisperSeqRef.current !== seq) { handle.stop(); return; }
            whisperHandleRef.current = handle;
            setListening(true);
        });
    }, [appendTurn, handleUserUtterance, stopSpeech]);
    startWhisperRecognitionRef.current = startWhisperRecognition;

    const startRecognition = useCallback(() => {
        if (typeof window === 'undefined') return;
        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SR) { startWhisperRecognition(); return; }
        try {
            const rec: SpeechRecognitionInstance = new SR();
            rec.continuous = true;
            rec.interimResults = true; // interim fragments feed the listening face
            rec.lang = langRef.current;
            rec.maxAlternatives = 1;
            rec.onresult = (ev) => {
                let interim = '';
                for (let i = ev.resultIndex; i < ev.results.length; i++) {
                    const r = ev.results[i];
                    if (r.isFinal && r[0]) {
                        // Utterance complete — the listener stops "listening" and answers.
                        listenStateRef.current = { active: false, fragment: '', fragmentAt: 0, speakingSince: 0 };
                        handleUserUtterance(r[0].transcript);
                    } else if (r[0]) {
                        interim += r[0].transcript;
                    }
                }
                if (interim.trim()) {
                    const now = Date.now();
                    const prev = listenStateRef.current;
                    listenStateRef.current = {
                        active: true,
                        fragment: interim,
                        fragmentAt: now,
                        speakingSince: prev.active ? prev.speakingSince : now,
                    };
                }
            };
            rec.onerror = () => setListening(false);
            rec.onend = () => {
                // Chrome ends continuous recognition periodically — restart while live.
                if (liveRef.current && recognitionRef.current === rec) {
                    try { rec.start(); } catch { setListening(false); }
                } else {
                    setListening(false);
                }
            };
            recognitionRef.current = rec;
            rec.start();
            setListening(true);
        } catch {
            setListening(false);
        }
    }, [handleUserUtterance, startWhisperRecognition]);

    const stopRecognition = useCallback(() => {
        const rec = recognitionRef.current;
        recognitionRef.current = null;
        if (rec) { try { rec.abort(); } catch { /* already stopped */ } }
        whisperSeqRef.current += 1;                 // drops whisper sessions still resolving
        const whisper = whisperHandleRef.current;
        whisperHandleRef.current = null;
        if (whisper) { try { whisper.stop(); } catch { /* already stopped */ } }
        setListening(false);
    }, []);

    // ── Call lifecycle ────────────────────────────────────────────────
    const endCall = useCallback(() => {
        liveRef.current = false;
        setCallState('idle');
        stopRecognition();
        stopSpeech();
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
    }, [stopRecognition, stopSpeech]);
    const endCallRef = useRef(endCall);
    endCallRef.current = endCall;

    const startCall = useCallback(() => {
        if (liveRef.current) return;
        liveRef.current = true;
        nudgeCountRef.current = 0;
        setCallState('live');
        startRecognition();
        armIdleTimer();

        const cfg = configRef.current;
        // Warm the on-device neural model in the background — the greeting
        // (and early chunks) use the browser fallback until it's ready. Also
        // warm it when 'auto' is selected and no OpenAI key exists, so auto
        // upgrades from browser → neural mid-session.
        const selectedVoice = getVoiceOption(cfg.voiceId);
        if (
            selectedVoice.provider === 'kokoro' ||
            (selectedVoice.provider === 'auto' && !llmRef.current.openai?.apiKey)
        ) void ensureKokoro();
        if (!cfg.skipGreeting) {
            if (cfg.greeting.trim()) {
                appendTurn(makeTurn({ role: 'assistant', text: cfg.greeting.trim() }));
                speak(cfg.greeting.trim());
            } else {
                // Let the persona generate its own greeting (Anam parity).
                respond([makeTurn({ role: 'user', text: '(The call just connected. Greet me briefly and ask what I want to talk about.)' })]);
            }
        }
    }, [appendTurn, armIdleTimer, respond, speak, startRecognition]);

    const sendText = useCallback((text: string) => {
        if (!liveRef.current) return;
        handleUserUtterance(text);
    }, [handleUserUtterance]);

    // Unmount cleanup.
    useEffect(() => () => { endCallRef.current(); }, []);

    return { callState, turns, speaking, listening, thinking, sttEngine, micAvailable, llmReady, audioRef, speechRef: speechProgressRef, listenRef: listenStateRef, startCall, endCall, sendText };
}
