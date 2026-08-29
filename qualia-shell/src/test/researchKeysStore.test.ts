/**
 * researchKeysStore + researchLogStore — per-user namespace isolation
 * (Andy ≠ Lisa), log cap/truncation, and separation from the main
 * integrations key bundle.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
    getResearchKey,
    researchKeysStore,
    researchKeysUserIdHolder,
    resetResearchKeys,
    setResearchKey,
} from '../lib/researchLlm/researchKeysStore';
import {
    RESEARCH_LOG_CAP,
    RESEARCH_RESPONSE_TRUNCATE,
    addLogEntry,
    removeLogEntry,
    researchLogStore,
    researchLogUserIdHolder,
    resetResearchLog,
} from '../lib/researchLlm/researchLogStore';

beforeEach(() => {
    localStorage.clear();
    researchKeysUserIdHolder.current = null;
    researchLogUserIdHolder.current = null;
    resetResearchKeys(); // v2.72.1 standing convention
    resetResearchLog();
});

describe('key isolation', () => {
    it('Andy’s research keys never leak into Lisa’s namespace', () => {
        researchKeysUserIdHolder.current = 'user-andy';
        setResearchKey('groq', 'gsk-andy-key');
        expect(getResearchKey('groq')).toBe('gsk-andy-key');

        researchKeysUserIdHolder.current = 'user-lisa';
        expect(getResearchKey('groq')).toBe('');
        expect(researchKeysStore.getSnapshot()).toEqual({});

        researchKeysUserIdHolder.current = 'user-andy';
        expect(getResearchKey('groq')).toBe('gsk-andy-key');
    });
    it('saving an empty value clears the key', () => {
        researchKeysUserIdHolder.current = 'user-andy';
        setResearchKey('groq', 'k1');
        setResearchKey('groq', '   ');
        expect(getResearchKey('groq')).toBe('');
    });
    it('keys live under their own researchKeys:* localStorage namespace (never the integrations bundle)', () => {
        researchKeysUserIdHolder.current = 'user-andy';
        setResearchKey('groq', 'k1');
        expect(localStorage.getItem('researchKeys:user-andy')).toContain('k1');
        for (const storageKey of Object.keys(localStorage)) {
            if (localStorage.getItem(storageKey)?.includes('k1')) {
                expect(storageKey).toBe('researchKeys:user-andy');
            }
        }
    });
});

describe('experiments log', () => {
    it('logs per-user, truncates responses at 4k, and deletes by id', () => {
        researchLogUserIdHolder.current = 'user-andy';
        const entry = addLogEntry({
            prompt: 'compare models',
            systemPreset: 'model-probe',
            responses: [{ providerId: 'groq', model: 'm', text: 'x'.repeat(RESEARCH_RESPONSE_TRUNCATE + 500), latencyMs: 10 }],
        });
        expect(researchLogStore.getSnapshot()[0].responses[0].text).toHaveLength(RESEARCH_RESPONSE_TRUNCATE);

        researchLogUserIdHolder.current = 'user-lisa';
        expect(researchLogStore.getSnapshot()).toEqual([]);

        researchLogUserIdHolder.current = 'user-andy';
        removeLogEntry(entry.id);
        expect(researchLogStore.getSnapshot()).toEqual([]);
    });
    it('caps at the newest 50 entries', () => {
        researchLogUserIdHolder.current = 'user-andy';
        for (let i = 0; i < RESEARCH_LOG_CAP + 5; i++) {
            addLogEntry({ prompt: `p${i}`, systemPreset: 'blank', responses: [] });
        }
        const log = researchLogStore.getSnapshot();
        expect(log).toHaveLength(RESEARCH_LOG_CAP);
        expect(log[0].prompt).toBe(`p${RESEARCH_LOG_CAP + 4}`); // newest first
    });
});
