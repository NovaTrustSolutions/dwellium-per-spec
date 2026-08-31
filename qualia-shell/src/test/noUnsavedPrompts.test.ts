/**
 * Plan 055 phase 3 — "closing a widget never prompts".
 *
 * With phases 1+2 everything is saved continuously, so no unsaved-changes
 * dialog may survive: this suite greps the source tree and fails if one
 * comes back. Delete-confirmations (destructive data actions) are OUT of
 * scope — only unsaved-changes / close-interceptor prompts are banned.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) {
            if (name === 'test' || name === 'node_modules') continue;
            walk(p, out);
        } else if (/\.(ts|tsx)$/.test(name)) {
            out.push(p);
        }
    }
    return out;
}

describe('no unsaved-changes prompts remain', () => {
    const files = walk(SRC);

    it('no confirm() about unsaved changes anywhere in src', () => {
        const offenders = files.filter((f) => {
            const text = readFileSync(f, 'utf8');
            return /confirm\([^)]*unsaved/i.test(text) || /unsaved[^\n]*confirm\(/i.test(text);
        });
        expect(offenders).toEqual([]);
    });

    it('the removed Scribe tab-close prompt stays removed (dirty tabs are flushed, not questioned)', () => {
        const tabBar = readFileSync(join(SRC, 'components/Scribe/TabBar.tsx'), 'utf8');
        expect(tabBar).not.toMatch(/confirm\(/);
        expect(tabBar).toContain('saveFile');
    });

    it('beforeunload listeners exist ONLY in the persistence-flush modules', () => {
        const allowed = new Set([
            join(SRC, 'lib/sessionRestoreStore.ts'),
            join(SRC, 'lib/widgetMemory.ts'),
        ]);
        const offenders = files.filter((f) =>
            /addEventListener\(['"]beforeunload/.test(readFileSync(f, 'utf8')) && !allowed.has(f));
        expect(offenders).toEqual([]);
    });
});
