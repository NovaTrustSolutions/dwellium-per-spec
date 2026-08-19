/**
 * idocsOutline — "Create with Agent" outline-first flow (wave 2B).
 *
 *   1. generateOutline(input, opts, llm)   → DocOutline { title, description, cards:[{ title, bullets, layoutHint?, blocksHint? }] }
 *      (user edits it in the library UI: rename / reorder / add / remove / bullets)
 *   2. researchTopic(topic, ctx)           → optional grounding via the Web Search skill (Tavily/Brave/Anthropic)
 *   3. generateFromOutline(outline, opts, llm, callLlmFn, onProgress) → IDoc, cards written in batches of ≤ 6,
 *      titles fixed by the outline, bullets = required content, merged via normalizeDoc; a failed batch keeps
 *      title-only stubs so the doc still opens. Research → snippets in every prompt + a final "Sources" card.
 *
 * Every LLM entry point takes the `llm` bundle + injectable `callLlmFn`; research takes an injectable search runner
 * (same signature as `AgentSkill.run`). The last outline is cached in localStorage['scribe-idocs:last-outline'] so a
 * failed step 3 can be retried; the 5 most recent live under 'scribe-idocs:recent-outlines'.
 */
import { AGENT_SKILLS, type SkillContext, type SkillResult } from '../../../lib/agents/skills';
import { callLlm, hasActiveLlm } from '../../../lib/llmClient';
import type { IntegrationsBundle } from '../../../types/integrations';
import { BLOCK_CONTRACT, commonRules, normalizeDoc, parseJsonLoose, type CallLlmFn, type GenerateOpts, type LlmBundle } from './idocsAi';
import { BLOCK_TYPES, CARD_LAYOUTS, newId, type BlockType, type Card, type CardLayout, type IDoc } from './idocTypes';

export type StylePreset = 'minimal' | 'visual' | 'classic' | 'consultant';

export interface OutlineCard { title: string; bullets: string[]; layoutHint?: CardLayout; blocksHint?: BlockType[] }
export interface DocOutline { title: string; description: string; cards: OutlineCard[] }

export interface ResearchSource { title: string; url: string; snippet?: string }
export interface ResearchResult { query: string; via: string; text: string; sources: ResearchSource[] }

export interface OutlineOpts extends GenerateOpts {
    preset?: StylePreset;
    /** Grounding from `researchTopic`; snippets go into every prompt, a "Sources" card is appended. */
    research?: ResearchResult | null;
}

export const OUTLINE_BATCH = 6;
export const LAST_OUTLINE_KEY = 'scribe-idocs:last-outline';
export const RECENT_OUTLINES_KEY = 'scribe-idocs:recent-outlines';
const MAX_SOURCE_CHARS = 12_000;

export const STYLE_PRESETS: Record<StylePreset, { label: string; blurb: string; hint: string; blocks: BlockType[] }> = {
    minimal: {
        label: 'Minimal', blurb: 'Text-first, few blocks', blocks: ['heading', 'text', 'callout', 'divider'],
        hint: 'Style MINIMAL: text-heavy and sparse — 1-3 blocks per card (heading + text, an occasional callout). No charts, images, boxes or backgrounds.',
    },
    visual: {
        label: 'Visual', blurb: 'Images, boxes, charts, backgrounds', blocks: ['image', 'boxes', 'chart', 'funnel', 'gallery', 'callout'],
        hint: 'Style VISUAL: favor "boxes", "chart", "funnel", "image"/"gallery" (only with REAL urls, else skip), split-left/split-right/hero layouts, and a "background" color on hero/section-break cards. Short punchy text.',
    },
    classic: {
        label: 'Classic', blurb: 'Headings, prose, quotes', blocks: ['heading', 'text', 'quote', 'callout', 'table'],
        hint: 'Style CLASSIC: a traditional document — heading + well-written paragraphs, quotes and callouts for emphasis; tables only when data demands. No boxes/funnels/charts unless essential.',
    },
    consultant: {
        label: 'Consultant', blurb: 'Exec summary, charts, tables, steps', blocks: ['callout', 'boxes', 'chart', 'table', 'funnel', 'steps'],
        hint: 'Style CONSULTANT: consulting-deck rigor — the FIRST card is an "Executive summary" (callout takeaway + boxes of key points); favor "chart", "table", "funnel", "steps"; MECE structure; crisp action-oriented bullets; end with recommendations/next steps.',
    },
};

