/**
 * Branch protection on `main` requires the "Build, test, and verify" check.
 * appfolio-parity-gate.yml only runs on parity paths; appfolio-parity-gate-skip.yml
 * is its twin (same job name) on the complementary paths-ignore list so docs-only
 * PRs can still merge. If the two lists drift, some PRs either run no gate at all
 * or block forever on "Expected". This test pins them together.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const WF = resolve(__dirname, '../../../../.github/workflows');
const read = (f: string) => readFileSync(resolve(WF, f), 'utf8');

function listUnder(yaml: string, trigger: 'pull_request', key: 'paths' | 'paths-ignore'): string[] {
    const m = yaml.match(new RegExp(`\\n  ${trigger}:\\n    ${key}:\\n((?:      - '[^']+'\\n)+)`));
    if (!m) throw new Error(`${trigger}.${key} block not found`);
    return [...m[1].matchAll(/      - '([^']+)'/g)].map(x => x[1]);
}

describe('AppFolio Parity Gate twin workflow (branch protection)', () => {
    it('the skip twin ignores exactly the paths the real gate runs on', () => {
        const real = listUnder(read('appfolio-parity-gate.yml'), 'pull_request', 'paths');
        const twin = listUnder(read('appfolio-parity-gate-skip.yml'), 'pull_request', 'paths-ignore');
        expect(real.length).toBeGreaterThan(0);
        expect(twin).toEqual(real);
    });

    it('both workflows report the same required check name', () => {
        const name = (yaml: string) => yaml.match(/^    name: (.+)$/m)?.[1];
        expect(name(read('appfolio-parity-gate-skip.yml'))).toBe('Build, test, and verify');
        expect(name(read('appfolio-parity-gate.yml'))).toBe('Build, test, and verify');
    });
});
