/**
 * IDocEditor — left rail (card outline: nested, DnD, multi-select) + center
 * canvas (recursive card canvas: blocks with hover toolbars, DnD, inline form
 * editors, "/" palette, notes/footnotes/background) + top bar (title, theme,
 * page size, Doc settings, Present, Export, Share, Analytics, AI, History, ?).
 * Every change goes straight to the store (autosave); a debounced snapshot
 * feeds per-doc undo/redo (idocsHistory.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties, type DragEvent, type ReactNode, type SyntheticEvent } from 'react';
import { recordArtifact } from '../../../lib/artifactStore';
import { hasActiveLlm } from '../../../lib/llmClient';
import { useIntegrations } from '../../../hooks/useIntegrations';
import * as BlockEditorModule from './BlockEditor';
import IDocRenderer, { BlockView } from './IDocRenderer';
import { download, exportHtml, exportMarkdown, exportPdf, printDoc, safeFilename } from './idocExport';
import { rewriteBlockMd, type LlmBundle, type RewriteInstruction } from './idocsAi';
import { createSnapshotDebouncer, relativeTime } from './idocsHistory';
import {
    cloneCard, exportDoc, findCard, findCardParent, flattenCards, idocsStore, insertCardsAt, isCard, listSnapshots, mapCard,
    pushSnapshot, redo, relocateCards, removeCards, replaceDoc, restoreSnapshot, setView, undo, unnestCard, updateCard, useIdocs,
} from './idocsStore';
import SlashPalette, { detectSlash, stripSlash } from './SlashPalette';
import {
    BLOCK_TYPES, CARD_LAYOUTS, IDOC_THEMES, MD_BLOCK_TYPES, createEmptyCard, defaultBlock, newId,
    type Block, type BlockType, type Card, type CardLayout, type IDoc, type IDocThemeId,
} from './idocTypes';
import './IDocEditor.css';

const AI_ACTIONS: RewriteInstruction[] = ['rewrite', 'shorten', 'expand', 'simplify', 'formal', 'friendly'];
const PAGE_SIZES: NonNullable<IDoc['pageSize']>[] = ['fluid', '16:9', '4:3', '1:1', 'a4', 'letter'];

// ── Integration seams (sibling agents; both degrade to "absent") ──

/** Agent A exports `<CardBackgroundEditor card onChange />` from BlockEditor.tsx; mounted automatically when present. */
// TODO(wave1-merge): confirm onChange payload shape (full Card vs CardBackground) — both are handled below.
const BlockEditor = BlockEditorModule.default;
const CardBackgroundEditor = (BlockEditorModule as unknown as { CardBackgroundEditor?: ComponentType<{ card: Card; onChange: (next: unknown) => void }> }).CardBackgroundEditor;

/** Agent B exports `DOC_AI_ACTIONS` from ./idocsDocAi.ts; glob-import resolves to {} while the file is absent. */
export interface DocAiAction { id: string; label: string; needsInput?: boolean; run: (doc: IDoc, input: string, llm: LlmBundle) => Promise<IDoc | null | undefined> | IDoc | null | undefined }
const docAiModules = import.meta.glob<{ DOC_AI_ACTIONS?: DocAiAction[] }>('./idocsDocAi.ts');
async function loadDocAiActions(): Promise<DocAiAction[]> {
    const loader = docAiModules['./idocsDocAi.ts'];
    if (!loader) return [];
    try { return (await loader()).DOC_AI_ACTIONS ?? []; } catch { return []; }
}

// ── small helpers ──

