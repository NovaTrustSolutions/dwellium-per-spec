/**
 * Shared CodeMirror 6 markdown configuration for Dwellium Scribe.
 *
 * Ported from Holocron's markdownConfig.ts (Cycle 4). Includes all
 * ViewPlugins for live-preview rendering, smart paste, double-space
 * period, and the editor base theme.
 *
 * Colors use literal hex values matching Dwellium's dark theme rather
 * than CSS vars (CodeMirror's EditorView.theme doesn't support vars
 * natively). Cycle 10 will add a theme settings UI.
 */
import { EditorView, ViewPlugin, type ViewUpdate, Decoration, DecorationSet, WidgetType, keymap, type Command } from '@codemirror/view';
import { RangeSetBuilder, Compartment } from '@codemirror/state';
import { syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { buildHighlightStyle, DWELLIUM_DEFAULT, type ScribeColorTheme } from './scribeThemes';
import { markdown } from '@codemirror/lang-markdown';
import { Table } from '@lezer/markdown';
import { mdTableField } from './tablePlugin';
import { basicSetup } from 'codemirror';
import { closeBrackets } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';

// ── Theme ────────────────────────────────────────────────────────────────────
// Dwellium dark theme — pure black bg, Hanken Grotesk body, JetBrains Mono code.

export const scribeTheme = EditorView.theme(
    {
        '&': {
            height: '100%',
            backgroundColor: '#000000',
            color: '#ffffff',
            fontSize: '13px',
            fontFamily: "'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
        },
        '.cm-content': {
            padding: '28px 40px',
            caretColor: '#D6FE51',
            lineHeight: '1.75',
            maxWidth: '780px',
            margin: '0 auto',
        },
        '.cm-focused': { outline: 'none' },
        '&.cm-focused': { outline: 'none' },
        '.cm-cursor': { borderLeftColor: '#D6FE51', borderLeftWidth: '2px' },
        '.cm-selectionBackground, ::selection': {
            backgroundColor: 'rgba(214,254,81,0.15) !important',
        },
        '.cm-gutters': {
            backgroundColor: '#000000',
            borderRight: '1px solid #222',
            minWidth: '44px',
        },
        '.cm-lineNumbers .cm-gutterElement': {
            color: '#555',
            fontSize: '12px',
            paddingRight: '12px',
        },
        '.cm-activeLineGutter': { backgroundColor: 'transparent', color: '#808080' },
        '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.03)' },
        '.cm-scroller': { overflow: 'auto', height: '100%' },
        '.cm-inline-code': {
            backgroundColor: 'rgba(255,255,255,0.07)',
            borderRadius: '3px',
            padding: '0 3px',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        },
        '.cm-md-mark-dim':    { opacity: '0', fontSize: '0' },
        '.cm-list-bullet':    { color: '#D6FE51' },
        '.cm-list-ordered':   { color: '#D6FE51' },
        '.cm-blockquote-mark': { color: '#868F97' },
        '.cm-hr': {
            display: 'block',
            border: 'none',
            borderTop: '1px solid #333',
            margin: '12px 0',
            height: '0',
            width: '100%',
        },
        '.cm-highlight': {
            background: 'rgba(214,254,81,0.2)',
            color: '#D6FE51',
            borderRadius: '3px',
            padding: '0 2px',
        },
        '.cm-fenced-code': {
            backgroundColor: '#0a0a0a',
            borderLeft: '3px solid #D6FE51',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        },
        // Redline styles (Cycle 6 — kept here so the theme is complete)
        '.cm-redline-original': {
            backgroundColor: 'rgba(255,45,120,0.15) !important',
            color: '#ff8db5 !important',
            textShadow: 'none !important',
        },
        '.cm-redline-original *': {
            color: '#ff8db5 !important',
            backgroundColor: 'transparent !important',
        },
        '.cm-redline-block': { padding: '6px 0 10px' },
        '.cm-redline-proposed-wrap': {
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '8px 10px 8px 14px',
            backgroundColor: 'rgba(214,254,81,0.08)',
            borderLeft: '3px solid #D6FE51',
            borderRadius: '4px',
        },
        '.cm-redline-proposed-body': {
            flex: '1',
            color: '#D6FE51',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            fontFamily: 'inherit',
            lineHeight: '1.6',
        },
        '.cm-redline-actions': { display: 'flex', gap: '6px', flexShrink: '0', alignItems: 'center' },
        '.cm-redline-btn': {
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            gap: '6px', height: '30px', padding: '0 14px', borderRadius: '999px',
            border: '1px solid transparent', cursor: 'pointer', fontSize: '12px',
            fontWeight: '600', fontFamily: 'inherit', lineHeight: '1',
            transition: 'background 120ms, color 120ms, border-color 120ms, transform 80ms',
        },
        '.cm-redline-btn:active': { transform: 'scale(0.97)' },
        '.cm-redline-glyph': { fontSize: '13px', lineHeight: '1' },
        '.cm-redline-label': { fontSize: '12px', lineHeight: '1' },
        '.cm-redline-accept': { background: '#D6FE51', color: '#000', borderColor: 'rgba(214,254,81,0.5)' },
        '.cm-redline-accept:hover': { background: '#e0ff6e', borderColor: '#D6FE51' },
        '.cm-redline-reject': { background: 'rgba(255,45,120,0.14)', color: '#ff85ab', borderColor: 'rgba(255,45,120,0.45)' },
        '.cm-redline-reject:hover': { background: 'rgba(255,45,120,0.24)', borderColor: '#ff2d78', color: '#ff9fbb' },
        // Table live-preview
        '.cm-md-table-wrap': { margin: '12px 0', overflow: 'auto' },
        '.cm-md-table': {
            borderCollapse: 'collapse', fontSize: '13px', fontFamily: 'inherit',
            background: 'transparent', width: 'fit-content', maxWidth: '100%',
        },
        '.cm-md-table th, .cm-md-table td': {
            border: '1px solid #333', padding: '7px 12px', textAlign: 'left',
            verticalAlign: 'top', color: '#fff', lineHeight: '1.5',
        },
        '.cm-md-table th': {
            background: 'rgba(255,255,255,0.05)', fontWeight: 700,
            fontSize: '11px', letterSpacing: '0.04em', textTransform: 'uppercase',
            color: '#D6FE51',
        },
        '.cm-md-table tr:nth-child(even) td': { background: 'rgba(255,255,255,0.02)' },
        // Comment styles (Cycle 7 — kept here so the theme is complete)
        '.cm-comment-marked': { borderBottom: '2px solid rgba(214,254,81,0.65)', cursor: 'pointer' },
        '.cm-comment-marked:hover': { borderBottom: '2px solid #D6FE51', backgroundColor: 'rgba(214,254,81,0.08)' },
        '.cm-comment-marked-resolved': { borderBottom: '2px dotted rgba(138,138,154,0.5)', cursor: 'pointer' },
        '.cm-comment-indicator': {
            display: 'inline-block', marginLeft: '6px', fontSize: '11px',
            cursor: 'pointer', opacity: '0.7', transition: 'opacity 100ms', verticalAlign: 'middle',
        },
        '.cm-comment-indicator:hover': { opacity: '1' },
        '.cm-comment-resolved': { opacity: '0.4' },
    },
    { dark: true },
);

