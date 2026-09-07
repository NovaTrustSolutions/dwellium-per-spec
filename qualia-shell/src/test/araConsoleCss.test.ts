import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * global.css sets `user-select: none` on <body>; every descendant inherits that
 * as its used value, so the ARA window's text was unselectable in all three
 * layouts (Classic window, Holocron OS tab, Cockpit pane). The console root
 * must opt back in — same pattern as Antigravity.css.
 */
describe('ARA console text selection CSS', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/components/ARAConsole/ARAConsole.css'), 'utf8');

    it('body is still user-select:none, so the opt-in is required', () => {
        const global = readFileSync(resolve(process.cwd(), 'src/styles/global.css'), 'utf8');
        const bodyRule = global.match(/\nbody\s*\{[^}]+\}/)?.[0] ?? '';
        expect(bodyRule).toMatch(/user-select:\s*none/);
    });

    it('the .ara-console root opts its subtree back into text selection', () => {
        const rootRule = css.match(/\n\.ara-console\s*\{[^}]+\}/)?.[0] ?? '';
        expect(rootRule).toMatch(/[^-]user-select:\s*text/);
        expect(rootRule).toMatch(/-webkit-user-select:\s*text/);
    });

    it('the side-panel resize handle stays non-selectable', () => {
        const dividerRule = css.match(/\n\.ara-side-divider\s*\{[^}]+\}/)?.[0] ?? '';
        expect(dividerRule).toMatch(/user-select:\s*none/);
    });
});
