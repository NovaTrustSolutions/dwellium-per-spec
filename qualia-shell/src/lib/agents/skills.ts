/**
 * skills — LibreChat-derived executable skill layer shared by ARA, Hermes,
 * and the Agent Lab personas.
 *
 * Inspired by LibreChat's agent tool catalog (github.com/danny-avila/librechat
 * — api/app/clients/tools/manifest.json + agent capabilities): web search,
 * calculator, code interpreter, image generation (DALL-E/Flux/Gemini),
 * weather (OpenWeather), and persistent memory. Each skill here is adapted to
 * run BROWSER-SIDE with what the user already has:
 *   - the per-user LLM integrations bundle (Anthropic / OpenAI / Gemini keys),
 *   - free keyless APIs (open-meteo for weather),
 *   - pure JS (calculator, code runner),
 *   - existing Dwellium stores (unifiedMemory, dwelliumCommands).
 *
 * PURE-AT-THE-SEAMS: every skill takes a SkillContext with the llm bundle and
 * an injectable fetch, so the catalog unit-tests without DOM or network.
 * Mirrors hermesRunner.ts / stellaToolCatalog.ts discipline.
 *
 * 2026-06-10 created (LibreChat skills arc).
 */
import type { IntegrationsBundle } from '../../types/integrations';
import { callLlm } from '../llmClient';
import { DEFAULT_MODELS } from '../../types/integrations';
import { recall, remember } from '../unifiedMemory';
import { performWidgetAction, resolveComposeTarget, lastOpenedWidgetHolder } from '../widgetActions';

// ── Types ─────────────────────────────────────────────────────────────

export interface SkillContext {
    llm: IntegrationsBundle['llm'];
    /** P11-9: live-search provider keys (Tavily/Brave) — the non-Anthropic path. */
    search?: IntegrationsBundle['search'];
    /** Injectable fetch (tests); defaults to global fetch. */
    fetchFn?: typeof fetch;
}

export interface SkillResult {
    ok: boolean;
    /** Markdown-ready text for the chat surface. */
    text: string;
    /** Which path produced it (shown as a meta hint). */
    via: string;
}

export interface AgentSkill {
    id: string;
    name: string;
    icon: string;
    description: string;
    /** LibreChat plugin/capability this is derived from (provenance). */
    derivedFrom: string;
    /** What the skill needs to actually run. */
    requires: 'none' | 'llm' | 'openai-key' | 'anthropic-key';
    /** Natural-language triggers; first capture group = the skill argument. */
    triggers: RegExp[];
    run: (input: string, ctx: SkillContext) => Promise<SkillResult>;
}

const fetchOf = (ctx: SkillContext): typeof fetch => ctx.fetchFn ?? fetch;

// ── Calculator (LibreChat "Calculator") ───────────────────────────────

const CALC_FNS: Record<string, (...a: number[]) => number> = {
    sqrt: Math.sqrt, abs: Math.abs, log: Math.log10, ln: Math.log,
    sin: Math.sin, cos: Math.cos, tan: Math.tan, round: Math.round,
    floor: Math.floor, ceil: Math.ceil, min: Math.min, max: Math.max, pow: Math.pow,
};

