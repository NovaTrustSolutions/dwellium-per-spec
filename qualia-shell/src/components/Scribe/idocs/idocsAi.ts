/**
 * idocsAi — LLM + pure helpers for Interactive Docs. Every LLM entry point
 * takes the integrations `llm` bundle AND an injectable `callLlmFn` so tests
 * can feed canned (even sloppy, fenced) JSON. `normalizeDoc` is the safety
 * net: whatever the model returns is coerced into a renderable IDoc.
 */
import { callLlm, hasActiveLlm, type LlmRequest, type LlmResponse } from '../../../lib/llmClient';
import type { IntegrationsBundle } from '../../../types/integrations';
import {
    BLOCK_TYPES, CARD_LAYOUTS, IDOC_THEMES, createEmptyDoc, newId,
    type Block, type BlockTone, type BlockType, type Card, type CardBackground, type CardLayout, type IDoc, type IDocThemeId,
} from './idocTypes';

export type LlmBundle = IntegrationsBundle['llm'];
export type CallLlmFn = (req: LlmRequest, llm: LlmBundle) => Promise<LlmResponse | null>;

export type GenerateAmount = 'brief' | 'medium' | 'detailed' | 'extensive';

export interface GenerateOpts {
    /** Target card count (default 6, capped at 30; >12 uses the outline-first two-step). */
    cards?: number;
    tone?: string;
    audience?: string;
    /** How much text per card (default medium). */
    amount?: GenerateAmount;
    /** BCP-47 name or code, e.g. "Spanish", "es", "Arabic". Model writes ALL text in it; sets doc.language/dir. */
    language?: string;
}

export const MAX_CARDS = 30;
/** Above this, generation goes outline → batches. */
const SINGLE_SHOT_MAX = 12;
const BATCH_SIZE = 10;
const MAX_SOURCE_CHARS = 12_000;

const AMOUNT_HINT: Record<GenerateAmount, string> = {
    brief: '2-3 blocks per card, ≤ 60 words of prose per card — headlines and bullets.',
    medium: '3-5 blocks per card, ~120 words of prose per card.',
    detailed: '4-7 blocks per card, ~200 words of prose per card with examples.',
    extensive: '5-8 blocks per card, ~300 words of prose per card; thorough, with supporting detail.',
};

/** Languages written right-to-left (names + ISO codes). ponytail: small list; extend if a user asks. */
const RTL = /^(ar|arabic|he|hebrew|fa|farsi|persian|ur|urdu|ps|pashto|yi|yiddish|sd|sindhi|ug|uyghur|dv|dhivehi|ku|kurdish|syr|syriac)\b/i;
export function dirForLanguage(language: string | undefined): 'ltr' | 'rtl' | undefined {
    if (!language?.trim()) return undefined;
    return RTL.test(language.trim()) ? 'rtl' : 'ltr';
}

