/**
 * idocTypes — data model for Scribe "Interactive Docs" (Gamma.app-style
 * card/block documents). Pure types + tiny factories; no React, no DOM.
 *
 * v1 simplifications (honest list, feeds the gap analysis):
 *  - Cards are a flat list — NO nested cards / card groups.
 *  - Blocks are a flat list per card — no block nesting (columns hold
 *    markdown strings, not blocks).
 *  - Themes are CSS-variable maps only (no per-theme layout templates).
 */

export type BlockTone = 'info' | 'success' | 'warning' | 'danger';
export type ChartKind = 'bar' | 'line' | 'pie' | 'donut' | 'area';

export type Block =
    | { id: string; type: 'heading'; level: 1 | 2 | 3; text: string }
    | { id: string; type: 'text'; md: string }
    | { id: string; type: 'callout'; tone: BlockTone; md: string }
    | { id: string; type: 'quote'; md: string; cite?: string }
    | { id: string; type: 'image'; src: string; alt?: string; caption?: string }
    | { id: string; type: 'gallery'; images: { src: string; alt?: string }[] }
    | { id: string; type: 'embed'; url: string; provider?: string }
    | { id: string; type: 'chart'; kind: ChartKind; title?: string; data: { label: string; value: number }[] }
    | { id: string; type: 'table'; headers: string[]; rows: string[][] }
    | { id: string; type: 'accordion'; items: { title: string; md: string }[] }
    | { id: string; type: 'tabs'; items: { title: string; md: string }[] }
    | { id: string; type: 'columns'; columns: string[] }
    | { id: string; type: 'button'; label: string; href: string; variant: 'primary' | 'secondary' }
    | { id: string; type: 'code'; lang: string; code: string }
    | { id: string; type: 'divider' }
    | { id: string; type: 'timeline'; items: { date: string; title: string; md: string }[] }
    | { id: string; type: 'quiz'; question: string; options: string[]; answerIndex: number; explanation?: string }
    | { id: string; type: 'toc' }
    // ── Wave 1 (Gamma "smart layout" family) ──
    | { id: string; type: 'steps'; items: { title: string; md: string }[]; numbered?: boolean }
    | { id: string; type: 'funnel'; items: { label: string; value?: number }[] }
    | { id: string; type: 'boxes'; items: { title: string; md: string; emphasis?: boolean }[]; columns?: 2 | 3 | 4 }
    | { id: string; type: 'math'; latex: string; inline?: boolean }
    | { id: string; type: 'diagram'; mermaid: string }
    | { id: string; type: 'qr'; url: string; caption?: string };

export type BlockType = Block['type'];

export const BLOCK_TYPES: readonly BlockType[] = [
    'heading', 'text', 'callout', 'quote', 'image', 'gallery', 'embed', 'chart', 'table',
    'accordion', 'tabs', 'columns', 'button', 'code', 'divider', 'timeline', 'quiz', 'toc',
    'steps', 'funnel', 'boxes', 'math', 'diagram', 'qr',
] as const;

/** Block types whose primary content is markdown (eligible for per-block AI rewrite). */
export const MD_BLOCK_TYPES: readonly BlockType[] = ['text', 'callout', 'quote'] as const;

export type CardLayout = 'default' | 'split-left' | 'split-right' | 'hero' | 'image-top' | 'background';
export const CARD_LAYOUTS: readonly CardLayout[] = ['default', 'split-left', 'split-right', 'hero', 'image-top', 'background'] as const;

/** Wave 1: per-card background (Gamma: color / image / overlay 0–100 / v-align). */
export interface CardBackground {
    color?: string;
    image?: string;
    overlay?: 'none' | 'frosted' | 'faded' | 'clear';
    intensity?: number; // 0–100
    align?: 'top' | 'center' | 'bottom';
}

/** Wave 1: footnotes render at card bottom; referenced from md via [^n]. */
export interface Footnote { id: string; text: string }

export interface Card {
    id: string;
    title?: string;
    layout: CardLayout;
    /** Used by hero + split layouts (split puts it beside the blocks). */
    headerImage?: string;
    blocks: Block[];
    /** Wave 1: nested cards (expand/collapse in render; outline shows them indented). */
    children?: Card[];
    background?: CardBackground;
    footnotes?: Footnote[];
    /** Presenter notes (not rendered in the doc; shown in presenter view / export as comments). */
    notes?: string;
    // ponytail: no nested cards in v1 — add `children?: Card[]` + recursive renderer when needed.
}

