/**
 * llmRouter B2 wiring — Phase-10 Task 10.6: normalization verdicts,
 * looksActionable gate, and the ⌘K→ARA prompt hand-off bus.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    classifyIntent,
    looksActionable,
    requestAraPrompt,
    consumePendingAraPrompt,
    ARA_PROMPT_EVENT,
} from '../lib/llmRouter';
import { hermesLearningStore, hermesLearningUserIdHolder } from '../components/HonchoHermesPanel/hermesLearningStore';
import { agentTeamsStore, agentLabUserIdHolder } from '../lib/agents/agentTeamsStore';
import { parseCommand } from '../lib/dwelliumCommands';
import type { IntegrationsBundle } from '../types/integrations';

const noLlm = { active: null } as unknown as IntegrationsBundle['llm'];

beforeEach(() => {
    hermesLearningUserIdHolder.current = 'test-user';
    agentLabUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (hermesLearningStore as unknown as { reset?: () => void }).reset?.();
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
    consumePendingAraPrompt();
});

describe('normalized verdicts', () => {
    it('carries a normalized canonical form that the exact parsers can execute', async () => {
        const invoke = vi.fn(async () =>
            '{"intent": "command", "confidence": 0.9, "normalized": "open strata"}');
        const d = await classifyIntent('can you get the strata thing up', { llm: noLlm, invoke });
        expect(d.normalized).toBe('open strata');
        // the whole point: the normalized form re-parses
        expect(parseCommand(d.normalized!)?.label.toLowerCase()).toContain('strata');
    });

    it('drops empty/whitespace normalized values', async () => {
        const invoke = vi.fn(async () => '{"intent": "command", "confidence": 0.9, "normalized": "   "}');
        const d = await classifyIntent('fuzzy input here', { llm: noLlm, invoke });
        expect(d.normalized).toBeUndefined();
    });
});

describe('looksActionable gate (LLM-on-miss pre-filter)', () => {
    const actionable = ['get the strata thing up', 'make it teal please', 'bring up my files', 'fire up the research crew on comps'];
    const notActionable = [
        'what is my vacancy rate',
        'why did revenue drop last month',
        'tell me about the maple street lease',
        'is the backend online?',
        'summarize my inbox',
        'how do I add a tenant to the portal and set up autopay for them please today', // >10 words
    ];
    for (const t of actionable) {
        it(`actionable: "${t}"`, () => expect(looksActionable(t)).toBe(true));
    }
    for (const t of notActionable) {
        it(`not actionable: "${t}"`, () => expect(looksActionable(t)).toBe(false));
    }
});

describe('⌘K → ARA prompt bus', () => {
    it('requestAraPrompt stores a one-shot pending prompt AND dispatches the live event', () => {
        const handler = vi.fn();
        window.addEventListener(ARA_PROMPT_EVENT, handler);
        try {
            requestAraPrompt('get the strata thing up');
        } finally {
            window.removeEventListener(ARA_PROMPT_EVENT, handler);
        }
        expect(handler).toHaveBeenCalledTimes(1);
        expect((handler.mock.calls[0][0] as CustomEvent).detail).toEqual({ text: 'get the strata thing up' });
        expect(consumePendingAraPrompt()).toBe('get the strata thing up');
        expect(consumePendingAraPrompt()).toBeNull(); // one-shot
    });
});