// ── normalize ────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim();
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isLayout = (v: unknown): v is CardLayout => (CARD_LAYOUTS as readonly string[]).includes(str(v));
const isBlockType = (v: unknown): v is BlockType => (BLOCK_TYPES as readonly string[]).includes(str(v));

/** Coerce a model/user object into a DocOutline (drops title-less cards; bullets from array or newline string). Never throws. */
export function normalizeOutline(raw: unknown): DocOutline {
    const r = rec(raw);
    const list = Array.isArray(r.cards) ? r.cards : Array.isArray(r.sections) ? r.sections : [];
    const cards: OutlineCard[] = [];
    for (const c of list) {
        const x = typeof c === 'string' ? { title: c } : rec(c);
        const title = str(x.title ?? x.heading);
        if (!title) continue;
        const bulletsRaw = x.bullets ?? x.points ?? x.goal ?? x.content;
        const bullets = (Array.isArray(bulletsRaw) ? bulletsRaw.map(str) : str(bulletsRaw).split('\n')).map((b) => b.replace(/^[-*•]\s*/, '').trim()).filter(Boolean);
        const card: OutlineCard = { title, bullets };
        if (isLayout(x.layoutHint ?? x.layout)) card.layoutHint = (x.layoutHint ?? x.layout) as CardLayout;
        const bh = Array.isArray(x.blocksHint) ? x.blocksHint.filter(isBlockType) : [];
        if (bh.length) card.blocksHint = bh;
        cards.push(card);
    }
    return { title: str(r.title) || 'Untitled doc', description: str(r.description), cards };
}

// ── research (Web Search skill) ──────────────────────────────────────

export type SearchRunner = (query: string, ctx: SkillContext) => Promise<SkillResult>;

const defaultRunSearch: SearchRunner = (query, ctx) => {
    const skill = AGENT_SKILLS.find((s) => s.id === 'skill-web-search');
    return skill ? skill.run(query, ctx) : Promise.resolve({ ok: false, text: '', via: 'none' });
};

/** True when a live-search path exists (Tavily/Brave key, or Anthropic key → web_search tool). */
export function canResearch(bundle: Pick<IntegrationsBundle, 'llm' | 'search'>): boolean {
    const s = bundle.search;
    return !!((s?.tavily?.enabled !== false && s?.tavily?.apiKey) || (s?.brave?.enabled !== false && s?.brave?.apiKey) || (bundle.llm.anthropic?.enabled !== false && bundle.llm.anthropic?.apiKey));
}

/** Markdown links → sources (dedup by url, cap 5); the description line under a link becomes its snippet. */
export function parseSources(text: string, cap = 5): ResearchSource[] {
    const out: ResearchSource[] = [];
    const seen = new Set<string>();
    const re = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)(?:\n\s+([^\n[]+))?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) && out.length < cap) {
        if (seen.has(m[2])) continue;
        seen.add(m[2]);
        out.push({ title: m[1].trim(), url: m[2], snippet: m[3]?.trim() || undefined });
    }
    return out;
}

/** Top-5 web results for the topic via the Web Search skill. null when nothing live came back. */
export async function researchTopic(topic: string, ctx: SkillContext, runSearch: SearchRunner = defaultRunSearch): Promise<ResearchResult | null> {
    const query = topic.trim().slice(0, 300);
    if (!query) return null;
    let res: SkillResult;
    try { res = await runSearch(query, ctx); } catch { return null; }
    if (!res.ok || !res.text.trim() || /no live web/i.test(res.via)) return null;
    return { query, via: res.via, text: res.text.slice(0, 6000), sources: parseSources(res.text) };
}

// ── prompts ──────────────────────────────────────────────────────────

function groundingBlock(research: ResearchResult | null | undefined): string {
    if (!research) return '';
    return `\n\n<research>\n${research.text}\n</research>\nUse the research above as grounding; cite facts from it rather than inventing numbers. Do NOT write a "Sources" card — it is added automatically.`;
}