function fmtSecs(s: number): string { return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`; }
const isField = (t: EventTarget | null): boolean => { const el = t as HTMLElement | null; return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable); };
/** Set a React-controlled textarea's value from outside (native setter + input event → React onChange fires). */
function setTextareaValue(el: HTMLTextAreaElement, value: string, caret: number): void {
    // ponytail: BlockEditor owns the textarea (agent A's file); this is how RTL's user-event drives controlled inputs too.
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    try { el.setSelectionRange(caret, caret); } catch { /* detached */ }
}
/** In-memory card clipboard (survives clipboard permission denials). */
let memClipboard: Card[] = [];

/** Tiny popover menu — click-outside closes. */
function Menu({ label, children, align = 'right', title }: { label: string; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; title?: string }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!open) return;
        const onDoc = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener('mousedown', onDoc);
        return () => document.removeEventListener('mousedown', onDoc);
    }, [open]);
    return (
        <div className="scribe-idocs__menu" ref={ref}>
            <button type="button" className="scribe-idocs__btn" aria-haspopup="menu" aria-expanded={open} title={title} onClick={() => setOpen((o) => !o)}>{label} ▾</button>
            {open && <div className={`scribe-idocs__menu-pop scribe-idocs__menu-pop--${align}`} role="menu">{children(() => setOpen(false))}</div>}
        </div>
    );
}

type DropPos = 'before' | 'after' | 'into';
interface SlashState { cardId: string; blockId: string; textarea: HTMLTextAreaElement; query: string }

/** Everything a (possibly nested) CardCanvas needs from the editor. Rebuilt per render — plain data, not a component. */
interface EditorApi {
    doc: IDoc;
    llmReady: boolean;
    aiBusy: string | null;
    editingBlockId: string | null;
    setEditingBlockId: (id: string | null) => void;
    setActiveCardId: (id: string) => void;
    patchCard: (cardId: string, patch: Partial<Card>) => void;
    patchBlock: (cardId: string, block: Block) => void;
    addBlock: (cardId: string, type: BlockType, afterId?: string) => void;
    moveBlock: (cardId: string, id: string, d: number) => void;
    deleteBlock: (cardId: string, id: string) => void;
    aiRewrite: (cardId: string, block: Block, instruction: RewriteInstruction) => void;
    addNestedCard: (parentId: string) => void;
    unnest: (cardId: string) => void;
    slash: SlashState | null;
    onSlashCheck: (cardId: string, blockId: string, e: SyntheticEvent) => void;
    onSlashPick: (type: BlockType) => void;
    onSlashClose: () => void;
    blockDrag: { cardId: string; blockId: string } | null;
    setBlockDrag: (d: { cardId: string; blockId: string } | null) => void;
    blockDrop: { blockId: string; pos: 'before' | 'after' } | null;
    setBlockDrop: (d: { blockId: string; pos: 'before' | 'after' } | null) => void;
    dropBlock: (targetCardId: string, targetBlockId: string | null) => void;
}

/** One card's editing surface. Recurses into `card.children`. */
function CardCanvas({ card, depth, ed }: { card: Card; depth: number; ed: EditorApi }) {
    const { doc } = ed;
    const isNested = depth > 0;
    const addBlockMenu = (afterId?: string) => (
        <Menu label="+ Add block" align="left">{(close) => BLOCK_TYPES.map((t) => <button key={t} type="button" role="menuitem" onClick={() => { ed.addBlock(card.id, t, afterId); close(); }}>{t}</button>)}</Menu>
    );
    const onBlockDragOver = (e: DragEvent, blockId: string) => {
        if (!ed.blockDrag) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const pos: 'before' | 'after' = r.height > 0 && (e.clientY - r.top) / r.height < 0.5 ? 'before' : 'after';
        if (ed.blockDrop?.blockId !== blockId || ed.blockDrop.pos !== pos) ed.setBlockDrop({ blockId, pos });
    };
    return (
        <section className={`scribe-idocs__card scribe-idocs__card--${card.layout} is-editing scribe-idocs-ed__cardcanvas${isNested ? ' scribe-idocs-ed__cardcanvas--nested' : ''}`}
            data-testid={`idoc-cardcanvas-${card.id}`} aria-label={isNested ? `Nested card ${card.title || ''}` : undefined}>
            <div className="scribe-idocs-ed__card-head">
                <input className="scribe-idocs__card-title-input" value={card.title ?? ''} onChange={(e) => ed.patchCard(card.id, { title: e.target.value })} placeholder={isNested ? 'Nested card title' : 'Card title'} aria-label={isNested ? 'Nested card title' : 'Card title'} />
                <select value={card.layout} onChange={(e) => ed.patchCard(card.id, { layout: e.target.value as CardLayout })} aria-label="Card layout">
                    {CARD_LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
                <input type="url" className="scribe-idocs__hdrimg" value={card.headerImage ?? ''} onChange={(e) => ed.patchCard(card.id, { headerImage: e.target.value || undefined })} placeholder="Header image URL (hero/split)" aria-label="Header image URL" />
                {isNested && <button type="button" className="scribe-idocs__btn" onClick={() => ed.unnest(card.id)} title="Move this card out of its parent">Un-nest</button>}
            </div>
            {CardBackgroundEditor && (
                <div className="scribe-idocs-ed__bg">
                    <CardBackgroundEditor card={card} onChange={(next) => ed.patchCard(card.id, isCard(next) ? next : { background: (next ?? undefined) as Card['background'] })} />
                </div>
            )}
            {card.headerImage && card.layout !== 'default' && <img className="scribe-idocs__card-media" src={card.headerImage} alt="" />}
            <div className="scribe-idocs__card-body" onDragOver={(e) => { if (ed.blockDrag && card.blocks.length === 0) e.preventDefault(); }} onDrop={(e) => { if (ed.blockDrag && card.blocks.length === 0) { e.preventDefault(); ed.dropBlock(card.id, null); } }}>
                {card.title && <h2 className="scribe-idocs__card-title">{card.title}</h2>}
                {card.blocks.map((b) => {
                    const editing = ed.editingBlockId === b.id;
                    const drop = ed.blockDrop?.blockId === b.id ? ed.blockDrop.pos : null;
                    return (
                        <div key={b.id} className={`scribe-idocs__blockwrap${editing ? ' is-editing' : ''}${drop ? ` scribe-idocs-ed__drop-${drop}` : ''}${ed.blockDrag?.blockId === b.id ? ' scribe-idocs-ed__dragging' : ''}`}
                            data-testid={`idoc-block-${b.id}`}
                            onDragOver={(e) => onBlockDragOver(e, b.id)} onDragLeave={() => { if (ed.blockDrop?.blockId === b.id) ed.setBlockDrop(null); }}
                            onDrop={(e) => { if (!ed.blockDrag) return; e.preventDefault(); e.stopPropagation(); ed.dropBlock(card.id, b.id); }}>
                            <div className="scribe-idocs__blocktools" role="toolbar" aria-label={`${b.type} block`}>
                                <span className="scribe-idocs-ed__handle" draggable aria-label="Drag to reorder block" title="Drag to reorder" role="button" tabIndex={-1}
                                    aria-grabbed={ed.blockDrag?.blockId === b.id}
                                    onDragStart={(e) => { e.dataTransfer?.setData('text/plain', b.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; ed.setBlockDrag({ cardId: card.id, blockId: b.id }); }}
                                    onDragEnd={() => { ed.setBlockDrag(null); ed.setBlockDrop(null); }}>⋮⋮</span>
                                <span className="scribe-idocs__blocktype">{b.type}</span>
                                <button type="button" onClick={() => ed.setEditingBlockId(editing ? null : b.id)}>{editing ? 'Done' : 'Edit'}</button>
                                <button type="button" onClick={() => ed.moveBlock(card.id, b.id, -1)} aria-label="Move block up">↑</button>
                                <button type="button" onClick={() => ed.moveBlock(card.id, b.id, 1)} aria-label="Move block down">↓</button>
                                {MD_BLOCK_TYPES.includes(b.type) && (
                                    <Menu label={ed.aiBusy === b.id ? 'AI…' : 'AI'} align="left">{(close) => (
                                        ed.llmReady
                                            ? AI_ACTIONS.map((a) => <button key={a} type="button" role="menuitem" onClick={() => { ed.aiRewrite(card.id, b, a); close(); }}>{a}</button>)
                                            : <small className="scribe-idocs__hint">Add an LLM key in Control Panel → API Keys</small>
                                    )}</Menu>
                                )}
                                <button type="button" onClick={() => ed.deleteBlock(card.id, b.id)} aria-label="Delete block">✕</button>
                            </div>
                            {editing && (
                                <div className="scribe-idocs__blockform scribe-idocs-ed__blockform" role="presentation"
                                    onKeyUp={(e) => ed.onSlashCheck(card.id, b.id, e)} onInput={(e) => ed.onSlashCheck(card.id, b.id, e)} onClick={(e) => ed.onSlashCheck(card.id, b.id, e)}>
                                    <BlockEditor block={b} onChange={(nb) => ed.patchBlock(card.id, nb)} />
                                    {ed.slash?.blockId === b.id && <SlashPalette textarea={ed.slash.textarea} query={ed.slash.query} onPick={ed.onSlashPick} onClose={ed.onSlashClose} />}
                                </div>
                            )}
                            <div className="scribe-idocs__blockview" onDoubleClick={() => ed.setEditingBlockId(b.id)}>
                                <BlockView block={b} ctx={{ doc, interactive: true, jumpTo: (id) => ed.setActiveCardId(id) }} />
                            </div>
                            <div className="scribe-idocs__addbar">{addBlockMenu(b.id)}</div>
                        </div>
                    );
                })}
                {card.blocks.length === 0 && <div className="scribe-idocs__addbar is-empty">{addBlockMenu()}</div>}
            </div>

            <details className="scribe-idocs-ed__details" open={!!card.notes}>
                <summary>Presenter notes{card.notes ? ' ·' : ''}</summary>
                <textarea rows={3} value={card.notes ?? ''} onChange={(e) => ed.patchCard(card.id, { notes: e.target.value || undefined })} placeholder="Only you see these (presenter view / export comments)" aria-label="Presenter notes" />
            </details>
            <details className="scribe-idocs-ed__details" open={!!card.footnotes?.length}>
                <summary>Footnotes{card.footnotes?.length ? ` (${card.footnotes.length})` : ''}</summary>
                <ol className="scribe-idocs-ed__footnotes">
                    {(card.footnotes ?? []).map((f, i) => (
                        <li key={f.id}>
                            <input value={f.text} onChange={(e) => ed.patchCard(card.id, { footnotes: card.footnotes!.map((x) => (x.id === f.id ? { ...x, text: e.target.value } : x)) })} placeholder={`Footnote ${i + 1} — reference it as [^${i + 1}]`} aria-label={`Footnote ${i + 1}`} />
                            <button type="button" onClick={() => ed.patchCard(card.id, { footnotes: card.footnotes!.filter((x) => x.id !== f.id) })} aria-label={`Remove footnote ${i + 1}`}>✕</button>
                        </li>
                    ))}
                </ol>
                <button type="button" className="scribe-idocs__btn" onClick={() => ed.patchCard(card.id, { footnotes: [...(card.footnotes ?? []), { id: newId('fn'), text: '' }] })}>+ Footnote</button>
            </details>

            {(card.children?.length ?? 0) > 0 && (
                <div className="scribe-idocs-ed__children" aria-label="Nested cards">
                    {card.children!.map((child) => <CardCanvas key={child.id} card={child} depth={depth + 1} ed={ed} />)}
                </div>
            )}
            <button type="button" className="scribe-idocs__btn scribe-idocs-ed__addnested" onClick={() => ed.addNestedCard(card.id)}>+ Add nested card</button>
        </section>
    );
}

export default function IDocEditor({ doc }: { doc: IDoc }) {
    const { integrations } = useIntegrations();
    const { docs: allDocs } = useIdocs();
    const llmReady = hasActiveLlm(integrations.llm);
    const rootRef = useRef<HTMLDivElement>(null);
    const [activeCardId, setActiveCardId] = useState<string>(doc.cards[0]?.id ?? '');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [aiBusy, setAiBusy] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [previewAll, setPreviewAll] = useState(false);
    const [live, setLive] = useState('');
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [importFrom, setImportFrom] = useState<{ docId: string; picked: Set<string> } | null>(null);
    const [slash, setSlash] = useState<SlashState | null>(null);
    const slashDismissed = useRef<string | null>(null);
    const [cardDrag, setCardDrag] = useState<string[] | null>(null);
    const [cardDrop, setCardDrop] = useState<{ id: string; pos: DropPos } | null>(null);
    const [blockDrag, setBlockDrag] = useState<{ cardId: string; blockId: string } | null>(null);
    const [blockDrop, setBlockDrop] = useState<{ blockId: string; pos: 'before' | 'after' } | null>(null);
    const [docAi, setDocAi] = useState<DocAiAction[]>([]);
    const [aiPrompt, setAiPrompt] = useState<{ action: DocAiAction; input: string } | null>(null);
    const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };
    const announce = (m: string) => { setLive(m); flash(m); };

    const activeCard = findCard(doc.cards, activeCardId) ?? doc.cards[0];
    useEffect(() => { if (!findCard(doc.cards, activeCardId)) setActiveCardId(doc.cards[0]?.id ?? ''); }, [doc.cards, activeCardId]);
    const flat = useMemo(() => flattenCards(doc.cards), [doc.cards]);

    // ── history: baseline on mount, debounced snapshot after edits ──
    const debouncer = useMemo(() => createSnapshotDebouncer(() => pushSnapshot(doc.id)), [doc.id]);
    useEffect(() => { pushSnapshot(doc.id); return () => debouncer.cancel(); }, [doc.id, debouncer]);
    useEffect(() => { debouncer.touch(); }, [doc, debouncer]);
    useEffect(() => { let on = true; void loadDocAiActions().then((a) => { if (on) setDocAi(a); }); return () => { on = false; }; }, []);

    const save = useCallback((patch: Partial<IDoc>) => replaceDoc({ ...doc, ...patch }), [doc]);
    const setCards = (cards: Card[]) => save({ cards });
    const patchCard = (id: string, patch: Partial<Card>) => updateCard(doc.id, id, patch);
    const patchBlock = (cardId: string, block: Block) => { const c = findCard(doc.cards, cardId); if (c) patchCard(cardId, { blocks: c.blocks.map((b) => (b.id === block.id ? block : b)) }); };

    // ── cards ──
    const locOf = (id: string) => findCardParent(doc.cards, id);
    const insertAfterActive = (cards: Card[]) => {
        const loc = activeCard ? locOf(activeCard.id) : null;
        setCards(insertCardsAt(doc.cards, loc?.parent?.id ?? null, loc ? loc.index + 1 : doc.cards.length, cards));
        if (cards[0]) setActiveCardId(cards[0].id);
    };
    const addCard = () => { const c = createEmptyCard({ title: `Card ${doc.cards.length + 1}` }); setCards([...doc.cards, c]); setActiveCardId(c.id); };
    const addNestedCard = (parentId: string) => {
        const p = findCard(doc.cards, parentId); if (!p) return;
        const c = createEmptyCard({ title: `${p.title || 'Card'} › ${(p.children?.length ?? 0) + 1}` });
        patchCard(parentId, { children: [...(p.children ?? []), c] });
        setActiveCardId(c.id);
    };
    const idsFor = (id: string) => (selected.has(id) && selected.size > 1 ? flat.filter((f) => selected.has(f.card.id)).map((f) => f.card.id) : [id]);
    const deleteCards = (ids: string[]) => {
        const { cards } = removeCards(doc.cards, new Set(ids));
        if (!cards.length) return flash('Keep at least one card');
        setCards(cards); setSelected(new Set()); announce(`${ids.length} card${ids.length > 1 ? 's' : ''} deleted`);
    };
    const duplicateCards = (ids: string[]) => {
        const set = new Set(ids);
        const src = flat.filter((f) => set.has(f.card.id) && !flat.some((g) => set.has(g.card.id) && g.card.id !== f.card.id && !!findCard(g.card.children ?? [], f.card.id)));
        const last = src[src.length - 1]; if (!last) return;
        const clones = src.map((f) => cloneCard(f.card));
        const loc = locOf(last.card.id)!;
        setCards(insertCardsAt(doc.cards, loc.parent?.id ?? null, loc.index + 1, clones));
        setActiveCardId(clones[0].id); setSelected(new Set()); announce(`Duplicated ${clones.length} card${clones.length > 1 ? 's' : ''}`);
    };
    const moveCardBy = (id: string, d: number) => {
        const loc = locOf(id); if (!loc) return;
        const j = loc.index + d; if (j < 0 || j >= loc.list.length) return;
        relocateCards(doc.id, [id], loc.parent?.id ?? null, j); announce(`Card moved ${d < 0 ? 'up' : 'down'}`);
    };
    const copyCards = async (ids: string[]) => {
        const cards = flat.filter((f) => ids.includes(f.card.id)).map((f) => f.card);
        memClipboard = cards.map((c) => structuredClone(c));
        try { await navigator.clipboard.writeText(JSON.stringify(cards, null, 2)); flash(`Copied ${cards.length} card${cards.length > 1 ? 's' : ''}`); } catch { flash('Copied (in-memory; clipboard blocked)'); }
    };
    const pasteCards = async () => {
        let cards: Card[] = [];
        try {
            const p = JSON.parse(await navigator.clipboard.readText()) as unknown;
            const arr = Array.isArray(p) ? p : [p];
            if (arr.length && arr.every(isCard)) cards = arr as Card[];
        } catch { /* fall through to in-memory */ }
        if (!cards.length) cards = memClipboard;
        if (!cards.length) return flash('Nothing to paste');
        insertAfterActive(cards.map(cloneCard)); announce(`Pasted ${cards.length} card${cards.length > 1 ? 's' : ''}`);
    };
    const insertFromDoc = () => {
        if (!importFrom) return;
        const src = allDocs.find((d) => d.id === importFrom.docId); if (!src) return;
        const cards = flattenCards(src.cards).filter((f) => importFrom.picked.has(f.card.id)).map((f) => cloneCard(f.card));
        if (!cards.length) return;
        insertAfterActive(cards); setImportFrom(null); announce(`Inserted ${cards.length} card${cards.length > 1 ? 's' : ''} from “${src.title}”`);
    };
    const selectCard = (id: string, e?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => {
        if (e?.shiftKey || e?.metaKey || e?.ctrlKey) {
            setSelected((s) => { const n = new Set(s); if (!n.size && activeCard) n.add(activeCard.id); if (n.has(id)) n.delete(id); else n.add(id); return n; });
        } else setSelected(new Set());
        setActiveCardId(id);
    };

    // ── card DnD (outline) ──
    const onCardDragOver = (e: DragEvent, id: string) => {
        if (!cardDrag || cardDrag.includes(id)) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const ratio = r.height > 0 ? (e.clientY - r.top) / r.height : 1; // jsdom (no layout) → 'after'
        const pos: DropPos = ratio < 0.3 ? 'before' : ratio > 0.7 ? 'after' : 'into';
        if (cardDrop?.id !== id || cardDrop.pos !== pos) setCardDrop({ id, pos });
    };
    const onCardDrop = (e: DragEvent, targetId: string) => {
        e.preventDefault();
        const ids = cardDrag; const pos = cardDrop?.id === targetId ? cardDrop.pos : 'after';
        setCardDrag(null); setCardDrop(null);
        if (!ids || ids.includes(targetId)) return;
        const set = new Set(ids);
        const { cards: rest } = removeCards(doc.cards, set);
        const target = findCard(rest, targetId); if (!target) return; // target was inside a dragged subtree
        if (pos === 'into') { relocateCards(doc.id, ids, targetId, target.children?.length ?? 0); announce(`Nested under “${target.title || 'card'}”`); return; }
        const loc = findCardParent(rest, targetId)!;
        relocateCards(doc.id, ids, loc.parent?.id ?? null, loc.index + (pos === 'after' ? 1 : 0));
        announce(`Moved ${ids.length > 1 ? `${ids.length} cards` : 'card'} ${pos} “${target.title || 'card'}”`);
    };

    // ── blocks ──
    const addBlock = (cardId: string, type: BlockType, afterId?: string) => {
        const c = findCard(doc.cards, cardId); if (!c) return;
        const b = defaultBlock(type);
        const blocks = c.blocks.slice();
        const i = afterId ? blocks.findIndex((x) => x.id === afterId) : -1;
        blocks.splice(i >= 0 ? i + 1 : blocks.length, 0, b);
        patchCard(cardId, { blocks });
        setEditingBlockId(b.id);
    };
    const moveBlock = (cardId: string, id: string, d: number) => {
        const c = findCard(doc.cards, cardId); if (!c) return;
        const i = c.blocks.findIndex((b) => b.id === id); const j = i + d;
        if (i < 0 || j < 0 || j >= c.blocks.length) return;
        const n = c.blocks.slice(); [n[i], n[j]] = [n[j], n[i]]; patchCard(cardId, { blocks: n }); announce(`Block moved ${d < 0 ? 'up' : 'down'}`);
    };
    const deleteBlock = (cardId: string, id: string) => { const c = findCard(doc.cards, cardId); if (c) patchCard(cardId, { blocks: c.blocks.filter((b) => b.id !== id) }); };
    const dropBlock = (targetCardId: string, targetBlockId: string | null) => {
        const d = blockDrag; const pos = blockDrop?.blockId === targetBlockId ? blockDrop.pos : 'after';
        setBlockDrag(null); setBlockDrop(null);
        if (!d || d.blockId === targetBlockId) return;
        const src = findCard(doc.cards, d.cardId); const block = src?.blocks.find((b) => b.id === d.blockId); if (!src || !block) return;
        let cards = doc.cards;
        cards = mapCard(cards, d.cardId, (c) => ({ ...c, blocks: c.blocks.filter((b) => b.id !== d.blockId) }));
        cards = mapCard(cards, targetCardId, (c) => {
            const n = c.blocks.slice(); const i = targetBlockId ? n.findIndex((b) => b.id === targetBlockId) : -1;
            n.splice(i < 0 ? n.length : i + (pos === 'after' ? 1 : 0), 0, block); return { ...c, blocks: n };
        });
        setCards(cards); announce('Block moved');
    };
    const aiRewrite = async (cardId: string, block: Block, instruction: RewriteInstruction) => {
        if (!('md' in block)) return;
        setAiBusy(block.id);
        try {
            const out = await rewriteBlockMd(block.md, instruction, integrations.llm);
            if (!out) { flash('AI returned nothing'); return; }
            // Deep patch through the store so edits made while the model was thinking aren't clobbered.
            const latest = findCard(idocsStore.getSnapshot().docs.find((d) => d.id === doc.id)?.cards ?? [], cardId);
            if (latest) updateCard(doc.id, cardId, { blocks: latest.blocks.map((x) => (x.id === block.id ? ({ ...x, md: out } as Block) : x)) });
        } catch (e) { flash(`AI failed: ${(e as Error).message}`); } finally { setAiBusy(null); }
    };

    // ── "/" palette ──
    const onSlashCheck = (cardId: string, blockId: string, e: SyntheticEvent) => {
        const el = e.target as HTMLElement;
        if (!(el instanceof HTMLTextAreaElement)) return;
        const hit = detectSlash(el.value, el.selectionStart ?? el.value.length);
        if (!hit) { slashDismissed.current = null; if (slash) setSlash(null); return; }
        if (slashDismissed.current === `/${hit.query}`) return;
        if (slash?.blockId !== blockId || slash.query !== hit.query || slash.textarea !== el) setSlash({ cardId, blockId, textarea: el, query: hit.query });
    };
    const onSlashPick = (type: BlockType) => {
        const s = slash; if (!s) return;
        setSlash(null);
        const { value, caret } = stripSlash(s.textarea.value, s.textarea.selectionStart ?? s.textarea.value.length);
        setTextareaValue(s.textarea, value, caret);
        // addBlock reads the doc prop; the strip above only changed the block's md, so re-read the latest blocks from the store.
        const latest = findCard(idocsStore.getSnapshot().docs.find((d) => d.id === doc.id)?.cards ?? doc.cards, s.cardId) ?? findCard(doc.cards, s.cardId);
        if (!latest) return;
        const b = defaultBlock(type);
        const blocks = latest.blocks.slice(); const i = blocks.findIndex((x) => x.id === s.blockId);
        blocks.splice(i >= 0 ? i + 1 : blocks.length, 0, b);
        updateCard(doc.id, s.cardId, { blocks });
        setEditingBlockId(b.id);
    };
    const onSlashClose = () => { if (slash) slashDismissed.current = `/${slash.query}`; setSlash(null); };

    // ── history / AI ──
    const doUndo = () => { debouncer.cancel(); announce(undo(doc.id) ? 'Undo' : 'Nothing to undo'); };
    const doRedo = () => { debouncer.cancel(); announce(redo(doc.id) ? 'Redo' : 'Nothing to redo'); };
    const runDocAi = async (action: DocAiAction, input: string) => {
        setAiPrompt(null); setAiBusy(`doc:${action.id}`);
        try {
            debouncer.cancel(); pushSnapshot(doc.id); // ⌘Z reverts the AI edit
            const latest = idocsStore.getSnapshot().docs.find((d) => d.id === doc.id) ?? doc;
            const out = await action.run(latest, input, integrations.llm);
            if (!out) { flash('AI returned nothing'); return; }
            replaceDoc({ ...out, id: doc.id, createdAt: latest.createdAt, analytics: latest.analytics }); flash(`${action.label} ✓ (⌘Z to revert)`);
        } catch (e) { flash(`AI failed: ${(e as Error).message}`); } finally { setAiBusy(null); }
    };

    // ── keyboard shortcuts (capture; only when the editor holds focus; inputs keep native undo) ──
    const shortcutState = useRef({ activeCard, showShortcuts, doUndo, doRedo, duplicateCards, idsFor });
    shortcutState.current = { activeCard, showShortcuts, doUndo, doRedo, duplicateCards, idsFor };
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const root = rootRef.current;
            if (!root || !(e.target instanceof Node) || !root.contains(e.target)) return;
            const st = shortcutState.current;
            const mod = e.metaKey || e.ctrlKey; const k = e.key.toLowerCase(); const inField = isField(e.target);
            if (mod && k === 'z') { if (inField) return; e.preventDefault(); e.stopPropagation(); if (e.shiftKey) st.doRedo(); else st.doUndo(); }
            else if (mod && k === 'd') { if (inField || !st.activeCard) return; e.preventDefault(); e.stopPropagation(); st.duplicateCards(st.idsFor(st.activeCard.id)); }
            else if (mod && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); setView('present'); }
            else if (e.key === '?' && !inField && !mod) { e.preventDefault(); setShowShortcuts((s) => !s); }
            else if (e.key === 'Escape' && st.showShortcuts) { e.preventDefault(); e.stopPropagation(); setShowShortcuts(false); }
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, []);

    // ── export / share ──
    const fname = safeFilename(doc.title);
    const shareCopy = async () => { try { await navigator.clipboard.writeText(exportDoc(doc.id)); flash('JSON copied'); } catch { flash('Clipboard blocked'); } };
    const saveArtifact = () => { recordArtifact({ content: exportHtml(doc), source: 'scribe', title: doc.title.slice(0, 40), type: 'html' }); flash('Saved to Artifact Gallery'); };
    const topCards = Object.entries(doc.analytics?.cardSeconds ?? {})
        .map(([id, s]) => ({ title: findCard(doc.cards, id)?.title || 'Card', s }))
        .sort((a, b) => b.s - a.s).slice(0, 5);
    const history = listSnapshots(doc.id);
    const chrome = doc.chrome ?? {};
    const setChrome = (patch: Partial<NonNullable<IDoc['chrome']>>) => save({ chrome: { ...chrome, ...patch } });

    const ed: EditorApi = {
        doc, llmReady, aiBusy, editingBlockId, setEditingBlockId, setActiveCardId, patchCard, patchBlock, addBlock, moveBlock, deleteBlock,
        aiRewrite: (c, b, i) => void aiRewrite(c, b, i), addNestedCard, unnest: (id) => { unnestCard(doc.id, id); announce('Card un-nested'); },
        slash, onSlashCheck, onSlashPick, onSlashClose, blockDrag, setBlockDrag, blockDrop, setBlockDrop, dropBlock,
    };

    return (
        <div className="scribe-idocs__editor scribe-idocs-ed" ref={rootRef} tabIndex={-1} data-testid="idoc-editor">
            <div className="scribe-idocs__topbar">
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => setView('library')} title="Back to library">← Library</button>
                <input className="scribe-idocs__title-input" value={doc.title} onChange={(e) => save({ title: e.target.value })} aria-label="Document title" />
                <div className="scribe-idocs__swatches" role="radiogroup" aria-label="Theme">
                    {IDOC_THEMES.map((t) => (
                        <button key={t.id} type="button" role="radio" aria-checked={doc.theme === t.id} title={t.label} aria-label={t.label}
                            className={`scribe-idocs__swatch${doc.theme === t.id ? ' is-active' : ''}`} style={{ background: t.swatch }}
                            onClick={() => save({ theme: t.id as IDocThemeId })} />
                    ))}
                </div>
                <select className="scribe-idocs-ed__pagesize" value={doc.pageSize ?? 'fluid'} onChange={(e) => save({ pageSize: e.target.value as IDoc['pageSize'] })} aria-label="Page size" title="Page size">
                    {PAGE_SIZES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <Menu label="Doc settings" title="Header, footer, logo, numbering">{() => (
                    <div className="scribe-idocs-ed__settings">
                        <label><span>Header</span><input value={chrome.header ?? ''} onChange={(e) => setChrome({ header: e.target.value || undefined })} placeholder="Shown at the top of every card" aria-label="Header text" /></label>
                        <label><span>Footer</span><input value={chrome.footer ?? ''} onChange={(e) => setChrome({ footer: e.target.value || undefined })} placeholder="Shown at the bottom of every card" aria-label="Footer text" /></label>
                        <label><span>Logo URL</span><input type="url" value={chrome.logo ?? ''} onChange={(e) => setChrome({ logo: e.target.value || undefined })} placeholder="https://…" aria-label="Logo URL" /></label>
                        <label className="scribe-idocs-ed__check"><input type="checkbox" checked={!!chrome.sectionNumbers} onChange={(e) => setChrome({ sectionNumbers: e.target.checked || undefined })} /> Section numbers</label>
                        <label className="scribe-idocs-ed__check"><input type="checkbox" checked={!!chrome.hideOnFirst} onChange={(e) => setChrome({ hideOnFirst: e.target.checked || undefined })} /> Hide on first card</label>
                        <label className="scribe-idocs-ed__check"><input type="checkbox" checked={!!doc.isTemplate} onChange={(e) => save({ isTemplate: e.target.checked || undefined })} /> Save as template</label>
                    </div>
                )}</Menu>
                <span className="scribe-idocs__spacer" />
                <button type="button" className={`scribe-idocs__btn${previewAll ? ' is-active' : ''}`} onClick={() => setPreviewAll((p) => !p)} title="Toggle full-doc preview">{previewAll ? 'Edit' : 'Preview'}</button>
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => setView('present')} title="⌘⏎">▶ Present</button>
                {docAi.length > 0 && (
                    <Menu label={aiBusy?.startsWith('doc:') ? 'AI…' : 'AI'} title="Doc-level AI actions">{(close) => (
                        llmReady
                            ? docAi.map((a) => <button key={a.id} type="button" role="menuitem" onClick={() => { close(); if (a.needsInput) setAiPrompt({ action: a, input: '' }); else void runDocAi(a, ''); }}>{a.label}{a.needsInput ? '…' : ''}</button>)
                            : <small className="scribe-idocs__hint">Add an LLM key in Control Panel → API Keys</small>
                    )}</Menu>
                )}
                <Menu label="History" title="Snapshots (⌘Z / ⌘⇧Z)">{(close) => (
                    <div className="scribe-idocs-ed__history">
                        <div className="scribe-idocs__row">
                            <button type="button" className="scribe-idocs__btn" onClick={() => { doUndo(); }} disabled={history.cursor <= 0}>↶ Undo</button>
                            <button type="button" className="scribe-idocs__btn" onClick={() => { doRedo(); }} disabled={history.cursor >= history.snapshots.length - 1}>↷ Redo</button>
                        </div>
                        {history.snapshots.length === 0 && <small className="scribe-idocs__hint">No snapshots yet.</small>}
                        <ol>
                            {history.snapshots.map((s, i) => ({ s, i })).reverse().map(({ s, i }) => (
                                <li key={`${s.at}-${i}`} className={i === history.cursor ? 'is-current' : ''}>
                                    <span>{relativeTime(s.at)}</span><small>{s.doc.cards.length} cards</small>
                                    {i === history.cursor ? <em>current</em> : <button type="button" onClick={() => { if (restoreSnapshot(doc.id, i)) announce('Snapshot restored'); close(); }}>Restore</button>}
                                </li>
                            ))}
                        </ol>
                    </div>
                )}</Menu>
                <Menu label="Export">{(close) => (
                    <>
                        <button type="button" role="menuitem" onClick={() => { download(`${fname}.html`, 'text/html', exportHtml(doc)); close(); }}>HTML (standalone)</button>
                        <button type="button" role="menuitem" onClick={() => { download(`${fname}.md`, 'text/markdown', exportMarkdown(doc)); close(); }}>Markdown</button>
                        <button type="button" role="menuitem" onClick={() => { void exportPdf(doc); close(); }}>PDF (text)</button>
                        <button type="button" role="menuitem" onClick={() => { setPreviewAll(true); setTimeout(printDoc, 150); close(); }}>Print…</button>
                        <button type="button" role="menuitem" onClick={() => { download(`${fname}.idoc.json`, 'application/json', exportDoc(doc.id)); close(); }}>JSON</button>
                    </>
                )}</Menu>
                <Menu label="Share">{(close) => (
                    <>
                        <button type="button" role="menuitem" onClick={() => { void shareCopy(); close(); }}>Copy JSON</button>
                        <button type="button" role="menuitem" onClick={() => { saveArtifact(); close(); }}>Save to Artifact Gallery</button>
                    </>
                )}</Menu>
                <Menu label="Analytics">{() => (
                    <div className="scribe-idocs__analytics">
                        <div><strong>{doc.analytics?.views ?? 0}</strong> views{doc.analytics?.lastViewedAt ? ` · last ${new Date(doc.analytics.lastViewedAt).toLocaleString()}` : ''}</div>
                        {topCards.length ? <ol>{topCards.map((c, i) => <li key={i}>{c.title} — {fmtSecs(c.s)}</li>)}</ol> : <small>No card time yet — present the doc to collect it.</small>}
                        <small className="scribe-idocs__hint">Local-only analytics (this browser).</small>
                    </div>
                )}</Menu>
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--ghost" onClick={() => setShowShortcuts((s) => !s)} aria-label="Keyboard shortcuts" title="Keyboard shortcuts (?)">?</button>
                {toast && <span className="scribe-idocs__toast" role="status">{toast}</span>}
                <span className="scribe-idocs-ed__sr" aria-live="polite">{live}</span>
            </div>
            {aiPrompt && (
                <form className="scribe-idocs-ed__aiprompt" onSubmit={(e) => { e.preventDefault(); void runDocAi(aiPrompt.action, aiPrompt.input); }}>
                    <span>{aiPrompt.action.label}:</span>
                    <input ref={(el) => el?.focus()} value={aiPrompt.input} onChange={(e) => setAiPrompt({ ...aiPrompt, input: e.target.value })} placeholder="What should the AI do?" aria-label={`${aiPrompt.action.label} input`} />
                    <button type="submit" className="scribe-idocs__btn scribe-idocs__btn--primary">Run</button>
                    <button type="button" className="scribe-idocs__btn" onClick={() => setAiPrompt(null)}>Cancel</button>
                </form>
            )}

            {previewAll ? (
                <div className="scribe-idocs__preview-scroll"><IDocRenderer doc={doc} mode="scroll" /></div>
            ) : (
                <div className="scribe-idocs__body">
                    <aside className="scribe-idocs__rail" aria-label="Cards">
                        {selected.size > 1 && (
                            <div className="scribe-idocs-ed__selbar" role="toolbar" aria-label="Selected cards">
                                <span>{selected.size} selected</span>
                                <button type="button" onClick={() => duplicateCards([...selected])}>Duplicate</button>
                                <button type="button" onClick={() => void copyCards([...selected])}>Copy</button>
                                <button type="button" onClick={() => deleteCards([...selected])}>Delete</button>
                                <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection">✕</button>
                            </div>
                        )}
                        <ol className="scribe-idocs__outline scribe-idocs-ed__outline" aria-label="Card outline">
                            {flat.map(({ card: c, depth, index }, n) => {
                                const isActive = c.id === activeCard?.id; const isSel = selected.has(c.id);
                                const drop = cardDrop?.id === c.id ? cardDrop.pos : null;
                                const siblings = (depth === 0 ? doc.cards : findCard(doc.cards, flat[n].parentId!)?.children ?? []);
                                return (
                                    <li key={c.id} draggable data-testid={`idoc-outline-${c.id}`} aria-level={depth + 1} aria-grabbed={cardDrag?.includes(c.id) ?? false}
                                        className={`scribe-idocs__outline-item scribe-idocs-ed__outline-item${isActive ? ' is-active' : ''}${isSel ? ' is-selected' : ''}${drop ? ` scribe-idocs-ed__drop-${drop}` : ''}${cardDrag?.includes(c.id) ? ' scribe-idocs-ed__dragging' : ''}`}
                                        style={{ '--idocs-depth': depth } as CSSProperties}
                                        onDragStart={(e) => { const ids = idsFor(c.id); e.dataTransfer?.setData('text/plain', c.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; setCardDrag(ids); setLive(`Dragging ${ids.length > 1 ? `${ids.length} cards` : c.title || 'card'}`); }}
                                        onDragEnd={() => { setCardDrag(null); setCardDrop(null); }}
                                        onDragOver={(e) => onCardDragOver(e, c.id)} onDragLeave={() => { if (cardDrop?.id === c.id) setCardDrop(null); }}
                                        onDrop={(e) => onCardDrop(e, c.id)}>
                                        <button type="button" className="scribe-idocs__outline-btn" onClick={(e) => selectCard(c.id, e)} aria-pressed={isSel || undefined} title="Click to edit · Shift-click to multi-select · drag to reorder or nest">
                                            <span className="scribe-idocs__outline-n">{depth ? '·' : index + 1}</span>
                                            <span className="scribe-idocs__outline-t">{c.title || 'Untitled card'}</span>
                                            <small>{c.blocks.length} blk{c.children?.length ? ` · ${c.children.length} sub` : ''}</small>
                                        </button>
                                        <div className="scribe-idocs__outline-tools">
                                            <button type="button" onClick={() => moveCardBy(c.id, -1)} aria-label="Move card up" disabled={index === 0}>↑</button>
                                            <button type="button" onClick={() => moveCardBy(c.id, 1)} aria-label="Move card down" disabled={index === siblings.length - 1}>↓</button>
                                            <button type="button" onClick={() => duplicateCards(idsFor(c.id))} aria-label="Duplicate card" title="⌘D">⧉</button>
                                            <button type="button" onClick={() => void copyCards(idsFor(c.id))} aria-label="Copy card">⎘</button>
                                            <button type="button" onClick={() => addNestedCard(c.id)} aria-label="Add nested card">+sub</button>
                                            {depth > 0 && <button type="button" onClick={() => ed.unnest(c.id)} aria-label="Un-nest card">⇤</button>}
                                            <button type="button" onClick={() => deleteCards(idsFor(c.id))} aria-label="Delete card" disabled={flat.length <= 1}>✕</button>
                                        </div>
                                    </li>
                                );
                            })}
                        </ol>
                        <div className="scribe-idocs-ed__railbtns">
                            <button type="button" className="scribe-idocs__btn scribe-idocs__btn--block" onClick={addCard}>+ Add card</button>
                            <button type="button" className="scribe-idocs__btn scribe-idocs__btn--block" onClick={() => void pasteCards()} title="From clipboard JSON or the last copied card">Paste card</button>
                            <button type="button" className="scribe-idocs__btn scribe-idocs__btn--block" onClick={() => setImportFrom(importFrom ? null : { docId: allDocs.find((d) => d.id !== doc.id)?.id ?? '', picked: new Set() })} aria-expanded={!!importFrom}>Insert cards from another doc…</button>
                        </div>
                        {importFrom && (
                            <div className="scribe-idocs-ed__import" role="group" aria-label="Insert cards from another doc">
                                <select value={importFrom.docId} onChange={(e) => setImportFrom({ docId: e.target.value, picked: new Set() })} aria-label="Source document">
                                    {allDocs.filter((d) => d.id !== doc.id).map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                                </select>
                                {(() => {
                                    const src = allDocs.find((d) => d.id === importFrom.docId);
                                    if (!src) return <small className="scribe-idocs__hint">No other docs yet.</small>;
                                    return (
                                        <ul>
                                            {flattenCards(src.cards).map(({ card: c, depth }) => (
                                                <li key={c.id} style={{ paddingLeft: depth * 12 }}>
                                                    <label><input type="checkbox" checked={importFrom.picked.has(c.id)} onChange={(e) => { const p = new Set(importFrom.picked); if (e.target.checked) p.add(c.id); else p.delete(c.id); setImportFrom({ ...importFrom, picked: p }); }} /> {c.title || 'Untitled card'} <small>({c.blocks.length} blk)</small></label>
                                                </li>
                                            ))}
                                        </ul>
                                    );
                                })()}
                                <div className="scribe-idocs__row">
                                    <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={insertFromDoc} disabled={!importFrom.picked.size}>Insert {importFrom.picked.size || ''}</button>
                                    <button type="button" className="scribe-idocs__btn" onClick={() => setImportFrom(null)}>Cancel</button>
                                </div>
                            </div>
                        )}
                        <label className="scribe-idocs__field"><span>Description</span>
                            <textarea rows={2} value={doc.description ?? ''} onChange={(e) => save({ description: e.target.value })} placeholder="One-line summary (shown in library + exports)" />
                        </label>
                    </aside>

                    <main className={`scribe-idocs__canvas scribe-idocs-ed__canvas scribe-idocs-ed__canvas--${doc.pageSize ?? 'fluid'}`}>
                        {activeCard ? (
                            <div className={`scribe-idocs__doc scribe-idocs__theme-${doc.theme} scribe-idocs__canvas-doc`} style={IDOC_THEMES.find((t) => t.id === doc.theme)?.vars as CSSProperties}>
                                <CardCanvas card={activeCard} depth={0} ed={ed} />
                            </div>
                        ) : <p className="scribe-idocs__empty">Add a card to start.</p>}
                    </main>
                </div>
            )}

            {showShortcuts && (
                <div className="scribe-idocs-ed__sheet-backdrop" role="presentation" onClick={(e) => { if (e.target === e.currentTarget) setShowShortcuts(false); }}>
                    <div className="scribe-idocs-ed__sheet" role="dialog" aria-label="Keyboard shortcuts">
                        <h3>Keyboard shortcuts</h3>
                        <dl>
                            <dt>⌘Z / ⌘⇧Z</dt><dd>Undo / redo (outside text fields)</dd>
                            <dt>⌘D</dt><dd>Duplicate current card (or selection)</dd>
                            <dt>⌘⏎</dt><dd>Present</dd>
                            <dt>/</dt><dd>At line start in a text field: insert block palette</dd>
                            <dt>Shift-click</dt><dd>Multi-select cards in the outline</dd>
                            <dt>?</dt><dd>This sheet</dd>
                        </dl>
                        <h4>Present mode</h4>
                        <dl>
                            <dt>← / →  · Space</dt><dd>Previous / next card</dd>
                            <dt>S</dt><dd>Spotlight</dd>
                            <dt>Esc</dt><dd>Exit</dd>
                        </dl>
                        <button type="button" className="scribe-idocs__btn" onClick={() => setShowShortcuts(false)}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
