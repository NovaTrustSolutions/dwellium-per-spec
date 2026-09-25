/**
 * Master themes — `--text` and `--muted` reach WCAG AA (4.5:1) on their own surfaces (plan 064).
 *
 * `themes-master.css` bridges `--text` → `--text-primary` and `--muted` → `--text-secondary` /
 * `--text-tertiary`, and `--bg` / `--surface` / `--surface2` → the desktop, surface and elevated
 * surface tokens, so these six values decide whether every widget's text is readable. Parsed
 * from the stylesheet itself: a new theme block is checked without anyone remembering to add it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../styles/themes-master.css'), 'utf8');
const THEME_CONTEXT = readFileSync(resolve(__dirname, '../context/ThemeContext.tsx'), 'utf8');

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
    let h = hex.replace('#', '');
    if (h.length === 3) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

/** `#rgb`, `#rrggbb` or `rgba(r,g,b,a)` → colour + alpha. Anything else is a test failure, not a skip. */
function parseColor(value: string): { rgb: Rgb; alpha: number } {
    const rgba = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(value);
    if (rgba) return { rgb: [Number(rgba[1]), Number(rgba[2]), Number(rgba[3])], alpha: Number(rgba[4]) };
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return { rgb: hexToRgb(value), alpha: 1 };
    throw new Error(`cannot parse colour "${value}"`);
}

function luminance(rgb: Rgb): number {
    const [r, g, b] = rgb.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast of a (possibly translucent) foreground composited over an opaque background. */
function contrast(fg: { rgb: Rgb; alpha: number }, bg: Rgb): number {
    const painted = fg.rgb.map((v, i) => v * fg.alpha + bg[i] * (1 - fg.alpha)) as Rgb;
    const a = luminance(painted);
    const b = luminance(bg);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const themes = [...CSS.matchAll(/\.theme-([\w-]+)\{([^}]*)\}/g)]
    .map((m) => ({ name: m[1], tokens: Object.fromEntries([...m[2].matchAll(/--([\w-]+):([^;]+);/g)].map((t) => [t[1], t[2].trim()])) }))
    .filter((t) => t.tokens.text && t.tokens.muted);

describe('master themes — text contrast on their own surfaces', () => {
    it('every theme the picker offers has a palette block (a new theme cannot skip this file)', () => {
        const set = /VALID_PICKER_THEMES = new Set<Theme>\(\[([^\]]+)\]/.exec(THEME_CONTEXT);
        expect(set, 'VALID_PICKER_THEMES not found in ThemeContext.tsx').not.toBeNull();
        const picker = [...set![1].matchAll(/'([\w-]+)'/g)].map((m) => m[1]);
        expect(picker.length).toBeGreaterThanOrEqual(16);
        const missing = picker.filter((name) => !themes.some((t) => t.name === name));
        expect(missing).toEqual([]);
    });

    it.each(themes.map((t) => [t.name, t] as const))('%s: --text and --muted are ≥ 4.5:1 on --bg, --surface and --surface2', (_name, theme) => {
        const failures: string[] = [];
        for (const token of ['text', 'muted'] as const) {
            for (const surface of ['bg', 'surface', 'surface2'] as const) {
                const ratio = contrast(parseColor(theme.tokens[token]), parseColor(theme.tokens[surface]).rgb);
                if (ratio < 4.5) failures.push(`--${token} ${theme.tokens[token]} on --${surface} ${theme.tokens[surface]} = ${ratio.toFixed(2)}:1`);
            }
        }
        expect(failures).toEqual([]);
    });
});
