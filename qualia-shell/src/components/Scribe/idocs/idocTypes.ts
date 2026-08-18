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
export type ChartKind = 'bar' | 'line' | 'pie';

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
    | { id: string; type: 'toc' };

export type BlockType = Block['type'];

export const BLOCK_TYPES: readonly BlockType[] = [
    'heading', 'text', 'callout', 'quote', 'image', 'gallery', 'embed', 'chart', 'table',
    'accordion', 'tabs', 'columns', 'button', 'code', 'divider', 'timeline', 'quiz', 'toc',
] as const;

/** Block types whose primary content is markdown (eligible for per-block AI rewrite). */
export const MD_BLOCK_TYPES: readonly BlockType[] = ['text', 'callout', 'quote'] as const;

export type CardLayout = 'default' | 'split-left' | 'split-right' | 'hero';
export const CARD_LAYOUTS: readonly CardLayout[] = ['default', 'split-left', 'split-right', 'hero'] as const;

export interface Card {
    id: string;
    title?: string;
    layout: CardLayout;
    /** Used by hero + split layouts (split puts it beside the blocks). */
    headerImage?: string;
    blocks: Block[];
    // ponytail: no nested cards in v1 — add `children?: Card[]` + recursive renderer when needed.
}

export type IDocThemeId = 'inherit' | 'paper' | 'midnight' | 'sunrise' | 'forest' | 'slate' | 'neon';

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
    }
}
