/**
 * Plan 065 Phase 3 — guards against reintroducing `--accent` (a fill/tint colour) as CSS/TSX text.
 * `--accent` is below WCAG AA as text on several themes; text must use `--accent-text` instead
 * (see `src/styles/themes-master.css` header + `Scripts/codemod_accent_text.mjs`, which did the
 * one-time sweep this test guards).
 *
 * The three regexes below are a deliberate, hand-kept-in-sync duplicate of the ones in
 * `Scripts/codemod_accent_text.mjs` — that script lives outside qualia-shell's tsconfig `include`
 * (["src", "app", "../packages/types"]; the script is at the repo root under `Scripts/`), so an
 * `import` of it here is not a file `tsc -b` would pick up as part of this project. Duplicating two
 * ~2-line regexes is simpler and more robust than fighting the project boundary for a shared module.
 * If you touch the matching rules, update both places.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const SRC_ROOT = resolve(__dirname, '..');

// One level of balanced parens — enough for fallback shapes seen in this repo: rgba(...), var(...).
const FALLBACK = String.raw`(?:[^()]|\([^()]*\))*`;

// CSS declaration whose property is exactly `color` (not background-color, border-color, etc.).
const CSS_RE = new RegExp(
    String.raw`(^|[\s{;])color(\s*:\s*)var\(--accent(?:-hover)?(,\s*${FALLBACK})?\)(\s*!important)?`,
    'g',
);

// TSX inline-style object key `color: 'var(--accent)'` (not backgroundColor, borderColor, etc.).
const TSX_RE = new RegExp(
    String.raw`([\s{,])color(\s*:\s*)(['"])var\(--accent(?:-hover)?(,\s*${FALLBACK})?\)\3`,
    'g',
);

interface AllowEntry {
    file: string; // path relative to qualia-shell/src, e.g. "components/Foo/Foo.css"
    reason: string;
}

// Empty until the codemod (Scripts/codemod_accent_text.mjs --write) has actually been applied and
// reviewed. A future intentional exception (e.g. a swatch preview that must show the raw accent as
// text) gets a one-line reason here.
const ALLOWLIST: AllowEntry[] = [
    // PR #134 (plan 063) rewrites this file and already removes accent-as-text there; converting it
    // here too would only manufacture a merge conflict. Delete this entry once #134 is on main.
    { file: 'components/DocViewer/TemplateGenerator.css', reason: 'rewritten by PR #134 (plan 063)' },
];

function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry === 'build') continue;
        const full = join(dir, entry);
        if (full === join(SRC_ROOT, 'test')) continue; // skip src/test itself
        const st = statSync(full);
        if (st.isDirectory()) walk(full, files);
        else if (/\.(css|tsx)$/.test(entry)) files.push(full);
    }
    return files;
}

function relSrc(full: string): string {
    return relative(SRC_ROOT, full).split(sep).join('/');
}

function lineOf(content: string, index: number): number {
    return content.slice(0, index).split('\n').length;
}

describe('accent-as-text guard (plan 065 Phase 3)', () => {
    it('no color declaration uses --accent as text outside the allowlist', () => {
        const allowed = new Set(ALLOWLIST.map((a) => a.file));
        const hits: string[] = [];
        let total = 0;

        for (const full of walk(SRC_ROOT)) {
            const rel = relSrc(full);
            const content = readFileSync(full, 'utf8');
            const re = full.endsWith('.tsx') ? TSX_RE : CSS_RE;
            re.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = re.exec(content))) {
                total++;
                if (!allowed.has(rel)) hits.push(`${rel}:${lineOf(content, m.index)}`);
            }
        }

        // Not asserted on (the codemod hasn't run yet at the time this test is introduced — see the
        // plan) — printed so a reviewer can diff it against `node Scripts/codemod_accent_text.mjs`'s
        // dry-run TOTAL, which this count must match since the matching rules are identical.
        console.log(`accentAsText guard: ${total} total hit(s) found, ${hits.length} outside the allowlist`);

        expect(hits, `--accent used as text color outside the allowlist:\n${hits.join('\n')}`).toEqual([]);
    });
});
