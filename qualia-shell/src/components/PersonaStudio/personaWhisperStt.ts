/**
 * personaWhisperStt — FREE on-device speech recognition fallback for Persona
 * Studio, for browsers with no `window.SpeechRecognition` (Safari
 * configurations, Firefox) where voice calls would otherwise be typed-only.
 *
 * Lazy singleton around Whisper-tiny ONNX running locally through
 * @huggingface/transformers (already in node_modules as kokoro-js's runtime)
 * on WebGPU when available, WASM otherwise. The model is a ~40 MB one-time
 * download from the Hugging Face Hub, cached by the browser so subsequent
 * sessions load instantly. English uses `whisper-tiny.en`; any other language
 * uses the multilingual `whisper-tiny` with an explicit transcribe task.
 *
 * A session captures mic audio via getUserMedia + AudioContext with a
 * ScriptProcessorNode (deprecated but universally supported — fine here),
 * runs simple RMS-based VAD (speech starts above threshold for 2 consecutive
 * buffers; an utterance ends after ~900 ms of silence or 15 s max), resamples
 * each utterance to 16 kHz, and transcribes chunks strictly one at a time
 * (the oldest queued utterance is dropped if a backlog forms).
 *
 * CRITICAL bundling contract (mirrors personaNeuralTts): the transformers
 * runtime is ONLY ever loaded through a dynamic `import('@huggingface/transformers')`,
 * so it lands in its own lazy chunk — the main bundle and the vitest graph
 * never touch it. Do NOT add a static import of @huggingface/transformers.
 *
 * Every export is throw-proof: callers get status/null and fall back to
 * typed chat, so a broken mic never breaks the call.
 *
 * 2026-07-06 created (Persona Studio arc, gap-report item B-9).
 */

export type WhisperStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

/** English-only tiny model (~40 MB at q8) — best latency for the common case. */
const WHISPER_EN_MODEL = 'onnx-community/whisper-tiny.en';
/** Multilingual tiny model — used whenever the call language is not English. */
const WHISPER_MULTI_MODEL = 'onnx-community/whisper-tiny';

// ── VAD tuning ────────────────────────────────────────────────────────
/** Per-buffer RMS above this counts as voiced. */
const RMS_THRESHOLD = 0.015;
/** Speech starts after this many consecutive voiced buffers. */
const VOICED_BUFFERS_TO_START = 2;
/** An utterance ends after this much continuous silence. */
const SILENCE_END_MS = 900;
/** Hard cap per utterance — whisper-tiny handles up to 30 s; stay well under. */
const MAX_UTTERANCE_MS = 15000;
/** Utterances with less voiced audio than this are noise blips — dropped. */
const MIN_VOICED_MS = 250;

/** Minimal structural typing for the lazily-imported ASR pipeline instance. */
type AsrPipeline = (audio: Float32Array, options?: Record<string, unknown>) => Promise<unknown>;

// ── Module-level singleton state ──────────────────────────────────────
let status: WhisperStatus = 'idle';
let progress = 0;                                   // 0..1 during model download
let sawNetworkProgress = false;
const pipelinePromises = new Map<string, Promise<AsrPipeline | null>>();
const listeners = new Set<(status: WhisperStatus, progress: number) => void>();

function publish(next: WhisperStatus, nextProgress: number) {
    status = next;
    progress = nextProgress;
    for (const cb of listeners) {
        try { cb(status, progress); } catch { /* listener errors never propagate */ }
    }
}

export function getWhisperStatus(): WhisperStatus {
    return status;
}

