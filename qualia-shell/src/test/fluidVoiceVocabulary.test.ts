/**
 * fluidVoiceVocabulary — plan 047 FluidVoice phase 1: the vocabulary seed is
 * non-empty, deduped, well-formed, and the payload mode is ALWAYS 'append'
 * (never 'replace' — upsert-only rule).
 */
import { describe, expect, it } from 'vitest';
import { FLUIDVOICE_VOCABULARY, buildVocabularyPayload, SEED_COMMAND } from '../data/fluidVoiceVocabulary';

describe('fluidVoiceVocabulary', () => {
    it('is non-empty and every entry has non-empty text', () => {
        expect(FLUIDVOICE_VOCABULARY.length).toBeGreaterThan(0);
        for (const e of FLUIDVOICE_VOCABULARY) {
            expect(typeof e.text).toBe('string');
            expect(e.text.trim().length).toBeGreaterThan(0);
        }
    });

    it('is deduped — no repeated text (case-insensitive), no alias echoing its own text', () => {
        const texts = FLUIDVOICE_VOCABULARY.map(e => e.text.toLowerCase());
        expect(new Set(texts).size).toBe(texts.length);
        for (const e of FLUIDVOICE_VOCABULARY) {
            for (const a of e.aliases ?? []) {
                expect(a.trim().length).toBeGreaterThan(0);
                expect(a.toLowerCase()).not.toBe(e.text.toLowerCase());
            }
        }
    });

    it('covers real app terms — widget names and property-management jargon', () => {
        const texts = FLUIDVOICE_VOCABULARY.map(e => e.text);
        for (const term of ['Dwellium', 'ARA', 'Strata', 'Honcho', 'Hermes', 'Scribe', 'work order', 'HVAC', 'lease renewal']) {
            expect(texts).toContain(term);
        }
    });

    it("covers Andy's portfolio — property/community names and leasing-desk jargon (plan 053)", () => {
        const texts = FLUIDVOICE_VOCABULARY.map(e => e.text);
        for (const term of [
            'Woodland Parc Townhomes', 'Riverwood Club Apartments', 'Woodland Parc',
            'Azalea Drive', 'Wayside Drive', 'Harbor View Drive', 'Hilltop Drive',
            'St Andrews Drive', 'Ski Country Chalet', 'Dunedin', 'ANZO',
            'guest card', 'countersign', 'notice to vacate', 'month-to-month', 'market rent',
        ]) {
            expect(texts).toContain(term);
        }
    });

    it('contains NO resident/vendor/person names (PII stays on the backend — plan 047 G9)', () => {
        // Person names visible in the Strata fixtures (appfolioDerived + LeasingModule guest cards)
        // must never appear in the seed, in text or aliases.
        const serialized = JSON.stringify(FLUIDVOICE_VOCABULARY).toLowerCase();
        for (const person of [
            'jamel', 'blunt', 'gallogly', 'zohoury', 'keck', 'hennessey', 'maselli',
            'canoy', 'beishir', 'basher', 'devine', 'fuller-barrow', 'cullins',
            'atterbury', 'mckoy', 'blackwell', 'byers', 'coats', 'antoinette', 'kenderequs',
        ]) {
            expect(serialized).not.toContain(person);
        }
    });

    it('payload mode is append (never replace) and carries every entry', () => {
        const payload = buildVocabularyPayload();
        expect(payload.mode).toBe('append');
        expect(payload.entries).toHaveLength(FLUIDVOICE_VOCABULARY.length);
        expect(JSON.stringify(payload)).not.toContain('replace');
    });

    it('seed command posts to the FluidVoice loopback dictionary API', () => {
        expect(SEED_COMMAND).toContain('127.0.0.1:47733/v1/dictionary/custom-words');
    });
});
