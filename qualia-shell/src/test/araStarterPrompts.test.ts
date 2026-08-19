import { describe, it, expect } from 'vitest';
import { STARTER_PROMPTS, starterPromptsFor } from '../components/ARAConsole/araStarterPrompts';

const BUILTIN_IDS = [
    'executive-assistant', 'chief-of-staff', 'research-synthesizer', 'lead-counsel', 'clinical-analyst',
    'financial-strategist', 'creative-director', 'diplomat', 'devils-advocate',
];

describe('araStarterPrompts (046-A1)', () => {
    it('every built-in lens has 4–6 non-empty prompts', () => {
        for (const id of BUILTIN_IDS) {
            const list = starterPromptsFor(id);
            expect(list.length, id).toBeGreaterThanOrEqual(4);
            expect(list.length, id).toBeLessThanOrEqual(6);
            expect(list.every(p => p.trim().length > 0), id).toBe(true);
        }
        expect(Object.keys(STARTER_PROMPTS).sort()).toEqual([...BUILTIN_IDS].sort());
    });

    it('unknown id falls back to the Executive Assistant list', () => {
        expect(starterPromptsFor('nope')).toBe(STARTER_PROMPTS['executive-assistant']);
        expect(starterPromptsFor('executive-assistant')).toContain('Open Strata');
    });
});
