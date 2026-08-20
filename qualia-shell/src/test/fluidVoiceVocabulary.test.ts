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
