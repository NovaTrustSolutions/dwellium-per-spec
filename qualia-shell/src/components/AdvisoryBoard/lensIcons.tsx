/**
 * lensIcons — thin-line glyphs for the five advisory lenses, matching the
 * upstream project's artwork. Two come from lucide (the balance scale and the
 * concentric target are exact matches); three are hand-authored inline SVG in
 * the same 24×24 / 1.5-stroke style.
 */
import { Scale, Target } from 'lucide-react';
import type { ReactNode } from 'react';
import type { LensId } from '../../lib/advisoryBoard/lenses';

const svg = (children: ReactNode) => (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
        {children}
    </svg>
);

/** Focus frame — four corner brackets (Product Clarity). */
const ClarityGlyph = () => svg(<>
    <path d="M4 9V5a1 1 0 0 1 1-1h4" />
    <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
    <path d="M4 15v4a1 1 0 0 0 1 1h4" />
    <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
</>);

/** Shield with a downward arrow (Risk and Capital). */
const RiskGlyph = () => svg(<>
    <path d="M12 3 4.5 6v6c0 4.2 3 7.6 7.5 9 4.5-1.4 7.5-4.8 7.5-9V6L12 3Z" />
    <path d="M9.5 10.5 12 13.5l2.5-3" />
    <path d="M12 13.5V8" />
</>);

/** Sun over a winding path (Future Self). */
const FutureSelfGlyph = () => svg(<>
    <circle cx="12" cy="7.5" r="2.6" />
    <path d="M12 2.4v1.4M12 11.2v1.4M6.9 7.5H5.5M18.5 7.5h-1.4M8.4 3.9l-1-1M17 12.1l-1-1M8.4 11.1l-1 1M17 2.9l-1 1" />
    <path d="M5 21c2.6 0 2.6-3.4 5.2-3.4S12.8 21 15.4 21c1.6 0 2.3-1.3 3.6-2.2" />
</>);

export const LENS_GLYPH: Record<LensId, () => ReactNode> = {
    'clarity': ClarityGlyph,
    'risk': RiskGlyph,
    'offer': () => <Scale size={28} strokeWidth={1.5} aria-hidden="true" />,
    'scale': () => <Target size={28} strokeWidth={1.5} aria-hidden="true" />,
    'future-self': FutureSelfGlyph,
};

/** The small hexagon rune inside the CRIT hexagon. */
export const HexRune = () => (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.4" strokeLinejoin="round" aria-hidden="true" focusable="false">
        <path d="M12 2.6 20 7v10l-8 4.4L4 17V7l8-4.4Z" />
        <path d="M12 7.4 16.2 9.8v4.4L12 16.6 7.8 14.2V9.8L12 7.4Z" />
        <circle cx="12" cy="12" r="1.7" />
    </svg>
);
