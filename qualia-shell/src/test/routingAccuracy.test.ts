/**
 * routingAccuracy — Phase-10 Task 10.7 (B3): regression suite pinning the
 * Conductor's routing behavior on the real-world command corpus. Gate from
 * Phase_10_Plan.md: ≥95% accuracy on existing ⌘K/ARA patterns across agent
 * spawns, widget opens, window ops, theme/space changes, skills, and chat.
 *
 * Also verifies cascade RESILIENCE (a deliberately-wrong low-confidence /
 * invalid LLM cannot drag accuracy below the gate — threshold + whitelist
 * hold) and the mis-route collection hook (re-training input surface).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    heuristicRoute,
    classifyIntent,
    recordRoutingDecision,
    collectMisRoutes,
    ROUTER_CONFIDENCE_THRESHOLD,
    type RouteIntent,
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

/**
 * The corpus: every pattern family the existing parsers support, drawn from
 * dwelliumCommands.test.ts / araSpawn.test.ts / conductorChain.test.ts /
 * agentSkills.test.ts shapes. This PINS behavior — a parser regression that
 * flips any family shows up here as an accuracy drop.
 */
const CORPUS: Array<{ input: string; expect: RouteIntent }> = [
    // ── widget opens (the highest-volume ⌘K pattern) ──
    { input: 'open strata', expect: 'command' },
    { input: 'open up transcription', expect: 'command' },
    { input: 'show me the inbox', expect: 'command' },
    { input: 'pull up scribe', expect: 'command' },
    { input: 'bring up terminal', expect: 'command' },
    { input: 'go to transcription', expect: 'command' },
    { input: 'take me to ara', expect: 'command' },
    { input: 'navigate to files', expect: 'command' },
    { input: 'launch agent lab', expect: 'command' },
    { input: 'open the task board', expect: 'command' },
    { input: 'notepad', expect: 'command' },
    { input: 'strata dashboard', expect: 'command' },
    { input: 'Hey ARA, could you open up Notepad for me please?', expect: 'command' },
    // ── window ops ──
    { input: 'close inbox', expect: 'command' },
    { input: 'minimize scribe', expect: 'command' },
    { input: 'maximize strata', expect: 'command' },
    { input: 'tile windows', expect: 'command' },
    { input: 'put strata on the left and scribe on the right', expect: 'command' },
    { input: 'group strata and scribe into tabs', expect: 'command' },
    // ── theme / accent / animations ──
    { input: 'dark mode', expect: 'command' },
    { input: 'switch theme to cosmos', expect: 'command' },
    { input: 'make the accent teal', expect: 'command' },
    { input: 'animations off', expect: 'command' },
    // ── spaces / memory ──
    { input: 'save space Morning', expect: 'command' },
    { input: 'remember the elevator code is 4417', expect: 'command' },
    // ── agent spawns ──
    { input: 'spawn research squad on rent comps in midtown', expect: 'spawn' },
    { input: 'spawn the deal desk on the Maple St offer', expect: 'spawn' },
    { input: 'run a deal desk analysis of the hilltop acquisition', expect: 'spawn' },
    { input: 'solo researcher on solar incentives', expect: 'spawn' },
    { input: 'have the engineer look into the flaky tests', expect: 'spawn' },
    { input: 'assemble build team on caching and bundle size', expect: 'spawn' },
    // ── chains ──
    { input: 'open notepad and calculate 15% of 2400', expect: 'chain' },
    { input: 'open notepad then calculate 2+2 then open strata', expect: 'chain' },
    { input: 'calculate 15% of 2400 and calculate the result + 10', expect: 'chain' },
    // ── skills ──
    { input: 'calculate 15% of 2400', expect: 'skill' },
    { input: 'what is 2+2', expect: 'skill' },
    { input: 'compute sqrt(144) * 3', expect: 'skill' },
    { input: '2+2', expect: 'skill' },
    // ── chat (must NOT be claimed by any parser) ──
    { input: "what's in my inbox?", expect: 'chat' },
    { input: 'why is my vacancy rate up this month', expect: 'chat' },
    { input: 'draft a friendly late-rent reminder for unit 4B', expect: 'chat' },
    { input: 'explain the difference between gross and net leases', expect: 'chat' },
    { input: 'tell me a joke', expect: 'chat' },
    { input: 'how do I evict a tenant in georgia', expect: 'chat' },
    { input: 'should I renew the maple street lease', expect: 'chat' },
    { input: 'summarize my open work orders', expect: 'chat' },
];

