/**
 * emailFrame — builds the sanitized `<iframe srcDoc>` document shared by the
 * inline preview and full email viewer in InboxZero.
 *
 * CSS custom properties (`var(--…)`) do NOT cross into an iframe `srcDoc` —
 * the iframe is a separate document with no access to the parent document's
 * computed styles, so every color below must be a literal resolved before
 * the string is built. The previous version left `var(--bg-surface)` etc. in
 * the srcDoc string, which iframe-internal CSS can never resolve, alongside
 * hardcoded light-mode text colors (`#1e293b` and friends) that read as
 * low-contrast dark-blue-on-near-black against this app's dark theme.
 */

export interface EmailFramePalette {
    bg: string;
    text: string;
    muted: string;
    link: string;
    border: string;
    surface: string;
    quoteBar: string;
}

// High-contrast literal fallback. Used whenever the live theme's tokens are
// missing or fail the allowlist below, and always for the full viewer (which
// has its own fixed dark chrome, independent of the active theme).
export const VIEWER_PALETTE: EmailFramePalette = {
    bg: '#141726',
    text: '#ffffff',
    muted: '#cbd5e1',
    link: '#93c5fd',
    border: 'rgba(255,255,255,0.18)',
    surface: 'rgba(255,255,255,0.06)',
    quoteBar: '#818cf8',
};

// A palette value is interpolated straight into a <style> block inside the
// srcDoc string, so it must never be able to close that tag or attribute —
// no `<`, `>`, `;`, quotes or braces. This allowlist covers every legal hex/
// rgb/rgba/named-color/color-mix-free CSS color token this app's themes use.
const SAFE_VALUE = /^[#a-zA-Z0-9\s(),.%-]{1,64}$/;

function safe(value: string | undefined | null, fallback: string): string {
    const trimmed = (value ?? '').trim();
    return trimmed && SAFE_VALUE.test(trimmed) ? trimmed : fallback;
}

/**
 * Reads the live theme's CSS custom properties off `el` — default the
 * `<html>` element, which is where ThemeContext.tsx sets `theme-{id}` as the
 * className (both at boot, via the FOUC IIFE, and on every theme change) —
 * and maps them onto the flat palette shape `buildEmailSrcDoc` needs.
 *
 * bg/text are treated as a coherent contrast pair: if either is missing or
 * invalid, the whole VIEWER_PALETTE is returned rather than risking a valid
 * background paired with the fallback's text color (or vice versa). Every
 * other token falls back individually.
 */
export function themePalette(el: Element = document.documentElement): EmailFramePalette {
    const cs = getComputedStyle(el);
    const bg = safe(cs.getPropertyValue('--bg-surface'), '');
    const text = safe(cs.getPropertyValue('--text-primary'), '');
    if (!bg || !text) return VIEWER_PALETTE;
    return {
        bg,
        text,
        muted: safe(cs.getPropertyValue('--text-secondary'), VIEWER_PALETTE.muted),
        link: safe(cs.getPropertyValue('--accent-text'), VIEWER_PALETTE.link),
        border: safe(cs.getPropertyValue('--border-default'), VIEWER_PALETTE.border),
        surface: safe(cs.getPropertyValue('--bg-surface-elevated'), VIEWER_PALETTE.surface),
        quoteBar: safe(cs.getPropertyValue('--accent'), VIEWER_PALETTE.quoteBar),
    };
}

type Density = 'compact' | 'comfortable';

const METRICS: Record<Density, { padding: string; fontSize: string; lineHeight: string }> = {
    compact: { padding: '20px 24px', fontSize: '14px', lineHeight: '1.7' },
    comfortable: { padding: '28px 32px', fontSize: '15px', lineHeight: '1.75' },
};

/**
 * Builds the full `<!DOCTYPE html>` document for an email body iframe.
 * Ports both of the previous inline stylesheets byte-for-byte on layout
 * (compact = inline-preview metrics, comfortable = full-viewer metrics) —
 * only the colors change, all sourced from `palette`, never `var(--…)`.
 *
 * `bodyHtml` is inserted as-is; callers pass already-sanitized HTML.
 */
export function buildEmailSrcDoc(bodyHtml: string, palette: EmailFramePalette, density: Density): string {
    const m = METRICS[density];
    const compact = density === 'compact';
    const heading = compact
        ? `h1,h2,h3{color:${palette.text};margin:16px 0 8px}`
        : `h1{font-size:22px;color:${palette.text};margin:20px 0 10px}h2{font-size:18px;color:${palette.text};margin:18px 0 8px}h3{font-size:16px;color:${palette.text};margin:14px 0 6px}`;

    const style = [
        `*{box-sizing:border-box}`,
        `html,body{background:${palette.bg}}`,
        `body{margin:0;padding:${m.padding};font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;font-size:${m.fontSize};line-height:${m.lineHeight};color:${palette.text};word-wrap:break-word;overflow-wrap:break-word}`,
        `img{max-width:100%;height:auto;border-radius:${compact ? 4 : 6}px;display:block;margin:${compact ? 8 : 12}px 0}`,
        `a{color:${palette.link};text-decoration:none${compact ? '' : ';font-weight:500'}}`,
        `a:hover{text-decoration:underline}`,
        `table{border-collapse:collapse;width:100%;margin:${compact ? 12 : 16}px 0}`,
        `td,th{padding:${compact ? '8px 12px' : '10px 14px'};border:1px solid ${palette.border};text-align:left;font-size:${compact ? 13 : 14}px}`,
        `th{background:${palette.surface};font-weight:600;color:${palette.text}}`,
        `blockquote{margin:${compact ? 12 : 16}px 0;padding:${compact ? '12px 20px' : '14px 24px'};border-left:4px solid ${palette.quoteBar};background:${palette.surface};color:${palette.muted};border-radius:${compact ? '0 6px 6px 0' : '0 8px 8px 0'}${compact ? '' : ';font-style:italic'}}`,
        `pre,code{font-family:'SF Mono',Monaco,Consolas,monospace;font-size:13px;background:${palette.surface};color:${palette.text};border-radius:4px;padding:2px 6px}`,
        `pre{padding:${compact ? '14px 18px' : '16px 20px'};overflow-x:auto${compact ? '' : `;border:1px solid ${palette.border}`}}`,
        `hr{border:none;border-top:1px solid ${palette.border};margin:${compact ? 16 : 20}px 0}`,
        heading,
        `ul,ol{padding-left:${compact ? 24 : 28}px}`,
        `li{margin:${compact ? 4 : 6}px 0}`,
        `p{margin:${compact ? 8 : 10}px 0}`,
        `.email-footer,.unsubscribe{font-size:11px;color:${palette.muted};margin-top:${compact ? 24 : 28}px;padding-top:${compact ? 16 : 18}px;border-top:1px solid ${palette.border}}`,
        // Plain-text quote lines (formatEmailBody's `.q` span) and the
        // viewer's empty-body fallback (`.empty`) — both previously used
        // inline `var(--…)` styles that are invalid inside this iframe.
        `.q{color:${palette.muted};border-left:3px solid ${palette.border};padding-left:10px;display:inline-block;margin:2px 0}`,
        `.empty{padding:40px;text-align:center;color:${palette.muted};font-style:italic}`,
    ].join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style></head><body>${bodyHtml}</body></html>`;
}
