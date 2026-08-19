/**
 * idocsDocAi — doc-level AI actions for Interactive Docs. Pure: every function
 * takes the integrations `llm` bundle + an injectable `callLlmFn`, returns a
 * NEW IDoc (never mutates), runs the result through normalizeCard/normalizeDoc,
 * and resolves `null` when there is no active LLM or the model returned
 * nothing usable (callers show a toast and keep the old doc).
 *
 * ── Menu contract for the editor (agent C mounts this with zero coupling) ──
 *   import { DOC_AI_ACTIONS } from './idocsDocAi';
 *   DOC_AI_ACTIONS: readonly DocAiAction[]
 *   interface DocAiAction {
 *     id: 'translate' | 'summarize' | 'add-card' | 'restyle' | 'regenerate-card' | 'remix';
 *     label: string;              // menu label
 *     needsInput?: boolean;       // true → prompt the user for a string first
 *     inputHint?: string;         // placeholder for that prompt
 *     perCard?: boolean;          // true → `input` is "<cardId>|<optional instruction>"
 *     run(doc: IDoc, input: string, llm: LlmBundle, callLlmFn?: CallLlmFn): Promise<IDoc | null>;
 *   }
 *   Usage: const next = await action.run(doc, input, integrations.llm); if (next) replaceDoc(next);
 */
import { callLlm, hasActiveLlm } from '../../../lib/llmClient';
import { BLOCK_CONTRACT, dirForLanguage, normalizeCard, parseJsonLoose, type CallLlmFn, type LlmBundle } from './idocsAi';
import { CARD_LAYOUTS, IDOC_THEMES, type Block, type Card, type IDoc, type IDocThemeId } from './idocTypes';

const BATCH = 8;

/** Human-readable text of one card (for context prompts). */
function cardText(c: Card): string {
    const parts: string[] = [];
    for (const b of c.blocks) {
        if ('md' in b && typeof b.md === 'string') parts.push(b.md);
        else if (b.type === 'heading') parts.push(b.text);
        else if ('items' in b) parts.push(b.items.map((i) => ('title' in i ? i.title : 'label' in i ? i.label : '')).join(', '));
    }
    return parts.join('\n').slice(0, 1500);
}

function docOutline(doc: IDoc): string {
    return `Title: ${doc.title}\n${doc.description ? `Description: ${doc.description}\n` : ''}Cards:\n${doc.cards.map((c, i) => `${i + 1}. ${c.title ?? `Card ${i + 1}`}\n${cardText(c)}`).join('\n\n')}`.slice(0, 20_000);
}

/** Compact doc context for chat prompts: title, per-card id/title/block-type counts + first `perCard` chars; capped at `cap`. */
export function docContext(doc: IDoc, perCard = 400, cap = 6000): string {
    const counts = (c: Card) => { const m: Record<string, number> = {}; for (const b of c.blocks) m[b.type] = (m[b.type] ?? 0) + 1; return Object.entries(m).map(([t, n]) => (n > 1 ? `${t}×${n}` : t)).join(', '); };
    const head = `Title: ${doc.title}\n${doc.description ? `Description: ${doc.description}\n` : ''}${doc.language ? `Language: ${doc.language}\n` : ''}Theme: ${doc.theme} · ${doc.cards.length} cards\n`;
    const cards = doc.cards.map((c, i) => `#${i + 1} id=${c.id} "${c.title ?? `Card ${i + 1}`}" [${counts(c) || 'empty'}]${c.blocks.length ? `\n  blocks: ${c.blocks.map((b) => `${b.id}:${b.type}`).join(' ')}` : ''}\n  ${cardText(c).slice(0, perCard).replace(/\n+/g, ' ')}`);
    return (head + cards.join('\n')).slice(0, cap);
}

async function askJson(prompt: string, systemPrompt: string, llm: LlmBundle, callLlmFn: CallLlmFn, maxTokens = 6000): Promise<Record<string, unknown> | null> {
    const res = await callLlmFn({ prompt, systemPrompt, maxTokens, temperature: 0.4, responseFormat: 'json' }, llm);
    if (!res?.text) return null;
    const parsed = parseJsonLoose(res.text);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
}