function outlineSystem(n: number, opts: OutlineOpts): string {
    const preset = opts.preset ? STYLE_PRESETS[opts.preset] : null;
    return `You are a document designer planning a ${n}-card Gamma-style interactive document.
Respond with STRICT JSON only — no fences, no commentary:
{"title":"…","description":"one sentence","cards":[{"title":"short title","bullets":["what this card must cover","…"],"layoutHint":"default","blocksHint":["text"]}]}
- Exactly ${n} cards in reading order. 2-5 bullets per card (content, not prose). Do NOT write the bodies yet.
- layoutHint is one of ${CARD_LAYOUTS.join('|')} ("hero" for the first card when apt). blocksHint lists 1-4 block types from: ${BLOCK_TYPES.join(', ')}.
${preset ? `- ${preset.hint}\n` : ''}${opts.tone ? `- Tone: ${opts.tone}.\n` : ''}${opts.audience ? `- Audience: ${opts.audience}.\n` : ''}${opts.language ? `- Language: write titles and bullets in ${opts.language}.\n` : ''}`;
}

function batchSystem(opts: OutlineOpts): string {
    const preset = opts.preset ? STYLE_PRESETS[opts.preset] : null;
    return `You are a document designer writing the bodies of some cards of a Gamma-style document from an approved outline.
Respond with STRICT JSON only: {"cards":[{"title":"…","layout":"default","blocks":[…]}]} — one entry per requested card, same order, EXACT same titles.
Rules:
- Every bullet of a card's outline must be covered by its blocks. Card layout is one of ${CARD_LAYOUTS.join('|')}; honor the layout/blocks hints when given.
${preset ? `- ${preset.hint}\n` : ''}${commonRules(opts)}
${BLOCK_CONTRACT}`;
}

