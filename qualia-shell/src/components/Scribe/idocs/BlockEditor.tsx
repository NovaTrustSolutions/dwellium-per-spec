/**
 * BlockEditor — small form editors per block type. Controlled: receives the
 * block, emits a replacement via onChange. Plain inputs/textareas only.
 *
 * Card-level editors exported for the editor's card header bar (mounted by IDocEditor):
 *   <CardBackgroundEditor card={card} onChange={(patch: Partial<Card>) => …} />
 *     — color / image (URL · Upload · AI · Stock · Placeholder) / overlay / intensity 0–100 / align.
 *       Emits `{ background: CardBackground | undefined }` patches (undefined when everything is cleared).
 *   <CardFootnotesEditor card={card} onChange={(patch: Partial<Card>) => …} />
 *     — ordered footnote list; reference from any markdown block with `[^n]` (1-based).
 *       Emits `{ footnotes: Footnote[] }` patches.
 *   <CardHeaderImageEditor card={card} onChange={(patch: Partial<Card>) => …} />   (Wave 2)
 *     — the full ImagePicker for `card.headerImage` (hero / split / image-top). Emits `{ headerImage: string | undefined }`.
 *   <ImagePicker value={src} onChange={(src, meta?) => …} />                          (Wave 2, exported)
 *     — tabs URL / Upload / AI (DALL·E · Gemini via the user's keys) / Stock (Openverse; Unsplash + Giphy once a key
 *       is saved to localStorage['scribe-idocs:media-keys']) / Placeholder (picsum). `meta` = { title?, attribution? }.
 *
 * Wave 2 image options live in `block.imgOpts?: { fit?: 'cover'|'contain'; focal?: string; ratio?: '16:9'|'4:3'|'1:1' }`
 * (inline-cast — idocTypes.ts is not touched; the renderer/export read it defensively). Chart `autoSync?: boolean` likewise.
 */
