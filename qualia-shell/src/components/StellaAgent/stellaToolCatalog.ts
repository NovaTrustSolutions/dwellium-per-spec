/**
 * stellaToolCatalog — Stella's broad, organized tool/capability library (Cycle 18).
 *
 * 🔒 PROTECTED widget: STRICTLY ADDITIVE. This is pure data + pure helpers describing the
 * tools Stella can run to complete user tasks, grouped into discoverable categories. The
 * Skills tab renders this catalog above the backend-installed `/skills` list — it does NOT
 * replace or restyle any existing Stella surface.
 *
 * Each tool's `action` reuses an EXISTING Stella mechanism (no new plumbing):
 *   - `chat-command`  → prefill the chat composer with `command` (e.g. `/hermes <task>`),
 *                       routed through the SAME `parseHermesCommand`/sendMessage path.
 *   - `open-widget`   → fire the shell's `dwellium:open-widget` intent bus (reuses
 *                       `stellaLinkage.openWidgetHandoff` / `workspaceScribe.dispatchOpenWidget`),
 *                       targeting a LIVE (non-deprecated) `widgetRegistry.ts` id.
 *   - `info`          → a built-in capability surfaced in another Stella tab (no dispatch).
 *
 * All helpers are pure (take the catalog as an arg, read nothing external) so they
 * unit-test with no DOM, no fetch, no store — mirrors stellaLinkage.ts / stellaHermesSpawn.ts.
 */

export type StellaToolActionKind = 'chat-command' | 'open-widget' | 'info';

export interface StellaToolAction {
    kind: StellaToolActionKind;
    /** For `chat-command`: the text to prefill the composer with (e.g. `/hermes `). */
    command?: string;
    /** For `open-widget`: a LIVE widgetRegistry.ts id (verified). */
    widgetId?: string;
    /** For `open-widget`: human label / lucide icon passed to the intent bus. */
    widgetLabel?: string;
    widgetIcon?: string;
    /** For `info`: which Stella tab surfaces this capability. */
    tab?: string;
}

export interface StellaTool {
    id: string;
    name: string;
    /** Display category — catalog is grouped + ordered by CATEGORY_ORDER. */
    category: string;
    description: string;
    /** Emoji glyph, matching Stella's existing skill-card aesthetic. */
    icon: string;
    /** Lower-case search terms (name + category are also matched implicitly). */
    keywords: string[];
    action: StellaToolAction;
}

/** Canonical display order for the catalog's category sections. */
export const CATEGORY_ORDER: readonly string[] = [
    'AI Skills',
    'Agents & Automation',
    'Thoughts & Insights',
    'Memory & Knowledge',
    'Files & Documents',
    'Research & Analysis',
    'Communication',
];

/**
 * Stella's tool library. Every `open-widget` target is a LIVE registry id
 * (inbox / ara-console / honcho / thought-weaver / transcription / file-manager /
 * doc-viewer / scribe — verified against widgetRegistry.ts). Names are chosen to NOT
 * collide with backend `/skills` entries (e.g. `web-search`, `code-review`) so the Skills
 * tab never renders an ambiguous duplicate label.
 */
