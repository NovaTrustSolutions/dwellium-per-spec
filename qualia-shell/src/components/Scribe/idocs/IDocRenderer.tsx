/**
 * IDocRenderer — PURE presentational renderer for an IDoc. Used by the editor
 * canvas (preview), Present mode, and export preview. No store access.
 *
 * Markdown: react-markdown + remark-gfm directly (same engine as
 * ../MarkdownPreview) — MarkdownPreview itself is a full-height scroll pane
 * with its own background + CDN enhancers, wrong shape for an inline block.
 * No dangerouslySetInnerHTML anywhere in this file.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { embedSrcFor } from './idocsAi';
import { themeById, type Block, type Card, type IDoc } from './idocTypes';
import { ChartBlock } from './blocks/ChartBlock';

export interface IDocRendererProps {
    doc: IDoc;
    mode?: 'scroll' | 'present';
    /** present mode: which card is shown (controlled). Uncontrolled when omitted. */
    activeCardIndex?: number;
    onActiveCardChange?: (index: number) => void;
    /** Quiz/tabs/accordion respond to input (default true). */
    interactive?: boolean;
    /** Fired when a card becomes the visible/active one (present: on change; scroll: on mount of each). */
    onCardVisible?: (cardId: string) => void;
    /** present mode: request exit (Esc / button). */
    onExit?: () => void;
    /** present mode: switch to scroll view. */
    onToggleScroll?: () => void;
    className?: string;
}

export function themeStyle(doc: IDoc): CSSProperties {
    return themeById(doc.theme).vars as CSSProperties;
}

export function Md({ md, className }: { md: string; className?: string }) {
    return (
        <div className={`scribe-idocs__md${className ? ` ${className}` : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{md || ''}</ReactMarkdown>
        </div>
    );
}

export default function IDocRenderer(props: IDocRendererProps) {
    const { doc, mode = 'scroll', interactive = true, onCardVisible, onExit, onToggleScroll, onActiveCardChange, className } = props;
    const [internalIdx, setInternalIdx] = useState(0);
    const idx = Math.min(props.activeCardIndex ?? internalIdx, Math.max(0, doc.cards.length - 1));
    const setIdx = useCallback((i: number) => {
        const clamped = Math.max(0, Math.min(i, doc.cards.length - 1));
        setInternalIdx(clamped);
        onActiveCardChange?.(clamped);
    }, [doc.cards.length, onActiveCardChange]);

    const jumpTo = useCallback((cardId: string) => {
        const i = doc.cards.findIndex((c) => c.id === cardId);
        if (i < 0) return;
        if (mode === 'present') setIdx(i);
        else document.getElementById(`idoc-card-${cardId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [doc.cards, mode, setIdx]);

    // Present-mode keyboard: ← → Esc.
    useEffect(() => {
        if (mode !== 'present') return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); setIdx(idx + 1); }
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIdx(idx - 1); }
            else if (e.key === 'Escape') { onExit?.(); }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [mode, idx, setIdx, onExit]);

    useEffect(() => {
        if (mode !== 'present') return;
        const c = doc.cards[idx];
        if (c) onCardVisible?.(c.id);
    }, [mode, idx, doc.cards, onCardVisible]);

    const ctx: RenderCtx = { doc, interactive, jumpTo };
    const rootClass = `scribe-idocs__doc scribe-idocs__doc--${mode} scribe-idocs__theme-${doc.theme}${className ? ` ${className}` : ''}`;

    if (mode === 'present') {
        const card = doc.cards[idx];
        return (
            <div className={rootClass} style={themeStyle(doc)} data-testid="idoc-present">
                <div className="scribe-idocs__present-stage">
                    {card ? <CardView key={card.id} card={card} index={idx} ctx={ctx} /> : <p className="scribe-idocs__empty">No cards yet.</p>}
                </div>
                <div className="scribe-idocs__present-bar">
                    <button type="button" className="scribe-idocs__pbtn" onClick={() => setIdx(idx - 1)} disabled={idx <= 0} aria-label="Previous card">←</button>
                    <div className="scribe-idocs__dots" role="tablist" aria-label="Cards">
                        {doc.cards.map((c, i) => (
                            <button key={c.id} type="button" role="tab" aria-selected={i === idx} aria-label={c.title || `Card ${i + 1}`}
                                className={`scribe-idocs__dot${i === idx ? ' is-active' : ''}`} onClick={() => setIdx(i)} />
                        ))}
                    </div>
                    <button type="button" className="scribe-idocs__pbtn" onClick={() => setIdx(idx + 1)} disabled={idx >= doc.cards.length - 1} aria-label="Next card">→</button>
                    <span className="scribe-idocs__present-count">{doc.cards.length ? idx + 1 : 0} / {doc.cards.length}</span>
                    {onToggleScroll && <button type="button" className="scribe-idocs__pbtn" onClick={onToggleScroll}>Scroll</button>}
                    {onExit && <button type="button" className="scribe-idocs__pbtn" onClick={onExit} aria-label="Exit presentation">Esc</button>}
                </div>
            </div>
        );
    }

    return (
        <div className={rootClass} style={themeStyle(doc)} data-testid="idoc-scroll">
            {doc.cards.map((card, i) => <CardView key={card.id} card={card} index={i} ctx={ctx} onVisible={onCardVisible} />)}
            {doc.cards.length === 0 && <p className="scribe-idocs__empty">No cards yet.</p>}
        </div>
    );
}

