/**
 * slashCommands — the command registry + insertion logic for Scribe's
 * "/" block menu (suitenumerique/docs parity). Pure & dependency-free so the
 * matching/insertion behavior is unit-testable without an editor.
 *
 * The editor integration (detecting "/", showing the menu) consumes
 * `filterSlashCommands(query)` to render options and `commandSnippet(id)` to
 * insert the chosen block at the cursor.
 */

export interface SlashCommand {
    id: string;
    label: string;
    description: string;
    keywords: string[];
    /** Markdown inserted at the cursor. */
    snippet: string;
    /** Where to place the cursor after insertion, as an offset into `snippet`.
     *  Defaults to end of snippet. */
    cursorOffset?: number;
}

export const SLASH_COMMANDS: SlashCommand[] = [
    { id: 'h1', label: 'Heading 1', description: 'Large section heading', keywords: ['h1', 'title', 'heading'], snippet: '# ' },
    { id: 'h2', label: 'Heading 2', description: 'Medium section heading', keywords: ['h2', 'subtitle', 'heading'], snippet: '## ' },
    { id: 'h3', label: 'Heading 3', description: 'Small section heading', keywords: ['h3', 'heading'], snippet: '### ' },
    { id: 'bullet', label: 'Bulleted list', description: 'A simple bulleted list', keywords: ['ul', 'unordered', 'bullet', 'list'], snippet: '- ' },
    { id: 'numbered', label: 'Numbered list', description: 'A numbered list', keywords: ['ol', 'ordered', 'number', 'list'], snippet: '1. ' },
    { id: 'checklist', label: 'To-do list', description: 'A checklist with checkboxes', keywords: ['todo', 'task', 'check', 'checkbox'], snippet: '- [ ] ' },
    { id: 'quote', label: 'Quote', description: 'A block quote', keywords: ['blockquote', 'quote', 'citation'], snippet: '> ' },
    { id: 'code', label: 'Code block', description: 'A fenced code block', keywords: ['code', 'pre', 'fence', 'snippet'], snippet: '```\n\n```', cursorOffset: 4 },
    { id: 'table', label: 'Table', description: 'A 2×2 Markdown table', keywords: ['table', 'grid'], snippet: '| Column A | Column B |\n| --- | --- |\n|  |  |\n', cursorOffset: 0 },
    { id: 'divider', label: 'Divider', description: 'A horizontal rule', keywords: ['hr', 'rule', 'divider', 'separator'], snippet: '\n---\n' },
    { id: 'link', label: 'Link', description: 'A Markdown link', keywords: ['link', 'url', 'anchor', 'href'], snippet: '[](url)', cursorOffset: 1 },
];

/**
 * Filter + rank commands for a query (the text typed after "/"). Empty query
 * returns all commands in registry order. Ranking: label-prefix > keyword-prefix
 * > substring; stable within a tier.
 */
export function filterSlashCommands(query: string): SlashCommand[] {
    const q = query.trim().toLowerCase();
    if (!q) return [...SLASH_COMMANDS];
    const scored: Array<{ cmd: SlashCommand; score: number }> = [];
    for (const cmd of SLASH_COMMANDS) {
        const label = cmd.label.toLowerCase();
        let score = -1;
        if (label.startsWith(q)) score = 3;
        else if (cmd.keywords.some(k => k.startsWith(q))) score = 2;
        else if (label.includes(q) || cmd.keywords.some(k => k.includes(q))) score = 1;
        if (score >= 0) scored.push({ cmd, score });
    }
    return scored
        .map((s, i) => ({ ...s, i }))
        .sort((a, b) => (b.score - a.score) || (a.i - b.i))
        .map(s => s.cmd);
}

export interface SnippetInsertion {
    text: string;
    /** Absolute cursor position within `text` after insertion. */
    cursor: number;
}

/** The markdown to insert for a command id, plus where the cursor should land. */
export function commandSnippet(id: string): SnippetInsertion | null {
    const cmd = SLASH_COMMANDS.find(c => c.id === id);
    if (!cmd) return null;
    const cursor = typeof cmd.cursorOffset === 'number' ? cmd.cursorOffset : cmd.snippet.length;
    return { text: cmd.snippet, cursor };
}
