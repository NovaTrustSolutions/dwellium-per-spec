/**
 * Pure WCAG-contrast helpers shared by the theme-contrast test (plan 064) and the
 * `--accent-text` token work (plan 065): parsing/compositing colours, measuring
 * contrast, and nudging a colour's lightness until it clears a contrast target.
 *
 * No browser globals, no React — safe to import at module top level anywhere,
 * including SSR.
 */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
    let h = hex.replace('#', '');
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

function rgbToHex(rgb: Rgb): string {
    return '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** `#rgb`, `#rrggbb` or `rgba(r,g,b,a)` → colour + alpha. Anything else throws. */
export function parseColor(value: string): { rgb: Rgb; alpha: number } {
    const v = value.trim();
    const rgba = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(v);
    if (rgba) return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: rgba[4] !== undefined ? Number(rgba[4]) : 1 };
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) return { rgb: hexToRgb(v), alpha: 1 };
    throw new Error(`cannot parse colour "${value}"`);
}

export function luminance(rgb: Rgb): number {
    const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of a (possibly translucent) foreground composited over an opaque background. */
export function contrast(fg: { rgb: Rgb; alpha: number }, bg: Rgb): number {
    const painted = fg.rgb.map((v, i) => v * fg.alpha + bg[i] * (1 - fg.alpha)) as Rgb;
    const a = luminance(painted);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Composites `fg` at `alpha` over `bg` and returns the flattened `#rrggbb` result. */
export function tint(fg: string, bg: string, alpha: number): string {
    const f = parseColor(fg);
    const b = parseColor(bg);
    const rgb = f.rgb.map((v, i) => v * alpha + b.rgb[i] * (1 - alpha)) as Rgb;
    return rgbToHex(rgb);
}

function rgbToHsl(rgb: Rgb): [number, number, number] {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): Rgb {
    if (s === 0) return [l * 255, l * 255, l * 255];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t: number): number => {
        let tt = t;
        if (tt < 0) tt += 1;
        if (tt > 1) tt -= 1;
        if (tt < 1 / 6) return p + (q - p) * 6 * tt;
        if (tt < 1 / 2) return q;
        if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
        return p;
    };
    const hk = h / 360;
    return [hue2rgb(hk + 1 / 3) * 255, hue2rgb(hk) * 255, hue2rgb(hk - 1 / 3) * 255];
}

/**
 * Keeps `color`'s hue and saturation, moves lightness only (lighter over dark
 * backgrounds, darker over light ones) in small steps until the WORST of
 * `backgrounds` reaches `target` contrast, rounding to `#rrggbb` at each step.
 * Already-safe input is returned UNCHANGED (same string). Translucent input is
 * treated as its rgb at alpha 1. Never throws: an unreachable target returns the
 * best candidate found (the white/black end of the lightness range).
 */
/**
 * Target to AIM for when producing a colour. The requirement is 4.5:1; a browser's own `color-mix()`
 * rounds a tint one step differently from our arithmetic, which turned a computed 4.50 into a measured
 * 4.49 (axe, cyberpunk, plan 065). Tests still assert the real 4.5.
 */
export const CONTRAST_AIM = 4.6;

export function nudgeToContrast(color: string, backgrounds: string[], target = 4.5): string {
    let parsed: { rgb: Rgb; alpha: number };
    try {
        parsed = parseColor(color);
    } catch {
        return color;
    }
    const bgRgbs: Rgb[] = [];
    for (const b of backgrounds) {
        try {
            bgRgbs.push(parseColor(b).rgb);
        } catch {
            /* skip unparsable background */
        }
    }
    if (bgRgbs.length === 0) return color;

    const worstRatio = (rgb: Rgb): number => Math.min(...bgRgbs.map((bg) => contrast({ rgb, alpha: 1 }, bg)));

    if (worstRatio(parsed.rgb) >= target) return color;

    // Direction comes from the BINDING background (the one with the worst ratio), not the mean:
    // with backgrounds straddling mid-luminance the mean can point away from the one that fails.
    const binding = bgRgbs.reduce((worst, bg) => (contrast({ rgb: parsed.rgb, alpha: 1 }, bg) < contrast({ rgb: parsed.rgb, alpha: 1 }, worst) ? bg : worst));
    const lighter = luminance(binding) < 0.5;

    const [h, s, startL] = rgbToHsl(parsed.rgb);
    let l = startL;
    const step = 0.002;
    let bestHex = rgbToHex(parsed.rgb);
    let bestRatio = worstRatio(parsed.rgb);

    for (let i = 0; i < 600; i++) {
        l = lighter ? Math.min(1, l + step) : Math.max(0, l - step);
        const rgb = hslToRgb(h, s, l);
        const ratio = worstRatio(rgb);
        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestHex = rgbToHex(rgb);
        }
        if (ratio >= target) return rgbToHex(rgb);
        if (l <= 0 || l >= 1) break;
    }
    return bestHex;
}
