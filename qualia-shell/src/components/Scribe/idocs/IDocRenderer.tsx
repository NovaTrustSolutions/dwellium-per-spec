/**
 * IDocRenderer — PURE presentational renderer for an IDoc. Used by the editor
 * canvas (preview), Present mode, and export preview. No store access.
 *
 * Markdown: react-markdown + remark-gfm directly (same engine as
 * ../MarkdownPreview) — MarkdownPreview itself is a full-height scroll pane
 * with its own background + CDN enhancers, wrong shape for an inline block.
 * No dangerouslySetInnerHTML anywhere in this file (math/diagram/code use an
 * imperative container + previewEnhance's fail-safe CDN loaders).
 *
 * Wave 1: card backgrounds + image-top/background layouts, page sizes, nested
 * cards (⌘⇧O toggles all), footnotes ([^n] → #fn-<card>-n), doc chrome
 * (header/footer/logo/section numbers), steps/funnel/boxes/math/diagram/qr,
 * donut/area charts, `#card:<id>` button links, present-mode Spotlight (S).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { enhancePreview } from '../previewEnhance';
import { embedSrcFor } from './idocsAi';
import { themeVarsFor, type Block, type Card, type CustomTheme, type IDoc } from './idocTypes';
import { ChartBlock } from './blocks/ChartBlock';
import { qrPath } from './blocks/qr';
import { fetchChartData } from './blocks/chartData';
import { imgOptsOf, imgOptsStyle, type ChartBlockW2 } from './blocks/imageOpts';

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

/** CSS aspect-ratio per page size (fluid → none). */
export const PAGE_ASPECT: Record<NonNullable<IDoc['pageSize']>, string> = {
    fluid: 'auto', '16:9': '16 / 9', '4:3': '4 / 3', '1:1': '1 / 1', a4: '210 / 297', letter: '8.5 / 11',
};
/** `@page size` per page size (fluid → none). */
export const PAGE_PRINT_SIZE: Record<NonNullable<IDoc['pageSize']>, string> = {
    fluid: '', '16:9': '13.333in 7.5in', '4:3': '10in 7.5in', '1:1': '7.5in 7.5in', a4: 'A4', letter: 'letter',
};

export function themeStyle(doc: IDoc): CSSProperties {
    const vars = themeVarsFor(doc);
    vars['--idoc-aspect'] = PAGE_ASPECT[doc.pageSize ?? 'fluid'];
    return vars as CSSProperties;
}

/**
 * Wave 2: `@font-face` rules for a custom theme's uploaded fonts (data URLs).
 * Shared by the renderer (inline <style>) and exportHtml. Family names are
 * quoted + stripped of quotes/backslashes; only `data:` URLs are emitted.
 */