// ── Syntax highlight style ───────────────────────────────────────────────────

const themeCompartment = new Compartment();
const activeViews = new Set<EditorView>();

export function registerEditorView(view: EditorView): () => void {
    activeViews.add(view);
    return () => { activeViews.delete(view); };
}

export function applyEditorThemeToAllViews(theme: ScribeColorTheme): void {
    const ext = syntaxHighlighting(buildHighlightStyle(theme));
    for (const view of activeViews) {
        view.dispatch({ effects: themeCompartment.reconfigure(ext) });
    }
}

function makeEditorThemeExtension(theme: ScribeColorTheme = DWELLIUM_DEFAULT) {
    return themeCompartment.of(syntaxHighlighting(buildHighlightStyle(theme)));
}

export { resolveTheme } from './scribeThemes';
export type { ScribeColorTheme, ScribeTokenKey, ScribeTokens } from './scribeThemes';

// ── Mark-hiding ViewPlugin ───────────────────────────────────────────────────

const hiddenMark = Decoration.mark({ class: 'cm-md-mark-dim' });
const hiddenRange = Decoration.replace({});

const MARK_NODES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'LinkMark']);

function buildMarkDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
    const pending: Array<{ from: number; to: number; replace: boolean }> = [];
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from, to,
            enter(node) {
                if (MARK_NODES.has(node.name)) {
                    const markLine = view.state.doc.lineAt(node.from).number;
                    if (markLine !== cursorLine) {
                        if (node.name === 'HeaderMark') {
                            const lineEnd = view.state.doc.lineAt(node.from).to;
                            pending.push({ from: node.from, to: Math.min(node.to + 1, lineEnd), replace: true });
                        } else {
                            pending.push({ from: node.from, to: node.to, replace: false });
                        }
                    }
                }
            },
        });
    }
    pending.sort((a, b) => a.from - b.from || a.to - b.to);
    let lastTo = -1;
    for (const { from, to, replace } of pending) {
        if (from >= lastTo) {
            builder.add(from, to, replace ? hiddenRange : hiddenMark);
            lastTo = to;
        }
    }
    return builder.finish();
}