/** Subscribe to status/progress changes (progress 0..1 during model download). Returns unsubscribe. */
export function subscribeWhisper(cb: (status: WhisperStatus, progress: number) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

/** BCP-47 → whisper's 2-letter language code ('en-US' → 'en'). */
function toWhisperLang(lang: string): string {
    return (lang || 'en').slice(0, 2).toLowerCase();
}

function modelIdForLang(lang: string): string {
    return toWhisperLang(lang) === 'en' ? WHISPER_EN_MODEL : WHISPER_MULTI_MODEL;
}

/** Idempotent per-model pipeline load — cached forever, never throws. */
function loadPipeline(modelId: string): Promise<AsrPipeline | null> {
    let promise = pipelinePromises.get(modelId);
    if (!promise) {
        publish('loading', 0);
        promise = (async (): Promise<AsrPipeline | null> => {
            try {
                const { pipeline } = await import('@huggingface/transformers');
                const asr = await pipeline('automatic-speech-recognition', modelId, {
                    dtype: 'q8',
                    device: (navigator as any).gpu ? 'webgpu' : 'wasm',
                    progress_callback: (item: any) => {
                        if (item && item.status === 'progress' && typeof item.progress === 'number') {
                            sawNetworkProgress = true;
                            publish('loading', Math.max(0, Math.min(1, item.progress / 100)));
                        }
                    },
                } as any);
                publish('ready', 1);
                return asr as unknown as AsrPipeline;
            } catch {
                // No WebAssembly + nothing ever downloaded → the runtime itself
                // can't exist here; otherwise it's a (possibly transient) error.
                const noWasm = typeof (globalThis as any).WebAssembly === 'undefined';
                publish(!sawNetworkProgress && noWasm ? 'unsupported' : 'error', 0);
                return null;
            }
        })();
        pipelinePromises.set(modelId, promise);
    }
    return promise;
}

/**
 * Idempotent model warm-up. Resolves true when ready. SSR-safe (no-ops
 * server-side) and never throws — failures surface as 'error'/'unsupported'
 * status instead. Pass the call language so the right model warms up.
 */
export async function ensureWhisper(lang = 'en'): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
        const asr = await loadPipeline(modelIdForLang(lang));
        return asr !== null;
    } catch {
        return false;
    }
}

/**
 * Linear-interpolation resample to 16 kHz (whisper's expected input rate).
 * Pure helper, exported for testing. Returns the input untouched when it is
 * already at 16 kHz or empty.
 */
export function resampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
    if (fromRate === 16000 || fromRate <= 0 || samples.length === 0) return samples;
    const ratio = 16000 / fromRate;
    const outLength = Math.max(1, Math.round(samples.length * ratio));
    const out = new Float32Array(outLength);
    const last = samples.length - 1;
    for (let i = 0; i < outLength; i++) {
        const pos = i / ratio;
        const i0 = Math.min(last, Math.floor(pos));
        const i1 = Math.min(last, i0 + 1);
        const frac = pos - Math.floor(pos);
        out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
    }
    return out;
}

/** Extract the transcription text from whatever shape the pipeline returned. */
function extractText(result: unknown): string {
    if (result && typeof (result as any).text === 'string') return (result as any).text;
    if (Array.isArray(result) && result[0] && typeof (result as any)[0].text === 'string') return (result as any)[0].text;
    return '';
}

export interface WhisperSessionHandle { stop(): void; }

/**
 * Start a mic-listening session: captures audio via getUserMedia + AudioContext,
 * runs simple RMS-based VAD (speech starts above threshold; an utterance ends
 * after ~900 ms of silence or 15 s max), transcribes each utterance chunk with
 * whisper, and invokes callbacks. Returns null when unsupported (no
 * getUserMedia/AudioContext/WASM) or when mic access is denied.
 */
