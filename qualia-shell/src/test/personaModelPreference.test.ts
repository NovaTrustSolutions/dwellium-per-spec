/**
 * P12-2 — per-persona preferred model (gap item 5, 2026-06-12): cheap models
 * take routine personas; honest fallback when the provider isn't configured.
 */
import { describe, it, expect } from 'vitest';
import { applyModelPreference } from '../lib/llmClient';
import type { IntegrationsBundle } from '../types/integrations';

const BUNDLE: IntegrationsBundle['llm'] = {
    active: 'anthropic',
    anthropic: { enabled: true, apiKey: 'sk-a', model: 'claude-sonnet-4-6' },
    openai: { enabled: true, apiKey: 'sk-o', model: 'gpt-4o' },
    gemini: { enabled: false, apiKey: '', model: '' },
} as IntegrationsBundle['llm'];

describe('applyModelPreference', () => {
    it('no preference → bundle unchanged', () => {
        expect(applyModelPreference(BUNDLE, undefined)).toBe(BUNDLE);
        expect(applyModelPreference(BUNDLE, null)).toBe(BUNDLE);
    });

    it('switches active provider when configured', () => {
        const out = applyModelPreference(BUNDLE, { provider: 'openai' });
        expect(out.active).toBe('openai');
        expect(out.openai?.model).toBe('gpt-4o'); // provider default kept
    });

    it('overrides the model id when given', () => {
        const out = applyModelPreference(BUNDLE, { provider: 'openai', model: 'gpt-4o-mini' });
        expect(out.active).toBe('openai');
        expect(out.openai?.model).toBe('gpt-4o-mini');
        // Source bundle untouched (immutability).
        expect(BUNDLE.openai?.model).toBe('gpt-4o');
    });

    it('falls back to the user bundle when the preferred provider is NOT configured', () => {
        const out = applyModelPreference(BUNDLE, { provider: 'gemini', model: 'gemini-flash' });
        expect(out).toBe(BUNDLE); // gemini disabled → honest fallback
        const out2 = applyModelPreference(BUNDLE, { provider: 'local' });
        expect(out2).toBe(BUNDLE); // local not configured at all
    });
});

describe('orchestrator passes personaId on invokes', () => {
    it('member execution carries the persona id (mock invoke captures req)', async () => {
        const { runPersona } = await import('../lib/agents/orchestrator');
        const seen: Array<string | undefined> = [];
        const persona = {
            id: 'p-test', name: 'Tester', discipline: 'general', icon: 'bot', color: '#fff',
            tagline: 't', systemPrompt: 'You test.',
        } as never;
        await runPersona({
            goal: 'check the thing',
            persona,
            deps: {
                invoke: async (req: { personaId?: string }) => { seen.push(req.personaId); return 'done'; },
            } as never,
        });
        expect(seen).toContain('p-test');
    });
});