const markHidingPlugin = ViewPlugin.fromClass(
    class { decorations: DecorationSet; constructor(view: EditorView) { this.decorations = buildMarkDecorations(view); } update(u: ViewUpdate) { if (u.docChanged || u.selectionSet || u.viewportChanged) { this.decorations = buildMarkDecorations(u.view); } } },
    { decorations: (v) => v.decorations },
);

// ── List marker ViewPlugin ───────────────────────────────────────────────────

const bulletDecoration = Decoration.mark({ class: 'cm-list-bullet' });
const orderedDecoration = Decoration.mark({ class: 'cm-list-ordered' });

function buildListDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const pending: Array<{ from: number; to: number; ordered: boolean }> = [];
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from, to,
            enter(node) {
                if (node.name === 'ListMark') {
                    const marker = view.state.doc.sliceString(node.from, node.to);
                    pending.push({ from: node.from, to: node.to, ordered: /^\d/.test(marker) });
                }
            },
        });
    }
    pending.sort((a, b) => a.from - b.from);
    let lastTo = -1;
    for (const { from, to, ordered } of pending) {
        if (from >= lastTo) {
            builder.add(from, to, ordered ? orderedDecoration : bulletDecoration);
            lastTo = to;
        }
    }
    return builder.finish();
}

const listMarkerPlugin = ViewPlugin.fromClass(
    class { decorations: DecorationSet; constructor(view: EditorView) { this.decorations = buildListDecorations(view); } update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) { this.decorations = buildListDecorations(u.view); } } },
    { decorations: (v) => v.decorations },
);

// ── Blockquote mark ViewPlugin ───────────────────────────────────────────────

const quoteMarkDecoration = Decoration.mark({ class: 'cm-blockquote-mark' });

function buildQuoteDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const pending: Array<{ from: number; to: number }> = [];
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from, to,
            enter(node) { if (node.name === 'QuoteMark') { pending.push({ from: node.from, to: node.to }); } },
        });
    }
    pending.sort((a, b) => a.from - b.from);
    let lastTo = -1;
    for (const { from, to } of pending) {
        if (from >= lastTo) { builder.add(from, to, quoteMarkDecoration); lastTo = to; }
    }
    return builder.finish();
}

const quoteMarkPlugin = ViewPlugin.fromClass(
    class { decorations: DecorationSet; constructor(view: EditorView) { this.decorations = buildQuoteDecorations(view); } update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) { this.decorations = buildQuoteDecorations(u.view); } } },
    { decorations: (v) => v.decorations },
);

// ── Horizontal rule ViewPlugin ───────────────────────────────────────────────

class HrWidget extends WidgetType {
    toDOM(): HTMLElement {
        const el = document.createElement('hr');
        el.className = 'cm-hr';
        el.style.cssText = 'display:block;border:none;border-top:1px solid #333;margin:12px 0;height:0;width:100%;';
        return el;
    }
    eq(): boolean { return true; }
    ignoreEvent(): boolean { return false; }
}