/** The JSON contract the model must follow — one example per block type (all 24). Exported for doc-level AI prompts. */
export const BLOCK_CONTRACT = `Block types (use ONLY these; every block is an object with "type"):
- {"type":"heading","level":2,"text":"Section title"}  (level 1|2|3)
- {"type":"text","md":"Markdown paragraph(s)."}
- {"type":"callout","tone":"info","md":"Key point"}  (tone info|success|warning|danger)
- {"type":"quote","md":"Quoted text","cite":"Who"}
- {"type":"image","src":"https://…","alt":"desc","caption":"…"}  (only if you have a REAL url; else skip)
- {"type":"gallery","images":[{"src":"https://…","alt":"…"}]}  (only real urls)
- {"type":"embed","url":"https://www.youtube.com/watch?v=…"}  (only real urls)
- {"type":"chart","kind":"bar","title":"Revenue","data":[{"label":"Q1","value":12},{"label":"Q2","value":18},{"label":"Q3","value":22}]}  (kind bar|line|pie; 3-8 numeric points)
- {"type":"table","headers":["Col A","Col B"],"rows":[["a1","b1"],["a2","b2"]]}
- {"type":"accordion","items":[{"title":"Q?","md":"Answer"}]}
- {"type":"tabs","items":[{"title":"Tab","md":"Content"}]}
- {"type":"columns","columns":["Left markdown","Right markdown"]}  (2-3 columns)
- {"type":"button","label":"Learn more","href":"https://…","variant":"primary"}
- {"type":"code","lang":"ts","code":"const x = 1;"}
- {"type":"divider"}
- {"type":"timeline","items":[{"date":"2024","title":"Launch","md":"What happened"}]}
- {"type":"quiz","question":"…?","options":["A","B","C"],"answerIndex":1,"explanation":"Why"}
- {"type":"toc"}
- {"type":"steps","numbered":true,"items":[{"title":"Step","md":"What to do"}]}  (sequential process, 3-6 steps)
- {"type":"funnel","items":[{"label":"Stage","value":100},{"label":"Next","value":40}]}  (narrowing stages, top→bottom)
- {"type":"boxes","columns":3,"items":[{"title":"Box","md":"Short point","emphasis":false}]}  (grid of 2-6 equal cards; columns 2|3|4)
- {"type":"math","latex":"E = mc^2","inline":false}
- {"type":"diagram","mermaid":"flowchart LR\\n  A --> B"}  (mermaid source; flowchart/sequence/gantt)
- {"type":"qr","url":"https://…","caption":"Scan me"}`;

const LAYOUT_HINTS = `Smart layouts: prefer "steps" for processes, "boxes" for parallel points/features, "funnel" for narrowing stages, "timeline" for dates, "columns" for side-by-side comparisons, "table" for data.
Cards may nest sub-cards via "children":[{"title":"…","layout":"default","blocks":[…]}] when a section has natural sub-sections (rare; ≤ 3 children).
Cards may add "background":{"color":"#0b1020","overlay":"faded"} ONLY when a hero/section-break card benefits from it.`;

/** Shared per-card writing rules (amount/tone/audience/language + smart-layout hints). Used by idocsOutline too. */
export function commonRules(opts: GenerateOpts): string {
    const amount = AMOUNT_HINT[opts.amount ?? 'medium'];
    return `- ${amount} Mix block types where they genuinely help; don't force every type.
- Charts need 3-8 numeric data points with short labels. Tables ≤ 6 rows.
- Markdown fields may use **bold**, lists, links. No HTML.
${opts.tone ? `- Tone: ${opts.tone}.\n` : ''}${opts.audience ? `- Audience: ${opts.audience}.\n` : ''}${opts.language ? `- Language: write ALL text (titles, blocks, labels, options) in ${opts.language}.\n` : ''}${LAYOUT_HINTS}`;
}

function systemPrompt(opts: GenerateOpts): string {
    const n = Math.min(SINGLE_SHOT_MAX, Math.max(1, opts.cards ?? 6));
    return `You are a document designer producing a Gamma-style interactive card document.
Respond with STRICT JSON only — no markdown fences, no commentary:
{"title":"…","description":"one sentence","cards":[{"title":"…","layout":"default","blocks":[…]}]}
Rules:
- Exactly ${n} cards. Card layout is one of ${CARD_LAYOUTS.join('|')} (use "hero" for the first card when apt).
${commonRules(opts)}
${BLOCK_CONTRACT}`;
}

function outlinePrompt(n: number, opts: GenerateOpts): string {
    return `You are a document designer planning a ${n}-card Gamma-style document.
Respond with STRICT JSON only: {"title":"…","description":"one sentence","cards":[{"title":"…","goal":"one sentence on what this card must cover"}]}
- Exactly ${n} cards, in reading order. Titles are short. Do NOT write the card bodies yet.
${opts.tone ? `- Tone: ${opts.tone}.\n` : ''}${opts.audience ? `- Audience: ${opts.audience}.\n` : ''}${opts.language ? `- Language: ${opts.language}.\n` : ''}`;
}