export type IDocThemeId = 'inherit' | 'paper' | 'midnight' | 'sunrise' | 'forest' | 'slate' | 'neon'
    // Wave 1 (+40, generated from WAVE1_PALETTES below)
    | 'ocean' | 'sand' | 'lavender' | 'terracotta' | 'mint' | 'ivory' | 'coral' | 'sky' | 'olive' | 'rose'
    | 'cobalt' | 'lime' | 'arctic' | 'peach' | 'sage' | 'linen' | 'blush' | 'citrus' | 'pearl' | 'dune'
    | 'graphite' | 'plum' | 'mocha' | 'steel' | 'ember' | 'moss' | 'obsidian' | 'ink' | 'cocoa' | 'aubergine'
    | 'pine' | 'cherry' | 'navy' | 'charcoal' | 'wine' | 'bronze' | 'teal' | 'violet' | 'rust' | 'sunset';

export interface IDocAnalytics {
    views: number;
    lastViewedAt?: string;
    /** Seconds spent per card id while presenting (local-only in v1). */
    cardSeconds: Record<string, number>;
}

export interface IDoc {
    id: string;
    title: string;
    description?: string;
    theme: IDocThemeId;
    cards: Card[];
    createdAt: string;
    updatedAt: string;
    analytics: IDocAnalytics;
    /** Wave 1 */
    pageSize?: 'fluid' | '16:9' | '4:3' | '1:1' | 'a4' | 'letter';
    chrome?: { header?: string; footer?: string; logo?: string; sectionNumbers?: boolean; hideOnFirst?: boolean };
    isTemplate?: boolean;
    language?: string;
    dir?: 'ltr' | 'rtl';
}

/** CSS custom properties applied on the doc root via inline style. */
export interface IDocTheme {
    id: IDocThemeId;
    label: string;
    vars: Record<string, string>;
    /** Swatch color for the theme picker. */
    swatch: string;
}

const HEADING_FONT = "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const BODY_FONT = "'Inter', 'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
const SERIF_FONT = "Georgia, 'Times New Roman', serif";
const MONO_FONT = "'JetBrains Mono', ui-monospace, monospace";

/**
 * Themes are the ONE place hardcoded hex is allowed for idocs — a doc theme
 * must look the same regardless of the app's light/dark mode. `inherit`
 * forwards the app tokens instead.
 */
/**
 * Wave 1 palette table → 40 generated themes (20 light + 20 dark).
 * [id, label, bg, surface, text, muted, accent, border, headingFont, radius]
 */
