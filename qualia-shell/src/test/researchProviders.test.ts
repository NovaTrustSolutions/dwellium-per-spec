/**
 * researchProviders registry sanity (parsed from
 * github.com/NovaTrustSolutions/awesome-freellm-apis README, 2026-08-28)
 * + labs-tier widget wiring for research-lab.
 */
import { describe, expect, it } from 'vitest';
import { RESEARCH_PROVIDERS, getResearchProvider } from '../data/researchProviders';
import { chatCompletionsUrl, RESEARCH_PRESETS } from '../lib/researchLlm/client';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';
import { defaultDockItems } from '../data/hierarchy';
import { getIcon } from '../components/Sidebar/iconMap';

describe('provider registry', () => {
    it('carries 21 keyed browser-CORS-verified providers + 1 keyless = 22 (keyed: 20 permanent + OpenRouter renewable) — Ilya 2026-08-29 exclude browser-refusers, 2026-08-31 add keyless Pollinations', () => {
        expect(RESEARCH_PROVIDERS).toHaveLength(22);
        const keyed = RESEARCH_PROVIDERS.filter(p => !p.keyless);
        const keyless = RESEARCH_PROVIDERS.filter(p => p.keyless);
        expect(keyed).toHaveLength(21);
        expect(keyless.map(p => p.id)).toEqual(['pollinations']);
        expect(keyed.filter(p => p.tier === 'permanent')).toHaveLength(20);
        expect(keyed.filter(p => p.tier === 'renewable').map(p => p.id)).toEqual(['openrouter']);
    });
    it('the keyless Pollinations provider sits at the top, is keyless, POSTs to a /openai base, and ships EXACTLY the 2 probe-verified models (2026-08-31)', () => {
        expect(RESEARCH_PROVIDERS[0].id).toBe('pollinations');
        const p = getResearchProvider('pollinations')!;
        expect(p.keyless).toBe(true);
        expect(p.baseUrl).toBe('https://text.pollinations.ai/openai');
        expect(p.baseUrl.endsWith('/openai')).toBe(true);
        expect(p.models?.map(m => m.id)).toEqual(['openai', 'openai-fast']);
        expect(p.getKeyUrl).toBe('');
    });
    it('ships ONLY the browser-verified set — none of the excluded providers, no placeholders, no duplicate endpoints', () => {
        const EXCLUDED = ['nvidia-nim', 'sambanova', 'kilo-code', 'ollama-cloud', 'opencode-zen', 'github-models', 'glhf-chat', 'cline', 'cloudflare-workers-ai', 'grok-xai'];
        const ids = RESEARCH_PROVIDERS.map(p => p.id);
        for (const bad of EXCLUDED) expect(ids).not.toContain(bad);
        for (const p of RESEARCH_PROVIDERS) {
            expect(p.baseUrl.startsWith('https://'), p.id).toBe(true);
            expect(p.baseUrl.includes('{'), p.id).toBe(false);
            expect(p.unusable ?? false, p.id).toBe(false);
        }
        expect(new Set(RESEARCH_PROVIDERS.map(p => p.baseUrl)).size).toBe(RESEARCH_PROVIDERS.length);
    });
    it('ids are unique', () => {
        const ids = RESEARCH_PROVIDERS.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it('every usable base URL is https', () => {
        for (const p of RESEARCH_PROVIDERS) {
            if (p.unusable) continue;
            expect(p.baseUrl, p.id).toMatch(/^https:\/\//);
        }
    });
    it('Google Gemini uses the OpenAI-compat endpoint (documented substitution)', () => {
        const g = getResearchProvider('google-gemini')!;
        expect(g.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
        expect(g.note).toMatch(/OpenAI-compat/);
    });
    it('chatCompletionsUrl joins without double slashes', () => {
        expect(chatCompletionsUrl('https://api.groq.com/openai/v1')).toBe('https://api.groq.com/openai/v1/chat/completions');
        expect(chatCompletionsUrl('https://generativelanguage.googleapis.com/v1beta/openai/')).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    });
    it('the fixed preset list includes the Georgia housing-law researcher and Blank', () => {
        const ids = RESEARCH_PRESETS.map(p => p.id);
        expect(ids).toContain('housing-law-ga');
        expect(ids).toContain('blank');
    });
});

describe('research-lab labs-tier wiring', () => {
    const w = WIDGET_REGISTRY['research-lab'];
    it('registers as a hidden-door labs widget with the flask icon', () => {
        expect(w).toBeDefined();
        expect(w.tier).toBe('labs');
        expect(w.icon).toBe('flask-conical');
        expect(getIcon('flask-conical')).toBeTruthy();
    });
    it('gets NO dock row (labs convention) and NO email restriction', () => {
        expect(defaultDockItems.some(d => d.component === 'research-lab')).toBe(false);
        expect(w.restrictedToEmails).toBeUndefined();
    });
});
