/**
 * speakerEmbedder — turns a voice sample into a neural speaker embedding
 * (voiceprint) using Transformers.js running fully in the browser.
 *
 * Primary path: an x-vector speaker model (WavLM-SV) via `@huggingface/transformers`,
 * the same in-browser ML stack the app already uses for Moonshine ASR. The model
 * is heavy, so it's dynamically imported (code-split) and lazy-loaded on first use.
 *
 * Fallback path: if the model can't load/run (offline, asset blocked, API drift),
 * we compute a small DETERMINISTIC signal feature vector so enrollment + matching
 * still function — clearly reported via `getEmbedderMode()` so the UI can say
 * "neural" vs "basic". This is honest degradation, never a fake "neural" claim.
 *
 * Browser-only: all model/audio work is guarded; on the server it reports
 * 'unavailable' and never touches `window`.
 */

// Configurable embedding model. WavLM-SV is the verified Transformers.js
// x-vector default; a stronger model (ECAPA-TDNN / WeSpeaker exported to ONNX)
// can be selected here, but needs a browser run to validate the load.
export const MODEL_CANDIDATES = ['Xenova/wavlm-base-plus-sv'];
let currentModelId = MODEL_CANDIDATES[0];
export function setEmbedderModel(id: string): void {
    currentModelId = id;
    pipePromise = null;        // force reload with the new model
    mode = 'unavailable';
}
export function getEmbedderModel(): string { return currentModelId; }

const TARGET_RATE = 16000;

export type EmbedderMode = 'neural' | 'basic' | 'unavailable';

let mode: EmbedderMode = 'unavailable';
let pipePromise: Promise<((audio: Float32Array, opts?: unknown) => Promise<unknown>) | null> | null = null;

export function getEmbedderMode(): EmbedderMode {
    return mode;
}

/** Linear-interpolation downsample to 16 kHz mono. Pure + testable. */
export function downsampleTo16k(samples: Float32Array, fromRate: number): Float32Array {
    if (fromRate === TARGET_RATE || samples.length === 0) return samples;
    const ratio = fromRate / TARGET_RATE;
    const outLen = Math.max(1, Math.floor(samples.length / ratio));
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
        const src = i * ratio;
        const i0 = Math.floor(src);
        const i1 = Math.min(samples.length - 1, i0 + 1);
        const frac = src - i0;
        out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
    }
    return out;
}

/** Mix a (browser) AudioBuffer to mono and downsample to 16 kHz. */
export function audioBufferToMono16k(buffer: AudioBuffer): Float32Array {
    const ch = buffer.numberOfChannels;
    const len = buffer.length;
    const mono = new Float32Array(len);
    for (let c = 0; c < ch; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < len; i++) mono[i] += data[i] / ch;
    }
    return downsampleTo16k(mono, buffer.sampleRate);
}

/**
 * Deterministic fallback voiceprint: framed RMS + zero-crossing-rate over N
 * frames → a fixed-length vector. Not as discriminative as the neural model,
 * but real, stable, and good enough to keep the library usable when the model
 * is unavailable. (32-dim: 16 RMS frames + 16 ZCR frames.)
 */
export function fallbackEmbedding(samples: Float32Array, frames = 16): number[] {
    const out: number[] = [];
    if (samples.length === 0) return new Array(frames * 2).fill(0);
    const frameLen = Math.max(1, Math.floor(samples.length / frames));
    for (let f = 0; f < frames; f++) {
        const start = f * frameLen;
        const end = Math.min(samples.length, start + frameLen);
        let sq = 0, zc = 0;
        for (let i = start; i < end; i++) {
            sq += samples[i] * samples[i];
            if (i > start && ((samples[i] >= 0) !== (samples[i - 1] >= 0))) zc++;
        }
        const n = Math.max(1, end - start);
        out.push(Math.sqrt(sq / n));      // RMS
        out.push(zc / n);                 // ZCR
    }
    return out;
}

async function loadPipeline() {
    if (typeof window === 'undefined') return null;
    try {
        const tjs: any = await import('@huggingface/transformers');
        if (tjs?.env) {
            // Allow remote model fetch from the HF hub; cache in the browser.
            tjs.env.allowLocalModels = false;
        }
        const pipe = await tjs.pipeline('audio-xvector', currentModelId);
        mode = 'neural';
        return pipe as (audio: Float32Array, opts?: unknown) => Promise<unknown>;
    } catch (err) {
        console.warn('[speakerEmbedder] neural model unavailable — using basic fallback:', err);
        mode = 'basic';
        return null;
    }
}

