/**
 * P11-9: web-search provider cascade (Tavily / Brave) + Gemini image
 * fallback — injectable fetch, no network.
 */
import { describe, it, expect, vi } from 'vitest';
import { AGENT_SKILLS, type SkillContext } from '../lib/agents/skills';
import type { IntegrationsBundle } from '../types/integrations';

const noLlm = { active: null } as unknown as IntegrationsBundle['llm'];
const webSearch = AGENT_SKILLS.find(s => s.id === 'skill-web-search')!;
const imageGen = AGENT_SKILLS.find(s => s.id === 'skill-image-gen')!;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
    return { ok, status, json: async () => body } as unknown as Response;
}

describe('web search cascade', () => {
    it('uses Tavily when configured (no Anthropic key)', async () => {
        const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
            expect(String(url)).toContain('api.tavily.com');
            return jsonResponse({ answer: 'Rents rose 3%.', results: [{ title: 'Report', url: 'https://x.test/r' }] });
        });
        const ctx: SkillContext = { llm: noLlm, search: { active: 'tavily', tavily: { apiKey: 'tvly-1', enabled: true } }, fetchFn: fetchFn as never };
        const r = await webSearch.run('rent trends austin', ctx);
        expect(r.ok).toBe(true);
        expect(r.via).toBe('tavily');
        expect(r.text).toContain('Rents rose 3%.');
        expect(r.text).toContain('https://x.test/r');
    });

    it('falls to Brave when Tavily fails', async () => {
        const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).includes('tavily')) return jsonResponse({}, false, 500);
            expect(String(url)).toContain('api.search.brave.com');
            return jsonResponse({ web: { results: [{ title: 'Brave hit', url: 'https://b.test', description: 'desc' }] } });
        });
        const ctx: SkillContext = {
            llm: noLlm,
            search: { active: 'tavily', tavily: { apiKey: 'tvly-1', enabled: true }, brave: { apiKey: 'bsa-1', enabled: true } },
            fetchFn: fetchFn as never,
        };
        const r = await webSearch.run('anything', ctx);
        expect(r.ok).toBe(true);
        expect(r.via).toBe('brave');
        expect(r.text).toContain('Brave hit');
    });

    it('no keys at all → honest failure naming all the options', async () => {
        const ctx: SkillContext = { llm: noLlm, fetchFn: vi.fn() as never };
        const r = await webSearch.run('anything', ctx);
        expect(r.ok).toBe(false);
        expect(r.text).toMatch(/Tavily\/Brave/);
    });
});

describe('image generation fallback', () => {
    it('uses Gemini when only a Gemini key exists', async () => {
        const fetchFn = vi.fn(async (url: RequestInfo | URL) => {
            expect(String(url)).toContain('generativelanguage.googleapis.com');
            return jsonResponse({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: 'AAA=' } }] } }] });
        });
        const ctx: SkillContext = {
            llm: { active: 'gemini', gemini: { apiKey: 'g-1', enabled: true } } as unknown as IntegrationsBundle['llm'],
            fetchFn: fetchFn as never,
        };
        const r = await imageGen.run('a lighthouse', ctx);
        expect(r.ok).toBe(true);
        expect(r.via).toBe('gemini-image');
        expect(r.text).toContain('data:image/png;base64,AAA=');
    });

    it('no image keys → CTA mentions the Control Panel (handoff chip)', async () => {
        const ctx: SkillContext = { llm: noLlm, fetchFn: vi.fn() as never };
        const r = await imageGen.run('a lighthouse', ctx);
        expect(r.ok).toBe(false);
        expect(r.text).toContain('Control Panel');
    });
});
