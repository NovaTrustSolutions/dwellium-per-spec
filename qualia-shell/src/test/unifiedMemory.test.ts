import { describe, it, expect, beforeEach } from 'vitest';
import { recall, remember, memoryCounts } from '../lib/unifiedMemory';
import { memoryStore, memoryUserIdHolder } from '../components/HonchoHermesPanel/honchoMemoryStore';
import { copawStore } from '../components/Hive/copawStore';
import { thoughtWeaverStore } from '../components/ThoughtWeaver/thoughtWeaverStore';

beforeEach(() => {
    memoryStore.reset();
    copawStore.reset();
    thoughtWeaverStore.reset();
    localStorage.clear();
    memoryUserIdHolder.current = 'test-user';
});

describe('unifiedMemory (One Memory)', () => {
    it('remember writes to honcho and recall finds it', () => {
        remember('the boiler at PGA Plaza needs servicing');
        const hits = recall('boiler');
        expect(hits.length).toBeGreaterThan(0);
        expect(hits[0].text).toMatch(/boiler/i);
        expect(hits[0].source).toBe('honcho');
    });

    it('counts reflect what was written', () => {
        remember('alpha');
        remember('beta');
        expect(memoryCounts().honcho).toBeGreaterThanOrEqual(2);
        expect(memoryCounts().total).toBeGreaterThanOrEqual(2);
    });

    it('token-overlap matching (not just substring)', () => {
        remember('quarterly maintenance schedule for the elevator');
        const hits = recall('elevator maintenance');
        expect(hits.some(h => /elevator/i.test(h.text))).toBe(true);
    });

    it('empty query returns recent memories', () => {
        remember('something');
        expect(recall('').length).toBeGreaterThan(0);
    });
});