/** Safely evaluate an arithmetic expression. Whitelist-only — no identifiers reach eval. */
export function evaluateMath(expr: string): number | null {
    let e = expr.toLowerCase()
        .replace(/\bx\b/g, '*').replace(/×/g, '*').replace(/÷/g, '/') // "3 x 4" (word-bounded so max/min survive)
        .replace(/\bof\b/g, '*')             // "15% of 2400" → "(15/100)*2400" (Phase-10 10.4)
        .replace(/\s+/g, '')
        .replace(/(\d),(?=\d{3}\b)/g, '$1')  // thousands separators only — fn args keep commas
        .replace(/\^/g, '**')
        .replace(/\bpi\b/g, `(${Math.PI})`)
        .replace(/\be\b/g, `(${Math.E})`)
        .replace(/(\d+(?:\.\d+)?)%/g, '($1/100)');
    for (const name of Object.keys(CALC_FNS)) {
        e = e.replace(new RegExp(`\\b${name}\\(`, 'g'), `F.${name}(`);
    }
    if (!/^[0-9+\-*/(),.F\s]*$/.test(e.replace(/F\.[a-z]+\(/g, 'F.('))) return null;
    if (!/[0-9]/.test(e)) return null;
    try {
        // eslint-disable-next-line no-new-func
        const v = new Function('F', `"use strict"; return (${e});`)(CALC_FNS);
        return typeof v === 'number' && Number.isFinite(v) ? v : null;
    } catch { return null; }
}

const calculatorSkill: AgentSkill = {
    id: 'skill-calculator',
    name: 'Calculator',
    icon: '🧮',
    description: 'Exact arithmetic — percentages, powers, roots, trig. Runs instantly in-app, no key needed.',
    derivedFrom: 'LibreChat: Calculator',
    requires: 'none',
    triggers: [
        /^(?:calc(?:ulate)?|compute|evaluate)\s+(.+)$/i,
        /^(?:what\s+is|what's)\s+([\d(][\d\s+\-*/().^%,x×÷]*[\d)%])\??$/i,
        /^([\d(][\d\s+\-*/().^%,x×÷]*[\d)%])\s*=?\s*\??$/,
    ],
    run: async (input) => {
        const v = evaluateMath(input);
        if (v === null) return { ok: false, text: `I couldn't read "${input}" as a math expression.`, via: 'calculator' };
        const pretty = Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(6) : `${+v.toFixed(10)}`;
        return { ok: true, text: `**${input.trim()} = ${pretty}**`, via: 'calculator' };
    },
};

// ── Code runner (LibreChat "Code Interpreter", JS-only browser analog) ─

const codeRunnerSkill: AgentSkill = {
    id: 'skill-code-runner',
    name: 'Code Runner (JS)',
    icon: '⚙️',
    description: 'Run a JavaScript snippet in a sandboxed scope and show the result — the in-browser cousin of a code interpreter.',
    derivedFrom: 'LibreChat: Code Interpreter',
    requires: 'none',
    triggers: [/^(?:run|execute|eval)\s+(?:this\s+)?(?:js|javascript|code)[:\s]+([\s\S]+)$/i],
    run: async (input) => {
        try {
            const isStatementBlock = /[;{}]|\b(?:throw|return|let|const|var|if|for|while|function|class)\b/.test(input);
            // eslint-disable-next-line no-new-func
            const fn = new Function(`"use strict"; return (async () => { ${isStatementBlock ? input : `return (${input});`} })();`);
            const value = await Promise.race([
                fn(),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timed out after 3s')), 3000)),
            ]);
            const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
            return { ok: true, text: `Result:\n\`\`\`\n${text}\n\`\`\``, via: 'code-runner' };
        } catch (err: any) {
            return { ok: false, text: `That snippet threw: \`${err?.message || err}\``, via: 'code-runner' };
        }
    },
};

// ── Web search (LibreChat: Google / Tavily / Traversaal analog) ───────
// Uses Anthropic's server-side web_search tool browser-direct when an
// Anthropic key exists (regardless of active provider); otherwise answers
// via the active LLM with a clear "no live web" caveat.

const webSearchSkill: AgentSkill = {
    id: 'skill-web-search',
    name: 'Web Search',
    icon: '🔎',
    description: 'Search the live web — Anthropic web-search tool, or your Tavily/Brave key (P11-9).',
    derivedFrom: 'LibreChat: Google / Tavily Search',
    requires: 'llm',
    triggers: [
        /^(?:search(?:\s+the)?\s+web(?:\s+for)?|web\s+search(?:\s+for)?|google|search\s+online(?:\s+for)?|look\s+up\s+online)\s+(.+)$/i,
    ],
    run: async (query, ctx) => {
        const key = ctx.llm.anthropic?.apiKey;
        if (key && ctx.llm.anthropic?.enabled !== false) {
            try {
                const res = await fetchOf(ctx)('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': key,
                        'anthropic-version': '2023-06-01',
                        'anthropic-dangerous-direct-browser-access': 'true',
                    },
                    body: JSON.stringify({
                        model: ctx.llm.anthropic?.model || DEFAULT_MODELS.anthropic,
                        max_tokens: 1024,
                        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
                        messages: [{ role: 'user', content: `Search the web and answer concisely with sources: ${query}` }],
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const text = (data.content || [])
                        .filter((b: any) => b.type === 'text')
                        .map((b: any) => b.text).join('\n').trim();
                    if (text) return { ok: true, text, via: 'anthropic web_search' };
                }
            } catch { /* fall through to plain LLM */ }
        }
        // P11-9: Tavily — the dedicated non-Anthropic live-search path.
        const tavilyKey = ctx.search?.tavily?.enabled !== false ? ctx.search?.tavily?.apiKey : undefined;
        if (tavilyKey) {
            try {
                const res = await fetchOf(ctx)('https://api.tavily.com/search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ api_key: tavilyKey, query, max_results: 5, include_answer: true }),
                });
                if (res.ok) {
                    const data = await res.json();
                    const sources = (data.results || []).slice(0, 5)
                        .map((r: any) => `- [${r.title}](${r.url})`).join('\n');
                    const text = `${data.answer ? `${data.answer}\n\n` : ''}${sources ? `Sources:\n${sources}` : ''}`.trim();
                    if (text) return { ok: true, text, via: 'tavily' };
                }
            } catch { /* fall through */ }
        }
        // P11-9: Brave Search.
        const braveKey = ctx.search?.brave?.enabled !== false ? ctx.search?.brave?.apiKey : undefined;
        if (braveKey) {
            try {
                const res = await fetchOf(ctx)(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
                    headers: { Accept: 'application/json', 'X-Subscription-Token': braveKey },
                });
                if (res.ok) {
                    const data = await res.json();
                    const rows = (data.web?.results || []).slice(0, 5);
                    if (rows.length) {
                        const text = rows.map((r: any) => `- [${r.title}](${r.url})\n  ${r.description ?? ''}`).join('\n');
                        return { ok: true, text: `Top results:\n${text}`, via: 'brave' };
                    }
                }
            } catch { /* fall through */ }
        }
        const llmRes = await callLlm({
            prompt: `(No live web access right now.) From your knowledge, answer as best you can and SAY what may be outdated: ${query}`,
            maxTokens: 700, temperature: 0.3,
        }, ctx.llm).catch(() => null);
        if (llmRes) return { ok: true, text: llmRes.text, via: `${llmRes.provider} (no live web)` };
        return { ok: false, text: 'I need an Anthropic key (live search), a Tavily/Brave key, or any active LLM key to answer that. Add one in Control Panel → API Keys.', via: 'web-search' };
    },
};

// ── Image generation (LibreChat: DALL-E / Flux / Gemini Image) ────────

const imageGenSkill: AgentSkill = {
    id: 'skill-image-gen',
    name: 'Image Generation',
    icon: '🎨',
    description: 'Generate an image — OpenAI DALL-E 3, or your Gemini key as the fallback (P11-9).',
    derivedFrom: 'LibreChat: DALL-E-3 / Flux / Gemini Image Tools',
    requires: 'llm',
    triggers: [
        // "create an image of a lighthouse"
        /^(?:generate|create|make|draw|render|paint)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|logo|drawing)\s*(?:of|for|showing|with|:)?\s*(.+)$/i,
        // "create a lighthouse image" (subject-first phrasing)
        /^(?:generate|create|make|draw|render|paint)\s+(?:me\s+)?(?:an?\s+)?(.+?)\s+(?:image|picture|photo|illustration|logo|drawing)$/i,
    ],
    run: async (prompt, ctx) => {
        const openaiKey = ctx.llm.openai?.apiKey;
        const geminiKey = ctx.llm.gemini?.apiKey;
        if (!openaiKey && !geminiKey) {
            // The "Control Panel" mention renders an open-widget handoff chip
            // in ARA (araLinkage) — the deep-link the BACKLOG asked for.
            return { ok: false, text: 'Image generation needs an OpenAI or Gemini key — open the Control Panel → API Keys and add one, and I\'ll paint away.', via: 'image-gen' };
        }
        let openaiError = '';
        if (openaiKey) {
            try {
                const res = await fetchOf(ctx)('https://api.openai.com/v1/images/generations', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${openaiKey}` },
                    body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
                const b64 = data?.data?.[0]?.b64_json;
                if (!b64) throw new Error('no image in response');
                return { ok: true, text: `![${prompt.slice(0, 60)}](data:image/png;base64,${b64})`, via: 'dall-e-3' };
            } catch (err: any) {
                openaiError = err?.message || String(err);
            }
        }
        // P11-9: Gemini image fallback (no OpenAI key, or DALL-E errored).
        if (geminiKey) {
            try {
                const res = await fetchOf(ctx)(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-preview-image-generation:generateContent?key=${geminiKey}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [{ text: `Generate an image: ${prompt}` }] }],
                        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
                    }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
                const part = (data?.candidates?.[0]?.content?.parts || []).find((p: any) => p.inlineData?.data);
                if (!part) throw new Error('no image in response');
                const mime = part.inlineData.mimeType || 'image/png';
                return { ok: true, text: `![${prompt.slice(0, 60)}](data:${mime};base64,${part.inlineData.data})`, via: 'gemini-image' };
            } catch (err: any) {
                return { ok: false, text: `Image generation failed (${openaiError ? `DALL-E: ${openaiError}; ` : ''}Gemini: ${err?.message || err}).`, via: 'image-gen' };
            }
        }
        return { ok: false, text: `Image generation failed: ${openaiError}`, via: 'image-gen' };
    },
};

// ── Weather (LibreChat: OpenWeather — keyless via open-meteo) ─────────

const WEATHER_CODES: Record<number, string> = {
    0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 61: 'light rain', 63: 'rain', 65: 'heavy rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 80: 'rain showers', 81: 'rain showers', 82: 'violent rain showers',
    95: 'thunderstorm', 96: 'thunderstorm w/ hail', 99: 'thunderstorm w/ heavy hail',
};

const weatherSkill: AgentSkill = {
    id: 'skill-weather',
    name: 'Weather',
    icon: '🌤️',
    description: 'Current conditions + today\'s range for any city — keyless (open-meteo), so it always works.',
    derivedFrom: 'LibreChat: OpenWeather',
    requires: 'none',
    triggers: [
        /^(?:weather|forecast)\s+(?:in|for|at)\s+(.+)$/i,
        /^(?:what(?:'s| is)\s+the\s+)?(?:weather|temperature|forecast)\s+(?:like\s+)?(?:in|for|at)\s+(.+?)(?:\s+(?:today|right now|now))?$/i,
    ],
    run: async (place, ctx) => {
        try {
            const f = fetchOf(ctx);
            const geo = await (await f(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1`)).json();
            const hit = geo?.results?.[0];
            if (!hit) return { ok: false, text: `I couldn't find a place called "${place}".`, via: 'open-meteo' };
            const wx = await (await f(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=1`)).json();
            const c = wx?.current; const d = wx?.daily;
            if (!c) throw new Error('no data');
            const cond = WEATHER_CODES[c.weather_code] ?? 'mixed';
            return {
                ok: true,
                text: `**${hit.name}${hit.admin1 ? `, ${hit.admin1}` : ''}** right now: **${Math.round(c.temperature_2m)}°F**, ${cond}, feels like ${Math.round(c.apparent_temperature)}°F, wind ${Math.round(c.wind_speed_10m)} mph. Today: ${Math.round(d.temperature_2m_min[0])}–${Math.round(d.temperature_2m_max[0])}°F.`,
                via: 'open-meteo',
            };
        } catch (err: any) {
            return { ok: false, text: `Weather lookup failed: ${err?.message || err}`, via: 'open-meteo' };
        }
    },
};

// ── Memory (LibreChat: Memory capability) ─────────────────────────────

const memoryRecallSkill: AgentSkill = {
    id: 'skill-memory-recall',
    name: 'Memory Recall',
    icon: '🧠',
    description: 'Search everything you\'ve asked Dwellium to remember.',
    derivedFrom: 'LibreChat: Memory',
    requires: 'none',
    triggers: [
        /^(?:recall|what\s+do\s+you\s+remember\s+about|what\s+did\s+i\s+(?:say|tell\s+you)\s+about)\s+(.+)$/i,
    ],
    run: async (q) => {
        const hits = recall(q);
        if (!hits.length) return { ok: true, text: `Nothing in memory about "${q}" yet. Tell me "remember …" and I'll keep it.`, via: 'memory' };
        return { ok: true, text: `Here's what I have on "${q}":\n${hits.slice(0, 5).map(h => `- ${h.text}`).join('\n')}`, via: 'memory' };
    },
};

const memoryRememberSkill: AgentSkill = {
    id: 'skill-memory-remember',
    name: 'Remember',
    icon: '📌',
    description: 'Pin a fact to persistent memory — every agent can recall it later.',
    derivedFrom: 'LibreChat: Memory',
    requires: 'none',
    triggers: [/^(?:remember|memorize|note)\s+(?:that\s+)?(.+)$/i],
    run: async (text) => {
        remember(text);
        return { ok: true, text: `Got it — I'll remember that.`, via: 'memory' };
    },
};

// ── Catalog + helpers ─────────────────────────────────────────────────

// ── Compose into widget (P11-7 widget-action bus) ─────────────────────
// "draft a letter in it" / "write a thank-you note in notepad" — the LLM
// drafts, the widget-action bus places the text INSIDE the target widget.
// Trigger REQUIRES the "in it/in notepad" suffix so plain drafting requests
// ("draft a friendly late-rent reminder") still go to chat.
const composeIntoWidgetSkill: AgentSkill = {
    id: 'skill-compose-widget',
    name: 'Compose into Widget',
    icon: '📝',
    description: 'Draft text with the LLM and place it inside a widget ("draft a letter in notepad", "…in it" after opening one).',
    derivedFrom: 'Dwellium P11-7 widget-action bus',
    requires: 'llm',
    triggers: [
        /^(?:draft|write|compose)\s+(.+\s+in(?:to)?\s+(?:the\s+)?(?:it|notepad))\.?$/i,
    ],
    run: async (input, ctx) => {
        const m = input.match(/^(.*?)\s+in(?:to)?\s+(?:the\s+)?(it|notepad)\.?$/i);
        const what = (m?.[1] ?? input).trim();
        const explicit = m?.[2]?.toLowerCase() ?? null;
        const target = resolveComposeTarget(explicit, lastOpenedWidgetHolder.current);
        const res = await callLlm({
            systemPrompt: 'You draft clean, ready-to-use documents. Output ONLY the document text (Markdown allowed) — no preamble, no commentary.',
            prompt: `Draft ${what}.`,
            maxTokens: 1200,
            temperature: 0.5,
        }, ctx.llm).catch(() => null);
        if (!res?.text) {
            return { ok: false, text: 'Drafting needs an LLM key — add one in Control Panel → API Keys.', via: 'compose-widget' };
        }
        const delivered = performWidgetAction(target, 'insert-text', { text: res.text });
        return delivered
            ? { ok: true, text: `Drafted into ${target}:\n\n${res.text.slice(0, 400)}${res.text.length > 400 ? '…' : ''}`, via: 'compose-widget' }
            : { ok: false, text: `"${target}" doesn't accept inserted text yet.`, via: 'compose-widget' };
    },
};

export const AGENT_SKILLS: ReadonlyArray<AgentSkill> = [
    calculatorSkill,
    webSearchSkill,
    imageGenSkill,
    weatherSkill,
    codeRunnerSkill,
    composeIntoWidgetSkill,
    memoryRecallSkill,
    memoryRememberSkill,
];

/** First skill whose trigger matches, with the extracted argument. */
export function matchSkill(
    input: string,
    catalog: ReadonlyArray<AgentSkill> = AGENT_SKILLS,
): { skill: AgentSkill; arg: string } | null {
    const s = input.trim().replace(/[.!?]+$/, '').trim(); // "Create a lighthouse image."
    if (!s) return null;
    for (const skill of catalog) {
        for (const re of skill.triggers) {
            const m = s.match(re);
            if (m) return { skill, arg: (m[1] ?? s).trim() };
        }
    }
    return null;
}

/** Match + run in one step. Returns null when no skill claims the input. */
export async function runSkillForInput(
    input: string,
    ctx: SkillContext,
    catalog: ReadonlyArray<AgentSkill> = AGENT_SKILLS,
): Promise<(SkillResult & { skill: AgentSkill }) | null> {
    const hit = matchSkill(input, catalog);
    if (!hit) return null;
    const result = await hit.skill.run(hit.arg, ctx);
    return { ...result, skill: hit.skill };
}

/** One-line-per-skill description block for agent system prompts. */
export function describeSkillsForPrompt(catalog: ReadonlyArray<AgentSkill> = AGENT_SKILLS): string {
    return catalog.map(s => `- ${s.name}: ${s.description}`).join('\n');
}

/** Skill ids a given Agent Lab discipline is equipped with by default. */
export function skillIdsForDiscipline(discipline: string): string[] {
    const base = ['skill-memory-recall', 'skill-memory-remember'];
    switch (discipline) {
        case 'research': return ['skill-web-search', 'skill-weather', ...base];
        case 'data': return ['skill-calculator', 'skill-code-runner', ...base];
        case 'engineering': return ['skill-code-runner', 'skill-calculator', ...base];
        case 'creative': case 'comms': return ['skill-image-gen', 'skill-web-search', 'skill-compose-widget', ...base];
        case 'legal': case 'strategy': case 'operations': return ['skill-web-search', ...base];
        case 'orchestrator': return AGENT_SKILLS.map(s => s.id);
        default: return ['skill-calculator', 'skill-web-search', ...base];
    }
}