interface RenderCtx { doc: IDoc; interactive: boolean; jumpTo: (cardId: string) => void }

export function CardView({ card, index, ctx, onVisible }: { card: Card; index: number; ctx: RenderCtx; onVisible?: (id: string) => void }) {
    useEffect(() => { onVisible?.(card.id); }, [card.id, onVisible]);
    const media = card.headerImage ? <img className="scribe-idocs__card-media" src={card.headerImage} alt="" /> : null;
    const body = (
        <div className="scribe-idocs__card-body">
            {card.title && <h2 className="scribe-idocs__card-title">{card.title}</h2>}
            {card.blocks.map((b) => <BlockView key={b.id} block={b} ctx={ctx} />)}
        </div>
    );
    return (
        <section id={`idoc-card-${card.id}`} className={`scribe-idocs__card scribe-idocs__card--${card.layout}`} data-card-index={index}>
            {card.layout === 'hero' && media}
            {card.layout === 'split-left' && media}
            {body}
            {card.layout === 'split-right' && media}
        </section>
    );
}

export function BlockView({ block, ctx }: { block: Block; ctx: RenderCtx }) {
    switch (block.type) {
        case 'heading': {
            const Tag = (`h${block.level}`) as 'h1' | 'h2' | 'h3';
            return <Tag className={`scribe-idocs__h scribe-idocs__h--${block.level}`}>{block.text}</Tag>;
        }
        case 'text': return <Md md={block.md} />;
        case 'callout': return <div className={`scribe-idocs__callout scribe-idocs__callout--${block.tone}`} role="note"><Md md={block.md} /></div>;
        case 'quote': return <blockquote className="scribe-idocs__quote"><Md md={block.md} />{block.cite && <cite>— {block.cite}</cite>}</blockquote>;
        case 'image': return block.src ? (
            <figure className="scribe-idocs__figure">
                <img src={block.src} alt={block.alt || ''} loading="lazy" />
                {block.caption && <figcaption>{block.caption}</figcaption>}
            </figure>
        ) : <div className="scribe-idocs__placeholder">Image (no source)</div>;
        case 'gallery': return (
            <div className="scribe-idocs__gallery">
                {block.images.map((im, i) => <img key={i} src={im.src} alt={im.alt || ''} loading="lazy" />)}
                {block.images.length === 0 && <div className="scribe-idocs__placeholder">Gallery (empty)</div>}
            </div>
        );
        case 'embed': return <EmbedView url={block.url} />;
        case 'chart': return <ChartBlock block={block} />;
        case 'table': return (
            <div className="scribe-idocs__table-wrap">
                <table className="scribe-idocs__table">
                    {block.headers.length > 0 && <thead><tr>{block.headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>}
                    <tbody>{block.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
                </table>
            </div>
        );
        case 'accordion': return (
            <div className="scribe-idocs__accordion">
                {block.items.map((it, i) => (
                    <details key={i} className="scribe-idocs__acc-item"><summary>{it.title}</summary><Md md={it.md} /></details>
                ))}
            </div>
        );
        case 'tabs': return <TabsView items={block.items} />;
        case 'columns': return (
            <div className="scribe-idocs__columns" style={{ '--idoc-cols': block.columns.length } as CSSProperties}>
                {block.columns.map((c, i) => <Md key={i} md={c} className="scribe-idocs__col" />)}
            </div>
        );
        case 'button': {
            const safe = /^https?:\/\//i.test(block.href) || block.href.startsWith('mailto:');
            return safe
                ? <a className={`scribe-idocs__btn scribe-idocs__btn--${block.variant}`} href={block.href} target="_blank" rel="noopener noreferrer">{block.label}</a>
                : <span className={`scribe-idocs__btn scribe-idocs__btn--${block.variant} is-disabled`}>{block.label}</span>;
        }
        case 'code': return <pre className="scribe-idocs__code" data-lang={block.lang}><code>{block.code}</code></pre>;
        case 'divider': return <hr className="scribe-idocs__divider" />;
        case 'timeline': return (
            <ol className="scribe-idocs__timeline">
                {block.items.map((it, i) => (
                    <li key={i} className="scribe-idocs__tl-item">
                        <span className="scribe-idocs__tl-date">{it.date}</span>
                        <div className="scribe-idocs__tl-body"><strong>{it.title}</strong><Md md={it.md} /></div>
                    </li>
                ))}
            </ol>
        );
        case 'quiz': return <QuizView block={block} interactive={ctx.interactive} />;
        case 'toc': return (
            <nav className="scribe-idocs__toc" aria-label="Contents">
                <ol>
                    {ctx.doc.cards.map((c, i) => (
                        <li key={c.id}><button type="button" onClick={() => ctx.jumpTo(c.id)}>{c.title || `Card ${i + 1}`}</button></li>
                    ))}
                </ol>
            </nav>
        );
    }
}

function EmbedView({ url }: { url: string }) {
    const info = embedSrcFor(url);
    if (!info) return <div className="scribe-idocs__placeholder">Embed: {url ? 'unsupported URL' : 'no URL'}</div>;
    return (
        <div className={`scribe-idocs__embed scribe-idocs__embed--${info.aspect.replace(':', 'x')}`} data-provider={info.provider}>
            <iframe
                src={info.src}
                title={`${info.provider} embed`}
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
                loading="lazy"
                referrerPolicy="no-referrer"
                allow="fullscreen; picture-in-picture; encrypted-media"
            />
        </div>
    );
}

function TabsView({ items }: { items: { title: string; md: string }[] }) {
    const [i, setI] = useState(0);
    const cur = items[Math.min(i, items.length - 1)];
    if (!items.length) return null;
    return (
        <div className="scribe-idocs__tabs">
            <div className="scribe-idocs__tabs-list" role="tablist">
                {items.map((it, k) => (
                    <button key={k} type="button" role="tab" aria-selected={k === i} className={`scribe-idocs__tab${k === i ? ' is-active' : ''}`} onClick={() => setI(k)}>{it.title}</button>
                ))}
            </div>
            <div className="scribe-idocs__tabs-panel" role="tabpanel"><Md md={cur.md} /></div>
        </div>
    );
}

function QuizView({ block, interactive }: { block: Extract<Block, { type: 'quiz' }>; interactive: boolean }) {
    const [picked, setPicked] = useState<number | null>(null);
    const answered = picked !== null;
    return (
        <div className={`scribe-idocs__quiz${answered ? (picked === block.answerIndex ? ' is-correct' : ' is-wrong') : ''}`}>
            <p className="scribe-idocs__quiz-q">{block.question}</p>
            <div className="scribe-idocs__quiz-opts">
                {block.options.map((o, i) => {
                    let cls = 'scribe-idocs__quiz-opt';
                    if (answered && i === block.answerIndex) cls += ' is-answer';
                    if (answered && i === picked && picked !== block.answerIndex) cls += ' is-picked-wrong';
                    return (
                        <button key={i} type="button" className={cls} disabled={!interactive || answered} onClick={() => setPicked(i)} aria-pressed={picked === i}>
                            {o}
                        </button>
                    );
                })}
            </div>
            {answered && (
                <div className="scribe-idocs__quiz-result" role="status">
                    <strong>{picked === block.answerIndex ? 'Correct!' : 'Not quite.'}</strong>
                    {block.explanation && <span> {block.explanation}</span>}
                    <button type="button" className="scribe-idocs__link" onClick={() => setPicked(null)}>Try again</button>
                </div>
            )}
        </div>
    );
}
