/**
 * PersonaAvatarCanvas — the persona's "face": a theme-driven, always-alive
 * canvas animation (idle breathing when quiet, full amplitude while speaking).
 *
 * Reuses the ARA voiceVisualizerThemes draw functions but is PROP-driven
 * (theme comes from the persona config, not the visualizer's own localStorage)
 * so the Avatar tab selection applies instantly. Real audio reactivity taps
 * the OpenAI TTS <audio> element when present; browser SpeechSynthesis has no
 * tappable stream so a synthetic envelope animates instead (same fallback
 * strategy as VoiceVisualizer.tsx).
 *
 * SSR/test safe: window / AudioContext / RAF / 2D context all feature-detected.
 */
import { useCallback, useEffect, useRef } from 'react';
import { getTheme, type VisualizerThemeId } from '../ARAConsole/voiceVisualizerThemes';

export interface PersonaAvatarCanvasProps {
    themeId: VisualizerThemeId;
    /** True while the persona is speaking — drives full-energy animation. */
    speaking: boolean;
    /** True while a call is live — idle "breathing" animation when not speaking. */
    live: boolean;
    /** OpenAI TTS audio element (null on browser SpeechSynthesis). */
    audioRef?: React.RefObject<HTMLAudioElement | null>;
}

export default function PersonaAvatarCanvas({ themeId, speaking, live, audioRef }: PersonaAvatarCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const connectedElRef = useRef<HTMLMediaElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const smoothedAmpRef = useRef(0);
    const speakingRef = useRef(speaking);
    speakingRef.current = speaking;

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
                const src = ctx.createMediaElementSource(el);
                const analyser = ctx.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.8;
                src.connect(analyser);
                analyser.connect(ctx.destination);
                analyserRef.current = analyser;
                connectedElRef.current = el;
            }
            return analyserRef.current;
        } catch {
            return analyserRef.current;
        }
    }, [audioRef]);

    useEffect(() => {
        if (!live) {
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

        const render = () => {
            const canvas = canvasRef.current;
            const ctx2d = canvas?.getContext?.('2d');
            if (canvas && ctx2d) {
                const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
                const cssW = canvas.clientWidth || 320;
                const cssH = canvas.clientHeight || 240;
                const needW = Math.round(cssW * dpr);
                const needH = Math.round(cssH * dpr);
                if (canvas.width !== needW || canvas.height !== needH) {
                    canvas.width = needW; canvas.height = needH;
                }

                const analyser = speakingRef.current ? ensureAnalyser() : null;
                let amp: number;
                let freq: Uint8Array | null = null;
                if (analyser) {
                    freq = new Uint8Array(analyser.frequencyBinCount);
                    analyser.getByteFrequencyData(freq);
                    let sum = 0;
                    for (let i = 0; i < freq.length; i++) sum += freq[i];
                    amp = sum / (freq.length * 255);
                } else if (speakingRef.current) {
                    const t = Date.now() / 1000;
                    amp = 0.35 + 0.3 * Math.abs(Math.sin(t * 3.1)) + 0.15 * Math.abs(Math.sin(t * 7.7));
                } else {
                    // Idle breathing — the persona looks alive between turns.
                    const t = Date.now() / 1000;
                    amp = 0.08 + 0.05 * Math.abs(Math.sin(t * 0.9));
                }
                smoothedAmpRef.current += (amp - smoothedAmpRef.current) * 0.25;

                getTheme(themeId).draw(ctx2d, {
                    width: canvas.width,
                    height: canvas.height,
                    amplitude: Math.max(0, Math.min(1, smoothedAmpRef.current)),
                    freq,
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
    }, [live, themeId, ensureAnalyser]);

    return (
        <canvas
            ref={canvasRef}
            aria-hidden="true"
            className="pstudio__avatar-canvas"
        />
    );
}