export function fontFaceCss(fontFaces: CustomTheme['fontFaces'] | undefined): string {
    return (fontFaces ?? [])
        .filter((f) => f && typeof f.family === 'string' && f.family.trim() && typeof f.dataUrl === 'string' && /^data:(font|application)\//i.test(f.dataUrl))
        .map((f) => `@font-face{font-family:"${f.family.replace(/["\\]/g, '')}";src:url("${f.dataUrl.replace(/["\\)]/g, '')}");font-weight:${(f.weight || 'normal').replace(/[^\w\s-]/g, '') || 'normal'};font-display:swap}`)
        .join('\n');
}

/** Card id for footnote anchors — provided by CardView, consumed by Md. */
const CardIdCtx = createContext<string>('');

/** `[^n]` → markdown link to `#fn-<cardId>-n` (rendered as a superscript by the `a` component below). */
export function footnoteRefs(md: string, cardId: string): string {
    // ponytail: also rewrites inside fenced code — acceptable; use a remark plugin if that ever bites.
    return md.replace(/\[\^(\w+)\](?!:)/g, (_m, n: string) => `[${n}](#fn-${cardId}-${n})`);
}

/** Card-link href → card id (`#card:<id>` or `#card-<id>`), else null. */
export function cardLinkId(href: string): string | null {
    const m = /^#card[:-](.+)$/.exec(href.trim());
    return m ? m[1] : null;
}

export function Md({ md, className }: { md: string; className?: string }) {
    const cardId = useContext(CardIdCtx);
    const src = cardId ? footnoteRefs(md || '', cardId) : (md || '');
    return (
        <div className={`scribe-idocs__md${className ? ` ${className}` : ''}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                a: ({ href, children }) => /^#fn-/.test(href || '')
                    ? <sup className="scribe-idocs__fnref"><a href={href}>{children}</a></sup>
                    : <a href={href} target={/^https?:/i.test(href || '') ? '_blank' : undefined} rel="noopener noreferrer">{children}</a>,
            }}>{src}</ReactMarkdown>
        </div>
    );
}

/** Find the top-level card index containing `cardId` (itself or a nested child). */
export function topLevelIndexOf(cards: Card[], cardId: string): number {
    const has = (c: Card): boolean => c.id === cardId || (c.children ?? []).some(has);
    return cards.findIndex(has);
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
    // Nested cards: `subGen` bumps remount <details> with `subOpen` (⌘⇧O toggles all).
    const [sub, setSub] = useState({ open: true, gen: 0 });
    // Spotlight (present): null = off; number = index of the last revealed block.
    const [spot, setSpot] = useState<number | null>(null);

    const jumpTo = useCallback((cardId: string) => {
        const i = topLevelIndexOf(doc.cards, cardId);
        if (i < 0) return;
        if (mode === 'present') setIdx(i);
        else document.getElementById(`idoc-card-${cardId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [doc.cards, mode, setIdx]);

    // ⌘⇧O — expand/collapse all nested cards (both modes). Capture phase, like Esc below.
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'o') {
                e.preventDefault(); e.stopPropagation();
                setSub((s) => ({ open: !s.open, gen: s.gen + 1 }));
            }
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, []);

    // Present-mode keyboard: ← → Esc (+ S spotlight, ↑↓ reveal). Registered in the
    // CAPTURE phase and stopping propagation, because Desktop.tsx has a window-level
    // "Esc closes the top window" shortcut — without this, exiting a presentation
    // with Esc would also close the whole Scribe window (found in the live pass).
    const blockCount = doc.cards[idx]?.blocks.length ?? 0;
    useEffect(() => {
        if (mode !== 'present') return;
        const onKey = (e: KeyboardEvent) => {
            const t = e.target as HTMLElement | null;
            if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
            const stop = () => { e.preventDefault(); e.stopPropagation(); };
            if (e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === 's' || e.key === 'S') { stop(); setSpot((s) => (s == null ? 0 : null)); }
            else if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ' || (e.key === 'ArrowDown' && spot != null)) {
                stop();
                if (spot != null && spot < blockCount - 1) setSpot(spot + 1);
                else { setIdx(idx + 1); if (spot != null) setSpot(0); }
            } else if (e.key === 'ArrowUp' && spot != null) { stop(); setSpot(Math.max(0, spot - 1)); }
            else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { stop(); setIdx(idx - 1); if (spot != null) setSpot(0); }
            else if (e.key === 'Escape') { stop(); onExit?.(); }
        };
        window.addEventListener('keydown', onKey, { capture: true });
        return () => window.removeEventListener('keydown', onKey, { capture: true });
    }, [mode, idx, setIdx, onExit, spot, blockCount]);

    useEffect(() => {
        if (mode !== 'present') return;
        const c = doc.cards[idx];
        if (c) onCardVisible?.(c.id);
    }, [mode, idx, doc.cards, onCardVisible]);

    const ctx: RenderCtx = { doc, interactive, jumpTo, subOpen: sub.open, subGen: sub.gen };
    const pageSize = doc.pageSize ?? 'fluid';
    const rootClass = `scribe-idocs__doc scribe-idocs__doc--${mode} scribe-idocs__theme-${doc.theme} scribe-idocs__doc--ps-${pageSize.replace(':', 'x')}${className ? ` ${className}` : ''}`;
    const printSize = PAGE_PRINT_SIZE[pageSize];
    const fontCss = doc.theme === 'custom' ? fontFaceCss(doc.customTheme?.fontFaces) : '';
    const styleText = `${printSize ? `@media print{@page{size:${printSize}}}` : ''}${fontCss ? `\n${fontCss}` : ''}`;
    const pageStyle = styleText ? <style data-idoc-style="">{styleText}</style> : null;

    if (mode === 'present') {
        const card = doc.cards[idx];
        return (
            <div className={rootClass} style={themeStyle(doc)} data-testid="idoc-present" dir={doc.dir} lang={doc.language}>
                {pageStyle}
                <div className="scribe-idocs__present-stage">
                    {card ? <CardView key={card.id} card={card} index={idx} ctx={ctx} revealed={spot} /> : <p className="scribe-idocs__empty">No cards yet.</p>}
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
                    <button type="button" className={`scribe-idocs__pbtn scribe-idocs__spot-pill${spot != null ? ' is-active' : ''}`} onClick={() => setSpot(spot == null ? 0 : null)} aria-pressed={spot != null} title="Spotlight (S): reveal blocks one by one with ↓/↑">
                        Spotlight{spot != null && blockCount > 0 && <span className="scribe-idocs__spot-dots" aria-label={`${Math.min(spot + 1, blockCount)} of ${blockCount} blocks revealed`}>
                            {Array.from({ length: blockCount }, (_, i) => <i key={i} className={i <= spot ? 'is-on' : ''} />)}
                        </span>}
                    </button>
                    {onToggleScroll && <button type="button" className="scribe-idocs__pbtn" onClick={onToggleScroll}>Scroll</button>}
                    {onExit && <button type="button" className="scribe-idocs__pbtn" onClick={onExit} aria-label="Exit presentation">Esc</button>}
                </div>
            </div>
        );
    }

    return (
        <div className={rootClass} style={themeStyle(doc)} data-testid="idoc-scroll" dir={doc.dir} lang={doc.language}>
            {pageStyle}
            {doc.cards.map((card, i) => <CardView key={card.id} card={card} index={i} ctx={ctx} onVisible={onCardVisible} />)}
            {doc.cards.length === 0 && <p className="scribe-idocs__empty">No cards yet.</p>}
        </div>
    );
}

