/**
 * `--accent-text` runtime derivation (plan 065, phase 2).
 *
 * `ThemeContext.tsx`'s accent-applying effect derives `--accent-text` from whatever custom accent
 * the user picks, via `nudgeToContrast`/`tint` from `src/utils/contrast.ts` — the same helpers
 * `themeContrast.test.ts` uses for the theme-file values. Kept pure here: these are exactly the
 * functions the effect calls, so testing them directly covers the effect's logic without needing
 * to render `ThemeProvider` (no existing `ThemeContext` component test to extend — see repo grep).
 */
import { describe, expect, it } from 'vitest';
import { nudgeToContrast, tint, parseColor, contrast } from '../utils/contrast';

function worstRatio(color: string, backgrounds: string[]): number {
    return Math.min(...backgrounds.map((bg) => contrast(parseColor(color), parseColor(bg).rgb)));
}

function hueOf(hex: string): number {
    const [r, g, b] = parseColor(hex).rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    let h: number;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    return h;
}

/** Same 5-background shape ThemeContext.tsx builds from the theme's computed --bg/--surface/--surface2. */
function backgroundsFor(accent: string, bg: string, surface: string, surface2: string): string[] {
    return [bg, surface, surface2, tint(accent, surface, 0.14), tint(accent, surface2, 0.14)];
}

describe('nudgeToContrast — --accent-text runtime derivation', () => {
    it('a dark-on-dark pick (#333399 on cosmos surfaces) reaches 4.5:1 on all five backgrounds, hue preserved within 2 degrees', () => {
        const accent = '#333399';
        const backgrounds = backgroundsFor(accent, '#08081a', '#0f0f1e', '#13132a');
        const nudged = nudgeToContrast(accent, backgrounds);
        expect(worstRatio(nudged, backgrounds)).toBeGreaterThanOrEqual(4.5);
        expect(Math.abs(hueOf(nudged) - hueOf(accent))).toBeLessThanOrEqual(2);
    });

    it('a light-theme pick (#ffee00 on latte surfaces) reaches 4.5:1 by going darker', () => {
        const accent = '#ffee00';
        const backgrounds = backgroundsFor(accent, '#ede8ff', '#f8f5ff', '#e4dcff');
        const nudged = nudgeToContrast(accent, backgrounds);
        expect(worstRatio(nudged, backgrounds)).toBeGreaterThanOrEqual(4.5);
        // Darker means every channel moved down (or stayed) from the very bright original.
        const before = parseColor(accent).rgb;
        const after = parseColor(nudged).rgb;
        expect(after[0]).toBeLessThanOrEqual(before[0]);
        expect(after[1]).toBeLessThanOrEqual(before[1]);
    });

    it('an already-safe pick returns the identical string (untouched)', () => {
        // #00e5b0 (cosmos's own --cyan) against cosmos's dark surfaces already clears 4.5:1.
        const accent = '#00e5b0';
        const backgrounds = backgroundsFor(accent, '#08081a', '#0f0f1e', '#13132a');
        expect(worstRatio(accent, backgrounds)).toBeGreaterThanOrEqual(4.5);
        expect(nudgeToContrast(accent, backgrounds)).toBe(accent);
    });

    it('unparsable input does not throw from the caller\'s guard', () => {
        // tint() itself throws on unparsable colour — this IS why ThemeContext.tsx's effect wraps
        // the --accent-text derivation in a try/catch (it calls tint() before nudgeToContrast()).
        expect(() => tint('not-a-color', '#0f0f1e', 0.14)).toThrow();

        // The caller's guard: same shape as the effect body — the try/catch stops that throw from
        // reaching the component, and --accent-text is simply left unset (`derived` never assigned).
        let derived: string | undefined;
        expect(() => {
            try {
                const backgrounds = backgroundsFor('not-a-color', '#08081a', '#0f0f1e', '#13132a');
                derived = nudgeToContrast('not-a-color', backgrounds);
            } catch {
                // swallowed — exactly what ThemeContext.tsx's effect does
            }
        }).not.toThrow();
        expect(derived).toBeUndefined();

        // nudgeToContrast alone never throws either — unparsable colour comes back unchanged.
        expect(() => nudgeToContrast('not-a-color', ['#08081a', '#0f0f1e'])).not.toThrow();
        expect(nudgeToContrast('not-a-color', ['#08081a', '#0f0f1e'])).toBe('not-a-color');
    });
});

describe('nudgeToContrast — direction', () => {
    it('follows the binding (worst) background, not the mean, when backgrounds straddle mid-luminance', () => {
        // #888888 is 5.9:1 on #101010 but only 3.1:1 on #f0f0f0: the light one binds, so it must go DARKER.
        const out = nudgeToContrast('#888888', ['#101010', '#f0f0f0']);
        expect(contrast(parseColor(out), parseColor('#f0f0f0').rgb)).toBeGreaterThan(contrast(parseColor('#888888'), parseColor('#f0f0f0').rgb));
    });
});