/** Copy of the doc with new cards + bumped updatedAt (id/analytics/theme untouched). */
function withCards(doc: IDoc, cards: Card[], patch: Partial<IDoc> = {}): IDoc {
    return { ...doc, ...patch, cards, updatedAt: new Date().toISOString() };
}

/** Keep the original ids on a model-returned card (and its blocks/children by index). */
function keepIds(orig: Card, next: Card): Card {
    const blocks = next.blocks.map((b, i) => (orig.blocks[i] && orig.blocks[i].type === b.type ? { ...b, id: orig.blocks[i].id } as Block : b));
    const children = next.children?.map((c, i) => (orig.children?.[i] ? keepIds(orig.children[i], c) : c));
    return { ...next, id: orig.id, blocks, ...(children ? { children } : {}) };
}

/**
 * Shared "rewrite every card through the model in batches" loop used by
 * translate + restyle. A batch that fails keeps its original cards.
 */
async function rewriteCards(doc: IDoc, systemPrompt: string, llm: LlmBundle, callLlmFn: CallLlmFn): Promise<Card[] | null> {
    const out: Card[] = [];
    let anyOk = false;
    for (let i = 0; i < doc.cards.length; i += BATCH) {
        const slice = doc.cards.slice(i, i + BATCH);
        const res = await askJson(JSON.stringify({ cards: slice }), systemPrompt, llm, callLlmFn, 8000);
        const got = Array.isArray(res?.cards) ? res.cards : [];
        slice.forEach((orig, k) => {
            if (got[k]) { out.push(keepIds(orig, normalizeCard(got[k], i + k))); anyOk = true; } else out.push(orig);
        });
    }
    return anyOk ? out : null;
}

const STRUCTURE_RULES = `Respond with STRICT JSON only: {"cards":[…]} — the SAME cards, same order, same "id"s, same "type"s, same block order and counts, same layouts.
Only change human-readable text fields: card "title", "notes", block "md"/"text"/"label"/"title"/"caption"/"question"/"options"/"explanation"/"headers"/"rows" cells, item titles/labels, chart titles and data labels.
Never change urls, ids, numbers, "latex", "mermaid", "code", "kind", "level", "tone", "variant".`;

/** Translate every text field into `language`; sets doc.language + dir. */
export async function translateDoc(doc: IDoc, language: string, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    const lang = language.trim();
    if (!doc?.cards?.length || !lang || !hasActiveLlm(llm)) return null;
    const cards = await rewriteCards(doc, `You are a professional translator. Translate all human-readable text into ${lang}. Keep markdown formatting.\n${STRUCTURE_RULES}`, llm, callLlmFn);
    if (!cards) return null;
    const title = await askJson(JSON.stringify({ title: doc.title, description: doc.description ?? '' }), `Translate the values into ${lang}. Respond with STRICT JSON only: {"title":"…","description":"…"}`, llm, callLlmFn, 400);
    return withCards(doc, cards, {
        title: typeof title?.title === 'string' && title.title.trim() ? title.title : doc.title,
        description: typeof title?.description === 'string' ? title.description : doc.description,
        language: lang,
        dir: dirForLanguage(lang),
    });
}

/** Rewrite all markdown-ish text in a tone/style; structure and ids preserved. */
export async function restyleDoc(doc: IDoc, instruction: string, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    const inst = instruction.trim();
    if (!doc?.cards?.length || !inst || !hasActiveLlm(llm)) return null;
    const cards = await rewriteCards(doc, `You are an editor. Rewrite the prose in every card per this instruction: "${inst}". Same meaning, similar length, keep markdown.\n${STRUCTURE_RULES}`, llm, callLlmFn);
    return cards ? withCards(doc, cards) : null;
}

const ONE_CARD_RULES = `Respond with STRICT JSON only: {"title":"…","layout":"default","blocks":[…]} — ONE card. Layout is one of ${CARD_LAYOUTS.join('|')}. 2-6 blocks. Markdown may use **bold**, lists, links; no HTML.
${BLOCK_CONTRACT}`;

