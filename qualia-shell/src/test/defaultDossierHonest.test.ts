/**
 * P2 — defaultDossier must not invent measurements or ship developer template
 * text (Docs/code.md 2026-09-05/06: "A metric with no live feed renders Not
 * available, never a plausible literal"). Every DEFAULT_PERSONA's dossier must
 * be free of the old fabricated figures, and identity must show the persona's
 * real discipline.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_PERSONAS, defaultDossier } from '../lib/agents/personas';

const FORBIDDEN = [
    '94%', '89%', '98.3%', '06 ms', '12.8K', '27 Nodes', '2.4 Rad',
    'Topology Integrity', 'Facial Symmetry', 'landing view', 'WebGL', 'Humanoid v4',
];

describe('defaultDossier — honest, no fabricated measurements', () => {
    for (const p of DEFAULT_PERSONAS) {
        it(`${p.id}: dossier has none of the invented figures and shows its discipline`, () => {
            const json = JSON.stringify(defaultDossier(p));
            for (const bad of FORBIDDEN) {
                expect(json).not.toContain(bad);
            }
        });
    }

    it('identity shows the persona\'s real discipline', () => {
        const d = defaultDossier(DEFAULT_PERSONAS[1]);
        expect(d.identity.some(kv => kv.label === 'Discipline' && kv.value === DEFAULT_PERSONAS[1].discipline)).toBe(true);
    });

    it('empty sections stay empty rather than seeded with placeholders', () => {
        const d = defaultDossier(DEFAULT_PERSONAS[0]);
        expect(d.tags).toEqual([]);
        expect(d.metrics).toEqual([]);
        expect(d.readout).toEqual([]);
        expect(d.channels).toEqual([]);
        expect(d.notes).toEqual([]);
    });
});
