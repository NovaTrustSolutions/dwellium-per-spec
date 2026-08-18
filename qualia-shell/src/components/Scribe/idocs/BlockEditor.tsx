/**
 * BlockEditor — small form editors per block type. Controlled: receives the
 * block, emits a replacement via onChange. Plain inputs/textareas only.
 */
import { useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { fileToDataUrl, downscaleImageDataUrl } from '../../../lib/imageDownscale';
import { embedSrcFor } from './idocsAi';
import type { Block, BlockTone, ChartKind } from './idocTypes';

interface Props { block: Block; onChange: (b: Block) => void }

const TONES: BlockTone[] = ['info', 'success', 'warning', 'danger'];
const KINDS: ChartKind[] = ['bar', 'line', 'pie'];

/** Image file → downscaled data URL (bounded payload for localStorage). */
async function fileToImageSrc(file: File): Promise<string> {
    const raw = await fileToDataUrl(file);
    try { return await downscaleImageDataUrl(raw, 1280, 0.85); } catch { return raw; }
}

function ImagePicker({ value, onChange }: { value: string; onChange: (src: string) => void }) {
    const [busy, setBusy] = useState(false);
    const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        try { onChange(await fileToImageSrc(f)); } finally { setBusy(false); e.target.value = ''; }
    };
    return (
        <div className="scribe-idocs__row">
            <input type="url" placeholder="https://… image URL" value={value.startsWith('data:') ? '' : value} onChange={(e) => onChange(e.target.value)} />
            <label className="scribe-idocs__filebtn">{busy ? '…' : value.startsWith('data:') ? 'Replace file' : 'Upload'}<input type="file" accept="image/*" onChange={(e) => void onFile(e)} hidden /></label>
        </div>
    );
}

function ItemList<T extends object>({ items, onChange, render, blank, label }: {
    items: T[]; onChange: (items: T[]) => void; render: (item: T, set: (patch: Partial<T>) => void) => ReactNode; blank: T; label: string;
}) {
    const set = (i: number, patch: Partial<T>) => onChange(items.map((it, k) => (k === i ? { ...it, ...patch } : it)));
    const remove = (i: number) => onChange(items.filter((_, k) => k !== i));
    const move = (i: number, d: number) => { const j = i + d; if (j < 0 || j >= items.length) return; const n = items.slice(); [n[i], n[j]] = [n[j], n[i]]; onChange(n); };
    return (
        <div className="scribe-idocs__items">
            {items.map((it, i) => (
                <div key={i} className="scribe-idocs__item">
                    <div className="scribe-idocs__item-body">{render(it, (p) => set(i, p))}</div>
                    <div className="scribe-idocs__item-tools">
                        <button type="button" onClick={() => move(i, -1)} aria-label="Move up">↑</button>
                        <button type="button" onClick={() => move(i, 1)} aria-label="Move down">↓</button>
                        <button type="button" onClick={() => remove(i)} aria-label="Remove">✕</button>
                    </div>
                </div>
            ))}
            <button type="button" className="scribe-idocs__minibtn" onClick={() => onChange([...items, blank])}>+ {label}</button>
        </div>
    );
}