/** Prepend an "Executive summary" card (callout + bullets/boxes) built from the whole doc. */
export async function summarizeDocToCard(doc: IDoc, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    if (!doc?.cards?.length || !hasActiveLlm(llm)) return null;
    const raw = await askJson(`Write an executive-summary card for this document. Title it "Executive summary". Lead with one callout (the takeaway), then 3-6 bullets or a "boxes" block of key points.\n\n${docOutline(doc)}`, ONE_CARD_RULES, llm, callLlmFn, 2000);
    if (!raw) return null;
    const card = normalizeCard({ title: 'Executive summary', ...raw }, 0);
    return withCards(doc, [card, ...doc.cards]);
}

/** Append (or insert at `atIndex`) one new card about `instruction`, in the doc's context. */
export async function addCardWithAi(doc: IDoc, instruction: string, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm, atIndex?: number): Promise<IDoc | null> {
    const inst = instruction.trim();
    if (!doc || !inst || !hasActiveLlm(llm)) return null;
    const raw = await askJson(`Add ONE new card to this document about: ${inst}\nMatch the document's tone${doc.language ? ` and language (${doc.language})` : ''}. Do not repeat existing cards.\n\nExisting document outline:\n${docOutline(doc)}`, ONE_CARD_RULES, llm, callLlmFn, 2500);
    if (!raw) return null;
    const cards = [...(doc.cards ?? [])];
    const at = atIndex == null ? cards.length : Math.max(0, Math.min(cards.length, atIndex));
    cards.splice(at, 0, normalizeCard(raw, at));
    return withCards(doc, cards);
}

/** Regenerate one card in place (same id), optionally steered by `instruction`. */
export async function regenerateCard(doc: IDoc, cardId: string, instruction: string | undefined, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    const idx = doc?.cards?.findIndex((c) => c.id === cardId) ?? -1;
    if (idx < 0 || !hasActiveLlm(llm)) return null;
    const orig = doc.cards[idx];
    const raw = await askJson(`Regenerate card ${idx + 1} ("${orig.title ?? ''}") of this document — fresh wording and a better block mix, same topic${instruction?.trim() ? `. Instruction: ${instruction.trim()}` : ''}.${doc.language ? ` Language: ${doc.language}.` : ''}\n\nCurrent card JSON:\n${JSON.stringify(orig)}\n\nDocument outline:\n${docOutline(doc)}`, ONE_CARD_RULES, llm, callLlmFn, 2500);
    if (!raw) return null;
    const next = normalizeCard({ title: orig.title, ...raw }, idx);
    const cards = doc.cards.map((c, i) => (i === idx ? { ...next, id: orig.id, children: orig.children, background: orig.background, notes: orig.notes } : c));
    return withCards(doc, cards);
}

export type RemixFormat = 'doc' | 'deck' | 'brief';
export interface RemixOpts { theme?: IDocThemeId; format?: RemixFormat; instruction?: string }

const REMIX_FORMAT_RULES: Record<RemixFormat, string> = {
    doc: 'Keep roughly the same number of cards; regenerate every card with fresh wording and a better block mix.',
    deck: 'Turn it into a slide DECK: one idea per card, headline-style titles, ≤ 4 blocks per card, ≤ 50 words of prose per card; prefer boxes/charts/steps over paragraphs. Same or slightly more cards.',
    brief: 'Condense into a BRIEF of 1-3 cards total: the takeaway (callout), the key points (bullets or boxes), and next steps. Drop everything non-essential.',
};

/**
 * Remix / regenerate the whole doc: `deck` → short cards, page size 16:9, ≤ 4 blocks/card; `brief` → 1-3 cards; `doc` →
 * full regeneration. Card ids (and block ids by index) survive where titles match; theme is swapped when given.
 */
