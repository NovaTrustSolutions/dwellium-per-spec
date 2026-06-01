/**
 * VoiceVisualizer — a LiveKit-style, voice-reactive animation for ARA (Aura).
 *
 * Shows an animated overlay while ARA is speaking. When ARA uses OpenAI TTS
 * (a real <audio> element), the animation is driven by REAL audio energy via a
 * Web Audio AnalyserNode tapped off that element. On the browser-SpeechSynthesis
 * fallback (no tappable stream) it animates from a synthetic envelope so it
 * still responds to speaking on/off. Users can switch templates (Galaxy / Orb /
 * Bars / Waveform); the choice persists per browser.
 *
 * SSR / test safety: every browser global (window, AudioContext, canvas 2D ctx,
 * requestAnimationFrame, localStorage) is feature-detected. In SSR and jsdom the
 * component mounts and switches themes without throwing; drawing is simply a
 * no-op when no 2D context / RAF is available.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
    VISUALIZER_THEMES,
    DEFAULT_THEME_ID,
    getTheme,
    type VisualizerThemeId,
} from './voiceVisualizerThemes';

const STORAGE_KEY = 'ara-visualizer-theme';

function readStoredTheme(): VisualizerThemeId {
    if (typeof window === 'undefined') return DEFAULT_THEME_ID;
    try {
        const v = window.localStorage.getItem(STORAGE_KEY);
        if (v && VISUALIZER_THEMES.some(t => t.id === v)) return v as VisualizerThemeId;
    } catch { /* sandboxed */ }
    return DEFAULT_THEME_ID;
}

export interface VoiceVisualizerProps {
    /** True while ARA is speaking. Drives the animation on/off. */
    active: boolean;
    /** Ref to the live TTS <audio> element (OpenAI path). Null on SpeechSynthesis. */
    audioRef?: React.RefObject<HTMLAudioElement | null>;
    /** Show the template switcher control (default true). */
    showSwitcher?: boolean;
}

export default function VoiceVisualizer({ active, audioRef, showSwitcher = true }: VoiceVisualizerProps) {
    const [themeId, setThemeId] = useState<VisualizerThemeId>(readStoredTheme);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    // Web Audio graph (lazy, guarded).
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const connectedElRef = useRef<HTMLMediaElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const smoothedAmpRef = useRef(0);

    const selectTheme = useCallback((id: VisualizerThemeId) => {
        setThemeId(id);
        if (typeof window !== 'undefined') {
            try { window.localStorage.setItem(STORAGE_KEY, id); } catch { /* sandboxed */ }
        }
    }, []);

    // Attach an AnalyserNode to the current TTS audio element (once per element).
    const ensureAnalyser = useCallback(() => {
        if (typeof window === 'undefined') return null;
        const AC: typeof AudioContext | undefined =
            (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return null;
        const el = audioRef?.current ?? null;
        if (!el) return null;
        try {
            if (!audioCtxRef.current) audioCtxRef.current = new AC();
            const ctx = audioCtxRef.current;
            if (ctx.state === 'suspended') ctx.resume().catch(() => { /* needs gesture */ });
            if (connectedElRef.current !== el) {
                // New element → (re)build the source→analyser→destination graph.
                const src = ctx.createMediaElementSource(el);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.8;
                src.connect(analyser);
                analyser.connect(ctx.destination); // keep audio audible
                analyserRef.current = analyser;
                connectedElRef.current = el;
            }
            return analyserRef.current;
        } catch {
            // createMediaElementSource throws if the element was already tapped
            // by another context, or cross-origin tainted — fall back to synthetic.
            return analyserRef.current;
        }
    }, [audioRef]);

    useEffect(() => {
        if (!active) {
            // Stop the loop and clear the canvas.
            if (rafRef.current != null && typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = null;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext?.('2d');
            if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            smoothedAmpRef.current = 0;
            return;
        }

        if (typeof requestAnimationFrame === 'undefined') return; // SSR / jsdom

        const analyser = ensureAnalyser();
        const freqData = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

        const render = () => {
            const canvas = canvasRef.current;
            const ctx2d = canvas?.getContext?.('2d');
            if (canvas && ctx2d) {
                // Size to container (DPR-aware).
                const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
                const cssW = canvas.clientWidth || 320;
                const cssH = canvas.clientHeight || 120;
                const needW = Math.round(cssW * dpr);
                const needH = Math.round(cssH * dpr);
                if (canvas.width !== needW || canvas.height !== needH) {
                    canvas.width = needW; canvas.height = needH;
                }

                // Amplitude: real analyser energy, or synthetic envelope.
                let amp: number;
                if (analyser && freqData) {
                    analyser.getByteFrequencyData(freqData);
                    let sum = 0;
                    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
                    amp = sum / (freqData.length * 255);
                } else {
                    const t = Date.now() / 1000;
                    amp = 0.35 + 0.3 * Math.abs(Math.sin(t * 3.1)) + 0.15 * Math.abs(Math.sin(t * 7.7));
                }
                // Smooth so it doesn't strobe.
                smoothedAmpRef.current += (amp - smoothedAmpRef.current) * 0.25;

                getTheme(themeId).draw(ctx2d, {
                    width: canvas.width,
                    height: canvas.height,
                    amplitude: Math.max(0, Math.min(1, smoothedAmpRef.current)),
                    freq: freqData,
                    time: typeof performance !== 'undefined' ? performance.now() : Date.now(),
                });
            }
            rafRef.current = requestAnimationFrame(render);
        };
        rafRef.current = requestAnimationFrame(render);

        return () => {
            if (rafRef.current != null && typeof cancelAnimationFrame !== 'undefined') {
                cancelAnimationFrame(rafRef.current);
            }
            rafRef.current = null;
        };
    }, [active, themeId, ensureAnalyser]);

    return (
        <div
            className="ara-visualizer"
            data-active={active ? 'true' : 'false'}
            data-theme={themeId}
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                opacity: active ? 1 : 0,
                transition: 'opacity 320ms ease',
                zIndex: 2,
            }}
        >
            <canvas ref={canvasRef} aria-hidden="true" style={{ width: '100%', height: '100%', display: 'block' }} />

            {showSwitcher && active && (
                <div
                    className="ara-visualizer__switcher"
                    role="group"
                    aria-label="Voice visualizer template"
                    style={{
                        position: 'absolute',
                        top: 8,
                        right: 8,
                        display: 'flex',
                        gap: 4,
                        pointerEvents: 'auto',
                        background: 'rgba(0,0,0,0.35)',
                        borderRadius: 999,
                        padding: 4,
                        backdropFilter: 'blur(6px)',
                    }}
                >
                    {VISUALIZER_THEMES.map(t => (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => selectTheme(t.id)}
                            title={t.description}
                            aria-pressed={t.id === themeId}
                            aria-label={`Visualizer: ${t.label}`}
                            style={{
                                font: '11px/1 system-ui, sans-serif',
                                color: t.id === themeId ? '#0c0c0c' : '#fff',
                                background: t.id === themeId ? '#D6FE51' : 'transparent',
                                border: '1px solid rgba(255,255,255,0.25)',
                                borderRadius: 999,
                                padding: '4px 8px',
                                cursor: 'pointer',
                            }}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
