/**
 * IDocEditor — left rail (card outline) + center canvas (blocks with hover
 * toolbars + inline form editors) + top bar (title, theme, Present, Export,
 * Share, Analytics). Every change goes straight to the store (autosave).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { recordArtifact } from '../../../lib/artifactStore';
import { hasActiveLlm } from '../../../lib/llmClient';
import { useIntegrations } from '../../../hooks/useIntegrations';
import BlockEditor from './BlockEditor';
import IDocRenderer, { BlockView } from './IDocRenderer';
import { download, exportHtml, exportMarkdown, exportPdf, printDoc, safeFilename } from './idocExport';
import { rewriteBlockMd, type RewriteInstruction } from './idocsAi';
import { exportDoc, idocsStore, replaceDoc, setView } from './idocsStore';
import {
    BLOCK_TYPES, CARD_LAYOUTS, IDOC_THEMES, MD_BLOCK_TYPES, createEmptyCard, defaultBlock, newId,
    type Block, type BlockType, type Card, type CardLayout, type IDoc, type IDocThemeId,
} from './idocTypes';

const AI_ACTIONS: RewriteInstruction[] = ['rewrite', 'shorten', 'expand', 'simplify', 'formal', 'friendly'];

function fmtSecs(s: number): string { return s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`; }

/** Tiny popover menu — click-outside closes. */
function Menu({ label, children, align = 'right' }: { label: string; children: (close: () => void) => ReactNode; align?: 'left' | 'right' }) {
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
            <button type="button" className="scribe-idocs__btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{label} ▾</button>
            {open && <div className={`scribe-idocs__menu-pop scribe-idocs__menu-pop--${align}`} role="menu">{children(() => setOpen(false))}</div>}
        </div>
    );
}