type PaletteRow = [IDocThemeId, string, string, string, string, string, string, string, string, string];
const WAVE1_PALETTES: readonly PaletteRow[] = [
    // ── light family ──
    ['ocean', 'Ocean', '#eef6fb', '#ffffff', '#0d2b3e', '#4f6b7c', '#0e7490', '#cfe3ee', HEADING_FONT, '10px'],
    ['sand', 'Sand', '#f7f1e3', '#fffdf7', '#3b2f1e', '#7a6b55', '#b7791f', '#e7dcc4', SERIF_FONT, '6px'],
    ['lavender', 'Lavender', '#f3f0fa', '#ffffff', '#2a2340', '#6d6488', '#7c5cbf', '#dcd4ee', HEADING_FONT, '12px'],
    ['terracotta', 'Terracotta', '#fbf1ec', '#ffffff', '#3d2019', '#8a5c4f', '#c2410c', '#f0d5c8', SERIF_FONT, '8px'],
    ['mint', 'Mint', '#eefaf4', '#ffffff', '#0f2e22', '#4f7a67', '#059669', '#cdebdc', HEADING_FONT, '12px'],
    ['ivory', 'Ivory', '#fbfaf5', '#ffffff', '#262420', '#6c675c', '#8b7355', '#e9e5d9', SERIF_FONT, '4px'],
    ['coral', 'Coral', '#fff1ee', '#ffffff', '#3a1a14', '#8d5a50', '#e0533f', '#fbd3cb', HEADING_FONT, '14px'],
    ['sky', 'Sky', '#eef7ff', '#ffffff', '#0f2740', '#4d6885', '#2563eb', '#cfe2f7', HEADING_FONT, '10px'],
    ['olive', 'Olive', '#f4f5ea', '#fcfdf5', '#26290f', '#676c47', '#65731d', '#dfe2c4', SERIF_FONT, '6px'],
    ['rose', 'Rose', '#fdf0f4', '#ffffff', '#3d1424', '#8b5468', '#be185d', '#f6cfdc', HEADING_FONT, '12px'],
    ['cobalt', 'Cobalt', '#eef1fb', '#ffffff', '#111a3d', '#525c86', '#1e40af', '#d1d8f0', HEADING_FONT, '8px'],
    ['lime', 'Lime', '#f5fbe6', '#ffffff', '#1c2a08', '#5c6f3a', '#4d7c0f', '#dceabd', MONO_FONT, '4px'],
    ['arctic', 'Arctic', '#f2f8fa', '#ffffff', '#12303a', '#557480', '#0891b2', '#d3e6ec', HEADING_FONT, '16px'],
    ['peach', 'Peach', '#fff4ea', '#ffffff', '#3d2412', '#8c6a52', '#ea580c', '#fbdcc4', HEADING_FONT, '14px'],
    ['sage', 'Sage', '#f1f6f1', '#ffffff', '#1f2e22', '#5f7563', '#3f7a52', '#d4e2d6', SERIF_FONT, '10px'],
    ['linen', 'Linen', '#faf6f0', '#ffffff', '#33291f', '#75685a', '#9a6b3f', '#eadfd0', SERIF_FONT, '2px'],
    ['blush', 'Blush', '#fdf2f5', '#ffffff', '#3b1f28', '#87616d', '#d6336c', '#f5d5df', HEADING_FONT, '18px'],
    ['citrus', 'Citrus', '#fffbe6', '#ffffff', '#302a06', '#75693a', '#ca8a04', '#f3e8b4', HEADING_FONT, '8px'],
    ['pearl', 'Pearl', '#f6f6f8', '#ffffff', '#1f1f27', '#66666f', '#5b5bd6', '#dedee6', HEADING_FONT, '10px'],
    ['dune', 'Dune', '#f5efe6', '#fdf9f2', '#3a2f22', '#7d6d59', '#a16207', '#e5d9c8', SERIF_FONT, '6px'],
    // ── dark family ──
    ['graphite', 'Graphite', '#16181d', '#1f2229', '#e6e8ec', '#9aa0aa', '#7dd3fc', '#2c3038', HEADING_FONT, '8px'],
    ['plum', 'Plum', '#1a1020', '#26182f', '#f1e8f6', '#a894b7', '#c084fc', '#3a2848', SERIF_FONT, '12px'],
    ['mocha', 'Mocha', '#1c1512', '#28201b', '#f2eae3', '#a89586', '#d9a066', '#3a2f28', SERIF_FONT, '8px'],
    ['steel', 'Steel', '#141a21', '#1d252e', '#e2e8f0', '#94a3b8', '#38bdf8', '#2a3441', HEADING_FONT, '6px'],
    ['ember', 'Ember', '#1a1010', '#261717', '#f5e9e6', '#b08b84', '#f97316', '#3d2320', HEADING_FONT, '10px'],
    ['moss', 'Moss', '#111a14', '#19261d', '#e4efe7', '#8fa997', '#4ade80', '#25382c', SERIF_FONT, '10px'],
    ['obsidian', 'Obsidian', '#0a0a0b', '#141416', '#f4f4f5', '#8f8f96', '#e4e4e7', '#26262a', MONO_FONT, '2px'],
    ['ink', 'Ink', '#0f1419', '#18202a', '#e6edf3', '#8b98a8', '#60a5fa', '#263241', HEADING_FONT, '12px'],
    ['cocoa', 'Cocoa', '#1b1412', '#27201d', '#f1e9e4', '#a89388', '#f4a261', '#3b312c', HEADING_FONT, '14px'],
    ['aubergine', 'Aubergine', '#170f1a', '#231627', '#f2e9f4', '#a992ad', '#e879f9', '#382443', HEADING_FONT, '12px'],
    ['pine', 'Pine', '#0d1a17', '#142823', '#e2efe9', '#89a89c', '#2dd4bf', '#213b33', SERIF_FONT, '8px'],
    ['cherry', 'Cherry', '#1c0e12', '#29161c', '#f7e8ec', '#b58a97', '#fb7185', '#3f222b', HEADING_FONT, '10px'],
    ['navy', 'Navy', '#0b1226', '#131c37', '#e8ecf8', '#8f9ac0', '#93c5fd', '#22305a', HEADING_FONT, '10px'],
    ['charcoal', 'Charcoal', '#1e1e1e', '#2a2a2a', '#f0f0f0', '#a3a3a3', '#facc15', '#3a3a3a', HEADING_FONT, '4px'],
    ['wine', 'Wine', '#1d0f14', '#2b171e', '#f6e9ee', '#b08c98', '#e11d48', '#43242e', SERIF_FONT, '8px'],
    ['bronze', 'Bronze', '#171310', '#231d18', '#f1ebe4', '#a89a8a', '#d4a017', '#3a3128', SERIF_FONT, '6px'],
    ['teal', 'Teal', '#0c1a1c', '#132628', '#e3f2f3', '#88a9ac', '#2dd4bf', '#1f3a3d', HEADING_FONT, '12px'],
    ['violet', 'Violet', '#120f22', '#1c1732', '#ece8fb', '#9d95c4', '#a78bfa', '#2e2750', HEADING_FONT, '14px'],
    ['rust', 'Rust', '#1a1210', '#271a16', '#f4ebe6', '#ad9184', '#ea580c', '#3f2820', MONO_FONT, '4px'],
    ['sunset', 'Sunset', '#1a1017', '#271722', '#f8e9ef', '#b48ea0', '#fb923c', '#42243a', HEADING_FONT, '12px'],
];
const WAVE1_THEMES: readonly IDocTheme[] = WAVE1_PALETTES.map(([id, label, bg, surface, text, muted, accent, border, headingFont, radius]) => ({
    id, label, swatch: accent,
    vars: {
        '--idoc-bg': bg, '--idoc-surface': surface, '--idoc-text': text, '--idoc-muted': muted, '--idoc-accent': accent,
        '--idoc-heading-font': headingFont, '--idoc-body-font': BODY_FONT, '--idoc-radius': radius, '--idoc-border': border,
    },
}));

