/**
 * Knowledge Graph skill — KG arc 2026-06-12 (Ilya): graphify-backed graph
 * "connected to ara, hermes, honcho, thoughtweaver" — ONE AGENT_SKILLS entry
 * reaches ARA's skill tier, orchestrator team runs, Stella's mirror, and the
 * Hermes ReAct merged registry by construction.
 */
import { describe, it, expect } from 'vitest';
import { matchSkill, AGENT_SKILLS, runSkillForInput } from '../lib/agents/skills';
import { STELLA_TOOL_CATALOG } from '../components/StellaAgent/stellaToolCatalog';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

const NO_LLM = { active: null } as never;

describe('knowledge-graph skill triggers', () => {
    it('matches the natural phrasings', () => {
        for (const utterance of [
            'ask the graph about roof estimates',
            'query the knowledge graph for vendor contracts',
            'graph: maple property',
            'what connects the roof estimate to the vendor?',
        ]) {
            const m = matchSkill(utterance);
            expect(m?.skill.id, utterance).toBe('skill-knowledge-graph');
            expect(m?.arg.length).toBeGreaterThan(3);
        }
    });

    it('does NOT swallow ordinary chat or commands', () => {
        expect(matchSkill('open strata')?.skill.id).not.toBe('skill-knowledge-graph');
        expect(matchSkill('what do you remember about taxes')?.skill.id).toBe('skill-memory-recall');
    });
});

describe('knowledge-graph skill run (injected fetch)', () => {
    it('returns the backend answer', async () => {
        const fetchFn = (async () => ({
            json: async () => ({ success: true, data: { answer: 'NODE Roof Estimate [community=0]' } }),
        })) as unknown as typeof fetch;
        const r = await runSkillForInput('ask the graph about roof', { llm: NO_LLM, fetchFn });
        expect(r?.ok).toBe(true);
        expect(r?.text).toContain('Roof Estimate');
    });

    it('honest failure when the backend says no', async () => {
        const fetchFn = (async () => ({
            json: async () => ({ success: false, error: 'Graph not built yet — run a rebuild first.' }),
        })) as unknown as typeof fetch;
        const r = await runSkillForInput('ask the graph about roof', { llm: NO_LLM, fetchFn });
        expect(r?.ok).toBe(false);
        expect(r?.text).toContain('not built');
    });
});

describe('3-surface invariant + registry', () => {
    it('AGENT_SKILLS entry has a STELLA_TOOL_CATALOG mirror', () => {
        expect(AGENT_SKILLS.some(s => s.id === 'skill-knowledge-graph')).toBe(true);
        expect(STELLA_TOOL_CATALOG.some(t => t.id === 'skill-knowledge-graph')).toBe(true);
    });

    it('knowledge-graph widget is registered (ARA Graph tab opens it)', () => {
        expect(WIDGET_REGISTRY['knowledge-graph']).toBeTruthy();
        expect(WIDGET_REGISTRY['knowledge-graph'].label.toLowerCase()).toContain('knowledge');
    });
});
