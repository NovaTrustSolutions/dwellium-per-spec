/**
 * CoPaw continuous-capture (spec §8.5) — extractor + per-user memory store.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { copawStore, copawUserIdHolder, extractFacts, captureFacts, clearMemory } from '../components/Hive/copawStore';

const NOW = new Date('2026-06-04T12:00:00.000Z');

beforeEach(() => {
    localStorage.clear();
    copawStore.reset();
    copawUserIdHolder.current = null;
});

describe('extractFacts', () => {
    it('keeps declarative sentences, drops questions + fragments + filler', () => {
        const text = 'Okay, here is the plan. The vendor must submit a certificate of insurance before any work order is approved. Why? Track COI expiry and send a reminder thirty days before it lapses. Hmm.';
        const facts = extractFacts(text);
        expect(facts.some((f) => f.includes('certificate of insurance'))).toBe(true);
        expect(facts.some((f) => f.endsWith('?'))).toBe(false);
        expect(facts.some((f) => /^okay/i.test(f))).toBe(false);
        expect(facts.every((f) => f.length >= 25)).toBe(true);
    });

    it('caps the number of facts', () => {
        const many = Array.from({ length: 20 }, (_, i) => `This is a sufficiently long declarative fact number ${i} about the system.`).join(' ');
        expect(extractFacts(many, 5).length).toBe(5);
    });
});

describe('captureFacts', () => {
    it('persists extracted facts most-recent-first with source', () => {
        const fresh = captureFacts('Synthesis Lab', 'The maintenance backlog grew twelve percent last quarter across the portfolio.', NOW);
        expect(fresh.length).toBe(1);
        const snap = copawStore.getSnapshot();
        expect(snap[0].source).toBe('Synthesis Lab');
        expect(snap[0].text).toContain('maintenance backlog');
    });

    it('de-dupes against existing memory', () => {
        const t = 'Rent increases without notice are a leading driver of tenant churn here.';
        captureFacts('A', t, NOW);
        const second = captureFacts('B', t, NOW); // same fact text
        expect(second.length).toBe(0);
        expect(copawStore.getSnapshot().length).toBe(1);
    });

    it('isolates memory per user and clears', () => {
        copawUserIdHolder.current = 'andy';
        captureFacts('A', 'Andy has a long enough declarative fact to be captured by CoPaw.', NOW);
        expect(localStorage.getItem('dwellium:copaw-memory:andy')).toBeTruthy();
        copawUserIdHolder.current = 'lisa';
        copawStore.reset();
        expect(copawStore.getSnapshot()).toEqual([]);
        copawUserIdHolder.current = 'andy';
        copawStore.reset();
        expect(copawStore.getSnapshot().length).toBe(1);
        clearMemory();
        expect(copawStore.getSnapshot()).toEqual([]);
    });
});