export default function BlockEditor({ block, onChange }: Props) {
    const up = (patch: Partial<Block>) => onChange({ ...block, ...patch } as Block);
    switch (block.type) {
        case 'heading': return (
            <div className="scribe-idocs__row">
                <select value={block.level} onChange={(e) => up({ level: Number(e.target.value) as 1 | 2 | 3 })} aria-label="Heading level">
                    <option value={1}>H1</option><option value={2}>H2</option><option value={3}>H3</option>
                </select>
                <input value={block.text} onChange={(e) => up({ text: e.target.value })} placeholder="Heading text" aria-label="Heading text" />
            </div>
        );
        case 'text': return <textarea rows={4} value={block.md} onChange={(e) => up({ md: e.target.value })} placeholder="Markdown…" aria-label="Text (markdown)" />;
        case 'callout': return (
            <>
                <div className="scribe-idocs__row">
                    {TONES.map((t) => <button key={t} type="button" className={`scribe-idocs__chip${block.tone === t ? ' is-active' : ''}`} onClick={() => up({ tone: t })}>{t}</button>)}
                </div>
                <textarea rows={3} value={block.md} onChange={(e) => up({ md: e.target.value })} aria-label="Callout (markdown)" />
            </>
        );
        case 'quote': return (
            <>
                <textarea rows={3} value={block.md} onChange={(e) => up({ md: e.target.value })} aria-label="Quote (markdown)" />
                <input value={block.cite ?? ''} onChange={(e) => up({ cite: e.target.value })} placeholder="Attribution (optional)" aria-label="Attribution" />
            </>
        );
        case 'image': return (
            <>
                <ImagePicker value={block.src} onChange={(src) => up({ src })} />
                <div className="scribe-idocs__row">
                    <input value={block.alt ?? ''} onChange={(e) => up({ alt: e.target.value })} placeholder="Alt text" aria-label="Alt text" />
                    <input value={block.caption ?? ''} onChange={(e) => up({ caption: e.target.value })} placeholder="Caption" aria-label="Caption" />
                </div>
            </>
        );
        case 'gallery': return (
            <ItemList items={block.images} onChange={(images) => up({ images })} blank={{ src: '', alt: '' }} label="image"
                render={(im, set) => (
                    <>
                        <ImagePicker value={im.src} onChange={(src) => set({ src })} />
                        <input value={im.alt ?? ''} onChange={(e) => set({ alt: e.target.value })} placeholder="Alt text" aria-label="Alt text" />
                    </>
                )} />
        );
        case 'embed': {
            const info = embedSrcFor(block.url);
            return (
                <>
                    <input type="url" value={block.url} onChange={(e) => up({ url: e.target.value, provider: embedSrcFor(e.target.value)?.provider })} placeholder="https://youtube.com/watch?v=… · figma · docs.google.com · maps · loom · …" aria-label="Embed URL" />
                    <small className="scribe-idocs__hint">{block.url ? (info ? `Provider: ${info.provider} (${info.aspect})` : 'Unsupported or non-http URL') : 'YouTube, Vimeo, Loom, Figma, Google Docs/Sheets/Slides/Maps, Airtable, Miro, Spotify, Calendly, Typeform, PDF, any https page'}</small>
                </>
            );
        }
        case 'chart': return (
            <>
                <div className="scribe-idocs__row">
                    {KINDS.map((k) => <button key={k} type="button" className={`scribe-idocs__chip${block.kind === k ? ' is-active' : ''}`} onClick={() => up({ kind: k })}>{k}</button>)}
                    <input value={block.title ?? ''} onChange={(e) => up({ title: e.target.value })} placeholder="Chart title" aria-label="Chart title" />
                </div>
                <ItemList items={block.data} onChange={(data) => up({ data })} blank={{ label: '', value: 0 }} label="data point"
                    render={(d, set) => (
                        <div className="scribe-idocs__row">
                            <input value={d.label} onChange={(e) => set({ label: e.target.value })} placeholder="Label" aria-label="Label" />
                            <input type="number" value={d.value} onChange={(e) => set({ value: Number(e.target.value) || 0 })} aria-label="Value" style={{ maxWidth: 110 }} />
                        </div>
                    )} />
            </>
        );
        case 'table': {
            const setCell = (r: number, c: number, v: string) => up({ rows: block.rows.map((row, i) => (i === r ? row.map((x, j) => (j === c ? v : x)) : row)) });
            const setHeader = (c: number, v: string) => up({ headers: block.headers.map((h, j) => (j === c ? v : h)) });
            const addCol = () => up({ headers: [...block.headers, `Column ${block.headers.length + 1}`], rows: block.rows.map((r) => [...r, '']) });
            const delCol = () => block.headers.length > 1 && up({ headers: block.headers.slice(0, -1), rows: block.rows.map((r) => r.slice(0, -1)) });
            const addRow = () => up({ rows: [...block.rows, block.headers.map(() => '')] });
            const delRow = (i: number) => up({ rows: block.rows.filter((_, k) => k !== i) });
            return (
                <div className="scribe-idocs__tablegrid" style={{ '--cols': block.headers.length } as CSSProperties}>
                    {block.headers.map((h, c) => <input key={`h${c}`} className="is-head" value={h} onChange={(e) => setHeader(c, e.target.value)} aria-label={`Header ${c + 1}`} />)}
                    <span />
                    {block.rows.map((row, r) => (
                        <div key={r} className="scribe-idocs__tablerow">
                            {row.map((cell, c) => <input key={c} value={cell} onChange={(e) => setCell(r, c, e.target.value)} aria-label={`Row ${r + 1} col ${c + 1}`} />)}
                            <button type="button" onClick={() => delRow(r)} aria-label="Delete row">✕</button>
                        </div>
                    ))}
                    <div className="scribe-idocs__row">
                        <button type="button" className="scribe-idocs__minibtn" onClick={addRow}>+ row</button>
                        <button type="button" className="scribe-idocs__minibtn" onClick={addCol}>+ column</button>
                        <button type="button" className="scribe-idocs__minibtn" onClick={delCol}>− column</button>
                    </div>
                </div>
            );
        }
        case 'accordion':
        case 'tabs': return (
            <ItemList items={block.items} onChange={(items) => up({ items })} blank={{ title: 'Item', md: '' }} label={block.type === 'tabs' ? 'tab' : 'section'}
                render={(it, set) => (
                    <>
                        <input value={it.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Title" />
                        <textarea rows={2} value={it.md} onChange={(e) => set({ md: e.target.value })} placeholder="Markdown…" aria-label="Content" />
                    </>
                )} />
        );
        case 'columns': return (
            <>
                <div className="scribe-idocs__row">
                    <span className="scribe-idocs__hint">{block.columns.length} columns</span>
                    <button type="button" className="scribe-idocs__minibtn" disabled={block.columns.length >= 3} onClick={() => up({ columns: [...block.columns, ''] })}>+ column</button>
                    <button type="button" className="scribe-idocs__minibtn" disabled={block.columns.length <= 2} onClick={() => up({ columns: block.columns.slice(0, -1) })}>− column</button>
                </div>
                <div className="scribe-idocs__row scribe-idocs__row--stretch">
                    {block.columns.map((c, i) => <textarea key={i} rows={4} value={c} onChange={(e) => up({ columns: block.columns.map((x, k) => (k === i ? e.target.value : x)) })} aria-label={`Column ${i + 1}`} />)}
                </div>
            </>
        );
        case 'button': return (
            <div className="scribe-idocs__row">
                <input value={block.label} onChange={(e) => up({ label: e.target.value })} placeholder="Label" aria-label="Button label" />
                <input type="url" value={block.href} onChange={(e) => up({ href: e.target.value })} placeholder="https://…" aria-label="Button link" />
                <select value={block.variant} onChange={(e) => up({ variant: e.target.value as 'primary' | 'secondary' })} aria-label="Variant"><option value="primary">primary</option><option value="secondary">secondary</option></select>
            </div>
        );
        case 'code': return (
            <>
                <input value={block.lang} onChange={(e) => up({ lang: e.target.value })} placeholder="language" aria-label="Language" style={{ maxWidth: 140 }} />
                <textarea rows={5} className="is-mono" value={block.code} onChange={(e) => up({ code: e.target.value })} aria-label="Code" spellCheck={false} />
            </>
        );
        case 'divider': return <small className="scribe-idocs__hint">Horizontal rule — nothing to edit.</small>;
        case 'timeline': return (
            <ItemList items={block.items} onChange={(items) => up({ items })} blank={{ date: '', title: '', md: '' }} label="event"
                render={(it, set) => (
                    <>
                        <div className="scribe-idocs__row">
                            <input value={it.date} onChange={(e) => set({ date: e.target.value })} placeholder="Date" aria-label="Date" style={{ maxWidth: 140 }} />
                            <input value={it.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Title" />
                        </div>
                        <textarea rows={2} value={it.md} onChange={(e) => set({ md: e.target.value })} placeholder="Details (markdown)" aria-label="Details" />
                    </>
                )} />
        );
        case 'quiz': return (
            <>
                <input value={block.question} onChange={(e) => up({ question: e.target.value })} placeholder="Question" aria-label="Question" />
                <div className="scribe-idocs__items">
                    {block.options.map((o, i) => (
                        <div key={i} className="scribe-idocs__row">
                            <input type="radio" name={`ans-${block.id}`} checked={block.answerIndex === i} onChange={() => up({ answerIndex: i })} aria-label={`Mark option ${i + 1} correct`} />
                            <input value={o} onChange={(e) => up({ options: block.options.map((x, k) => (k === i ? e.target.value : x)) })} aria-label={`Option ${i + 1}`} />
                            <button type="button" onClick={() => up({ options: block.options.filter((_, k) => k !== i), answerIndex: Math.max(0, Math.min(block.answerIndex, block.options.length - 2)) })} aria-label="Remove option" disabled={block.options.length <= 2}>✕</button>
                        </div>
                    ))}
                    <button type="button" className="scribe-idocs__minibtn" onClick={() => up({ options: [...block.options, `Option ${block.options.length + 1}`] })}>+ option</button>
                </div>
                <input value={block.explanation ?? ''} onChange={(e) => up({ explanation: e.target.value })} placeholder="Explanation shown after answering (optional)" aria-label="Explanation" />
            </>
        );
        case 'toc': return <small className="scribe-idocs__hint">Table of contents — lists all card titles automatically.</small>;
    }
}