const hrWidgetDec = Decoration.replace({ widget: new HrWidget() });

function buildHrDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const cursorLine = view.state.doc.lineAt(view.state.selection.main.head).number;
    const pending: Array<{ from: number; to: number }> = [];
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from, to,
            enter(node) {
                if (node.name === 'HorizontalRule') {
                    const hrLine = view.state.doc.lineAt(node.from).number;
                    if (hrLine !== cursorLine) pending.push({ from: node.from, to: node.to });
                }
            },
        });
    }
    pending.sort((a, b) => a.from - b.from);
    let lastTo = -1;
    for (const { from, to } of pending) {
        if (from >= lastTo) { builder.add(from, to, hrWidgetDec); lastTo = to; }
    }
    return builder.finish();
}

const hrPlugin = ViewPlugin.fromClass(
    class { decorations: DecorationSet; constructor(view: EditorView) { this.decorations = buildHrDecorations(view); } update(u: ViewUpdate) { if (u.docChanged || u.selectionSet || u.viewportChanged) { this.decorations = buildHrDecorations(u.view); } } },
    { decorations: (v) => v.decorations },
);

// ── ==highlight== ViewPlugin ─────────────────────────────────────────────────

const highlightDec = Decoration.mark({ class: 'cm-highlight' });

function buildHighlightDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const re = /==([^=\n]+)==/g;
    const pending: Array<{ from: number; to: number }> = [];
    for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(text)) !== null) {
            pending.push({ from: from + m.index, to: from + m.index + m[0].length });
        }
    }
    pending.sort((a, b) => a.from - b.from);
    for (const { from, to } of pending) builder.add(from, to, highlightDec);
    return builder.finish();
}

const highlightPlugin = ViewPlugin.fromClass(
    class { decorations: DecorationSet; constructor(view: EditorView) { this.decorations = buildHighlightDecorations(view); } update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) { this.decorations = buildHighlightDecorations(u.view); } } },
    { decorations: (v) => v.decorations },
);

// ── Fenced code block ViewPlugin ─────────────────────────────────────────────

const codeBlockLineDec = Decoration.line({ class: 'cm-fenced-code' });

function buildFencedCodeDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();
    const positions = new Set<number>();
    for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
            from, to,
            enter(node) {
                if (node.name === 'FencedCode') {
                    const clampedFrom = Math.max(node.from, from);
                    const clampedTo = Math.min(node.to, to);
                    if (clampedFrom >= clampedTo) return;
                    const startLine = view.state.doc.lineAt(clampedFrom).number;
                    const endLine = view.state.doc.lineAt(clampedTo - 1).number;
                    for (let ln = startLine; ln <= endLine; ln++) positions.add(view.state.doc.line(ln).from);
                }
            },
        });
    }
    for (const pos of [...positions].sort((a, b) => a - b)) builder.add(pos, pos, codeBlockLineDec);
    return builder.finish();
}

const fencedCodePlugin = ViewPlugin.fromClass(
    class { decorations: DecorationSet; constructor(view: EditorView) { this.decorations = buildFencedCodeDecorations(view); } update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) { this.decorations = buildFencedCodeDecorations(u.view); } } },
    { decorations: (v) => v.decorations },
);

// ── Double-space → period (iOS-style) ────────────────────────────────────────

const DSP_USER_EVENT = 'input.dsp.replace';

function isSentenceTerminator(ch: string): boolean {
    return ch === '.' || ch === '!' || ch === '?' || ch === ':' || ch === ';' || ch === ',';
}

function isInsideCode(view: EditorView, pos: number): boolean {
    const tree = syntaxTree(view.state);
    let node: ReturnType<typeof tree.resolveInner> | null = tree.resolveInner(pos, -1);
    while (node) {
        const n = node.name;
        if (n === 'FencedCode' || n === 'CodeBlock' || n === 'InlineCode') return true;
        node = node.parent;
    }
    return false;
}

