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
    it('carries all 31 providers (30 permanent + OpenRouter renewable)', () => {
        expect(RESEARCH_PROVIDERS).toHaveLength(31);
        expect(RESEARCH_PROVIDERS.filter(p => p.tier === 'permanent')).toHaveLength(30);
        expect(RESEARCH_PROVIDERS.filter(p => p.tier === 'renewable').map(p => p.id)).toEqual(['openrouter']);
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
    it('Cline is honestly unusable (README ships no base URL)', () => {
        const cline = getResearchProvider('cline')!;
        expect(cline.unusable).toBe(true);
        expect(cline.baseUrl).toBe('');
        expect(cline.note).toBeTruthy();
    });
    it('Cloudflare is flagged needsAccountId (the {account_id} placeholder)', () => {
        const cf = getResearchProvider('cloudflare-workers-ai')!;
        expect(cf.needsAccountId).toBe(true);
        expect(cf.baseUrl).toContain('{account_id}');
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
