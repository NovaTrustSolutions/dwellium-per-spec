/**
 * D20: Agent Lab's warning / danger colours come from the theme (var(--warning), var(--danger) and the
 * --alab-warn-text / --alab-danger-text tokens derived from them), never a hard-coded hex that only suits
 * a dark theme. A hex is allowed only as a var() fallback.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Not `new URL('…', import.meta.url)`: Vite rewrites that as an asset import, and it resolved to this test file.
const AGENT_LAB = join(dirname(fileURLToPath(import.meta.url)), '..', 'components', 'AgentLab');

const FILES = ['AgentLab.css', 'PersonaWorkspace.css', 'AvatarDossier.css'];
/** Tailwind-ish red / amber shades and their rgb triplets — the warning/danger palette. */
const PALETTE = /#(?:fca5a5|fecaca|f87171|ef4444|dc2626|b91c1c|fcd34d|fbbf24|f59e0b|d97706)\b|rgba?\(\s*(?:252,\s*165,\s*165|248,\s*113,\s*113|239,\s*68,\s*68|220,\s*38,\s*38|251,\s*191,\s*36|245,\s*158,\s*11)\b/gi;
/** Drop var(--x, fallback) fallbacks (one level of nested parentheses, e.g. color-mix(...)). */
const withoutFallbacks = (css: string) => css.replace(/var\(\s*--[\w-]+\s*,(?:[^()]|\([^()]*\))*\)/g, 'var()');

describe('Agent Lab stylesheets — warning / danger colours come from the theme (D20)', () => {
    for (const file of FILES) {
        it(file, () => {
            const css = readFileSync(join(AGENT_LAB, file), 'utf8');
            expect(css).toMatch(/\.alab|\.pw-|\.avd-/);                   // really the stylesheet (see AGENT_LAB)
            const offenders = withoutFallbacks(css).split('\n').filter((line) => line.match(PALETTE)).map((l) => l.trim());
            expect(offenders).toEqual([]);
        });
    }

    it('control: the check does see a hard-coded colour, and ignores one used as a var() fallback', () => {
        expect(withoutFallbacks('.x { color: #fca5a5; }').match(PALETTE)).not.toBeNull();
        expect(withoutFallbacks('.x { color: var(--danger, #ef4444); background: color-mix(in srgb, var(--danger, #ef4444) 18%, transparent); }').match(PALETTE)).toBeNull();
    });
});

describe('Agent Lab task buttons — a disabled Run / Retry looks disabled (D16)', () => {
    const css = readFileSync(join(AGENT_LAB, 'PersonaWorkspace.css'), 'utf8');
    it('.pw-mini:disabled is dimmed and its hover is reset', () => {
        expect(css).toMatch(/\.pw-mini:disabled,\s*\.pw-mini:disabled:hover\s*\{[^}]*opacity:\s*\.?\d/);
    });
    it("the delete X's red hover is not out-ranked by a more specific generic hover", () => {
        expect(css).not.toMatch(/\.pw-mini:hover:not\(/);                       // (0,3,0) would beat .pw-mini--del:hover
        expect(css.indexOf('.pw-mini--del:hover')).toBeGreaterThan(css.indexOf('.pw-mini:hover {'));
    });
});

describe('Agent Lab status-text ink follows the background, not the text colour', () => {
    it('--alab-ink is derived from --window-bg at the white/black crossover (L 0.564)', () => {
        const css = readFileSync(join(AGENT_LAB, 'AgentLab.css'), 'utf8');
        expect(css).toMatch(/--alab-ink:\s*oklch\(from var\(--window-bg[^)]*\) round\(up, 0\.564 - l, 1\) 0 0 \/ 1\)/);   // opaque
    });
});
