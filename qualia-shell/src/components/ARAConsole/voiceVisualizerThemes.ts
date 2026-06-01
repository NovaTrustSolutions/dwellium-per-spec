/**
 * voiceVisualizerThemes — pure rendering registry for the ARA (Aura) voice
 * visualizer. Each theme is a LiveKit-style voice-reactive animation drawn to a
 * 2D canvas. Kept free of React / DOM-lifecycle so the drawing + selection logic
 * is unit-testable with a mock canvas context.
 *
 * A theme's `draw(ctx, frame)` is called once per animation frame. `frame`
 * carries the current audio energy:
 *   - amplitude: 0..1 overall loudness (drives "how big / how bright")
 *   - freq:      optional Uint8Array of frequency-bin magnitudes (0..255) from
 *                an AnalyserNode. Null on the SpeechSynthesis path (no tappable
 *                stream) — themes then synthesize motion from `amplitude`.
 *   - time:      monotonically increasing ms (drives idle drift / phase)
 */

export type VisualizerThemeId = 'galaxy' | 'orb' | 'bars' | 'waveform';

export interface VisualizerFrame {
    width: number;
    height: number;
    amplitude: number;            // 0..1
    freq: Uint8Array | null;      // 0..255 bins, or null
    time: number;                 // ms
    /** Accent color (theme-aware). Defaults to Dwellium acid lime. */
    accent?: string;
}

export interface VisualizerTheme {
    id: VisualizerThemeId;
    label: string;
    description: string;
    draw: (ctx: CanvasRenderingContext2D, frame: VisualizerFrame) => void;
}

const ACCENT = '#D6FE51';        // Dwellium acid lime
const VIOLET = '#7c5cff';

/** Clamp helper. */
function clamp(n: number, lo = 0, hi = 1): number {
    return n < lo ? lo : n > hi ? hi : n;
}

/**
 * Produce a magnitude in 0..1 for "bin i of n" — uses real freq data when
 * present, otherwise a smooth synthetic spectrum driven by amplitude + time so
 * the SpeechSynthesis path (no stream) still animates believably.
 */
function binMagnitude(frame: VisualizerFrame, i: number, n: number): number {
    const { freq, amplitude, time } = frame;
    if (freq && freq.length > 0) {
        const idx = Math.min(freq.length - 1, Math.floor((i / n) * freq.length));
        return clamp(freq[idx] / 255);
    }
    // Synthetic: bell-ish envelope across bins + per-bin shimmer.
    const center = n / 2;
    const envelope = 1 - Math.abs(i - center) / center;          // 0..1, peak in middle
    const shimmer = 0.5 + 0.5 * Math.sin(time / 180 + i * 0.7);   // 0..1
    return clamp(amplitude * (0.45 + 0.55 * envelope) * (0.55 + 0.45 * shimmer));
}

// ── Galaxy / Nebula ──────────────────────────────────────────────────
const galaxy: VisualizerTheme = {
    id: 'galaxy',
    label: 'Galaxy',
    description: 'Nebula core that blooms with the voice, drifting starfield.',
    draw(ctx, f) {
        const { width: w, height: h, amplitude: a, time: t } = f;
        const accent = f.accent ?? ACCENT;
        const cx = w / 2, cy = h / 2;
        ctx.clearRect(0, 0, w, h);

        // Nebula core — radial gradient scaled by amplitude.
        const coreR = Math.max(1, (Math.min(w, h) * 0.18) * (0.7 + a * 0.9));
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.4);
        g.addColorStop(0, withAlpha(accent, 0.55 + a * 0.4));
        g.addColorStop(0.35, withAlpha(VIOLET, 0.35 + a * 0.3));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, coreR * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Drifting stars — deterministic from index + time (no persistent state).
        const stars = 90;
        for (let i = 0; i < stars; i++) {
            const ang = (i / stars) * Math.PI * 2 + t / 4000 + i;
            const rad = (Math.min(w, h) * 0.46) * ((i % 17) / 17) * (0.6 + a * 0.5);
            const x = cx + Math.cos(ang) * rad;
            const y = cy + Math.sin(ang) * rad * 0.7;
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 300 + i));
            ctx.globalAlpha = clamp(tw * (0.5 + a * 0.5));
            ctx.fillStyle = i % 5 === 0 ? accent : '#ffffff';
            const s = 0.6 + (i % 3) * 0.7 + a * 1.4;
            ctx.fillRect(x, y, s, s);
        }
        ctx.globalAlpha = 1;
    },
};

