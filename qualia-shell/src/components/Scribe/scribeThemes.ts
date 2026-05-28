/**
 * Scribe editor color themes — preset palettes + HighlightStyle builder.
 *
 * Ported from Holocron's scribeThemes.ts (Cycle 4). Renamed "Holocron
 * Default" → "Dwellium Default" with acid lime accent (#D6FE51) to match
 * the app-wide fey design system. Cycle 10 adds a settings UI for custom
 * themes + live theme switching.
 */
import { HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// ── Types ────────────────────────────────────────────────────────────────────

export type ScribeTokenKey =
    | 'h1' | 'h2' | 'h3' | 'h4'
    | 'bold' | 'italic'
    | 'code' | 'codeStr'
    | 'quote' | 'hr'
    | 'url' | 'link'
    | 'meta';

export type ScribeTokens = Record<ScribeTokenKey, string>;

export interface ScribeColorTheme {
    name: string;
    isCustom: boolean;
    tokens: ScribeTokens;
}

// ── Preset themes ────────────────────────────────────────────────────────────

export const DWELLIUM_DEFAULT: ScribeColorTheme = {
    name: 'Dwellium Default',
    isCustom: false,
    tokens: {
        h1: '#D6FE51',
        h2: '#4ebe96',
        h3: '#479ffa',
        h4: '#479ffa',
        bold: '#ffffff',
        italic: '#868F97',
        code: '#D6FE51',
        codeStr: '#D6FE51',
        quote: '#868F97',
        hr: '#333',
        url: '#479ffa',
        link: '#D6FE51',
        meta: '#808080',
    },
};

export const AGENTERYX: ScribeColorTheme = {
    name: 'Agenteryx',
    isCustom: false,
    tokens: {
        h1: '#ff9f0a',
        h2: '#30d158',
        h3: '#ff2d78',
        h4: '#ff2d78',
        bold: '#ffd60a',
        italic: '#bf5af2',
        code: '#ff6b6b',
        codeStr: '#ff6b6b',
        quote: '#7dd3fc',
        hr: '#48484a',
        url: '#64d2ff',
        link: '#ff2d78',
        meta: '#ffffff',
    },
};

export const MINIMAL: ScribeColorTheme = {
    name: 'Minimal',
    isCustom: false,
    tokens: {
        h1: '#D6FE51',
        h2: '#e6e6e6',
        h3: '#c0c0c0',
        h4: '#c0c0c0',
        bold: '#D6FE51',
        italic: '#a0a0a0',
        code: '#a0a0a0',
        codeStr: '#a0a0a0',
        quote: '#808080',
        hr: '#333',
        url: '#D6FE51',
        link: '#D6FE51',
        meta: '#e6e6e6',
    },
};

export const HIGH_CONTRAST: ScribeColorTheme = {
    name: 'High Contrast',
    isCustom: false,
    tokens: {
        h1: '#ffffff',
        h2: '#ffff00',
        h3: '#00ff00',
        h4: '#00ffff',
        bold: '#ff00ff',
        italic: '#ffaa00',
        code: '#ffff00',
        codeStr: '#ffff00',
        quote: '#00ffff',
        hr: '#ffffff',
        url: '#00aaff',
        link: '#ff00aa',
        meta: '#ffffff',
    },
};

export const PRESETS: Record<string, ScribeColorTheme> = {
    'dwellium-default': DWELLIUM_DEFAULT,
    'agenteryx':        AGENTERYX,
    'minimal':          MINIMAL,
    'high-contrast':    HIGH_CONTRAST,
};

export const PRESET_KEYS = ['dwellium-default', 'agenteryx', 'minimal', 'high-contrast'] as const;

export const TOKEN_LABELS: Record<ScribeTokenKey, string> = {
    h1: 'Heading 1',
    h2: 'Heading 2',
    h3: 'Heading 3',
    h4: 'Heading 4',
    bold: 'Bold',
    italic: 'Italic',
    code: 'Code',
    codeStr: 'Code (string)',
    quote: 'Blockquote',
    hr: 'Horizontal rule',
    url: 'Link URL',
    link: 'Link text',
    meta: 'Frontmatter / meta',
};

export const TOKEN_ORDER: ScribeTokenKey[] = [
    'h1', 'h2', 'h3', 'h4',
    'bold', 'italic',
    'code', 'codeStr',
    'quote', 'hr',
    'link', 'url',
    'meta',
];

// ── HighlightStyle builder ───────────────────────────────────────────────────

export function buildHighlightStyle(theme: ScribeColorTheme): HighlightStyle {
    const t = theme.tokens;
    return HighlightStyle.define([
        { tag: tags.heading1, fontSize: '1.55em', fontWeight: '700', color: t.h1, lineHeight: '1.3' },
        { tag: tags.heading2, fontSize: '1.35em', fontWeight: '700', color: t.h2 },
        { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600', color: t.h3 },
        { tag: tags.heading4, fontSize: '1.05em', fontWeight: '600', color: t.h4 },
        { tag: tags.strong,   fontWeight: '700',  color: t.bold },
        { tag: tags.emphasis, fontStyle: 'italic', color: t.italic },
        { tag: tags.monospace, color: t.code, fontFamily: "'JetBrains Mono', 'Fira Code', monospace" },
        { tag: tags.string,    color: t.codeStr },
        { tag: tags.quote,     color: t.quote },
        { tag: tags.contentSeparator, color: t.hr },
        { tag: tags.url,       color: t.url, textDecoration: 'underline' },
        { tag: tags.link,      color: t.link },
        { tag: tags.meta,                 color: t.meta },
        { tag: tags.processingInstruction, color: t.meta },
    ]);
}

export function resolveTheme(
    name: string,
    customs: Record<string, ScribeColorTheme>,
): ScribeColorTheme {
    if (PRESETS[name]) return PRESETS[name];
    if (customs[name]) return customs[name];
    return DWELLIUM_DEFAULT;
}