export async function remixDoc(doc: IDoc, { theme, format = 'doc', instruction }: RemixOpts, llm: LlmBundle, callLlmFn: CallLlmFn = callLlm): Promise<IDoc | null> {
    if (!doc?.cards?.length || !hasActiveLlm(llm)) return null;
    const rules = REMIX_FORMAT_RULES[format] ?? REMIX_FORMAT_RULES.doc;
    const raw = await askJson(
        `Remix this document. ${rules}${instruction?.trim() ? ` Instruction: ${instruction.trim()}.` : ''}${doc.language ? ` Language: ${doc.language}.` : ''} Keep card titles where the content stays the same.\n\nCurrent document:\n${docOutline(doc)}`,
        `You are a document designer. Respond with STRICT JSON only: {"title":"…","description":"…","cards":[{"title":"…","layout":"default","blocks":[…]}]}. Layout is one of ${CARD_LAYOUTS.join('|')}. Markdown may use **bold**, lists, links; no HTML.\n${BLOCK_CONTRACT}`,
        llm, callLlmFn, 8000,
    );
    if (!raw || !Array.isArray(raw.cards) || !raw.cards.length) return null;
    const norm = (t: string | undefined) => (t ?? '').trim().toLowerCase();
    const byTitle = new Map(doc.cards.map((c) => [norm(c.title), c] as const));
    let cards = (raw.cards as unknown[]).map((c, i) => {
        const next = normalizeCard(c, i);
        const orig = byTitle.get(norm(next.title));
        if (!orig) return next;
        byTitle.delete(norm(next.title));
        return keepIds(orig, next);
    });
    if (format === 'brief') cards = cards.slice(0, 3);
    if (format === 'deck') cards = cards.map((c) => (c.blocks.length > 4 ? { ...c, blocks: c.blocks.slice(0, 4) } : c));
    const isTheme = (t: unknown): t is IDocThemeId => IDOC_THEMES.some((x) => x.id === t);
    return withCards(doc, cards, {
        title: typeof raw.title === 'string' && raw.title.trim() ? raw.title : doc.title,
        description: typeof raw.description === 'string' ? raw.description : doc.description,
        ...(format === 'deck' ? { pageSize: '16:9' as const } : {}),
        ...(isTheme(theme) ? { theme } : {}),
    });
}

/** "deck" / "brief" / "doc" → format; anything else → free instruction (format doc). Used by the menu action. */
export function parseRemixInput(input: string): RemixOpts {
    const s = input.trim();
    const m = /^(deck|brief|doc)\b[\s:,-]*(.*)$/i.exec(s);
    if (m) return { format: m[1].toLowerCase() as RemixFormat, instruction: m[2].trim() || undefined };
    return { format: 'doc', instruction: s || undefined };
}

export interface DocAiAction {
    id: 'translate' | 'summarize' | 'add-card' | 'restyle' | 'regenerate-card' | 'remix';
    label: string;
    needsInput?: boolean;
    inputHint?: string;
    /** `input` is "<cardId>|<optional instruction>" */
    perCard?: boolean;
    run(doc: IDoc, input: string, llm: LlmBundle, callLlmFn?: CallLlmFn): Promise<IDoc | null>;
}

export const DOC_AI_ACTIONS: readonly DocAiAction[] = [
    { id: 'summarize', label: 'Add executive summary', run: (doc, _i, llm, f) => summarizeDocToCard(doc, llm, f) },
    { id: 'add-card', label: 'Add a card about…', needsInput: true, inputHint: 'e.g. “pricing tiers” or “FAQ”', run: (doc, input, llm, f) => addCardWithAi(doc, input, llm, f) },
    { id: 'translate', label: 'Translate to…', needsInput: true, inputHint: 'e.g. Spanish, Arabic, 中文', run: (doc, input, llm, f) => translateDoc(doc, input, llm, f) },
    { id: 'restyle', label: 'Change tone / restyle…', needsInput: true, inputHint: 'e.g. “more concise and friendly”', run: (doc, input, llm, f) => restyleDoc(doc, input, llm, f) },
    {
        id: 'regenerate-card', label: 'Regenerate this card', perCard: true, needsInput: false,
        run: (doc, input, llm, f) => { const [cardId, ...rest] = input.split('|'); return regenerateCard(doc, cardId.trim(), rest.join('|') || undefined, llm, f); },
    },
    { id: 'remix', label: 'Remix / regenerate doc…', needsInput: true, inputHint: 'e.g. deck, brief, or an instruction', run: (doc, input, llm, f) => remixDoc(doc, parseRemixInput(input), llm, f) },
];