// ── Orb (LiveKit signature) ──────────────────────────────────────────
const orb: VisualizerTheme = {
    id: 'orb',
    label: 'Orb',
    description: 'A breathing central orb with concentric rings — classic assistant look.',
    draw(ctx, f) {
        const { width: w, height: h, amplitude: a, time: t } = f;
        const accent = f.accent ?? ACCENT;
        const cx = w / 2, cy = h / 2;
        ctx.clearRect(0, 0, w, h);
        const base = Math.min(w, h) * 0.16;

        // Outer rings pulse outward with amplitude.
        for (let r = 0; r < 4; r++) {
            const phase = (t / 900 + r * 0.5) % 1;
            const ringR = base * (1 + phase * 2.2) * (0.8 + a * 0.7);
            ctx.globalAlpha = clamp((1 - phase) * (0.25 + a * 0.5));
            ctx.strokeStyle = r % 2 === 0 ? accent : VIOLET;
            ctx.lineWidth = 1.5 + a * 2;
            ctx.beginPath();
            ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // Core orb.
        const orbR = Math.max(1, base * (0.85 + a * 0.6));
        const g = ctx.createRadialGradient(cx - orbR * 0.3, cy - orbR * 0.3, 0, cx, cy, orbR);
        g.addColorStop(0, withAlpha('#ffffff', 0.9));
        g.addColorStop(0.4, withAlpha(accent, 0.85));
        g.addColorStop(1, withAlpha(VIOLET, 0.5));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
        ctx.fill();
    },
};

// ── Bars (LiveKit BarVisualizer) ─────────────────────────────────────
const bars: VisualizerTheme = {
    id: 'bars',
    label: 'Bars',
    description: 'Frequency bars that dance to the spectrum of the voice.',
    draw(ctx, f) {
        const { width: w, height: h } = f;
        const accent = f.accent ?? ACCENT;
        ctx.clearRect(0, 0, w, h);
        const n = 28;
        const gap = 3;
        const bw = (w - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
            const m = binMagnitude(f, i, n);
            const bh = Math.max(2, m * h * 0.9);
            const x = i * (bw + gap);
            const y = (h - bh) / 2;
            const grad = ctx.createLinearGradient(0, y, 0, y + bh);
            grad.addColorStop(0, accent);
            grad.addColorStop(1, withAlpha(VIOLET, 0.7));
            ctx.fillStyle = grad;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(x, y, bw, bh);
        }
        ctx.globalAlpha = 1;
    },
};

// ── Waveform ─────────────────────────────────────────────────────────
const waveform: VisualizerTheme = {
    id: 'waveform',
    label: 'Waveform',
    description: 'A single luminous waveform tracing the voice envelope.',
    draw(ctx, f) {
        const { width: w, height: h, amplitude: a } = f;
        const accent = f.accent ?? ACCENT;
        ctx.clearRect(0, 0, w, h);
        const cy = h / 2;
        const n = 64;
        ctx.lineWidth = 2 + a * 2;
        ctx.strokeStyle = accent;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        for (let i = 0; i <= n; i++) {
            const m = binMagnitude(f, i, n);
            const x = (i / n) * w;
            const dir = i % 2 === 0 ? 1 : -1;
            const y = cy + dir * m * (h * 0.4);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
    },
};

/** Apply alpha to a #rrggbb hex (or pass through rgba/named). */
export function withAlpha(color: string, alpha: number): string {
    const a = clamp(alpha);
    if (/^#([0-9a-f]{6})$/i.test(color)) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${a})`;
    }
    return color;
}

export const VISUALIZER_THEMES: VisualizerTheme[] = [galaxy, orb, bars, waveform];

export const DEFAULT_THEME_ID: VisualizerThemeId = 'galaxy';

/** Look up a theme by id, falling back to the default. */
export function getTheme(id: string | null | undefined): VisualizerTheme {
    return VISUALIZER_THEMES.find(t => t.id === id) ?? VISUALIZER_THEMES[0];
}

/** Cycle to the next theme id (wraps). Used by the switcher control. */
export function nextThemeId(id: VisualizerThemeId): VisualizerThemeId {
    const idx = VISUALIZER_THEMES.findIndex(t => t.id === id);
    const next = VISUALIZER_THEMES[(idx + 1) % VISUALIZER_THEMES.length];
    return next.id;
}

export { binMagnitude };
