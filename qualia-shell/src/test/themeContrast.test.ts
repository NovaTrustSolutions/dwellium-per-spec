/**
 * Master themes — `--text` and `--muted` reach WCAG AA (4.5:1) on their own surfaces (plan 064),
 * and `--accent-text` reaches it too, on `--bg`/`--surface`/`--surface2` and on a 14% `--blue`
 * tint over `--surface`/`--surface2` (plan 065 — the usual "accent chip").
 *
 * `themes-master.css` bridges `--text` → `--text-primary` and `--muted` → `--text-secondary` /
 * `--text-tertiary`, and `--bg` / `--surface` / `--surface2` → the desktop, surface and elevated
 * surface tokens, so these six values decide whether every widget's text is readable. Parsed
 * from the stylesheet itself: a new theme block is checked without anyone remembering to add it.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseColor, contrast, tint } from '../utils/contrast';

const CSS = readFileSync(resolve(__dirname, '../styles/themes-master.css'), 'utf8');
const THEME_CONTEXT = readFileSync(resolve(__dirname, '../context/ThemeContext.tsx'), 'utf8');

const themes = [...CSS.matchAll(/\.theme-([\w-]+)\{([^}]*)\}/g)]
    .map((m) => ({ name: m[1], tokens: Object.fromEntries([...m[2].matchAll(/--([\w-]+):([^;]+);/g)].map((t) => [t[1], t[2].trim()])) }))
    .filter((t) => t.tokens.text && t.tokens.muted);

/** Resolves a token value, following one `var(--x)` hop into the same block's own tokens. */
function resolveToken(tokens: Record<string, string>, key: string): string {
    const value = tokens[key];
    const ref = /^var\(--([\w-]+)\)$/.exec(value);
    return ref ? tokens[ref[1]] : value;
}

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

const accentThemes = themes.filter((t) => t.tokens['accent-text'] && t.tokens.blue);

describe('master themes — --accent-text / --accent-text-hover contrast on their own surfaces + accent tint', () => {
    it('every theme with an accent defines --accent-text-hover (the text colour for hover states)', () => {
        expect(accentThemes.filter((t) => !t.tokens['accent-text-hover']).map((t) => t.name)).toEqual([]);
    });

    const cases = accentThemes.flatMap((t) => (['accent-text', 'accent-text-hover'] as const).map((token) => [t.name, token, t] as const));
    it.each(cases)('%s: --%s is ≥ 4.5:1 on --bg, --surface, --surface2 and a 14%% --blue tint over --surface/--surface2', (_name, token, theme) => {
        const accentText = resolveToken(theme.tokens, token);
        const surfaceTint = tint(theme.tokens.blue, theme.tokens.surface, 0.14);
        const surface2Tint = tint(theme.tokens.blue, theme.tokens.surface2, 0.14);
        const backgrounds: Array<[string, string]> = [
            ['bg', theme.tokens.bg],
            ['surface', theme.tokens.surface],
            ['surface2', theme.tokens.surface2],
            ['14% --blue tint over --surface', surfaceTint],
            ['14% --blue tint over --surface2', surface2Tint],
        ];
        const failures: string[] = [];
        for (const [label, bg] of backgrounds) {
            const ratio = contrast(parseColor(accentText), parseColor(bg).rgb);
            if (ratio < 4.5) failures.push(`--${token} ${accentText} on ${label} ${bg} = ${ratio.toFixed(2)}:1`);
        }
        expect(failures).toEqual([]);
    });
});
