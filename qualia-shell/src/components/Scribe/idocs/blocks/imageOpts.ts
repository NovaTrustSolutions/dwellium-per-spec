/**
 * imageOpts — Wave 2 image display options carried on an image block as
 * `imgOpts?` (inline-cast; idocTypes.ts untouched). Shared by BlockEditor
 * (edit), IDocRenderer (style) and idocExport (inline CSS string).
 *
 *   ratio  → frame the image at 16:9 / 4:3 / 1:1 (absent = natural size)
 *   fit    → 'cover' (fill, crops around `focal`) | 'contain' (letterbox); only meaningful with `ratio`
 *   focal  → object-position, e.g. "30% 60%" (click-to-set in the editor)
 */
import type { CSSProperties } from 'react';
import type { Block } from '../idocTypes';

export interface ImgOpts { fit?: 'cover' | 'contain'; focal?: string; ratio?: '16:9' | '4:3' | '1:1' }
export type ImageBlockW2 = Extract<Block, { type: 'image' }> & { imgOpts?: ImgOpts };
export type ChartBlockW2 = Extract<Block, { type: 'chart' }> & { autoSync?: boolean };

const FOCAL_RE = /^\d{1,3}%\s\d{1,3}%$/;
const RATIOS = new Set(['16:9', '4:3', '1:1']);

/** Defensive read — tolerates hand-edited JSON. */
export function imgOptsOf(block: Block): ImgOpts | undefined {
    const raw = (block as ImageBlockW2).imgOpts;
    if (!raw || typeof raw !== 'object') return undefined;
    const o: ImgOpts = {};
    if (raw.fit === 'cover' || raw.fit === 'contain') o.fit = raw.fit;
    if (typeof raw.focal === 'string' && FOCAL_RE.test(raw.focal)) o.focal = raw.focal;
    if (typeof raw.ratio === 'string' && RATIOS.has(raw.ratio)) o.ratio = raw.ratio;
    return Object.keys(o).length ? o : undefined;
}

export function imgOptsStyle(o: ImgOpts | undefined): CSSProperties | undefined {
    if (!o) return undefined;
    const s: CSSProperties = {};
    if (o.ratio) { s.aspectRatio = o.ratio.replace(':', ' / '); s.width = '100%'; s.objectFit = o.fit ?? 'cover'; }
    if (o.focal) s.objectPosition = o.focal;
    return Object.keys(s).length ? s : undefined;
}

/** Same as imgOptsStyle, as an inline `style="…"` value (already safe: values are validated above). */
export function imgOptsCss(o: ImgOpts | undefined): string {
    if (!o) return '';
    const parts: string[] = [];
    if (o.ratio) parts.push(`aspect-ratio:${o.ratio.replace(':', '/')}`, 'width:100%', `object-fit:${o.fit ?? 'cover'}`);
    if (o.focal) parts.push(`object-position:${o.focal}`);
    return parts.join(';');
}
