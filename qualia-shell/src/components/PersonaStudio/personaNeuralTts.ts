/**
 * personaNeuralTts — FREE on-device neural TTS for Persona Studio voices.
 *
 * Lazy singleton around kokoro-js (Kokoro-82M ONNX running locally via
 * @huggingface/transformers on WebGPU when available, WASM otherwise). The
 * model is a ~90 MB one-time download from the Hugging Face Hub, cached by
 * the browser (Cache Storage) so subsequent sessions load instantly. No API
 * key, no network round-trips per utterance — synthesis happens entirely on
 * this device.
 *
 * CRITICAL bundling contract: kokoro-js is ONLY ever loaded through a
 * dynamic `import('kokoro-js')` inside ensureKokoro(), so the transformers
 * runtime lands in its own lazy chunk — the main bundle and the vitest
 * graph never touch it. Do NOT add a static import of kokoro-js anywhere.
 *
 * Every export is throw-proof: callers get status/null and fall back to the
 * browser SpeechSynthesis path, so the persona is never mute.
 *
 * 2026-07-05 created (Persona Studio arc, Bucket B-8).
 */

export type KokoroStatus = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

/** kokoro-js model id + quantization (q8 ≈ 90 MB, best quality/size trade). */
const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/** Minimal structural typing for the lazily-imported kokoro-js instance. */
interface KokoroTTSLike {
    generate(text: string, options: { voice: string; speed: number }): Promise<{ toBlob(): Blob }>;
}

// ── Module-level singleton state ──────────────────────────────────────
let status: KokoroStatus = 'idle';
let progress = 0;                                   // 0..1 during model download
let ttsPromise: Promise<KokoroTTSLike | null> | null = null;
let sawNetworkProgress = false;
const listeners = new Set<(status: KokoroStatus, progress: number) => void>();

function publish(next: KokoroStatus, nextProgress: number) {
    status = next;
    progress = nextProgress;
    for (const cb of listeners) {
        try { cb(status, progress); } catch { /* listener errors never propagate */ }
    }
}

export function getKokoroStatus(): KokoroStatus {
    return status;
}

/** Subscribe to status/progress changes (progress 0..1 during model download). Returns unsubscribe. */
export function subscribeKokoro(cb: (status: KokoroStatus, progress: number) => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

/**
 * Idempotent: kicks off (or reuses) the model load. Resolves true when ready.
 * SSR-safe (no-ops server-side) and never throws — failures surface as
 * 'error' / 'unsupported' status instead.
 */
export async function ensureKokoro(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (!ttsPromise) {
        publish('loading', 0);
        ttsPromise = (async (): Promise<KokoroTTSLike | null> => {
            try {
                const { KokoroTTS } = await import('kokoro-js');
                const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
                    dtype: 'q8',
                    device: (navigator as any).gpu ? 'webgpu' : 'wasm',
                    progress_callback: (item: any) => {
                        if (item && item.status === 'progress' && typeof item.progress === 'number') {
                            sawNetworkProgress = true;
                            publish('loading', Math.max(0, Math.min(1, item.progress / 100)));
                        }
                    },
                });
                publish('ready', 1);
                return tts as unknown as KokoroTTSLike;
            } catch {
                // No WebAssembly + nothing ever downloaded → the runtime itself
                // can't exist here; otherwise it's a (possibly transient) error.
                const noWasm = typeof (globalThis as any).WebAssembly === 'undefined';
                publish(!sawNetworkProgress && noWasm ? 'unsupported' : 'error', 0);
                return null;
            }
        })();
    }
    const tts = await ttsPromise;
    return tts !== null;
}

/**
 * Synthesize one utterance on-device. Returns a WAV Blob, or null when the
 * model is not ready / failed — callers fall back to browser SpeechSynthesis.
 */
export async function synthesizeKokoro(text: string, kokoroVoice: string, speed: number): Promise<Blob | null> {
    try {
        if (typeof window === 'undefined') return null;
        if (!ttsPromise) {
            void ensureKokoro();                    // warm the model for next time…
            return null;                            // …but never block speech on a cold load
        }
        if (status === 'loading') return null;      // mid-download — caller falls back for this chunk
        const tts = await ttsPromise;
        if (!tts) return null;
        const audio = await tts.generate(text, {
            voice: kokoroVoice,
            speed: Math.max(0.5, Math.min(2, speed)),
        });
        return audio.toBlob();
    } catch {
        return null;
    }
}
