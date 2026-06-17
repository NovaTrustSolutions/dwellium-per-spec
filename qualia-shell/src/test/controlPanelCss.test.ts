import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('ControlPanel hosted layout CSS', () => {
    it('keeps settings sections from shrinking into clipped header rows', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/components/ControlPanel/ControlPanel.css'), 'utf8');
        const sectionRule = css.match(/\.cp-section\s*\{[^}]+\}/)?.[0] ?? '';

        expect(sectionRule).toMatch(/flex:\s*0\s+0\s+auto/);
    });
});