import { useState, type ChangeEvent, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { fileToDataUrl, downscaleImageDataUrl } from '../../../lib/imageDownscale';
import { useIntegrations } from '../../../hooks/useIntegrations';
import { embedSrcFor } from './idocsAi';
import { newId, type Block, type BlockTone, type Card, type CardBackground, type ChartKind } from './idocTypes';
import { IMAGE_SIZES, IMAGE_STYLES, generateImageDataUrl, hasImageGenKey, type ImageSize, type ImageStyle } from './blocks/aiImage';
import { attributionFor, loadMediaKeys, picsumUrl, saveMediaKeys, searchGiphy, searchOpenverse, searchUnsplash, type MediaKeys, type StockImage, type StockSource } from './blocks/imageSources';
import { fetchChartData } from './blocks/chartData';
import type { ChartBlockW2, ImageBlockW2, ImgOpts } from './blocks/imageOpts';

interface Props { block: Block; onChange: (b: Block) => void }

const TONES: BlockTone[] = ['info', 'success', 'warning', 'danger'];
const KINDS: ChartKind[] = ['bar', 'line', 'area', 'pie', 'donut'];
const OVERLAYS: NonNullable<CardBackground['overlay']>[] = ['none', 'frosted', 'faded', 'clear'];
const ALIGNS: NonNullable<CardBackground['align']>[] = ['top', 'center', 'bottom'];
const RATIOS: NonNullable<ImgOpts['ratio']>[] = ['16:9', '4:3', '1:1'];

/** Image file → downscaled data URL (bounded payload for localStorage). */
async function fileToImageSrc(file: File): Promise<string> {
    const raw = await fileToDataUrl(file);
    try { return await downscaleImageDataUrl(raw, 1280, 0.85); } catch { return raw; }
}

export interface PickMeta { title?: string; attribution?: string }
type PickTab = 'url' | 'upload' | 'ai' | 'stock' | 'placeholder';
const PICK_TABS: { id: PickTab; label: string }[] = [{ id: 'url', label: 'URL' }, { id: 'upload', label: 'Upload' }, { id: 'ai', label: 'AI ✨' }, { id: 'stock', label: 'Stock' }, { id: 'placeholder', label: 'Placeholder' }];

export function ImagePicker({ value, onChange }: { value: string; onChange: (src: string, meta?: PickMeta) => void }) {
    const [tab, setTab] = useState<PickTab>(value.startsWith('data:') ? 'upload' : 'url');
    const [busy, setBusy] = useState(false);
    const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setBusy(true);
        try { onChange(await fileToImageSrc(f)); } finally { setBusy(false); e.target.value = ''; }
    };
    return (
        <div className="scribe-idocs__picker" role="group" aria-label="Image source">
            <div className="scribe-idocs__row scribe-idocs__picker-tabs" role="tablist">
                {PICK_TABS.map((t) => <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`scribe-idocs__chip${tab === t.id ? ' is-active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
                {value && <button type="button" className="scribe-idocs__minibtn" onClick={() => onChange('')} aria-label="Clear image">clear</button>}
            </div>
            {tab === 'url' && <input type="url" placeholder="https://… image URL" value={value.startsWith('data:') ? '' : value} onChange={(e) => onChange(e.target.value)} aria-label="Image URL" />}
            {tab === 'upload' && (
                <div className="scribe-idocs__row">
                    <label className="scribe-idocs__filebtn">{busy ? '…' : value.startsWith('data:') ? 'Replace file' : 'Upload'}<input type="file" accept="image/*" onChange={(e) => void onFile(e)} hidden /></label>
                    {value.startsWith('data:') && <small className="scribe-idocs__hint">Stored inline (downscaled to ≤1280px).</small>}
                </div>
            )}
            {tab === 'ai' && <AiImageTab onPick={onChange} />}
            {tab === 'stock' && <StockTab onPick={onChange} />}
            {tab === 'placeholder' && <PlaceholderTab onPick={onChange} />}
        </div>
    );
}

function AiImageTab({ onPick }: { onPick: (src: string, meta?: PickMeta) => void }) {
    const { integrations } = useIntegrations();
    const [prompt, setPrompt] = useState('');
    const [style, setStyle] = useState<ImageStyle>('photo');
    const [size, setSize] = useState<ImageSize>('wide');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const ready = hasImageGenKey(integrations.llm);
    const go = async () => {
        setBusy(true); setErr('');
        try { onPick(await generateImageDataUrl(prompt, { style, size, llm: integrations.llm }), { title: prompt.trim() }); }
        catch (e) { setErr((e as Error)?.message || String(e)); }
        finally { setBusy(false); }
    };
    return (
        <div className="scribe-idocs__picker-pane">
            <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Describe the image…" aria-label="Image prompt" onKeyDown={(e) => { if (e.key === 'Enter' && ready && !busy) void go(); }} />
            <div className="scribe-idocs__row">
                <select value={style} onChange={(e) => setStyle(e.target.value as ImageStyle)} aria-label="Style">{IMAGE_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <select value={size} onChange={(e) => setSize(e.target.value as ImageSize)} aria-label="Size">{IMAGE_SIZES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select>
                <button type="button" className="scribe-idocs__minibtn" disabled={!ready || busy || !prompt.trim()} onClick={() => void go()}>{busy ? 'Generating…' : 'Generate with AI'}</button>
            </div>
            {!ready && <small className="scribe-idocs__hint">Needs an OpenAI (DALL·E 3) or Gemini key — Control Panel → API Keys.</small>}
            {err && <small className="scribe-idocs__hint scribe-idocs__hint--err" role="alert">{err}</small>}
        </div>
    );
}

const STOCK_SOURCES: { id: StockSource; label: string; keyed: boolean }[] = [{ id: 'openverse', label: 'Openverse', keyed: false }, { id: 'unsplash', label: 'Unsplash', keyed: true }, { id: 'giphy', label: 'Giphy', keyed: true }];

function StockTab({ onPick }: { onPick: (src: string, meta?: PickMeta) => void }) {
    const [keys, setKeys] = useState<MediaKeys>(() => loadMediaKeys());
    const [source, setSource] = useState<StockSource>('openverse');
    const [q, setQ] = useState('');
    const [keyDraft, setKeyDraft] = useState('');
    const [items, setItems] = useState<StockImage[]>([]);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const keyFor = (s: StockSource) => (s === 'unsplash' ? keys.unsplash : s === 'giphy' ? keys.giphy : 'x');
    const needsKey = !keyFor(source);
    const search = async () => {
        if (!q.trim()) return;
        setBusy(true); setErr('');
        try {
            const res = source === 'openverse' ? await searchOpenverse(q) : source === 'unsplash' ? await searchUnsplash(q, keys.unsplash ?? '') : await searchGiphy(q, keys.giphy ?? '');
            setItems(res);
            if (!res.length) setErr('No results.');
        } catch (e) { setItems([]); setErr((e as Error)?.message || String(e)); }
        finally { setBusy(false); }
    };
    const saveKey = () => {
        const next = { ...keys, [source]: keyDraft.trim() || undefined } as MediaKeys;
        saveMediaKeys(next); setKeys(next); setKeyDraft('');
    };
    return (
        <div className="scribe-idocs__picker-pane">
            <div className="scribe-idocs__row">
                {STOCK_SOURCES.map((s) => <button key={s.id} type="button" className={`scribe-idocs__chip${source === s.id ? ' is-active' : ''}`} onClick={() => { setSource(s.id); setItems([]); setErr(''); }}>{s.label}{s.keyed && !keyFor(s.id) ? ' 🔑' : ''}</button>)}
            </div>
            {needsKey ? (
                <div className="scribe-idocs__row">
                    <input type="password" value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} placeholder={`${source === 'unsplash' ? 'Unsplash access key' : 'Giphy API key'} (stored in this browser only)`} aria-label={`${source} key`} />
                    <button type="button" className="scribe-idocs__minibtn" disabled={!keyDraft.trim()} onClick={saveKey}>Save key</button>
                </div>
            ) : (
                <div className="scribe-idocs__row">
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={source === 'giphy' ? 'Search GIFs…' : 'Search photos…'} aria-label="Stock search" onKeyDown={(e) => { if (e.key === 'Enter') void search(); }} />
                    <button type="button" className="scribe-idocs__minibtn" disabled={busy || !q.trim()} onClick={() => void search()}>{busy ? '…' : 'Search'}</button>
                    {source !== 'openverse' && <button type="button" className="scribe-idocs__minibtn" onClick={() => { const next = { ...keys, [source]: undefined } as MediaKeys; saveMediaKeys(next); setKeys(next); }} title="Forget key">forget key</button>}
                </div>
            )}
            {err && <small className="scribe-idocs__hint" role="status">{err}</small>}
            {items.length > 0 && (
                <div className="scribe-idocs__stockgrid">
                    {items.map((im, i) => (
                        <button key={`${im.source}-${i}`} type="button" className="scribe-idocs__stockitem" onClick={() => onPick(im.url, { title: im.title, attribution: attributionFor(im) })} title={`${im.title || 'Untitled'} — ${attributionFor(im)}`}>
                            <img src={im.thumb} alt={im.title || ''} loading="lazy" />
                            <span>{im.creator || im.title || im.license}</span>
                        </button>
                    ))}
                </div>
            )}
            <small className="scribe-idocs__hint">{source === 'openverse' ? 'CC-licensed images from Openverse (no key needed). Attribution is written into the caption.' : source === 'unsplash' ? 'Unsplash License — credit is written into the caption.' : 'GIFs via GIPHY.'}</small>
        </div>
    );
}

function PlaceholderTab({ onPick }: { onPick: (src: string, meta?: PickMeta) => void }) {
    const [w, setW] = useState(1200); const [h, setH] = useState(675); const [seed, setSeed] = useState('');
    return (
        <div className="scribe-idocs__row">
            <input type="number" value={w} min={16} onChange={(e) => setW(Number(e.target.value) || 800)} aria-label="Width" style={{ maxWidth: 90 }} />
            <span>×</span>
            <input type="number" value={h} min={16} onChange={(e) => setH(Number(e.target.value) || 450)} aria-label="Height" style={{ maxWidth: 90 }} />
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="seed (optional)" aria-label="Seed" style={{ maxWidth: 140 }} />
            <button type="button" className="scribe-idocs__minibtn" onClick={() => onPick(picsumUrl(w, h, seed || undefined), { title: 'Placeholder' })}>Use placeholder</button>
        </div>
    );
}

/** Wave 2: fill/fit toggle + crop ratio + click-to-set focal point. */
function ImageOptsEditor({ src, opts, onChange }: { src: string; opts: ImgOpts; onChange: (o: ImgOpts | undefined) => void }) {
    const set = (patch: Partial<ImgOpts>) => {
        const next: ImgOpts = { ...opts, ...patch };
        (Object.keys(next) as (keyof ImgOpts)[]).forEach((k) => { if (next[k] === undefined) delete next[k]; });
        onChange(Object.keys(next).length ? next : undefined);
    };
    const onFocal = (e: MouseEvent<HTMLButtonElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)));
        const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)));
        set({ focal: `${x}% ${y}%` });
    };
    if (!src) return null;
    return (
        <div className="scribe-idocs__imgopts">
            <div className="scribe-idocs__row">
                <span className="scribe-idocs__hint">Crop</span>
                <button type="button" className={`scribe-idocs__chip${!opts.ratio ? ' is-active' : ''}`} onClick={() => set({ ratio: undefined })}>free</button>
                {RATIOS.map((r) => <button key={r} type="button" className={`scribe-idocs__chip${opts.ratio === r ? ' is-active' : ''}`} onClick={() => set({ ratio: r })}>{r}</button>)}
                <span className="scribe-idocs__hint">·</span>
                <button type="button" className={`scribe-idocs__chip${(opts.fit ?? 'cover') === 'cover' ? ' is-active' : ''}`} onClick={() => set({ fit: 'cover' })} disabled={!opts.ratio}>fill</button>
                <button type="button" className={`scribe-idocs__chip${opts.fit === 'contain' ? ' is-active' : ''}`} onClick={() => set({ fit: 'contain' })} disabled={!opts.ratio}>fit</button>
                {opts.focal && <button type="button" className="scribe-idocs__minibtn" onClick={() => set({ focal: undefined })}>reset focal</button>}
            </div>
            <button type="button" className="scribe-idocs__focal" title="Click to set the focal point" aria-label="Set focal point (click on the image)" onClick={onFocal}>
                <img src={src} alt="" />
                <i style={{ left: opts.focal?.split(' ')[0] ?? '50%', top: opts.focal?.split(' ')[1] ?? '50%' }} aria-hidden="true" />
            </button>
            <small className="scribe-idocs__hint">Click the preview to set the focal point{opts.focal ? ` (${opts.focal})` : ''}. Crop ratios frame the image; “fill” crops around the focal point, “fit” letterboxes.</small>
        </div>
    );
}

/** Wave 2 chart data source (CSV / Google Sheet URL) + sync + auto-refresh. */
function ChartSourceEditor({ block, onChange }: { block: ChartBlockW2; onChange: (patch: Partial<ChartBlockW2>) => void }) {
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const sync = async () => {
        if (!block.sourceUrl) return;
        setBusy(true); setErr('');
        try { onChange({ data: await fetchChartData(block.sourceUrl), syncedAt: new Date().toISOString() }); }
        catch (e) { setErr((e as Error)?.message || String(e)); }
        finally { setBusy(false); }
    };
    return (
        <div className="scribe-idocs__chartsrc">
            <div className="scribe-idocs__row">
                <input type="url" value={block.sourceUrl ?? ''} onChange={(e) => onChange({ sourceUrl: e.target.value || undefined })} placeholder="Data source URL — raw CSV or Google Sheet link" aria-label="Data source URL" />
                <button type="button" className="scribe-idocs__minibtn" disabled={busy || !block.sourceUrl} onClick={() => void sync()}>{busy ? 'Syncing…' : 'Sync now'}</button>
                <label className="scribe-idocs__inline"><input type="checkbox" checked={!!block.autoSync} disabled={!block.sourceUrl} onChange={(e) => onChange({ autoSync: e.target.checked || undefined })} /> Auto-refresh on open</label>
            </div>
            <small className={`scribe-idocs__hint${err ? ' scribe-idocs__hint--err' : ''}`} role={err ? 'alert' : undefined}>
                {err || (block.syncedAt ? `Synced ${new Date(block.syncedAt).toLocaleString()}` : 'First text column → label, first numeric column → value. Google Sheets: share “Anyone with the link” or Publish to web.')}
            </small>
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
        case 'image': {
            const b = block as ImageBlockW2;
            return (
                <>
                    <ImagePicker value={b.src} onChange={(src, meta) => onChange({ ...b, src, alt: b.alt || meta?.title || b.alt, caption: b.caption || meta?.attribution || b.caption } as Block)} />
                    <div className="scribe-idocs__row">
                        <input value={b.alt ?? ''} onChange={(e) => up({ alt: e.target.value })} placeholder="Alt text" aria-label="Alt text" />
                        <input value={b.caption ?? ''} onChange={(e) => up({ caption: e.target.value })} placeholder="Caption" aria-label="Caption" />
                    </div>
                    <ImageOptsEditor src={b.src} opts={b.imgOpts ?? {}} onChange={(imgOpts) => onChange({ ...b, imgOpts } as Block)} />
                </>
            );
        }
        case 'gallery': return (
            <ItemList items={block.images} onChange={(images) => up({ images })} blank={{ src: '', alt: '' }} label="image"
                render={(im, set) => (
                    <>
                        <ImagePicker value={im.src} onChange={(src, meta) => set({ src, alt: im.alt || meta?.title || im.alt })} />
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
                <ChartSourceEditor block={block as ChartBlockW2} onChange={(patch) => onChange({ ...block, ...patch } as Block)} />
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
                <input value={block.href} onChange={(e) => up({ href: e.target.value })} placeholder="https://… or #card:<card-id>" aria-label="Button link" />
                <select value={block.variant} onChange={(e) => up({ variant: e.target.value as 'primary' | 'secondary' })} aria-label="Variant"><option value="primary">primary</option><option value="secondary">secondary</option></select>
                <small className="scribe-idocs__hint">Use <code>#card:&lt;id&gt;</code> to jump to a card in this doc.</small>
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
        case 'steps': return (
            <>
                <label className="scribe-idocs__inline"><input type="checkbox" checked={block.numbered !== false} onChange={(e) => up({ numbered: e.target.checked })} /> Numbered</label>
                <ItemList items={block.items} onChange={(items) => up({ items })} blank={{ title: 'Step', md: '' }} label="step"
                    render={(it, set) => (
                        <>
                            <input value={it.title} onChange={(e) => set({ title: e.target.value })} placeholder="Step title" aria-label="Step title" />
                            <textarea rows={2} value={it.md} onChange={(e) => set({ md: e.target.value })} placeholder="Details (markdown)" aria-label="Step details" />
                        </>
                    )} />
            </>
        );
        case 'funnel': return (
            <ItemList items={block.items} onChange={(items) => up({ items })} blank={{ label: 'Stage', value: 50 }} label="stage"
                render={(it, set) => (
                    <div className="scribe-idocs__row">
                        <input value={it.label} onChange={(e) => set({ label: e.target.value })} placeholder="Stage" aria-label="Stage label" />
                        <input type="number" value={it.value ?? ''} onChange={(e) => set({ value: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="Value" aria-label="Stage value" style={{ maxWidth: 110 }} />
                    </div>
                )} />
        );
        case 'boxes': return (
            <>
                <div className="scribe-idocs__row">
                    <span className="scribe-idocs__hint">Columns</span>
                    {([2, 3, 4] as const).map((n) => <button key={n} type="button" className={`scribe-idocs__chip${(block.columns ?? 3) === n ? ' is-active' : ''}`} onClick={() => up({ columns: n })}>{n}</button>)}
                </div>
                <ItemList items={block.items} onChange={(items) => up({ items })} blank={{ title: 'Box', md: '' }} label="box"
                    render={(it, set) => (
                        <>
                            <div className="scribe-idocs__row">
                                <input value={it.title} onChange={(e) => set({ title: e.target.value })} placeholder="Title" aria-label="Box title" />
                                <label className="scribe-idocs__inline"><input type="checkbox" checked={!!it.emphasis} onChange={(e) => set({ emphasis: e.target.checked })} /> Emphasize</label>
                            </div>
                            <textarea rows={2} value={it.md} onChange={(e) => set({ md: e.target.value })} placeholder="Markdown…" aria-label="Box content" />
                        </>
                    )} />
            </>
        );
        case 'math': return (
            <>
                <textarea rows={2} className="is-mono" value={block.latex} onChange={(e) => up({ latex: e.target.value })} placeholder="LaTeX, e.g. \\frac{a}{b}" aria-label="LaTeX" spellCheck={false} />
                <label className="scribe-idocs__inline"><input type="checkbox" checked={!!block.inline} onChange={(e) => up({ inline: e.target.checked })} /> Inline</label>
            </>
        );
        case 'diagram': return (
            <>
                <textarea rows={6} className="is-mono" value={block.mermaid} onChange={(e) => up({ mermaid: e.target.value })} placeholder={"flowchart LR\n  A --> B"} aria-label="Mermaid source" spellCheck={false} />
                <small className="scribe-idocs__hint">Mermaid syntax (flowchart, sequenceDiagram, gantt, pie, …). Renders via CDN; falls back to source text offline.</small>
            </>
        );
        case 'qr': return (
            <div className="scribe-idocs__row">
                <input type="url" value={block.url} onChange={(e) => up({ url: e.target.value })} placeholder="https://…" aria-label="QR URL" />
                <input value={block.caption ?? ''} onChange={(e) => up({ caption: e.target.value })} placeholder="Caption (optional)" aria-label="QR caption" />
            </div>
        );
    }
}

/** Card background editor — see the file header for the contract. */
export function CardBackgroundEditor({ card, onChange }: { card: Card; onChange: (patch: Partial<Card>) => void }) {
    const bg = card.background ?? {};
    const set = (patch: Partial<CardBackground>) => {
        const next: CardBackground = { ...bg, ...patch };
        (Object.keys(next) as (keyof CardBackground)[]).forEach((k) => { if (next[k] === undefined || next[k] === '') delete next[k]; });
        onChange({ background: Object.keys(next).length ? next : undefined });
    };
    return (
        <div className="scribe-idocs__cardbg" role="group" aria-label="Card background">
            <div className="scribe-idocs__row">
                <label className="scribe-idocs__inline">Color
                    <input type="color" value={bg.color && /^#[0-9a-f]{6}$/i.test(bg.color) ? bg.color : '#ffffff'} onChange={(e) => set({ color: e.target.value })} aria-label="Background color" />
                </label>
                {bg.color && <button type="button" className="scribe-idocs__minibtn" onClick={() => set({ color: undefined })}>clear color</button>}
            </div>
            <ImagePicker value={bg.image ?? ''} onChange={(image) => set({ image: image || undefined })} />
            {bg.image && (
                <div className="scribe-idocs__row">
                    <select value={bg.overlay ?? 'faded'} onChange={(e) => set({ overlay: e.target.value as CardBackground['overlay'] })} aria-label="Overlay">
                        {OVERLAYS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                    <label className="scribe-idocs__inline">Intensity
                        <input type="range" min={0} max={100} value={bg.intensity ?? 60} onChange={(e) => set({ intensity: Number(e.target.value) })} aria-label="Overlay intensity" />
                        <span>{bg.intensity ?? 60}</span>
                    </label>
                    <select value={bg.align ?? 'center'} onChange={(e) => set({ align: e.target.value as CardBackground['align'] })} aria-label="Image alignment">
                        {ALIGNS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
            )}
        </div>
    );
}

/** Card header image editor (Wave 2) — see the file header for the contract. */
export function CardHeaderImageEditor({ card, onChange }: { card: Card; onChange: (patch: Partial<Card>) => void }) {
    return (
        <div className="scribe-idocs__cardbg" role="group" aria-label="Card header image">
            <ImagePicker value={card.headerImage ?? ''} onChange={(headerImage) => onChange({ headerImage: headerImage || undefined })} />
        </div>
    );
}

/** Card footnotes editor — see the file header for the contract. */
export function CardFootnotesEditor({ card, onChange }: { card: Card; onChange: (patch: Partial<Card>) => void }) {
    const items = card.footnotes ?? [];
    return (
        <div className="scribe-idocs__cardfn" role="group" aria-label="Footnotes">
            <ItemList items={items} onChange={(footnotes) => onChange({ footnotes })} blank={{ id: newId('fn'), text: '' }} label="footnote"
                render={(f, set) => <input value={f.text} onChange={(e) => set({ text: e.target.value })} placeholder={`Footnote text — reference with [^${items.indexOf(f) + 1}]`} aria-label="Footnote text" />} />
        </div>
    );
}
