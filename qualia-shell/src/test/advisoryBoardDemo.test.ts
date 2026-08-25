/**
 * The Getting Started guide must carry the Advisory Board walkthrough with
 * working demo screenshots — Ilya asked for a demo Andy can follow (2026-08-23).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { GETTING_STARTED_MD } from '../content/guides/gettingStarted';

describe('Advisory Board demo in the guide', () => {
    it('has its own section with the CRIT loop and how to open it', () => {
        expect(GETTING_STARTED_MD).toContain('5 Persona Advisory Board');
        for (const step of ['Context', 'Interview', 'Role', 'Task']) {
            expect(GETTING_STARTED_MD).toContain(`**${step}**`);
        }
        expect(GETTING_STARTED_MD).toMatch(/Ask just this lens/);
        expect(GETTING_STARTED_MD).toMatch(/Run your own decision/);
    });

    it('states the non-impersonation guardrail', () => {
        expect(GETTING_STARTED_MD).toMatch(/not impersonations|interpretive strategic lenses/i);
    });

    it('every demo screenshot it references actually exists in public/', () => {
        const refs = [...GETTING_STARTED_MD.matchAll(/!\[[^\]]*\]\((\/demo\/[^)]+)\)/g)].map(m => m[1]);
        expect(refs.length).toBeGreaterThanOrEqual(4);
        for (const r of refs) {
            expect(existsSync(resolve(__dirname, '../../public', r.replace(/^\//, ''))), r).toBe(true);
        }
    });

    it('sections stay uniquely numbered after the insert', () => {
        const nums = [...GETTING_STARTED_MD.matchAll(/^## (\d+) · /gm)].map(m => Number(m[1]));
        expect(nums).toEqual([...nums].sort((a, b) => a - b));
        expect(new Set(nums).size).toBe(nums.length);
    });
});