const doubleSpacePeriod = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (update.transactions.some((tr) => tr.isUserEvent(DSP_USER_EVENT))) return;
    const sel = update.state.selection.main;
    if (!sel.empty) return;
    const cursor = sel.head;
    if (cursor < 3) return;
    const tail = update.state.doc.sliceString(cursor - 3, cursor);
    if (tail[1] !== ' ' || tail[2] !== ' ') return;
    const c = tail[0];
    if (c === ' ' || c === '\n' || c === '\t' || isSentenceTerminator(c)) return;
    let recentSpace = false;
    update.changes.iterChanges((_fA, _tA, _fB, toB, inserted) => {
        if (inserted.toString().includes(' ') && toB <= cursor && toB >= cursor - 2) recentSpace = true;
    });
    if (!recentSpace) return;
    if (isInsideCode(update.view, cursor)) return;
    const view = update.view;
    Promise.resolve().then(() => {
        view.dispatch({
            changes: { from: cursor - 2, to: cursor, insert: '. ' },
            selection: { anchor: cursor },
            userEvent: DSP_USER_EVENT,
        });
    });
});

// ── Smart Paste ──────────────────────────────────────────────────────────────

const MD_STRUCTURE_RE = /^(\s*)([#>]|[-*+]\s|\d+\.\s|\|)/;

function smartMergeProse(lines: string[]): string {
    const out: string[] = [];
    for (const cur of lines) {
        if (out.length === 0) { out.push(cur); continue; }
        const prev = out[out.length - 1];
        if (prev.trim() === '' || cur.trim() === '') { out.push(cur); continue; }
        const lastChar = prev.trimEnd().slice(-1);
        if (lastChar === '.' || lastChar === '!' || lastChar === '?' || lastChar === ':' || lastChar === ';') { out.push(cur); continue; }
        if (MD_STRUCTURE_RE.test(cur)) { out.push(cur); continue; }
        out[out.length - 1] = prev.trimEnd() + ' ' + cur.trimStart();
    }
    return out.join('\n');
}

function smartPasteTransform(text: string): string {
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const blocks = normalized.split(/\n\n+/);
    return blocks.map((block) => {
        const lines = block.split('\n');
        if (lines.some((l) => /^\s*```/.test(l))) return block;
        return smartMergeProse(lines);
    }).join('\n\n');
}

export const smartPaste: Command = (view) => {
    void (async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            view.dispatch(view.state.replaceSelection(smartPasteTransform(text)));
        } catch { /* clipboard unavailable */ }
    })();
    return true;
};

export const rawPaste: Command = (view) => {
    void (async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            view.dispatch(view.state.replaceSelection(text.replace(/\s+/g, ' ').trim()));
        } catch { /* clipboard unavailable */ }
    })();
    return true;
};

const smartPasteKeymap = keymap.of([
    { key: 'Mod-Shift-v', run: smartPaste },
    { key: 'Mod-Shift-Alt-v', run: rawPaste },
]);

// ── Code block auto-close keymap ─────────────────────────────────────────────

const codeBlockKeymap = keymap.of([{
    key: 'Enter',
    run(view: EditorView): boolean {
        const { state } = view;
        const { from, to } = state.selection.main;
        if (from !== to) return false;
        const line = state.doc.lineAt(from);
        if (from !== line.to) return false;
        if (!line.text.trimStart().startsWith('```')) return false;
        let fenceCount = 0;
        for (let ln = 1; ln < line.number; ln++) {
            if (state.doc.line(ln).text.trimStart().startsWith('```')) fenceCount++;
        }
        if (fenceCount % 2 !== 0) return false;
        view.dispatch(state.update({
            changes: { from, insert: '\n\n```' },
            selection: { anchor: from + 1 },
            scrollIntoView: true,
        }));
        return true;
    },
}]);

// ── Bundled extension array ──────────────────────────────────────────────────

export function getMarkdownExtensions(): Extension[] {
    return [
        codeBlockKeymap,
        closeBrackets(),
        basicSetup,
        markdown({ extensions: [Table] }),
        makeEditorThemeExtension(DWELLIUM_DEFAULT),
        markHidingPlugin,
        listMarkerPlugin,
        quoteMarkPlugin,
        hrPlugin,
        highlightPlugin,
        fencedCodePlugin,
        mdTableField,
        doubleSpacePeriod,
        smartPasteKeymap,
        scribeTheme,
        EditorView.lineWrapping,
    ];
}