function batchPrompt(opts: GenerateOpts): string {
    return `You are a document designer writing the bodies of some cards of a Gamma-style document from an outline.
Respond with STRICT JSON only: {"cards":[{"title":"…","layout":"default","blocks":[…]}]} — one entry per requested card, same order, same titles.
Rules:
- Card layout is one of ${CARD_LAYOUTS.join('|')}.
${commonRules(opts)}
${BLOCK_CONTRACT}`;
}

/** Fence-tolerant JSON parse (pattern from ../redlinePrompt.ts). Also trims leading prose before the first `{`. */
export function parseJsonLoose(text: string): unknown | null {
    try {
        let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start > 0 || end < cleaned.length - 1) cleaned = cleaned.slice(Math.max(0, start), end + 1);
        return JSON.parse(cleaned);
    } catch {
        return null;
    }
}

// ── normalize ────────────────────────────────────────────────────────

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.isFinite(Number(v)) ? Number(v) : fallback);
const arr = <T>(v: unknown, map: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(map).filter((x): x is T => x != null) : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const isType = (t: unknown): t is BlockType => typeof t === 'string' && (BLOCK_TYPES as readonly string[]).includes(t);

/** Coerce anything into a Block. Unknown/garbage → text block holding the JSON so nothing is silently lost. */
export function normalizeBlock(raw: unknown): Block {
    const r = rec(raw);
    const id = str(r.id) || newId();
    const type = r.type;
    if (!isType(type)) {
        const body = typeof raw === 'string' ? raw : JSON.stringify(raw ?? null);
        return { id, type: 'text', md: body };
    }
    switch (type) {
        case 'heading': {
            const lvl = Math.min(3, Math.max(1, Math.round(num(r.level, 2)))) as 1 | 2 | 3;
            return { id, type, level: lvl, text: str(r.text ?? r.md) };
        }
        case 'text': return { id, type, md: str(r.md ?? r.text ?? r.content) };
        case 'callout': {
            const tone: BlockTone = ['info', 'success', 'warning', 'danger'].includes(str(r.tone)) ? (r.tone as BlockTone) : 'info';
            return { id, type, tone, md: str(r.md ?? r.text) };
        }
        case 'quote': return { id, type, md: str(r.md ?? r.text), cite: r.cite == null ? undefined : str(r.cite) };
        case 'image': return { id, type, src: str(r.src ?? r.url), alt: str(r.alt), caption: str(r.caption) };
        case 'gallery': return { id, type, images: arr(r.images, (x) => { const i = rec(x); const src = str(i.src ?? i.url ?? (typeof x === 'string' ? x : '')); return src ? { src, alt: str(i.alt) } : null; }) };
        case 'embed': return { id, type, url: str(r.url ?? r.src), provider: r.provider == null ? undefined : str(r.provider) };
        case 'chart': {
            const kind = ['bar', 'line', 'pie'].includes(str(r.kind)) ? (r.kind as 'bar' | 'line' | 'pie') : 'bar';
            const data = arr(r.data, (x) => { const d = rec(x); const label = str(d.label ?? d.name ?? d.x); return label ? { label, value: num(d.value ?? d.y) } : null; });
            return { id, type, kind, title: r.title == null ? undefined : str(r.title), data };
        }
        case 'table': {
            const headers = arr(r.headers, (h) => str(h));
            const rows = arr(r.rows, (row) => (Array.isArray(row) ? row.map((c) => str(c)) : null));
            return { id, type, headers, rows };
        }
        case 'accordion':
        case 'tabs':
            return { id, type, items: arr(r.items, (x) => { const i = rec(x); return { title: str(i.title ?? i.label, 'Item'), md: str(i.md ?? i.text ?? i.content) }; }) };
        case 'columns': {
            const cols = arr(r.columns, (c) => (typeof c === 'string' ? c : str(rec(c).md ?? rec(c).text)));
            return { id, type, columns: cols.length >= 2 ? cols.slice(0, 3) : [...cols, ...Array(2 - cols.length).fill('')] };
        }
        case 'button': return { id, type, label: str(r.label ?? r.text, 'Open'), href: str(r.href ?? r.url), variant: r.variant === 'secondary' ? 'secondary' : 'primary' };
        case 'code': return { id, type, lang: str(r.lang ?? r.language), code: str(r.code ?? r.text) };
        case 'divider': return { id, type };
        case 'timeline': return { id, type, items: arr(r.items, (x) => { const i = rec(x); return { date: str(i.date), title: str(i.title, 'Event'), md: str(i.md ?? i.text) }; }) };
        case 'quiz': {
            const options = arr(r.options, (o) => str(o));
            const answerIndex = Math.min(Math.max(0, Math.round(num(r.answerIndex ?? r.answer, 0))), Math.max(0, options.length - 1));
            return { id, type, question: str(r.question, 'Question?'), options, answerIndex, explanation: r.explanation == null ? undefined : str(r.explanation) };
        }
        case 'toc': return { id, type };
        case 'steps': return { id, type, numbered: r.numbered !== false, items: arr(r.items ?? r.steps, (x) => { const i = rec(x); return { title: str(i.title ?? i.label, 'Step'), md: str(i.md ?? i.text ?? i.description) }; }) };
        case 'funnel': return { id, type, items: arr(r.items ?? r.stages, (x) => { const i = rec(x); return { label: str(i.label ?? i.title, 'Stage'), value: i.value == null ? undefined : num(i.value) }; }) };
        case 'boxes': { const cols = num(r.columns, 3); return { id, type, columns: (cols === 2 || cols === 4 ? cols : 3) as 2 | 3 | 4, items: arr(r.items ?? r.boxes, (x) => { const i = rec(x); return { title: str(i.title ?? i.label, 'Box'), md: str(i.md ?? i.text ?? i.description), emphasis: i.emphasis === true }; }) }; }
        case 'math': return { id, type, latex: str(r.latex ?? r.tex ?? r.text), inline: r.inline === true };
        case 'diagram': return { id, type, mermaid: str(r.mermaid ?? r.code ?? r.text) };
        case 'qr': return { id, type, url: str(r.url ?? r.href), caption: r.caption == null ? undefined : str(r.caption) };
    }
}

function normalizeBackground(raw: unknown): CardBackground | undefined {
    const r = rec(raw);
    if (!Object.keys(r).length) return undefined;
    const overlay = ['none', 'frosted', 'faded', 'clear'].includes(str(r.overlay)) ? (r.overlay as CardBackground['overlay']) : undefined;
    const align = ['top', 'center', 'bottom'].includes(str(r.align)) ? (r.align as CardBackground['align']) : undefined;
    const bg: CardBackground = {
        color: r.color ? str(r.color) : undefined,
        image: r.image ? str(r.image) : undefined,
        overlay,
        intensity: r.intensity == null ? undefined : Math.min(100, Math.max(0, Math.round(num(r.intensity)))),
        align,
    };
    return bg.color || bg.image ? bg : undefined;
}

export function normalizeCard(raw: unknown, index: number, depth = 0): Card {
    const r = rec(raw);
    const layout = (CARD_LAYOUTS as readonly string[]).includes(str(r.layout)) ? (r.layout as CardLayout) : 'default';
    const card: Card = {
        id: str(r.id) || newId('c'),
        title: r.title == null ? `Card ${index + 1}` : str(r.title),
        layout,
        headerImage: r.headerImage ? str(r.headerImage) : undefined,
        blocks: arr(r.blocks, (b) => normalizeBlock(b)),
    };
    // ponytail: one level of nesting is all the prompt asks for; depth guard stops runaway models.
    const children = depth < 2 ? arr(r.children, (c) => c) : [];
    if (children.length) card.children = children.slice(0, 5).map((c, i) => normalizeCard(c, i, depth + 1));
    const background = normalizeBackground(r.background);
    if (background) card.background = background;
    if (r.notes) card.notes = str(r.notes);
    const footnotes = arr(r.footnotes, (f) => { const x = rec(f); const text = str(x.text ?? (typeof f === 'string' ? f : '')); return text ? { id: str(x.id) || newId('fn'), text } : null; });
    if (footnotes.length) card.footnotes = footnotes;
    return card;
}

const isTheme = (t: unknown): t is IDocThemeId => IDOC_THEMES.some((x) => x.id === t);

/** Coerce a raw (model or imported) object into a full IDoc. Never throws. */
export function normalizeDoc(raw: unknown, base: Partial<IDoc> = {}): IDoc {
    const r = rec(raw);
    const cardsRaw = Array.isArray(r.cards) ? r.cards : Array.isArray(r.slides) ? r.slides : Array.isArray(r.sections) ? r.sections : [];
    const cards = cardsRaw.map((c, i) => normalizeCard(c, i));
    const language = str(r.language) || base.language;
    const dir = r.dir === 'rtl' || r.dir === 'ltr' ? r.dir : base.dir ?? dirForLanguage(language);
    const doc = createEmptyDoc({
        ...base,
        title: str(r.title, base.title ?? 'Untitled doc'),
        description: r.description == null ? base.description : str(r.description),
        cards: cards.length ? cards : createEmptyDoc().cards,
        ...(language ? { language } : {}),
        ...(dir ? { dir } : {}),
        ...(r.isTemplate === true ? { isTemplate: true } : {}),
    });
    doc.theme = isTheme(r.theme) ? r.theme : base.theme ?? suggestThemeFor(doc.title);
    return doc;
}

// ── generation ───────────────────────────────────────────────────────

async function askJson(prompt: string, sys: string, llm: LlmBundle, callLlmFn: CallLlmFn, maxTokens = 6000): Promise<Record<string, unknown> | null> {
    const res = await callLlmFn({ prompt, systemPrompt: sys, maxTokens, temperature: 0.5, responseFormat: 'json' }, llm);
    if (!res?.text) return null;
    const parsed = parseJsonLoose(res.text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
}

function langBase(opts: GenerateOpts): Partial<IDoc> {
    const language = opts.language?.trim();
    return language ? { language, dir: dirForLanguage(language) } : {};
}

/**
 * Single-shot for ≤ 12 cards. Above that: outline call → per-batch card calls
 * (≤ 10 each) → merge → normalizeDoc. A failed batch keeps the outline stubs
 * (title only) so the doc still opens with the right shape.
 */
async function generate(task: string, opts: GenerateOpts, llm: LlmBundle, callLlmFn: CallLlmFn): Promise<IDoc | null> {
    if (!hasActiveLlm(llm)) return null;
    const n = Math.min(MAX_CARDS, Math.max(1, Math.round(opts.cards ?? 6)));
    if (n <= SINGLE_SHOT_MAX) {
        const parsed = await askJson(task, systemPrompt({ ...opts, cards: n }), llm, callLlmFn);
        return parsed ? normalizeDoc(parsed, langBase(opts)) : null;
    }
    const outline = await askJson(task, outlinePrompt(n, opts), llm, callLlmFn, 2000);
    if (!outline) return null;
    const stubs = arr(outline.cards, (c) => { const x = rec(c); const title = str(x.title); return title ? { title, goal: str(x.goal) } : null; }).slice(0, n);
    if (!stubs.length) return null;
    const cards: unknown[] = [];
    for (let i = 0; i < stubs.length; i += BATCH_SIZE) {
        const slice = stubs.slice(i, i + BATCH_SIZE);
        const prompt = `${task}\n\nDocument title: ${str(outline.title)}\nFull outline (for context): ${stubs.map((s, k) => `${k + 1}. ${s.title}`).join('; ')}\n\nWrite cards ${i + 1}-${i + slice.length}:\n${slice.map((s, k) => `${i + k + 1}. ${s.title} — ${s.goal}`).join('\n')}`;
        const res = await askJson(prompt, batchPrompt(opts), llm, callLlmFn);
        const got = Array.isArray(res?.cards) ? res.cards : [];
        slice.forEach((s, k) => cards.push(got[k] ? { title: s.title, ...rec(got[k]) } : { title: s.title, blocks: [] }));
    }
    return normalizeDoc({ title: outline.title, description: outline.description, cards }, langBase(opts));
}

export function generateDocFromPrompt(prompt: string, opts: GenerateOpts, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    const p = prompt.trim();
    if (!p) return Promise.resolve(null);
    return generate(`Create the document about:\n${p}`, opts, llm, callLlmFn);
}

/** "Paste text/outline → structured cards". Source is truncated to 12k chars with a note. */
export function generateDocFromText(sourceText: string, opts: GenerateOpts, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    let src = sourceText.trim();
    if (!src) return Promise.resolve(null);
    if (src.length > MAX_SOURCE_CHARS) src = `${src.slice(0, MAX_SOURCE_CHARS)}\n\n[Source truncated at ${MAX_SOURCE_CHARS} chars]`;
    return generate(`Restructure the following source text into the card document. Preserve facts; do not invent numbers.\n\n<source>\n${src}\n</source>`, opts, llm, callLlmFn);
}

export type RewriteInstruction = 'rewrite' | 'shorten' | 'expand' | 'simplify' | 'formal' | 'friendly' | (string & {});
const REWRITE_HINTS: Record<string, string> = {
    rewrite: 'Rewrite for clarity and flow, same meaning and length.',
    shorten: 'Make it roughly half as long. Keep the key facts.',
    expand: 'Expand with one or two supporting details or examples. At most double the length.',
    simplify: 'Rewrite in plain language a 12-year-old could follow.',
    formal: 'Rewrite in a formal, professional register.',
    friendly: 'Rewrite in a warm, conversational, friendly voice.',
};

/** Per-block AI edit. Returns the new markdown, or null when no LLM / empty reply. */
export async function rewriteBlockMd(md: string, instruction: RewriteInstruction, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<string | null> {
    if (!hasActiveLlm(llm) || !md.trim()) return null;
    const hint = REWRITE_HINTS[instruction] ?? instruction;
    const res = await callLlmFn({
        systemPrompt: 'You edit a single markdown block. Return ONLY the edited markdown — no fences, no preamble, no explanation.',
        prompt: `Instruction: ${hint}\n\nBlock:\n${md}`,
        maxTokens: 1200,
        temperature: 0.4,
    }, llm);
    const out = res?.text?.trim().replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
    return out || null;
}

// ── heuristics ───────────────────────────────────────────────────────

/** Cheap keyword → theme guess (no LLM). ponytail: word-list heuristic; swap for a model call if it matters. */
export function suggestThemeFor(title: string): IDocThemeId {
    const t = title.toLowerCase();
    if (/\b(finance|budget|revenue|invest|bank|tax|q[1-4]|quarter)/.test(t)) return 'slate';
    if (/\b(nature|garden|eco|green|climate|forest|farm|sustain)/.test(t)) return 'forest';
    if (/\b(launch|party|summer|travel|welcome|celebrat|wedding|kids)/.test(t)) return 'sunrise';
    if (/\b(space|night|astro|security|cyber|dark|sleep)/.test(t)) return 'midnight';
    if (/\b(hack|dev|code|api|neon|gaming|startup|crypto)/.test(t)) return 'neon';
    if (/\b(letter|essay|history|book|poem|memo|policy|law)/.test(t)) return 'paper';
    return 'inherit';
}

export interface EmbedInfo { src: string; provider: string; aspect: '16:9' | '4:3' | 'auto' }

/** Pure URL → embeddable iframe src mapper. Rejects anything that isn't http(s). */
export function embedSrcFor(url: string): EmbedInfo | null {
    let u: URL;
    try { u = new URL(url.trim()); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./, '');
    const path = u.pathname;
    const enc = encodeURIComponent(u.toString());

    if (host === 'youtu.be') return { src: `https://www.youtube.com/embed/${path.slice(1).split('/')[0]}`, provider: 'youtube', aspect: '16:9' };
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
        const id = u.searchParams.get('v') ?? path.match(/^\/(?:shorts|embed|live)\/([^/?]+)/)?.[1];
        return id ? { src: `https://www.youtube.com/embed/${id}`, provider: 'youtube', aspect: '16:9' } : null;
    }
    if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        const id = path.match(/(\d+)/)?.[1];
        return id ? { src: `https://player.vimeo.com/video/${id}`, provider: 'vimeo', aspect: '16:9' } : null;
    }
    if (host === 'loom.com') {
        const id = path.match(/\/(?:share|embed)\/([a-zA-Z0-9]+)/)?.[1];
        return id ? { src: `https://www.loom.com/embed/${id}`, provider: 'loom', aspect: '16:9' } : null;
    }
    if (host === 'figma.com') return { src: `https://www.figma.com/embed?embed_host=share&url=${enc}`, provider: 'figma', aspect: '16:9' };
    if (host === 'docs.google.com') {
        const provider = path.startsWith('/spreadsheets') ? 'google-sheets' : path.startsWith('/presentation') ? 'google-slides' : path.startsWith('/forms') ? 'google-forms' : 'google-docs';
        if (/\/pub(html)?$/.test(path) || path.includes('/pub')) return { src: u.toString(), provider, aspect: '4:3' };
        return { src: `${u.origin}${path.replace(/\/edit.*$/, '/preview')}`, provider, aspect: '4:3' };
    }
    if (host === 'google.com' && path.startsWith('/maps')) {
        if (path.startsWith('/maps/embed')) return { src: u.toString(), provider: 'google-maps', aspect: '4:3' };
        const q = u.searchParams.get('q') ?? path.match(/\/maps\/(?:place|search)\/([^/]+)/)?.[1] ?? '';
        return { src: `https://www.google.com/maps?q=${encodeURIComponent(decodeURIComponent(q).replace(/\+/g, ' '))}&output=embed`, provider: 'google-maps', aspect: '4:3' };
    }
    if (host === 'maps.google.com' || (host === 'goo.gl' && path.startsWith('/maps'))) {
        return { src: `https://www.google.com/maps?q=${encodeURIComponent(u.searchParams.get('q') ?? '')}&output=embed`, provider: 'google-maps', aspect: '4:3' };
    }
    if (host === 'airtable.com') return { src: path.startsWith('/embed') ? u.toString() : `https://airtable.com/embed${path}`, provider: 'airtable', aspect: '4:3' };
    if (host === 'miro.com') {
        const id = path.match(/\/board\/([^/?]+)/)?.[1];
        return { src: id ? `https://miro.com/app/live-embed/${id}/` : u.toString(), provider: 'miro', aspect: '16:9' };
    }
    if (host === 'open.spotify.com') return { src: path.startsWith('/embed') ? u.toString() : `https://open.spotify.com/embed${path}`, provider: 'spotify', aspect: 'auto' };
    if (host === 'calendly.com') return { src: u.toString(), provider: 'calendly', aspect: 'auto' };
    if (host.endsWith('typeform.com')) return { src: u.toString(), provider: 'typeform', aspect: '4:3' };
    // ── Wave 1 providers ──
    if (host === 'tiktok.com' || host === 'm.tiktok.com') {
        const id = path.match(/\/video\/(\d+)/)?.[1] ?? path.match(/^\/embed\/(?:v2\/)?(\d+)/)?.[1];
        return id ? { src: `https://www.tiktok.com/embed/v2/${id}`, provider: 'tiktok', aspect: 'auto' } : null;
    }
    if (host.endsWith('wistia.com') || host.endsWith('wistia.net')) {
        const id = path.match(/\/(?:medias|embed\/iframe|embed\/medias)\/([a-zA-Z0-9]+)/)?.[1];
        return id ? { src: `https://fast.wistia.net/embed/iframe/${id}`, provider: 'wistia', aspect: '16:9' } : null;
    }
    if (host === 'form.jotform.com' || host === 'jotform.com') return { src: u.toString(), provider: 'jotform', aspect: '4:3' };
    if (host === 'instagram.com') {
        const id = path.match(/^\/(?:p|reel|reels|tv)\/([^/?]+)/)?.[1];
        return id ? { src: `https://www.instagram.com/p/${id}/embed`, provider: 'instagram', aspect: 'auto' } : null;
    }
    if (host === 'x.com' || host === 'twitter.com' || host === 'mobile.twitter.com') {
        const id = path.match(/\/status(?:es)?\/(\d+)/)?.[1];
        return id ? { src: `https://platform.twitter.com/embed/Tweet.html?id=${id}`, provider: 'x', aspect: 'auto' } : null;
    }
    if (host === 'onedrive.live.com' || host.endsWith('.sharepoint.com') || host.endsWith('.sharepoint-df.com')) {
        // Office 365: OneDrive "Embed" links and SharePoint `?action=embedview` links are already iframe-able.
        return { src: u.toString(), provider: 'office-365', aspect: '4:3' };
    }
    if (host === 'app.powerbi.com') return { src: u.toString(), provider: 'power-bi', aspect: '16:9' };
    if (host === 'public.tableau.com') {
        const src = /[?&]:embed=/.test(u.search) ? u.toString() : `${u.origin}${path}${u.search ? `${u.search}&` : '?'}:showVizHome=no&:embed=true`;
        return { src, provider: 'tableau', aspect: '16:9' };
    }
    if (host === 'drive.google.com') {
        const id = path.match(/\/file\/d\/([^/?]+)/)?.[1] ?? u.searchParams.get('id');
        return id ? { src: `https://drive.google.com/file/d/${id}/preview`, provider: 'google-drive', aspect: '4:3' } : { src: u.toString(), provider: 'google-drive', aspect: '4:3' };
    }
    if (/\.pdf$/i.test(path)) return { src: u.toString(), provider: 'pdf', aspect: '4:3' };
    return { src: u.toString(), provider: 'web', aspect: '16:9' };
}

/** No-LLM fallback for imported .md/.txt: one card per top-level heading (# or ##). */
export function docFromMarkdownHeadings(md: string, title = 'Imported doc'): IDoc {
    const lines = md.replace(/\r\n?/g, '\n').split('\n');
    const cards: Card[] = [];
    let cur: { title: string; body: string[] } | null = null;
    const flush = () => {
        if (!cur) return;
        const body = cur.body.join('\n').trim();
        cards.push({ id: newId('c'), title: cur.title, layout: 'default', blocks: body ? [{ id: newId(), type: 'text', md: body }] : [] });
        cur = null;
    };
    for (const line of lines) {
        const m = /^#{1,2}\s+(.+)$/.exec(line);
        if (m) { flush(); cur = { title: m[1].trim(), body: [] }; }
        else { if (!cur) cur = { title: 'Intro', body: [] }; cur.body.push(line); }
    }
    flush();
    const first = cards[0];
    const docTitle = first && cards.length > 1 && !first.blocks.length ? first.title : title;
    return createEmptyDoc({ title: docTitle, cards: cards.length ? cards : createEmptyDoc().cards });
}
