import { describe, it, expect } from 'vitest';
import {
    AI_ACTIONS,
    buildActionSystemPrompt,
    buildSummarizePreface,
    isRedlineAction,
} from '../components/Scribe/aiActions';

describe('Scribe AI writing helpers (Docs-parity)', () => {
    it('exposes the four discrete actions', () => {
        expect(AI_ACTIONS.map(a => a.id)).toEqual(['rewrite', 'fix', 'translate', 'summarize']);
    });

    it('rewrite/fix prompts carry their task AND the redline JSON schema', () => {
        const rewrite = buildActionSystemPrompt('rewrite');
        expect(rewrite.toLowerCase()).toContain('rewrite');
        expect(rewrite).toContain('"redlines"');          // stays compatible with parseRedlineResponse

        const fix = buildActionSystemPrompt('fix');
        expect(fix.toLowerCase()).toContain('spelling');
        expect(fix.toLowerCase()).toContain('grammar');
        expect(fix).toContain('"redlines"');
    });

    it('translate injects the requested language and stays redline-compatible', () => {
        const fr = buildActionSystemPrompt('translate', { language: 'French' });
        expect(fr).toContain('French');
        expect(fr).toContain('"redlines"');
        // default language when none supplied
        expect(buildActionSystemPrompt('translate')).toContain('English');
    });

    it('summarize is NOT a redline action and has a preface for the ARA panel', () => {
        expect(isRedlineAction('summarize')).toBe(false);
        expect(isRedlineAction('rewrite')).toBe(true);
        expect(isRedlineAction('fix')).toBe(true);
        expect(isRedlineAction('translate')).toBe(true);
        expect(() => buildActionSystemPrompt('summarize')).toThrow();
        expect(buildSummarizePreface().toLowerCase()).toContain('summarize');
    });
});