async function askJson(prompt: string, systemPrompt: string, llm: LlmBundle, callLlmFn: CallLlmFn, maxTokens: number): Promise<Record<string, unknown> | null> {
    const res = await callLlmFn({ prompt, systemPrompt, maxTokens, temperature: 0.5, responseFormat: 'json' }, llm);
    if (!res?.text) return null;
    const parsed = parseJsonLoose(res.text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
}

export interface OutlineInput { prompt?: string; sourceText?: string }

/** Step 1: prompt and/or source text → editable outline. null when no LLM / empty input / unusable reply. */
export async function generateOutline(input: OutlineInput, opts: OutlineOpts, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<DocOutline | null> {
    const prompt = input.prompt?.trim() ?? '';
    let src = input.sourceText?.trim() ?? '';
    if (!prompt && !src) return null;
    if (!hasActiveLlm(llm)) return null;
    if (src.length > MAX_SOURCE_CHARS) src = `${src.slice(0, MAX_SOURCE_CHARS)}\n\n[Source truncated at ${MAX_SOURCE_CHARS} chars]`;
    const n = Math.min(30, Math.max(1, Math.round(opts.cards ?? 6)));
    const task = [
        prompt ? `Plan the document about:\n${prompt}` : 'Plan a document that restructures the source below. Preserve its facts.',
        src ? `<source>\n${src}\n</source>` : '',
    ].filter(Boolean).join('\n\n') + groundingBlock(opts.research);
    const raw = await askJson(task, outlineSystem(n, opts), llm, callLlmFn, 2500);
    if (!raw) return null;
    const outline = normalizeOutline(raw);
    outline.cards = outline.cards.slice(0, n);
    return outline.cards.length ? outline : null;
}

/** Deterministic "Sources" card (no LLM). */
export function sourcesCard(research: ResearchResult): Card {
    const md = research.sources.length
        ? research.sources.map((s) => `- [${s.title}](${s.url})${s.snippet ? ` — ${s.snippet}` : ''}`).join('\n')
        : research.text.slice(0, 1500);
    return { id: newId('c'), title: 'Sources', layout: 'default', blocks: [
        { id: newId(), type: 'text', md },
        { id: newId(), type: 'callout', tone: 'info', md: `Researched via ${research.via} for “${research.query}”.` },
    ] };
}

/**
 * Step 3: outline → IDoc. Cards are written in batches of ≤ 6; titles are taken from the outline (the model can't
 * rename), bullets are the required content. `onProgress(done, total)` fires after each batch (0/total first).
 */
export async function generateFromOutline(
    outline: DocOutline, opts: OutlineOpts, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm,
    onProgress?: (done: number, total: number) => void,
): Promise<IDoc | null> {
    const cardsIn = outline.cards.filter((c) => c.title.trim());
    if (!cardsIn.length || !hasActiveLlm(llm)) return null;
    const total = cardsIn.length;
    onProgress?.(0, total);
    const full = cardsIn.map((c, i) => `${i + 1}. ${c.title}`).join('; ');
    const cards: unknown[] = [];
    let anyOk = false;
    for (let i = 0; i < total; i += OUTLINE_BATCH) {
        const slice = cardsIn.slice(i, i + OUTLINE_BATCH);
        const prompt = `Document title: ${outline.title}\n${outline.description ? `Description: ${outline.description}\n` : ''}Full outline (context): ${full}\n\nWrite cards ${i + 1}-${i + slice.length}:\n${slice.map((c, k) => `${i + k + 1}. ${c.title}${c.layoutHint ? ` [layout: ${c.layoutHint}]` : ''}${c.blocksHint?.length ? ` [blocks: ${c.blocksHint.join(', ')}]` : ''}\n${c.bullets.map((b) => `   - ${b}`).join('\n')}`).join('\n')}${groundingBlock(opts.research)}`;
        let res: Record<string, unknown> | null = null;
        try { res = await askJson(prompt, batchSystem(opts), llm, callLlmFn, 6000); } catch { res = null; }
        const got = Array.isArray(res?.cards) ? res.cards : [];
        slice.forEach((c, k) => {
            const g = got[k];
            if (g) { anyOk = true; cards.push({ ...rec(g), title: c.title, layout: rec(g).layout ?? c.layoutHint }); }
            else cards.push({ title: c.title, layout: c.layoutHint, blocks: c.bullets.length ? [{ type: 'text', md: c.bullets.map((b) => `- ${b}`).join('\n') }] : [] });
        });
        onProgress?.(Math.min(total, i + slice.length), total);
    }
    if (!anyOk) return null;
    if (opts.research) cards.push(sourcesCard(opts.research));
    const language = opts.language?.trim();
    return normalizeDoc({ title: outline.title, description: outline.description, cards }, language ? { language } : {});
}

// ── cache ────────────────────────────────────────────────────────────

export interface CachedOutline { outline: DocOutline; opts: OutlineOpts; at: string }

export function saveLastOutline(outline: DocOutline, opts: OutlineOpts): void {
    const entry: CachedOutline = { outline, opts: { ...opts, research: opts.research ?? null }, at: new Date().toISOString() };
    try {
        localStorage.setItem(LAST_OUTLINE_KEY, JSON.stringify(entry));
        const recent = loadRecentOutlines().filter((r) => r.outline.title !== outline.title);
        localStorage.setItem(RECENT_OUTLINES_KEY, JSON.stringify([entry, ...recent].slice(0, 5)));
    } catch { /* sandboxed / quota */ }
}

export function loadLastOutline(): CachedOutline | null {
    try {
        const raw = localStorage.getItem(LAST_OUTLINE_KEY);
        if (!raw) return null;
        const p = rec(JSON.parse(raw));
        const outline = normalizeOutline(p.outline);
        return outline.cards.length ? { outline, opts: rec(p.opts) as OutlineOpts, at: str(p.at) } : null;
    } catch { return null; }
}

export function loadRecentOutlines(): CachedOutline[] {
    try {
        const raw = localStorage.getItem(RECENT_OUTLINES_KEY);
        const list = raw ? JSON.parse(raw) : [];
        return Array.isArray(list) ? list.map((e) => { const p = rec(e); return { outline: normalizeOutline(p.outline), opts: rec(p.opts) as OutlineOpts, at: str(p.at) }; }).filter((e) => e.outline.cards.length) : [];
    } catch { return []; }
}