export const STELLA_TOOL_CATALOG: ReadonlyArray<StellaTool> = [
    // ── AI Skills (LibreChat-derived executable layer; lib/agents/skills.ts) ──
    // Ids intentionally match AGENT_SKILLS ids so Agent Lab personas can equip
    // them via Persona.tools. `chat-command` prefills a working trigger phrase.
    {
        id: 'skill-web-search',
        name: 'Web Search',
        category: 'AI Skills',
        description: 'Search the live web and summarize findings with sources (Anthropic web-search tool via your key).',
        icon: '',
        keywords: ['search', 'web', 'google', 'tavily', 'internet', 'online', 'librechat'],
        action: { kind: 'chat-command', command: 'search the web for ' },
    },
    {
        id: 'skill-calculator',
        name: 'Calculator',
        category: 'AI Skills',
        description: 'Exact arithmetic — percentages, powers, roots, trig. Instant, keyless.',
        icon: '',
        keywords: ['calculator', 'math', 'compute', 'arithmetic', 'percent', 'librechat'],
        action: { kind: 'chat-command', command: 'calculate ' },
    },
    {
        id: 'skill-image-gen',
        name: 'Image Generation',
        category: 'AI Skills',
        description: 'Generate images from a description (DALL-E 3 via your OpenAI key).',
        icon: '',
        keywords: ['image', 'picture', 'dall-e', 'dalle', 'flux', 'art', 'generate', 'librechat'],
        action: { kind: 'chat-command', command: 'generate an image of ' },
    },
    {
        id: 'skill-weather',
        name: 'Weather',
        category: 'AI Skills',
        description: 'Current conditions + today\'s range for any city — keyless, always works.',
        icon: '',
        keywords: ['weather', 'forecast', 'temperature', 'openweather', 'librechat'],
        action: { kind: 'chat-command', command: 'weather in ' },
    },
    {
        id: 'skill-code-runner',
        name: 'Code Runner (JS)',
        category: 'AI Skills',
        description: 'Run a JavaScript snippet in a sandboxed scope and show the result.',
        icon: '',
        keywords: ['code', 'javascript', 'run', 'execute', 'interpreter', 'sandbox', 'librechat'],
        action: { kind: 'chat-command', command: 'run js: ' },
    },
    {
        id: 'skill-compose-widget',
        name: 'Compose into Widget',
        category: 'AI Skills',
        description: 'Draft text with the LLM and place it inside a widget ("draft a letter in notepad").',
        icon: '',
        keywords: ['draft', 'write', 'compose', 'notepad', 'letter', 'widget-action', 'p11-7'],
        action: { kind: 'chat-command', command: 'draft a letter in notepad' },
    },
    {
        id: 'skill-knowledge-graph',
        name: 'Knowledge Graph',
        category: 'AI Skills',
        description: 'Query the graphify knowledge graph built from your memories, captures, notes, and tasks.',
        icon: '',
        keywords: ['knowledge', 'graph', 'graphify', 'connections', 'memory', 'kg'],
        action: { kind: 'chat-command', command: 'ask the graph about ' },
    },
    {
        id: 'skill-memory-recall',
        name: 'Memory Recall',
        category: 'AI Skills',
        description: 'Search everything you\'ve asked Dwellium to remember.',
        icon: '',
        keywords: ['memory', 'recall', 'remember', 'history', 'librechat'],
        action: { kind: 'chat-command', command: 'recall ' },
    },
    {
        id: 'skill-memory-remember',
        name: 'Remember',
        category: 'AI Skills',
        description: 'Pin a fact to persistent memory — every agent can recall it later.',
        icon: '',
        keywords: ['memory', 'remember', 'note', 'pin', 'save', 'librechat'],
        action: { kind: 'chat-command', command: 'remember that ' },
    },

    // ── Agents & Automation ───────────────────────────────────────────────
    {
        id: 'spawn-hermes',
        name: 'Spawn Hermes Agent',
        category: 'Agents & Automation',
        description: 'Delegate a multi-step task to the self-improving Hermes ReAct agent. Learns from every run.',
        icon: '',
        keywords: ['hermes', 'agent', 'delegate', 'react', 'reasoning', 'autonomous', 'spawn'],
        action: { kind: 'chat-command', command: '/hermes ' },
    },
    {
        id: 'open-hermes-panel',
        name: 'Hermes Control Panel',
        category: 'Agents & Automation',
        description: 'Open the standalone Honcho · Hermes widget — registered tools, run history, and learning.',
        icon: '',
        keywords: ['hermes', 'tools', 'panel', 'honcho', 'control'],
        action: { kind: 'open-widget', widgetId: 'honcho', widgetLabel: 'Honcho', widgetIcon: 'brain' },
    },
    {
        id: 'automation-schedule',
        name: 'Schedule Automation',
        category: 'Agents & Automation',
        description: 'Set up recurring tasks and cron jobs Stella runs on a schedule.',
        icon: '',
        keywords: ['cron', 'schedule', 'automation', 'recurring', 'job', 'task'],
        action: { kind: 'info', tab: 'automation' },
    },
    {
        id: 'mcp-servers',
        name: 'MCP Servers',
        category: 'Agents & Automation',
        description: 'Connect Model Context Protocol servers to extend Stella with external tools.',
        icon: '',
        keywords: ['mcp', 'model context protocol', 'server', 'integration', 'extend'],
        action: { kind: 'info', tab: 'mcp' },
    },

    // ── Thoughts & Insights ───────────────────────────────────────────────
    {
        id: 'capture-thought',
        name: 'Capture a Thought',
        category: 'Thoughts & Insights',
        description: 'Send a thought to ThoughtWeaver — auto-categorized and kept in your local capture log.',
        icon: '',
        keywords: ['thought', 'capture', 'note', 'idea', 'thoughtweaver', 'weaver'],
        action: { kind: 'open-widget', widgetId: 'thought-weaver', widgetLabel: 'ThoughtWeaver', widgetIcon: 'sparkles' },
    },
    {
        id: 'daily-report',
        name: 'Daily Report & Insights',
        category: 'Thoughts & Insights',
        description: 'Generate a daily report, refresh to-do lists, and surface non-obvious insights from your captures.',
        icon: '',
        keywords: ['report', 'daily', 'weekly', 'insight', 'summary', 'todo', 'to-do', 'thoughtweaver'],
        action: { kind: 'open-widget', widgetId: 'thought-weaver', widgetLabel: 'ThoughtWeaver', widgetIcon: 'sparkles' },
    },

    // ── Memory & Knowledge ────────────────────────────────────────────────
    {
        id: 'honcho-memory',
        name: 'Honcho Memory',
        category: 'Memory & Knowledge',
        description: 'Browse and search long-term memory, peers, sessions, and collections in Honcho.',
        icon: '',
        keywords: ['honcho', 'memory', 'recall', 'long-term', 'remember', 'knowledge'],
        action: { kind: 'open-widget', widgetId: 'honcho', widgetLabel: 'Honcho', widgetIcon: 'brain' },
    },
    {
        id: 'stella-memory-explorer',
        name: 'Memory Explorer',
        category: 'Memory & Knowledge',
        description: "Inspect and edit Stella's own context memory files.",
        icon: '',
        keywords: ['memory', 'context', 'explorer', 'files', 'stella'],
        action: { kind: 'info', tab: 'memory' },
    },

    // ── Files & Documents ─────────────────────────────────────────────────
    {
        id: 'scribe-editor',
        name: 'Scribe Editor',
        category: 'Files & Documents',
        description: 'Draft, convert, and ingest documents to Markdown in the Scribe editor.',
        icon: '',
        keywords: ['scribe', 'editor', 'markdown', 'draft', 'write', 'convert', 'ingest'],
        action: { kind: 'open-widget', widgetId: 'scribe', widgetLabel: 'Scribe', widgetIcon: 'pen-tool' },
    },
    {
        id: 'file-manager',
        name: 'File Manager',
        category: 'Files & Documents',
        description: 'Browse, organize, and open your files and converted Markdown documents.',
        icon: '',
        keywords: ['files', 'file manager', 'documents', 'folder', 'browse', 'organize'],
        action: { kind: 'open-widget', widgetId: 'file-manager', widgetLabel: 'Files', widgetIcon: 'folder-open' },
    },
    {
        id: 'doc-viewer',
        name: 'Document Viewer',
        category: 'Files & Documents',
        description: 'View PDFs and documents inline.',
        icon: '',
        keywords: ['doc', 'document', 'viewer', 'pdf', 'read'],
        action: { kind: 'open-widget', widgetId: 'doc-viewer', widgetLabel: 'Doc Viewer', widgetIcon: 'file-text' },
    },

    // ── Research & Analysis ───────────────────────────────────────────────
    {
        id: 'transcription-statute',
        name: 'Transcription & Statute Match',
        category: 'Research & Analysis',
        description: 'Transcribe audio and match segments to relevant legal statutes with fact-checking.',
        icon: '',
        keywords: ['transcribe', 'transcription', 'statute', 'legal', 'fact-check', 'georgia code', 'law'],
        action: { kind: 'open-widget', widgetId: 'transcription', widgetLabel: 'Transcription', widgetIcon: 'mic' },
    },
    {
        id: 'deep-research',
        name: 'Deep Research',
        category: 'Research & Analysis',
        description: 'Ask Stella to research a topic end-to-end and synthesize findings.',
        icon: '',
        keywords: ['research', 'investigate', 'analyze', 'synthesize', 'deep'],
        action: { kind: 'chat-command', command: 'Research the following topic and summarize the key findings: ' },
    },

    // ── Communication ─────────────────────────────────────────────────────
    {
        id: 'inbox-zero',
        name: 'Inbox Zero',
        category: 'Communication',
        description: 'Triage unread email and reach inbox zero.',
        icon: '',
        keywords: ['inbox', 'email', 'triage', 'unread', 'mail', 'inbox zero'],
        action: { kind: 'open-widget', widgetId: 'inbox', widgetLabel: 'Inbox Zero', widgetIcon: 'mail-open' },
    },
    {
        id: 'ara-console',
        name: 'ARA Console',
        category: 'Communication',
        description: "Hand off to ARA, Stella's sibling assistant with deep backend context.",
        icon: '',
        keywords: ['ara', 'console', 'assistant', 'handoff', 'sibling'],
        action: { kind: 'open-widget', widgetId: 'ara-console', widgetLabel: 'ARA', widgetIcon: 'bot' },
    },
];