/** Extract a flat number[] embedding from various Transformers.js output shapes. */
function extractEmbedding(output: any): number[] | null {
    const t = output?.embeddings ?? output;
    if (!t) return null;
    if (Array.isArray(t)) return (Array.isArray(t[0]) ? t[0] : t).map(Number);
    if (typeof t.tolist === 'function') {
        const l = t.tolist();
        return (Array.isArray(l[0]) ? l[0] : l).map(Number);
    }
    if (t.data) return Array.from(t.data as ArrayLike<number>, Number);
    return null;
}

/**
 * Embed a 16 kHz mono Float32Array into a speaker voiceprint. Prefers the neural
 * model; falls back to the deterministic feature vector. Returns null only when
 * there's nothing to embed.
 */
export async function embedAudio(audio16k: Float32Array): Promise<number[] | null> {
    if (!audio16k || audio16k.length === 0) return null;
    if (typeof window === 'undefined') return fallbackEmbedding(audio16k);

    if (!pipePromise) pipePromise = loadPipeline();
    const pipe = await pipePromise;

    if (pipe) {
        try {
            const out = await pipe(audio16k);
            const emb = extractEmbedding(out);
            if (emb && emb.length > 0) return emb;
        } catch (err) {
            console.warn('[speakerEmbedder] inference failed — using fallback:', err);
            mode = 'basic';
        }
    }
    return fallbackEmbedding(audio16k);
}

/** Convenience: embed straight from an AudioBuffer (recorder path). */
export async function embedAudioBuffer(buffer: AudioBuffer): Promise<number[] | null> {
    return embedAudio(audioBufferToMono16k(buffer));
}

// ── Energy-based VAD + window gating (pure, testable) ──────────────────
// A neural VAD (Silero via @ricky0123/vad-web) would be more accurate but is a
// new dependency + browser-only; this energy VAD is dependency-free and good
// enough to strip silence and reject too-short/too-quiet windows — both of
// which otherwise produce unreliable voiceprints.

/** RMS energy per fixed-length frame. */
export function frameEnergies(samples: Float32Array, frameLen = 400): number[] {
    const out: number[] = [];
    for (let i = 0; i < samples.length; i += frameLen) {
        const end = Math.min(samples.length, i + frameLen);
        let sq = 0;
        for (let j = i; j < end; j++) sq += samples[j] * samples[j];
        out.push(Math.sqrt(sq / Math.max(1, end - i)));
    }
    return out;
}

/** Fraction of frames whose energy exceeds `threshold` (0..1). */
export function voicedRatio(samples: Float32Array, threshold = 0.01, frameLen = 400): number {
    const e = frameEnergies(samples, frameLen);
    if (e.length === 0) return 0;
    return e.filter(x => x > threshold).length / e.length;
}

/** Trim leading/trailing silent frames; returns just the voiced span. */
export function trimSilence(samples: Float32Array, threshold = 0.01, frameLen = 400): Float32Array {
    const e = frameEnergies(samples, frameLen);
    const first = e.findIndex(x => x > threshold);
    let last = -1;
    for (let i = e.length - 1; i >= 0; i--) { if (e[i] > threshold) { last = i; break; } }
    if (first < 0 || last < 0) return new Float32Array(0);
    return samples.slice(first * frameLen, Math.min(samples.length, (last + 1) * frameLen));
}

export interface EmbedGateOptions { minMs?: number; minVoicedRatio?: number; energyThreshold?: number; }

/**
 * Should this window be embedded? Requires enough duration AND enough voiced
 * content — rejecting short/quiet windows is a large accuracy win (a 0.5s "yeah"
 * or a silent gap yields a garbage voiceprint that flips the speaker).
 */
export function shouldEmbed(samples: Float32Array, sampleRate = TARGET_RATE, opts: EmbedGateOptions = {}): boolean {
    const minMs = opts.minMs ?? 800;
    const minVoiced = opts.minVoicedRatio ?? 0.25;
    const thr = opts.energyThreshold ?? 0.01;
    if ((samples.length / sampleRate) * 1000 < minMs) return false;
    return voicedRatio(samples, thr) >= minVoiced;
}
