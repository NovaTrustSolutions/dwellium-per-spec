/**
 * llmRouter — Phase-10 Task 10.5 (B1): intent classification cascade
 * (per-user LLM → backend hook → heuristic) with Hermes few-shot over past
 * routing decisions. Mock LLM throughout (no network).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    classifyIntent,
    heuristicRoute,
    routerFewShot,
    recordRoutingDecision,
    ROUTER_CONFIDENCE_THRESHOLD,
    ROUTER_TOOL,
    type RouteDecision,
} from '../lib/llmRouter';
import { hermesLearningStore, hermesLearningUserIdHolder, rateRun } from '../components/HonchoHermesPanel/hermesLearningStore';
import { agentTeamsStore, agentLabUserIdHolder } from '../lib/agents/agentTeamsStore';
import type { IntegrationsBundle } from '../types/integrations';

const noLlm = { active: null } as unknown as IntegrationsBundle['llm'];

beforeEach(() => {
    hermesLearningUserIdHolder.current = 'test-user';
    agentLabUserIdHolder.current = 'test-user';
    try { localStorage.clear(); } catch { /* */ }
    (hermesLearningStore as unknown as { reset?: () => void }).reset?.();
    (agentTeamsStore as unknown as { reset?: () => void }).reset?.();
});

describe('heuristicRoute (exact-parser corpus)', () => {
    const cases: Array<[string, string]> = [
        ['spawn research squad on rent comps', 'spawn'],
        ['run a deal desk analysis of the hilltop offer', 'spawn'],
        ['open notepad and calculate 15% of 2400', 'chain'],
        ['open strata', 'command'],
        ['dark mode', 'command'],
        ['put strata on the left and scribe on the right', 'command'],
        ['save space Morning', 'command'],
        ['remember the elevator code is 4417', 'command'],
        ['calculate 15% of 2400', 'skill'],
        ['what is 2+2', 'skill'],
        ["what's in my inbox?", 'chat'],
        ['why is my vacancy rate up this month', 'chat'],
        ['draft a friendly late-rent reminder', 'chat'],
    ];
    for (const [input, intent] of cases) {
        it(`"${input}" → ${intent}`, () => {
            const d = heuristicRoute(input);
            expect(d.intent).toBe(intent);
            expect(d.via).toBe('heuristic');
        });
    }

    it('parser hits report high confidence; chat fallback reports low', () => {
        expect(heuristicRoute('open strata').confidence).toBeGreaterThanOrEqual(ROUTER_CONFIDENCE_THRESHOLD);
        expect(heuristicRoute('why is rent late').confidence).toBeLessThan(ROUTER_CONFIDENCE_THRESHOLD);
    });
});

describe('classifyIntent cascade', () => {
    it('trusts a confident LLM verdict (leg 1)', async () => {
        const invoke = vi.fn(async () => '{"intent": "spawn", "confidence": 0.92, "reason": "agent run request"}');
        const d = await classifyIntent('get the research crew going on midtown comps', { llm: noLlm, invoke });
        expect(d).toMatchObject({ intent: 'spawn', via: 'llm' });
        expect(invoke).toHaveBeenCalledTimes(1);
    });

    it('falls through a LOW-confidence LLM verdict to the heuristic', async () => {
        const invoke = vi.fn(async () => '{"intent": "chat", "confidence": 0.4}');
        const d = await classifyIntent('open strata', { llm: noLlm, invoke });
        expect(d).toMatchObject({ intent: 'command', via: 'heuristic' });
    });

    it('falls through malformed/non-JSON LLM output', async () => {
        const invoke = vi.fn(async () => 'Sure! I think this is probably a command.');
        const d = await classifyIntent('open strata', { llm: noLlm, invoke });
        expect(d.via).toBe('heuristic');
    });

    it('rejects an invalid intent value from the LLM', async () => {
        const invoke = vi.fn(async () => '{"intent": "self-destruct", "confidence": 0.99}');
        const d = await classifyIntent('open strata', { llm: noLlm, invoke });
        expect(d.via).toBe('heuristic');
        expect(d.intent).toBe('command');
    });

    it('uses the backend leg when the LLM leg is unavailable', async () => {
        const backendClassify = vi.fn(async (): Promise<RouteDecision | null> => ({
            intent: 'skill', confidence: 0.9, via: 'backend',
        }));
        const d = await classifyIntent('convert 80 f to c', { llm: noLlm, backendClassify });
        expect(d).toMatchObject({ intent: 'skill', via: 'backend' });
    });

    it('survives a throwing LLM leg (network error) via heuristic', async () => {
        const invoke = vi.fn(async () => { throw new Error('boom'); });
        const d = await classifyIntent('dark mode', { llm: noLlm, invoke });
        expect(d).toMatchObject({ intent: 'command', via: 'heuristic' });
    });

    it('no LLM key + no backend → pure heuristic, no invoke attempted', async () => {
        const d = await classifyIntent('calculate 2+2', { llm: noLlm });
        expect(d).toMatchObject({ intent: 'skill', via: 'heuristic' });
    });

    it('handles fenced JSON from chatty models', async () => {
        const invoke = vi.fn(async () => 'Here you go:\n```json\n{"intent": "command", "confidence": 0.85}\n```');
        const d = await classifyIntent('open the strata dashboard thing', { llm: noLlm, invoke });
        expect(d).toMatchObject({ intent: 'command', via: 'llm' });
    });
});

describe('Hermes routing few-shot', () => {
    it('records decisions under the llm-router tag and surfaces similar ones', () => {
        recordRoutingDecision('open the strata dashboard', { intent: 'command', confidence: 0.95, via: 'heuristic' });
        const block = routerFewShot('open strata dashboard please');
        expect(block).toContain('open the strata dashboard');
        expect(block).toContain('→ command');
    });

    it('mis-routes (correct=false) and thumbs-down-rated runs never surface', () => {
        recordRoutingDecision('spawn cleanup', { intent: 'chat', confidence: 0.5, via: 'heuristic' }, false);
        expect(routerFewShot('spawn cleanup now')).toBe('');
        const rec = recordRoutingDecision('weird input', { intent: 'skill', confidence: 0.9, via: 'llm' });
        rateRun(rec.id, -1);
        expect(routerFewShot('weird input again')).toBe('');
    });

    it('few-shot is injected into the LLM prompt', async () => {
        recordRoutingDecision('open the strata dashboard', { intent: 'command', confidence: 0.95, via: 'heuristic' });
        let seenSystem = '';
        const invoke = vi.fn(async (req: { systemPrompt?: string }) => {
            seenSystem = req.systemPrompt ?? '';
            return '{"intent": "command", "confidence": 0.9}';
        });
        await classifyIntent('open strata dashboard', { llm: noLlm, invoke });
        expect(seenSystem).toContain('Past routing decisions');
        expect(seenSystem).toContain(ROUTER_TOOL.length > 0 ? 'open the strata dashboard' : '');
    });
});