/** A category section: its name plus the tools in catalog order. */
export interface ToolCategoryGroup {
    category: string;
    tools: StellaTool[];
}

/**
 * Filter tools by a free-text query against name + category + description + keywords
 * (case-insensitive, whitespace-tokenized; every token must match somewhere → AND).
 * Empty/whitespace query returns the catalog unchanged (as a mutable copy).
 */
export function filterTools(
    query: string | null | undefined,
    catalog: ReadonlyArray<StellaTool> = STELLA_TOOL_CATALOG,
): StellaTool[] {
    const q = (query ?? '').trim().toLowerCase();
    if (!q) return [...catalog];
    const tokens = q.split(/\s+/).filter(Boolean);
    return catalog.filter((tool) => {
        const haystack = [
            tool.name,
            tool.category,
            tool.description,
            ...tool.keywords,
        ]
            .join(' ')
            .toLowerCase();
        return tokens.every((tok) => haystack.includes(tok));
    });
}

/**
 * Group a tool list into ordered category sections. Categories appear in CATEGORY_ORDER;
 * any category not in that list is appended afterwards in first-seen order. Empty
 * categories are omitted (so a filtered list only shows sections with matches).
 */
export function groupByCategory(
    tools: ReadonlyArray<StellaTool> = STELLA_TOOL_CATALOG,
): ToolCategoryGroup[] {
    const byCat = new Map<string, StellaTool[]>();
    for (const tool of tools) {
        const arr = byCat.get(tool.category);
        if (arr) arr.push(tool);
        else byCat.set(tool.category, [tool]);
    }
    const ordered: ToolCategoryGroup[] = [];
    const seen = new Set<string>();
    for (const cat of CATEGORY_ORDER) {
        const arr = byCat.get(cat);
        if (arr && arr.length) {
            ordered.push({ category: cat, tools: arr });
            seen.add(cat);
        }
    }
    for (const [cat, arr] of byCat) {
        if (!seen.has(cat) && arr.length) ordered.push({ category: cat, tools: arr });
    }
    return ordered;
}

/** Total tool count — surfaced in the catalog section header. */
export function toolCount(catalog: ReadonlyArray<StellaTool> = STELLA_TOOL_CATALOG): number {
    return catalog.length;
}