interface RenderCtx {
    doc: IDoc; interactive: boolean; jumpTo: (cardId: string) => void;
    /** Nested cards default open state + remount generation (⌘⇧O). Optional so external callers can pass the 3-field shape. */
    subOpen?: boolean; subGen?: number;
}

/** Inline style for a card background (color / image + overlay + align). Shared shape with idocExport. */
export function cardBackgroundStyle(card: Card): CSSProperties {
    const bg = card.background;
    const s: Record<string, string> = {};
    if (bg?.color) s['--idoc-card-bg'] = bg.color;
    const img = bg?.image || (card.layout === 'background' ? card.headerImage : undefined);
    if (img) {
        s['--idoc-card-image'] = `url("${img.replace(/["\\]/g, '')}")`;
        s['--idoc-card-image-pos'] = bg?.align === 'top' ? 'top' : bg?.align === 'bottom' ? 'bottom' : 'center';
    }
    if (bg?.intensity != null) s['--idoc-overlay'] = String(Math.max(0, Math.min(100, bg.intensity)) / 100);
    return s as CSSProperties;
}

export function CardView({ card, index, ctx, onVisible, revealed, depth = 0 }: { card: Card; index: number; ctx: RenderCtx; onVisible?: (id: string) => void; revealed?: number | null; depth?: number }) {
    useEffect(() => { onVisible?.(card.id); }, [card.id, onVisible]);
    const media = card.headerImage && card.layout !== 'background' ? <img className="scribe-idocs__card-media" src={card.headerImage} alt="" /> : null;
    const bg = card.background;
    const hasImage = !!(bg?.image || (card.layout === 'background' && card.headerImage));
    const overlay = hasImage ? (bg?.overlay ?? 'faded') : 'none';
    const chrome = depth === 0 && !(ctx.doc.chrome?.hideOnFirst && index === 0) ? ctx.doc.chrome : undefined;
    const body = (
        <div className="scribe-idocs__card-body">
            {card.title && <h2 className="scribe-idocs__card-title">{card.title}</h2>}
            {card.blocks.map((b, i) => (
                revealed == null
                    ? <BlockView key={b.id} block={b} ctx={ctx} />
                    : <div key={b.id} className={`scribe-idocs__blockslot${i > revealed ? ' is-dimmed' : ''}`} aria-hidden={i > revealed || undefined}><BlockView block={b} ctx={ctx} /></div>
            ))}
            {(card.children ?? []).map((child, i) => (
                <details key={`${child.id}-${ctx.subGen ?? 0}`} className="scribe-idocs__subcard" open={ctx.subOpen ?? true} id={`idoc-card-${child.id}`}>
                    <summary className="scribe-idocs__subcard-summary">{child.title || `Section ${i + 1}`}</summary>
                    <CardView card={child} index={i} ctx={ctx} depth={depth + 1} />
                </details>
            ))}
            {card.footnotes && card.footnotes.length > 0 && (
                <ol className="scribe-idocs__footnotes" aria-label="Footnotes">
                    {card.footnotes.map((f, i) => <li key={f.id || i} id={`fn-${card.id}-${i + 1}`}><Md md={f.text} /></li>)}
                </ol>
            )}
        </div>
    );
    const cls = `scribe-idocs__card scribe-idocs__card--${card.layout}${depth ? ' scribe-idocs__card--nested' : ''}${hasImage ? ` scribe-idocs__card--has-image scribe-idocs__card--overlay-${overlay}` : ''}${bg?.color ? ' scribe-idocs__card--has-color' : ''}`;
    return (
        <CardIdCtx.Provider value={card.id}>
            <section id={depth ? undefined : `idoc-card-${card.id}`} className={cls} data-card-index={index} style={cardBackgroundStyle(card)}>
                {chrome && (chrome.header || chrome.logo) && (
                    <div className="scribe-idocs__chrome scribe-idocs__chrome--top">
                        <span className="scribe-idocs__chrome-header">{chrome.header}</span>
                        {chrome.logo && <img className="scribe-idocs__chrome-logo" src={chrome.logo} alt="" />}
                    </div>
                )}
                {(card.layout === 'hero' || card.layout === 'image-top' || card.layout === 'split-left') && media}
                {body}
                {card.layout === 'split-right' && media}
                {chrome && (chrome.footer || chrome.sectionNumbers) && (
                    <div className="scribe-idocs__chrome scribe-idocs__chrome--bottom">
                        <span className="scribe-idocs__chrome-footer">{chrome.footer}</span>
                        {chrome.sectionNumbers && <span className="scribe-idocs__chrome-num">{index + 1} / {ctx.doc.cards.length}</span>}
                    </div>
                )}
            </section>
        </CardIdCtx.Provider>
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
                <img src={block.src} alt={block.alt || ''} loading="lazy" style={imgOptsStyle(imgOptsOf(block))} />
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
        case 'chart': return <ChartAuto block={block as ChartBlockW2} />;
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
            const cardId = cardLinkId(block.href);
            if (cardId) return <button type="button" className={`scribe-idocs__btn scribe-idocs__btn--${block.variant}`} onClick={() => ctx.jumpTo(cardId)}>{block.label}</button>;
            const safe = /^https?:\/\//i.test(block.href) || block.href.startsWith('mailto:');
            return safe
                ? <a className={`scribe-idocs__btn scribe-idocs__btn--${block.variant}`} href={block.href} target="_blank" rel="noopener noreferrer">{block.label}</a>
                : <span className={`scribe-idocs__btn scribe-idocs__btn--${block.variant} is-disabled`}>{block.label}</span>;
        }
        case 'code': return <Enhanced kind="code" src={block.code} lang={block.lang} />;
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
                <TocList cards={ctx.doc.cards} ctx={ctx} />
            </nav>
        );
        case 'steps': return (
            <ol className={`scribe-idocs__steps${block.numbered === false ? ' scribe-idocs__steps--plain' : ''}`}>
                {block.items.map((it, i) => (
                    <li key={i} className="scribe-idocs__step">
                        <span className="scribe-idocs__step-marker" aria-hidden="true">{block.numbered === false ? '' : i + 1}</span>
                        <div className="scribe-idocs__step-body"><strong>{it.title}</strong><Md md={it.md} /></div>
                    </li>
                ))}
            </ol>
        );
        case 'funnel': {
            const max = Math.max(1, ...block.items.map((it) => it.value ?? 0));
            return (
                <div className="scribe-idocs__funnel" role="list">
                    {block.items.map((it, i) => (
                        <div key={i} className="scribe-idocs__funnel-row" role="listitem" style={{ width: `${it.value == null ? 100 : Math.max(20, Math.round((it.value / max) * 100))}%` }}>
                            <span>{it.label}</span>{it.value != null && <em>{it.value}</em>}
                        </div>
                    ))}
                </div>
            );
        }
        case 'boxes': return (
            <div className="scribe-idocs__boxes" style={{ '--idoc-cols': block.columns ?? 3 } as CSSProperties}>
                {block.items.map((it, i) => <div key={i} className={`scribe-idocs__box${it.emphasis ? ' scribe-idocs__box--emphasis' : ''}`}><strong>{it.title}</strong><Md md={it.md} /></div>)}
            </div>
        );
        case 'math': return <Enhanced kind="math" src={block.latex} inline={block.inline} />;
        case 'diagram': return <Enhanced kind="diagram" src={block.mermaid} />;
        case 'qr': return <QrView url={block.url} caption={block.caption} />;
    }
}