export const IDOC_THEMES: readonly IDocTheme[] = [
    {
        id: 'inherit', label: 'Inherit app', swatch: 'var(--accent)',
        vars: {
            '--idoc-bg': 'var(--bg-surface)', '--idoc-surface': 'var(--bg-surface-elevated)',
            '--idoc-text': 'var(--text-primary)', '--idoc-muted': 'var(--text-secondary)',
            '--idoc-accent': 'var(--accent)', '--idoc-heading-font': 'var(--font-heading)',
            '--idoc-body-font': 'var(--font-primary)', '--idoc-radius': 'var(--radius-md)',
            '--idoc-border': 'var(--border-default)',
        },
    },
    {
        id: 'paper', label: 'Paper', swatch: '#f6f1e7',
        vars: {
            '--idoc-bg': '#f6f1e7', '--idoc-surface': '#ffffff', '--idoc-text': '#1f1b16',
            '--idoc-muted': '#6b635a', '--idoc-accent': '#b4532a', '--idoc-heading-font': SERIF_FONT,
            '--idoc-body-font': BODY_FONT, '--idoc-radius': '6px', '--idoc-border': '#e3dbcd',
        },
    },
    {
        id: 'midnight', label: 'Midnight', swatch: '#0b1020',
        vars: {
            '--idoc-bg': '#0b1020', '--idoc-surface': '#141a2e', '--idoc-text': '#e8ecf8',
            '--idoc-muted': '#8f97b3', '--idoc-accent': '#7aa2ff', '--idoc-heading-font': HEADING_FONT,
            '--idoc-body-font': BODY_FONT, '--idoc-radius': '12px', '--idoc-border': '#232b47',
        },
    },
    {
        id: 'sunrise', label: 'Sunrise', swatch: '#ff8a5b',
        vars: {
            '--idoc-bg': '#fff4ec', '--idoc-surface': '#ffffff', '--idoc-text': '#2a1a12',
            '--idoc-muted': '#8a6a5c', '--idoc-accent': '#ff6a3d', '--idoc-heading-font': HEADING_FONT,
            '--idoc-body-font': BODY_FONT, '--idoc-radius': '14px', '--idoc-border': '#ffd9c8',
        },
    },
    {
        id: 'forest', label: 'Forest', swatch: '#1e3a2f',
        vars: {
            '--idoc-bg': '#0f1f19', '--idoc-surface': '#1e3a2f', '--idoc-text': '#e6f2ea',
            '--idoc-muted': '#9dbfae', '--idoc-accent': '#7ed6a0', '--idoc-heading-font': SERIF_FONT,
            '--idoc-body-font': BODY_FONT, '--idoc-radius': '10px', '--idoc-border': '#2c4f41',
        },
    },
    {
        id: 'slate', label: 'Slate', swatch: '#334155',
        vars: {
            '--idoc-bg': '#f1f5f9', '--idoc-surface': '#ffffff', '--idoc-text': '#0f172a',
            '--idoc-muted': '#64748b', '--idoc-accent': '#0f766e', '--idoc-heading-font': HEADING_FONT,
            '--idoc-body-font': BODY_FONT, '--idoc-radius': '8px', '--idoc-border': '#cbd5e1',
        },
    },
    {
        id: 'neon', label: 'Neon', swatch: '#d6fe51',
        vars: {
            '--idoc-bg': '#050505', '--idoc-surface': '#111111', '--idoc-text': '#f5f5f5',
            '--idoc-muted': '#8a8a8a', '--idoc-accent': '#d6fe51', '--idoc-heading-font': MONO_FONT,
            '--idoc-body-font': BODY_FONT, '--idoc-radius': '2px', '--idoc-border': '#262626',
        },
    },
    ...WAVE1_THEMES,
] as const;

