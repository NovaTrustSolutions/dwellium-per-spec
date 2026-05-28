import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Color tokens that can be customized per editor theme. Each maps to one or
 * more lezer/highlight tags that CodeMirror's syntax tree emits for markdown.
 *
 * NOT in scope for v1 (controlled by app theme via EditorView.theme):
 *   - fenced-code background, inline-code background
 *   - blockquote left border, table cell borders, hr line color
 * These show up as disabled rows in the EditorTab UI for transparency.
 */
export type ScribeTokenKey =
  | 'h1' | 'h2' | 'h3' | 'h4'
  | 'bold' | 'italic'
  | 'code'      // tags.monospace — inline code spans + fenced code text
  | 'codeStr'   // tags.string — string literals inside code (rare in markdown but emitted)
  | 'quote'     // tags.quote — blockquote text
  | 'hr'        // tags.contentSeparator — horizontal rule
  | 'url'       // tags.url — link URL portion
  | 'link'      // tags.link — link text portion
  | 'meta'      // tags.meta + tags.processingInstruction — frontmatter, HTML-ish meta

export type ScribeTokens = Record<ScribeTokenKey, string>

export interface ScribeColorTheme {
  name: string
  isCustom: boolean
  tokens: ScribeTokens
}

// ── Preset themes ────────────────────────────────────────────────────────────

/**
 * Holocron Default — current values verbatim from the previous hardcoded
 * markdownHighlightStyle. Switching to this preset must produce zero visual
 * regression for users who never touch the new Editor tab.
 */
export const HOLOCRON_DEFAULT: ScribeColorTheme = {
  name: 'Agenteryx Default',
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
}

/**
 * Fey — palette aligned with the Fey app theme (`themes.ts` 'fey' block).
 * Designed to feel cohesive when both the app theme and editor theme are Fey.
 */
export const FEY: ScribeColorTheme = {
  name: 'Fey',
  isCustom: false,
  tokens: {
    h1: '#ffa16c',
    h2: '#4ebe96',
    h3: '#479ffa',
    h4: '#479ffa',
    bold: '#ffd60a',
    italic: '#d84f68',
    code: '#ff5c5c',
    codeStr: '#ff5c5c',
    quote: '#868f97',
    hr: '#3e3e3e',
    url: '#479ffa',
    link: '#ffa16c',
    meta: '#ffffff',
  },
}

/**
 * Minimal — mostly off-white with a single accent for h1 + bold + links.
 * Suppresses the "hierarchy noise" of varied heading colors.
 */
export const MINIMAL: ScribeColorTheme = {
  name: 'Minimal',
  isCustom: false,
  tokens: {
    h1: '#0a84ff',
    h2: '#e6e6e6',
    h3: '#c0c0c0',
    h4: '#c0c0c0',
    bold: '#0a84ff',
    italic: '#a0a0a0',
    code: '#a0a0a0',
    codeStr: '#a0a0a0',
    quote: '#808080',
    hr: '#48484a',
    url: '#0a84ff',
    link: '#0a84ff',
    meta: '#e6e6e6',
  },
}

/**
 * High Contrast — WCAG AAA on every pair against a dark background.
 * Deliberately vivid; usable but loud.
 */
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
}

export const PRESETS: Record<string, ScribeColorTheme> = {
  'holocron-default': HOLOCRON_DEFAULT,
  'fey':              FEY,
  'minimal':          MINIMAL,
  'high-contrast':    HIGH_CONTRAST,
}

/** Stable order for UI listing — presets always first in this exact order. */
export const PRESET_KEYS = ['holocron-default', 'fey', 'minimal', 'high-contrast'] as const

/** Display labels for the picker UI. */
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
}

/** Stable order for the color picker grid. */
export const TOKEN_ORDER: ScribeTokenKey[] = [
  'h1', 'h2', 'h3', 'h4',
  'bold', 'italic',
  'code', 'codeStr',
  'quote', 'hr',
  'link', 'url',
  'meta',
]

// ── HighlightStyle builder ───────────────────────────────────────────────────

/**
 * Convert an ScribeColorTheme's token map into a CodeMirror HighlightStyle.
 * Style metadata (font-size, weight, italic) stays per the original
 * markdownHighlightStyle; only colors come from the theme.
 */
export function buildHighlightStyle(theme: ScribeColorTheme): HighlightStyle {
  const t = theme.tokens
  return HighlightStyle.define([
    { tag: tags.heading1, fontSize: '1.55em', fontWeight: '700', color: t.h1, lineHeight: '1.3' },
    { tag: tags.heading2, fontSize: '1.35em', fontWeight: '700', color: t.h2 },
    { tag: tags.heading3, fontSize: '1.15em', fontWeight: '600', color: t.h3 },
    { tag: tags.heading4, fontSize: '1.05em', fontWeight: '600', color: t.h4 },
    { tag: tags.strong,   fontWeight: '700',  color: t.bold },
    { tag: tags.emphasis, fontStyle: 'italic', color: t.italic },
    { tag: tags.monospace, color: t.code, fontFamily: 'inherit' },
    { tag: tags.string,    color: t.codeStr },
    { tag: tags.quote,     color: t.quote },
    { tag: tags.contentSeparator, color: t.hr },
    { tag: tags.url,       color: t.url, textDecoration: 'underline' },
    { tag: tags.link,      color: t.link },
    { tag: tags.meta,                 color: t.meta },
    { tag: tags.processingInstruction, color: t.meta },
  ])
}

/** Resolve a theme by name from presets or customs. Falls back to default. */
export function resolveTheme(
  name: string,
  customs: Record<string, ScribeColorTheme>,
): ScribeColorTheme {
  if (PRESETS[name]) return PRESETS[name]
  if (customs[name]) return customs[name]
  return HOLOCRON_DEFAULT
}
