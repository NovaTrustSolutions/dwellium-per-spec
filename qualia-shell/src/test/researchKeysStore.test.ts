/**
 * researchKeysStore + researchLogStore — per-user namespace isolation
 * (Andy ≠ Lisa), log cap/truncation, and separation from the main
 * integrations key bundle. Also holds the ResearchLab skip-logging rule
 * (plan 062 phase 3) since it's a log-store behavior exercised through the
 * component's run loop.
 */
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ResearchLab from '../components/ResearchLab/ResearchLab';
import { resetGuardSession } from '../lib/researchLlm/guard';
import { resetWidgetMemory } from '../lib/widgetMemory';
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
    resetWidgetMemory();
    researchKeysUserIdHolder.current = null;
    researchLogUserIdHolder.current = null;
    resetResearchKeys(); // v2.72.1 standing convention
    resetResearchLog();
    resetGuardSession();
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

// Plan 062 phase 3 — an all-errors run wasn't an experiment; it burns no slot.
describe('ResearchLab run loop — skip-logging rule', () => {
    afterEach(() => vi.restoreAllMocks());

    const typePrompt = (text: string) =>
        fireEvent.change(screen.getByLabelText('Research prompt'), { target: { value: text } });

    it('an all-error run (every response failed, no text) adds no log entry', async () => {
        setResearchKey('groq', 'gsk-1');
        vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":{"message":"nope"}}', { status: 500 }));
        render(createElement(ResearchLab));
        typePrompt('will fail');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));

        await screen.findByText(/HTTP 500/);
        expect(researchLogStore.getSnapshot()).toEqual([]);
    });

    it('a mixed run (at least one response lands text) adds a log entry', async () => {
        setResearchKey('groq', 'gsk-1');
        setResearchKey('mistral', 'msk-1');
        vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
            if (String(url).includes('groq')) {
                return new Response(JSON.stringify({ choices: [{ message: { content: 'ok answer' } }] }), { status: 200 });
            }
            return new Response('{"error":{"message":"nope"}}', { status: 500 });
        });
        render(createElement(ResearchLab));
        typePrompt('mixed run');
        fireEvent.click(screen.getByRole('button', { name: 'Groq' }));
        fireEvent.click(screen.getByRole('button', { name: 'Mistral AI' }));
        fireEvent.change(screen.getByLabelText('Groq model id'), { target: { value: 'm1' } });
        fireEvent.change(screen.getByLabelText('Mistral AI model id'), { target: { value: 'm2' } });
        fireEvent.click(screen.getByRole('button', { name: /Run/ }));

        await screen.findByText('ok answer');
        expect(researchLogStore.getSnapshot()).toHaveLength(1);
    });
});
