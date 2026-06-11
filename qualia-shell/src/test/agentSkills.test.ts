/**
 * agentSkills — LibreChat-derived skills layer (lib/agents/skills.ts) +
 * hermesRunner offline fallback chain (LibreChat skills arc 2026-06-10).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
    AGENT_SKILLS,
    matchSkill,
    runSkillForInput,
    evaluateMath,
    describeSkillsForPrompt,
    skillIdsForDiscipline,
} from '../lib/agents/skills';
import { STELLA_TOOL_CATALOG } from '../components/StellaAgent/stellaToolCatalog';
import { DEFAULT_PERSONAS } from '../lib/agents/personas';
import { runHermes } from '../components/HonchoHermesPanel/hermesRunner';

const NO_LLM = { active: null } as any;

beforeEach(() => localStorage.clear());

describe('evaluateMath (Calculator skill)', () => {
    it('handles arithmetic, percent, powers, functions', () => {
        expect(evaluateMath('2 + 2')).toBe(4);
        expect(evaluateMath('15% * 2400')).toBeCloseTo(360);
        expect(evaluateMath('2^10')).toBe(1024);
        expect(evaluateMath('sqrt(144) + max(1, 5)')).toBe(17);
        expect(evaluateMath('1,000,000 / 4')).toBe(250000);
    });
    it('rejects non-math input (no identifier reaches eval)', () => {
        expect(evaluateMath('alert(1)')).toBeNull();
        expect(evaluateMath('window.location')).toBeNull();
        expect(evaluateMath('hello world')).toBeNull();
    });
});

describe('matchSkill triggers', () => {
    it('routes natural phrasings to the right skill', () => {
        expect(matchSkill('calculate 15% of 2400')?.skill.id).toBe('skill-calculator');
        expect(matchSkill("what's 2+2?")?.skill.id).toBe('skill-calculator');
        expect(matchSkill('search the web for georgia hb 404')?.skill.id).toBe('skill-web-search');
        expect(matchSkill('generate an image of a lighthouse at dusk')?.skill.id).toBe('skill-image-gen');
        expect(matchSkill('weather in Atlanta')?.skill.id).toBe('skill-weather');
        expect(matchSkill('run js: 1 + 1')?.skill.id).toBe('skill-code-runner');
        expect(matchSkill('recall gate code')?.skill.id).toBe('skill-memory-recall');
    });
    it('leaves ordinary chat alone', () => {
        expect(matchSkill('how are you today')).toBeNull();
        expect(matchSkill('summarize my leases')).toBeNull();
        expect(matchSkill('')).toBeNull();
    });
});

describe('skill execution', () => {
    it('calculator runs end-to-end without any key', async () => {
        const r = await runSkillForInput('calculate (3+4)*10', { llm: NO_LLM });
        expect(r?.ok).toBe(true);
        expect(r?.text).toContain('70');
    });
    it('code runner evaluates and sandboxes errors', async () => {
        const ok = await runSkillForInput('run js: [1,2,3].map(x => x*2)', { llm: NO_LLM });
        expect(ok?.ok).toBe(true);
        expect(ok?.text).toContain('2');
        const bad = await runSkillForInput('run js: throw new Error("boom")', { llm: NO_LLM });
        expect(bad?.ok).toBe(false);
        expect(bad?.text).toContain('boom');
    });
    it('weather skill works against an injected fetch (keyless open-meteo)', async () => {
        const fetchFn = (async (url: string) => ({
            ok: true,
            json: async () => url.includes('geocoding')
                ? { results: [{ name: 'Atlanta', admin1: 'Georgia', latitude: 33.7, longitude: -84.4 }] }
                : { current: { temperature_2m: 71.3, apparent_temperature: 70.1, weather_code: 2, wind_speed_10m: 7.2 }, daily: { temperature_2m_max: [78], temperature_2m_min: [60] } },
        })) as unknown as typeof fetch;
        const r = await runSkillForInput('weather in Atlanta', { llm: NO_LLM, fetchFn });
        expect(r?.ok).toBe(true);
        expect(r?.text).toContain('Atlanta');
        expect(r?.text).toContain('71');
        expect(r?.text).toContain('partly cloudy');
    });
    it('memory remember → recall round-trips through unifiedMemory', async () => {
        await runSkillForInput('remember that the gate code is 4821', { llm: NO_LLM });
        const r = await runSkillForInput('recall gate code', { llm: NO_LLM });
        expect(r?.ok).toBe(true);
        expect(r?.text).toContain('4821');
    });
    it('image gen explains what is missing without an OpenAI key', async () => {
        const r = await runSkillForInput('generate an image of a cat', { llm: NO_LLM });
        expect(r?.ok).toBe(false);
        expect(r?.text).toMatch(/OpenAI key/i);
    });
});

describe('catalog + persona wiring', () => {
    it('every AGENT_SKILL has a matching Stella catalog entry (3-surface display)', () => {
        const catalogIds = new Set(STELLA_TOOL_CATALOG.map(t => t.id));
        for (const s of AGENT_SKILLS) {
            expect(catalogIds.has(s.id), `catalog missing ${s.id}`).toBe(true);
        }
    });
    it('every built-in persona is equipped with skills for its discipline', () => {
        for (const p of DEFAULT_PERSONAS) {
            const expected = skillIdsForDiscipline(p.discipline);
            for (const id of expected) {
                expect(p.tools, `${p.name} missing ${id}`).toContain(id);
            }
        }
    });
    it('describeSkillsForPrompt lists every skill once', () => {
        const text = describeSkillsForPrompt();
        for (const s of AGENT_SKILLS) expect(text).toContain(s.name);
    });
});

describe('hermesRunner offline fallback chain (LibreChat skills arc)', () => {
    const failFetch = (async () => { throw new Error('ECONNREFUSED'); }) as any;

    it('falls back to a browser-side skill when the backend is down', async () => {
        const run = await runHermes('calculate 6*7', {
            authFetch: failFetch,
            record: false,
            skillFallbackFn: async (t) => {
                const hit = await runSkillForInput(t, { llm: NO_LLM });
                return hit ? { ok: hit.ok, text: hit.text, skillName: hit.skill.name } : null;
            },
        });
        expect(run.outcome).toBe('success');
        expect(run.via).toBe('skill');
        expect(run.result).toContain('42');
        expect(run.toolsUsed).toContain('Calculator');
    });

    it('falls back to the LLM when no skill matches', async () => {
        const run = await runHermes('plan my week', {
            authFetch: failFetch,
            record: false,
            skillFallbackFn: async () => null,
            llmFallbackFn: async () => 'Here is a plan.',
        });
        expect(run.outcome).toBe('success');
        expect(run.via).toBe('llm');
        expect(run.result).toBe('Here is a plan.');
    });

    it('still fails gracefully when no fallback is available', async () => {
        const run = await runHermes('plan my week', { authFetch: failFetch, record: false });
        expect(run.outcome).toBe('fail');
        expect(run.via).toBe('none');
        expect(run.error).toContain('ECONNREFUSED');
    });
});