export default function IDocEditor({ doc }: { doc: IDoc }) {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const [activeCardId, setActiveCardId] = useState<string>(doc.cards[0]?.id ?? '');
    const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
    const [aiBusy, setAiBusy] = useState<string | null>(null);
    const [toast, setToast] = useState<string | null>(null);
    const [previewAll, setPreviewAll] = useState(false);
    const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1800); };

    const activeCard = doc.cards.find((c) => c.id === activeCardId) ?? doc.cards[0];
    useEffect(() => { if (!doc.cards.some((c) => c.id === activeCardId)) setActiveCardId(doc.cards[0]?.id ?? ''); }, [doc.cards, activeCardId]);

    const save = useCallback((patch: Partial<IDoc>) => replaceDoc({ ...doc, ...patch }), [doc]);
    const setCards = (cards: Card[]) => save({ cards });
    const patchCard = (id: string, patch: Partial<Card>) => setCards(doc.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    const patchBlock = (cardId: string, block: Block) => patchCard(cardId, { blocks: (doc.cards.find((c) => c.id === cardId)?.blocks ?? []).map((b) => (b.id === block.id ? block : b)) });

    // ── cards ──
    const addCard = () => { const c = createEmptyCard({ title: `Card ${doc.cards.length + 1}` }); setCards([...doc.cards, c]); setActiveCardId(c.id); };
    const deleteCard = (id: string) => setCards(doc.cards.filter((c) => c.id !== id));
    const moveCard = (id: string, d: number) => {
        const i = doc.cards.findIndex((c) => c.id === id); const j = i + d;
        if (i < 0 || j < 0 || j >= doc.cards.length) return;
        const n = doc.cards.slice(); [n[i], n[j]] = [n[j], n[i]]; setCards(n);
    };
    const duplicateCard = (id: string) => {
        const i = doc.cards.findIndex((c) => c.id === id); if (i < 0) return;
        const src = doc.cards[i];
        const copy: Card = { ...structuredClone(src), id: newId('c'), blocks: src.blocks.map((b) => ({ ...b, id: newId() })) };
        const n = doc.cards.slice(); n.splice(i + 1, 0, copy); setCards(n); setActiveCardId(copy.id);
    };

    // ── blocks ──
    const addBlock = (type: BlockType, afterId?: string) => {
        if (!activeCard) return;
        const b = defaultBlock(type);
        const blocks = activeCard.blocks.slice();
        const i = afterId ? blocks.findIndex((x) => x.id === afterId) : -1;
        blocks.splice(i >= 0 ? i + 1 : blocks.length, 0, b);
        patchCard(activeCard.id, { blocks });
        setEditingBlockId(b.id);
    };
    const moveBlock = (id: string, d: number) => {
        if (!activeCard) return;
        const i = activeCard.blocks.findIndex((b) => b.id === id); const j = i + d;
        if (i < 0 || j < 0 || j >= activeCard.blocks.length) return;
        const n = activeCard.blocks.slice(); [n[i], n[j]] = [n[j], n[i]]; patchCard(activeCard.id, { blocks: n });
    };
    const deleteBlock = (id: string) => activeCard && patchCard(activeCard.id, { blocks: activeCard.blocks.filter((b) => b.id !== id) });
    const aiRewrite = async (block: Block, instruction: RewriteInstruction) => {
        if (!activeCard || !('md' in block)) return;
        setAiBusy(block.id);
        try {
            const out = await rewriteBlockMd(block.md, instruction, integrations.llm);
            if (!out) { flash('AI returned nothing'); return; }
            // Re-read the latest doc so edits made while the model was thinking aren't clobbered.
            const latest = idocsStore.getSnapshot().docs.find((d) => d.id === doc.id) ?? doc;
            replaceDoc({ ...latest, cards: latest.cards.map((c) => c.id === activeCard.id ? { ...c, blocks: c.blocks.map((x) => (x.id === block.id ? ({ ...x, md: out } as Block) : x)) } : c) });
        } catch (e) { flash(`AI failed: ${(e as Error).message}`); } finally { setAiBusy(null); }
    };

    // ── export / share ──
    const fname = safeFilename(doc.title);
    const shareCopy = async () => { try { await navigator.clipboard.writeText(exportDoc(doc.id)); flash('JSON copied'); } catch { flash('Clipboard blocked'); } };
    const saveArtifact = () => { recordArtifact({ content: exportHtml(doc), source: 'scribe', title: doc.title.slice(0, 40), type: 'html' }); flash('Saved to Artifact Gallery'); };

    const topCards = Object.entries(doc.analytics?.cardSeconds ?? {})
        .map(([id, s]) => ({ title: doc.cards.find((c) => c.id === id)?.title || 'Card', s }))
        .sort((a, b) => b.s - a.s).slice(0, 5);

    return (
        <div className="scribe-idocs__editor">
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
                <span className="scribe-idocs__spacer" />
                <button type="button" className={`scribe-idocs__btn${previewAll ? ' is-active' : ''}`} onClick={() => setPreviewAll((p) => !p)} title="Toggle full-doc preview">{previewAll ? 'Edit' : 'Preview'}</button>
                <button type="button" className="scribe-idocs__btn scribe-idocs__btn--primary" onClick={() => setView('present')}>▶ Present</button>
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
                {toast && <span className="scribe-idocs__toast" role="status">{toast}</span>}
            </div>

            {previewAll ? (
                <div className="scribe-idocs__preview-scroll"><IDocRenderer doc={doc} mode="scroll" /></div>
            ) : (
                <div className="scribe-idocs__body">
                    <aside className="scribe-idocs__rail" aria-label="Cards">
                        <ol className="scribe-idocs__outline">
                            {doc.cards.map((c, i) => (
                                <li key={c.id} className={`scribe-idocs__outline-item${c.id === activeCard?.id ? ' is-active' : ''}`}>
                                    <button type="button" className="scribe-idocs__outline-btn" onClick={() => setActiveCardId(c.id)}>
                                        <span className="scribe-idocs__outline-n">{i + 1}</span>
                                        <span className="scribe-idocs__outline-t">{c.title || 'Untitled card'}</span>
                                        <small>{c.blocks.length} blk</small>
                                    </button>
                                    <div className="scribe-idocs__outline-tools">
                                        <button type="button" onClick={() => moveCard(c.id, -1)} aria-label="Move card up" disabled={i === 0}>↑</button>
                                        <button type="button" onClick={() => moveCard(c.id, 1)} aria-label="Move card down" disabled={i === doc.cards.length - 1}>↓</button>
                                        <button type="button" onClick={() => duplicateCard(c.id)} aria-label="Duplicate card">⧉</button>
                                        <button type="button" onClick={() => deleteCard(c.id)} aria-label="Delete card" disabled={doc.cards.length <= 1}>✕</button>
                                    </div>
                                </li>
                            ))}
                        </ol>
                        <button type="button" className="scribe-idocs__btn scribe-idocs__btn--block" onClick={addCard}>+ Add card</button>
                        <label className="scribe-idocs__field"><span>Description</span>
                            <textarea rows={2} value={doc.description ?? ''} onChange={(e) => save({ description: e.target.value })} placeholder="One-line summary (shown in library + exports)" />
                        </label>
                    </aside>

                    <main className="scribe-idocs__canvas">
                        {activeCard ? (
                            <>
                                <div className="scribe-idocs__card-head">
                                    <input className="scribe-idocs__card-title-input" value={activeCard.title ?? ''} onChange={(e) => patchCard(activeCard.id, { title: e.target.value })} placeholder="Card title" aria-label="Card title" />
                                    <select value={activeCard.layout} onChange={(e) => patchCard(activeCard.id, { layout: e.target.value as CardLayout })} aria-label="Card layout">
                                        {CARD_LAYOUTS.map((l) => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                    <input type="url" className="scribe-idocs__hdrimg" value={activeCard.headerImage ?? ''} onChange={(e) => patchCard(activeCard.id, { headerImage: e.target.value || undefined })} placeholder="Header image URL (hero/split)" aria-label="Header image URL" />
                                </div>
                                <div className={`scribe-idocs__doc scribe-idocs__theme-${doc.theme} scribe-idocs__canvas-doc`} style={IDOC_THEMES.find((t) => t.id === doc.theme)?.vars as CSSProperties}>
                                    <section className={`scribe-idocs__card scribe-idocs__card--${activeCard.layout} is-editing`}>
                                        {activeCard.headerImage && activeCard.layout !== 'default' && <img className="scribe-idocs__card-media" src={activeCard.headerImage} alt="" />}
                                        <div className="scribe-idocs__card-body">
                                            {activeCard.title && <h2 className="scribe-idocs__card-title">{activeCard.title}</h2>}
                                            {activeCard.blocks.map((b) => (
                                                <div key={b.id} className={`scribe-idocs__blockwrap${editingBlockId === b.id ? ' is-editing' : ''}`}>
                                                    <div className="scribe-idocs__blocktools" role="toolbar" aria-label={`${b.type} block`}>
                                                        <span className="scribe-idocs__blocktype">{b.type}</span>
                                                        <button type="button" onClick={() => setEditingBlockId(editingBlockId === b.id ? null : b.id)}>{editingBlockId === b.id ? 'Done' : 'Edit'}</button>
                                                        <button type="button" onClick={() => moveBlock(b.id, -1)} aria-label="Move block up">↑</button>
                                                        <button type="button" onClick={() => moveBlock(b.id, 1)} aria-label="Move block down">↓</button>
                                                        {MD_BLOCK_TYPES.includes(b.type) && (
                                                            <Menu label={aiBusy === b.id ? 'AI…' : 'AI'} align="left">{(close) => (
                                                                llmReady
                                                                    ? AI_ACTIONS.map((a) => <button key={a} type="button" role="menuitem" onClick={() => { void aiRewrite(b, a); close(); }}>{a}</button>)
                                                                    : <small className="scribe-idocs__hint">Add an LLM key in Control Panel → API Keys</small>
                                                            )}</Menu>
                                                        )}
                                                        <button type="button" onClick={() => deleteBlock(b.id)} aria-label="Delete block">✕</button>
                                                    </div>
                                                    {editingBlockId === b.id
                                                        ? <div className="scribe-idocs__blockform"><BlockEditor block={b} onChange={(nb) => patchBlock(activeCard.id, nb)} /></div>
                                                        : null}
                                                    <div className="scribe-idocs__blockview" onDoubleClick={() => setEditingBlockId(b.id)}>
                                                        <BlockView block={b} ctx={{ doc, interactive: true, jumpTo: (id) => setActiveCardId(id) }} />
                                                    </div>
                                                    <div className="scribe-idocs__addbar">
                                                        <Menu label="+ Add block" align="left">{(close) => BLOCK_TYPES.map((t) => <button key={t} type="button" role="menuitem" onClick={() => { addBlock(t, b.id); close(); }}>{t}</button>)}</Menu>
                                                    </div>
                                                </div>
                                            ))}
                                            {activeCard.blocks.length === 0 && (
                                                <div className="scribe-idocs__addbar is-empty">
                                                    <Menu label="+ Add block" align="left">{(close) => BLOCK_TYPES.map((t) => <button key={t} type="button" role="menuitem" onClick={() => { addBlock(t); close(); }}>{t}</button>)}</Menu>
                                                </div>
                                            )}
                                        </div>
                                    </section>
                                </div>
                            </>
                        ) : <p className="scribe-idocs__empty">Add a card to start.</p>}
                    </main>
                </div>
            )}
        </div>
    );
}