describe('routing accuracy gate (≥95% on the corpus)', () => {
    it('heuristic leg meets the plan gate', () => {
        const failures: string[] = [];
        for (const c of CORPUS) {
            const got = heuristicRoute(c.input).intent;
            if (got !== c.expect) failures.push(`"${c.input}" → ${got} (expected ${c.expect})`);
        }
        const accuracy = (CORPUS.length - failures.length) / CORPUS.length;
        expect(failures, `mis-routes:\n${failures.join('\n')}`).toEqual([]);
        expect(accuracy).toBeGreaterThanOrEqual(0.95);
    });

    it('full cascade with a hostile low-quality LLM still meets the gate (threshold + whitelist hold)', async () => {
        // LLM that answers nonsense half the time, low-confidence wrong the
        // other half — neither may pass validation/threshold.
        let flip = false;
        const invoke = vi.fn(async () => {
            flip = !flip;
            return flip
                ? 'lol I think you should restart your computer'
                : '{"intent": "chat", "confidence": 0.3}';
        });
        const failures: string[] = [];
        for (const c of CORPUS) {
            const got = (await classifyIntent(c.input, { llm: noLlm, invoke })).intent;
            if (got !== c.expect) failures.push(`"${c.input}" → ${got}`);
        }
        const accuracy = (CORPUS.length - failures.length) / CORPUS.length;
        expect(accuracy).toBeGreaterThanOrEqual(0.95);
        expect(failures).toEqual([]);
    });

    it('a confident-but-hallucinating LLM is bounded by the intent whitelist', async () => {
        const invoke = vi.fn(async () => '{"intent": "format-disk", "confidence": 0.99}');
        const d = await classifyIntent('open strata', { llm: noLlm, invoke });
        expect(d).toMatchObject({ intent: 'command', via: 'heuristic' });
    });
});

describe('mis-route collection (re-training surface)', () => {
    it('collects correct=false decisions and thumbs-down-rated decisions, nothing else', () => {
        recordRoutingDecision('open strata', { intent: 'command', confidence: 0.95, via: 'heuristic' }); // good
        recordRoutingDecision('spawn cleanup', { intent: 'chat', confidence: 0.5, via: 'heuristic' }, false); // mis-route
        const voted = recordRoutingDecision('weird one', { intent: 'skill', confidence: 0.9, via: 'llm' }); // thumbs-down later
        rateRun(voted.id, -1);
        const mis = collectMisRoutes();
        expect(mis.map(m => m.prompt).sort()).toEqual(['spawn cleanup', 'weird one']);
    });

    it('threshold constant is the documented 0.7 (B2 contract)', () => {
        expect(ROUTER_CONFIDENCE_THRESHOLD).toBe(0.7);
    });
});

describe('P11-4: auto-re-weighting from mis-routes', () => {
    it('misRouteWarnings renders similar mis-routes as NOT-guidance', async () => {
        const { misRouteWarnings } = await import('../lib/llmRouter');
        recordRoutingDecision('archive the smith lease', { intent: 'skill', confidence: 0.9, via: 'llm' }, false);
        const block = misRouteWarnings('archive the smith lease file');
        expect(block).toContain('NOT skill');
        expect(misRouteWarnings('zz unrelated qq')).toBe('');
    });

    it('a confident LLM verdict repeating a known mis-route is demoted to the next leg', async () => {
        const { isKnownMisRoute } = await import('../lib/llmRouter');
        recordRoutingDecision('archive the smith lease', { intent: 'skill', confidence: 0.9, via: 'llm' }, false);
        expect(isKnownMisRoute('archive the smith lease', 'skill')).toBe(true);
        expect(isKnownMisRoute('archive the smith lease', 'command')).toBe(false);
        const invoke = vi.fn(async () => '{"intent": "skill", "confidence": 0.95}');
        const d = await classifyIntent('archive the smith lease', { llm: noLlm, invoke });
        expect(d.via).toBe('heuristic'); // demoted despite 0.95 confidence
    });

    it('warnings are injected into the classifier prompt', async () => {
        recordRoutingDecision('archive the smith lease', { intent: 'skill', confidence: 0.9, via: 'llm' }, false);
        let seenSystem = '';
        const invoke = vi.fn(async (req: { systemPrompt?: string }) => {
            seenSystem = req.systemPrompt ?? '';
            return '{"intent": "command", "confidence": 0.9, "normalized": "open strata"}';
        });
        await classifyIntent('archive the smith lease now', { llm: noLlm, invoke });
        expect(seenSystem).toContain('MIS-routed');
        expect(seenSystem).toContain('NOT skill');
    });
});