/**
 * Wave 2: chart with `autoSync && sourceUrl` refreshes its data once on mount
 * (fail-safe: any error keeps the stored data; the persisted block is NOT
 * mutated here — "Sync now" in the editor is what writes `data`/`syncedAt`).
 */
function ChartAuto({ block }: { block: ChartBlockW2 }) {
    const [live, setLive] = useState<ChartBlockW2['data'] | null>(null);
    const src = block.autoSync && block.sourceUrl ? block.sourceUrl : '';
    useEffect(() => {
        if (!src) return;
        let alive = true;
        fetchChartData(src).then((d) => { if (alive) setLive(d); }).catch(() => { /* keep stored data */ });
        return () => { alive = false; };
    }, [src]);
    return <ChartBlock block={live ? { ...block, data: live } : block} />;
}

function TocList({ cards, ctx }: { cards: Card[]; ctx: RenderCtx }) {
    return (
        <ol>
            {cards.map((c, i) => (
                <li key={c.id}>
                    <button type="button" onClick={() => ctx.jumpTo(c.id)}>{c.title || `Card ${i + 1}`}</button>
                    {c.children && c.children.length > 0 && <TocList cards={c.children} ctx={ctx} />}
                </li>
            ))}
        </ol>
    );
}

function QrView({ url, caption }: { url: string; caption?: string }) {
    const p = useMemo(() => (embedSrcFor(url) ? qrPath(url) : null), [url]);
    if (!p) return <div className="scribe-idocs__placeholder">QR: enter an http(s) URL</div>;
    return (
        <figure className="scribe-idocs__qr">
            {/* Black-on-white on purpose: scanners expect dark modules on a light ground regardless of theme. */}
            <svg className="scribe-idocs__qr-svg" viewBox={`0 0 ${p.dim} ${p.dim}`} width={200} height={200} role="img" aria-label={`QR code for ${url}`} shapeRendering="crispEdges">
                <rect width={p.dim} height={p.dim} fill="#fff" />
                <path d={p.d} fill="#000" />
            </svg>
            {caption && <figcaption>{caption}</figcaption>}
        </figure>
    );
}