export function themeById(id: string | undefined): IDocTheme {
    return IDOC_THEMES.find((t) => t.id === id) ?? IDOC_THEMES[0];
}

export function newId(prefix = 'b'): string {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    } catch { /* older runtime */ }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createEmptyCard(partial: Partial<Card> = {}): Card {
    return { id: newId('c'), layout: 'default', blocks: [], ...partial };
}

export function createEmptyDoc(partial: Partial<IDoc> = {}): IDoc {
    const now = new Date().toISOString();
    return {
        id: newId('doc'),
        title: 'Untitled doc',
        theme: 'inherit',
        cards: [createEmptyCard({ title: 'Card 1', blocks: [{ id: newId(), type: 'text', md: 'Start writing…' }] })],
        createdAt: now,
        updatedAt: now,
        analytics: { views: 0, cardSeconds: {} },
        ...partial,
    };
}

/** Sensible defaults for "+ Add block". */
export function defaultBlock(type: BlockType): Block {
    const id = newId();
    switch (type) {
        case 'heading': return { id, type, level: 2, text: 'Heading' };
        case 'text': return { id, type, md: 'Write something…' };
        case 'callout': return { id, type, tone: 'info', md: 'Something worth calling out.' };
        case 'quote': return { id, type, md: 'A memorable quote.', cite: '' };
        case 'image': return { id, type, src: '', alt: '', caption: '' };
        case 'gallery': return { id, type, images: [] };
        case 'embed': return { id, type, url: '' };
        case 'chart': return { id, type, kind: 'bar', title: 'Chart', data: [{ label: 'A', value: 3 }, { label: 'B', value: 5 }, { label: 'C', value: 2 }] };
        case 'table': return { id, type, headers: ['Column 1', 'Column 2'], rows: [['', '']] };
        case 'accordion': return { id, type, items: [{ title: 'Section', md: 'Details…' }] };
        case 'tabs': return { id, type, items: [{ title: 'Tab 1', md: 'First tab.' }, { title: 'Tab 2', md: 'Second tab.' }] };
        case 'columns': return { id, type, columns: ['Left column', 'Right column'] };
        case 'button': return { id, type, label: 'Learn more', href: 'https://', variant: 'primary' };
        case 'code': return { id, type, lang: 'ts', code: 'console.log("hello");' };
        case 'divider': return { id, type };
        case 'timeline': return { id, type, items: [{ date: '2026', title: 'Milestone', md: 'What happened.' }] };
        case 'quiz': return { id, type, question: 'Question?', options: ['Option A', 'Option B'], answerIndex: 0, explanation: '' };
        case 'toc': return { id, type };
        case 'steps': return { id, type, numbered: true, items: [{ title: 'Step 1', md: 'First…' }, { title: 'Step 2', md: 'Then…' }, { title: 'Step 3', md: 'Finally…' }] };
        case 'funnel': return { id, type, items: [{ label: 'Awareness', value: 100 }, { label: 'Interest', value: 60 }, { label: 'Decision', value: 25 }] };
        case 'boxes': return { id, type, columns: 3, items: [{ title: 'One', md: '' }, { title: 'Two', md: '' }, { title: 'Three', md: '' }] };
        case 'math': return { id, type, latex: 'E = mc^2', inline: false };
        case 'diagram': return { id, type, mermaid: 'flowchart LR\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Done]\n  B -->|No| A' };
        case 'qr': return { id, type, url: 'https://', caption: '' };
    }
}