export async function startWhisperSession(opts: {
    lang: string;                                  // BCP-47; whisper gets the 2-letter language
    onInterim: (fragment: string) => void;         // VAD detected speech STARTED (fragment = '' placeholder)
    onUtterance: (text: string) => void;           // final transcription of each utterance
    onError: (msg: string) => void;
}): Promise<WhisperSessionHandle | null> {
    try {
        if (typeof window === 'undefined') return null;
        const AC: typeof AudioContext | undefined = (window as any).AudioContext || (window as any).webkitAudioContext;
        const hasMic = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
        if (!AC || !hasMic || typeof (globalThis as any).WebAssembly === 'undefined') return null;

        const lang2 = toWhisperLang(opts.lang);
        const english = lang2 === 'en';
        const modelId = english ? WHISPER_EN_MODEL : WHISPER_MULTI_MODEL;
        // Warm the model in the background — capture starts immediately and
        // the first transcription simply awaits the download.
        void loadPipeline(modelId);

        let stream: MediaStream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch {
            try { opts.onError('Microphone access was denied.'); } catch { /* callback errors never propagate */ }
            return null;
        }

        // 16 kHz capture avoids resampling entirely where the platform allows it.
        let ctx: AudioContext;
        try { ctx = new AC({ sampleRate: 16000 }); } catch { ctx = new AC(); }
        if (ctx.state === 'suspended') { try { void ctx.resume().catch(() => { /* stays suspended */ }); } catch { /* ignore */ } }
        const sampleRate = ctx.sampleRate;
        const source = ctx.createMediaStreamSource(stream);
        // ScriptProcessorNode: deprecated but universally supported — exactly
        // the environments this fallback exists for (no AudioWorklet plumbing).
        const proc = ctx.createScriptProcessor(4096, 1, 1);

        let dead = false;

        // ── Serialized transcription (one at a time; backlog drops oldest) ──
        const queue: Float32Array[] = [];
        let transcribing = false;
        const pump = async () => {
            if (transcribing) return;
            transcribing = true;
            try {
                while (queue.length > 0 && !dead) {
                    const samples = queue.shift();
                    if (!samples) break;
                    const asr = await loadPipeline(modelId);
                    if (dead) return;
                    if (!asr) {
                        try { opts.onError('The on-device Whisper model failed to load.'); } catch { /* ignore */ }
                        return;
                    }
                    try {
                        const result = await asr(samples, english ? {} : { language: lang2, task: 'transcribe' });
                        if (dead) return;
                        const text = extractText(result).trim();
                        // Whisper emits bracketed tags for non-speech ("[BLANK_AUDIO]", "(music)").
                        if (text && !/^[[(].*[\])]$/.test(text)) {
                            try { opts.onUtterance(text); } catch { /* ignore */ }
                        }
                    } catch {
                        /* one bad chunk never kills the session */
                    }
                }
            } finally {
                transcribing = false;
            }
        };

        // ── RMS VAD state ─────────────────────────────────────────────
        let speechActive = false;
        let aboveCount = 0;
        let silenceMs = 0;
        let voicedMs = 0;
        let utteranceMs = 0;
        let chunks: Float32Array[] = [];
        const preRoll: Float32Array[] = [];         // onset context VAD would otherwise clip

        const finalizeUtterance = () => {
            speechActive = false;
            aboveCount = 0;
            silenceMs = 0;
            utteranceMs = 0;
            const captured = chunks;
            chunks = [];
            const voiced = voicedMs;
            voicedMs = 0;
            if (dead || captured.length === 0 || voiced < MIN_VOICED_MS) return;
            let total = 0;
            for (const c of captured) total += c.length;
            const joined = new Float32Array(total);
            let offset = 0;
            for (const c of captured) { joined.set(c, offset); offset += c.length; }
            queue.push(sampleRate === 16000 ? joined : resampleTo16k(joined, sampleRate));
            while (queue.length > 2) queue.shift();  // backlog formed — drop the oldest
            void pump();
        };

        proc.onaudioprocess = (e: AudioProcessingEvent) => {
            if (dead) return;
            try {
                const input = e.inputBuffer.getChannelData(0);
                const bufMs = (input.length / sampleRate) * 1000;
                let sum = 0;
                for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
                const voiced = Math.sqrt(sum / input.length) > RMS_THRESHOLD;

                if (!speechActive) {
                    preRoll.push(new Float32Array(input));
                    if (preRoll.length > 2) preRoll.shift();
                    if (voiced) {
                        aboveCount += 1;
                        if (aboveCount >= VOICED_BUFFERS_TO_START) {
                            speechActive = true;
                            silenceMs = 0;
                            utteranceMs = preRoll.length * bufMs;
                            voicedMs = aboveCount * bufMs;
                            chunks = preRoll.slice();
                            preRoll.length = 0;
                            try { opts.onInterim(''); } catch { /* ignore */ }
                        }
                    } else {
                        aboveCount = 0;
                    }
                    return;
                }

                chunks.push(new Float32Array(input));
                utteranceMs += bufMs;
                if (voiced) { silenceMs = 0; voicedMs += bufMs; } else { silenceMs += bufMs; }
                if (silenceMs >= SILENCE_END_MS || utteranceMs >= MAX_UTTERANCE_MS) finalizeUtterance();
            } catch { /* the audio callback must never throw */ }
        };

        source.connect(proc);
        proc.connect(ctx.destination);              // required for onaudioprocess; output stays silent

        return {
            stop() {
                if (dead) return;
                dead = true;
                queue.length = 0;
                try { proc.onaudioprocess = null; } catch { /* ignore */ }
                try { proc.disconnect(); } catch { /* ignore */ }
                try { source.disconnect(); } catch { /* ignore */ }
                for (const track of stream.getTracks()) { try { track.stop(); } catch { /* ignore */ } }
                try { void ctx.close().catch(() => { /* already closed */ }); } catch { /* ignore */ }
            },
        };
    } catch {
        return null;
    }
}