/**
 * Math / diagram / code — content is built imperatively into a React-owned
 * empty container, then previewEnhance's CDN-lazy KaTeX/Mermaid/Prism upgrade
 * it in place (fail-safe: falls back to the plain text below).
 */
function Enhanced({ kind, src, lang, inline }: { kind: 'math' | 'diagram' | 'code'; src: string; lang?: string; inline?: boolean }) {
    const ref = useRef<HTMLElement | null>(null);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        el.textContent = '';
        if (kind === 'math') {
            el.textContent = inline ? `$${src}$` : `$$${src}$$`;
        } else {
            const pre = document.createElement('pre');
            const code = document.createElement('code');
            code.className = kind === 'diagram' ? 'language-mermaid' : `language-${(lang || 'text').replace(/[^\w-]/g, '')}`;
            code.textContent = src;
            pre.appendChild(code);
            el.appendChild(pre);
        }
        enhancePreview(el);
    }, [kind, src, lang, inline]);
    if (kind === 'math' && inline) return <span ref={ref as RefObject<HTMLSpanElement>} className="scribe-idocs__math scribe-idocs__math--inline" data-latex={src} />;
    const cls = kind === 'math' ? 'scribe-idocs__math scribe-idocs__math--block' : kind === 'diagram' ? 'scribe-idocs__diagram' : 'scribe-idocs__code';
    return <div ref={ref as RefObject<HTMLDivElement>} className={cls} data-lang={lang} data-latex={kind === 'math' ? src : undefined} />;
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
