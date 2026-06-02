import { DockItem } from '../../data/types';

interface WidgetSearchProfile {
    summary: string;
    keywords: string[];
    contexts: string[];
    aliases?: string[];
}

export interface WidgetSearchMatch {
    item: DockItem;
    score: number;
    reason: string;
}

const WIDGET_SEARCH_PROFILES: Record<string, WidgetSearchProfile> = {
    'astra-dashboard': {
        summary: 'Property operations dashboard for portfolio monitoring and executive oversight.',
        keywords: ['property', 'portfolio', 'dashboard', 'operations', 'kpi', 'metrics', 'buildings'],
        contexts: ['property management', 'portfolio visibility', 'executive review'],
        aliases: ['astra', 'portfolio dashboard']
    },
    'strata-dashboard': {
        summary: 'Strata management workspace with modules for admin workflows and property operations.',
        keywords: ['strata', 'hoa', 'management', 'property', 'admin', 'work orders'],
        contexts: ['property management', 'resident operations', 'building admin'],
        aliases: ['strata', 'property admin']
    },
    'trello-board': {
        summary: 'Project board for cards, lists, and execution tracking.',
        keywords: ['trello', 'board', 'cards', 'kanban', 'project', 'workflow'],
        contexts: ['project execution', 'task board', 'delivery tracking'],
        aliases: ['kanban', 'project board']
    },
    'task-board': {
        summary: 'Local-first Kanban board: drag cards between columns, auto-timestamps, bulk-move, resizable columns, and a reversible audit log of every user and AI action.',
        keywords: ['task', 'board', 'kanban', 'columns', 'drag', 'timestamp', 'bulk', 'audit', 'reversible', 'undo', 'project', 'todo'],
        contexts: ['task management', 'project execution', 'kanban board', 'work tracking'],
        aliases: ['kanban', 'task board', 'todo board']
    },
    'tag-file': {
        summary: 'Central Tag file: everything tagged anywhere in the app, in one place. Tag cloud with counts, filter by tag, see each item and where it came from.',
        keywords: ['tag', 'tags', 'label', 'tagged', 'tag file', 'index', 'organize', 'cross-widget'],
        contexts: ['organization', 'cross-widget tags', 'tag index', 'knowledge organization'],
        aliases: ['tags', 'tag file', 'labels']
    },
    'control-panel': {
        summary: 'Settings and system controls for shell configuration and operational preferences.',
        keywords: ['settings', 'control', 'preferences', 'config', 'system'],
        contexts: ['configuration', 'admin settings', 'shell controls'],
        aliases: ['settings', 'control panel']
    },
    'thought-weaver': {
        summary: 'AI ideation and synthesis workspace for drafting, strategy, and concept building.',
        keywords: ['thought', 'weaver', 'ideation', 'brainstorm', 'strategy', 'drafting'],
        contexts: ['writing', 'strategy planning', 'AI ideation'],
        aliases: ['brainstorm', 'idea studio']
    },
    'inbox-zero': {
        summary: 'Email triage and approval flow for sorting signal vs noise and routing work.',
        keywords: ['inbox', 'email', 'triage', 'routing', 'approval', 'messages'],
        contexts: ['email operations', 'communications triage', 'task intake'],
        aliases: ['inbox zero', 'mail triage']
    },
    'transcription': {
        summary: 'Transcription and audio analysis workspace for calls, interviews, and recordings.',
        keywords: ['transcribe', 'transcription', 'audio', 'voice', 'meeting', 'recording'],
        contexts: ['meeting notes', 'audio processing', 'speech to text'],
        aliases: ['transcribe', 'speech', 'voice notes']
    },
    'fact-check-log': {
        summary: 'Fact-checking review log for claims, verdicts, and evidence tracking.',
        keywords: ['fact', 'check', 'claims', 'verification', 'evidence', 'truth'],
        contexts: ['research verification', 'compliance review', 'claim validation'],
        aliases: ['fact check', 'verify']
    },
    'home-upkeep-ai': {
        summary: 'AI assistant for maintenance planning, repairs, vendors, and upkeep workflows.',
        keywords: ['upkeep', 'maintenance', 'repair', 'vendor', 'hvac', 'plumbing', 'home'],
        contexts: ['maintenance operations', 'work orders', 'property repairs'],
        aliases: ['upkeep ai', 'maintenance ai']
    },
    'automation-hub': {
        summary: 'Automation planning and orchestration center for recurring workflows and schedules.',
        keywords: ['automation', 'automations', 'workflow', 'scheduler', 'recurring', 'agents'],
        contexts: ['process automation', 'recurring tasks', 'workflow orchestration'],
        aliases: ['automation hub', 'scheduler']
    },
    'two-brains': {
        summary: 'Shared collaboration board for Andy and Lisa with audit log and notes.',
        keywords: ['two brains', 'shared', 'collaboration', 'board', 'audit', 'andy', 'lisa'],
        contexts: ['team collaboration', 'shared workspace', 'executive coordination'],
        aliases: ['collaboration board', 'shared workspace']
    },
    'ara-console': {
        summary: 'ARA AI console for agent workflows, prompts, and research tooling.',
        keywords: ['ara', 'ai', 'console', 'agent', 'assistant', 'prompt', 'research'],
        contexts: ['AI operations', 'agent console', 'assistant workspace'],
        aliases: ['ARA', 'AI console']
    },
    'hierarchy-browser': {
        summary: 'Explorer for domains, nodes, and project hierarchy navigation.',
        keywords: ['explorer', 'hierarchy', 'domains', 'nodes', 'projects', 'tree'],
        contexts: ['information architecture', 'project navigation', 'domain structure'],
        aliases: ['explorer', 'hierarchy']
    },
    'tasks': {
        summary: 'Task management workspace with urgency, status, AI ranking, and reassignment.',
        keywords: ['tasks', 'todo', 'priorities', 'urgency', 'status', 'reassign'],
        contexts: ['task management', 'prioritization', 'execution queue'],
        aliases: ['task list', 'to do']
    },
    'inbox': {
        summary: 'Inbox view for incoming items and operational triage.',
        keywords: ['inbox', 'messages', 'intake', 'incoming', 'queue'],
        contexts: ['task intake', 'communications inbox', 'triage queue'],
        aliases: ['inbox queue']
    },
    'file-manager': {
        summary: 'File manager for uploads, documents, indexing, and storage operations.',
        keywords: ['files', 'file', 'documents', 'uploads', 'storage', 'search'],
        contexts: ['document management', 'file storage', 'knowledge base'],
        aliases: ['file manager', 'documents']
    },
    'notepad': {
        summary: 'Notes workspace for drafting, linked notes, and quick capture.',
        keywords: ['notes', 'notepad', 'memo', 'writing', 'draft', 'journal'],
        contexts: ['note taking', 'knowledge capture', 'drafting'],
        aliases: ['notes', 'notepad']
    },
    'doc-viewer': {
        summary: 'Document viewer for reading and reviewing generated or uploaded docs.',
        keywords: ['docs', 'documents', 'viewer', 'read', 'pdf', 'doc'],
        contexts: ['document review', 'reading', 'file preview'],
        aliases: ['doc viewer', 'document viewer']
    },
    'terminal': {
        summary: 'Terminal access for commands, scripts, and engineering workflows.',
        keywords: ['terminal', 'shell', 'cli', 'command', 'console', 'bash'],
        contexts: ['engineering tools', 'command line', 'developer workflow'],
        aliases: ['shell', 'cli']
    },
    'pdf-gear': {
        summary: 'Full document processing suite — convert PDF to Word, Excel, images, merge, split, compress, watermark, and text extraction.',
        keywords: ['pdf', 'gear', 'convert', 'word', 'excel', 'powerpoint', 'merge', 'split', 'compress', 'watermark', 'ocr', 'image', 'png', 'jpeg', 'txt', 'html', 'docx', 'xlsx', 'template'],
        contexts: ['document conversion', 'PDF tools', 'file processing', 'office documents', 'merge PDFs', 'split PDF'],
        aliases: ['pdf gear', 'pdf converter', 'document converter', 'pdf tools', 'pdf suite']
    }
};

const INTENT_BOOSTS: Array<{ label: string; terms: string[]; components: string[] }> = [
    {
        label: 'maintenance workflow',
        terms: ['maintenance', 'repair', 'vendor', 'hvac', 'plumbing', 'work order'],
        components: ['home-upkeep-ai', 'tasks', 'strata-dashboard', 'astra-dashboard']
    },
    {
        label: 'email triage',
        terms: ['email', 'inbox', 'mail', 'triage', 'message', 'routing'],
        components: ['inbox-zero', 'inbox', 'tasks']
    },
    {
        label: 'automation workflow',
        terms: ['automation', 'automate', 'recurring', 'schedule', 'scheduler', 'workflow', 'agent'],
        components: ['automation-hub', 'ara-console', 'tasks']
    },
    {
        label: 'documents and notes',
        terms: ['document', 'docs', 'pdf', 'file', 'notes', 'notepad', 'knowledge'],
        components: ['file-manager', 'doc-viewer', 'notepad', 'hierarchy-browser', 'pdf-gear']
    },
    {
        label: 'project execution',
        terms: ['project', 'board', 'kanban', 'tasks', 'delivery', 'execution'],
        components: ['trello-board', 'tasks', 'hierarchy-browser']
    },
    {
        label: 'team collaboration',
        terms: ['collaborate', 'shared', 'andy', 'lisa', 'audit', 'workspace'],
        components: ['two-brains', 'notepad', 'trello-board']
    },
    {
        label: 'research and verification',
        terms: ['research', 'fact', 'verify', 'analysis', 'claims', 'evidence'],
        components: ['fact-check-log', 'ara-console', 'thought-weaver']
    }
];

function normalizeText(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(input: string): string[] {
    return normalizeText(input)
        .split(/[\s-]+/)
        .map(t => t.trim())
        .filter(Boolean);
}

function unique<T>(values: T[]): T[] {
    return Array.from(new Set(values));
}

function includesToken(haystack: string[], needle: string): boolean {
    return haystack.some(token => token === needle || token.startsWith(needle) || needle.startsWith(token));
}

export function rankWidgetSearchResults(
    items: DockItem[],
    query: string,
    openComponents: Set<string> = new Set()
): WidgetSearchMatch[] {
    const rawQuery = query.trim();
    if (!rawQuery) return [];

    const queryTokens = unique(tokenize(rawQuery));
    const normalizedQuery = normalizeText(rawQuery);

    return items
        .map((item) => {
            const profile = WIDGET_SEARCH_PROFILES[item.component];
            const label = item.label;
            const group = item.group || '';

            const labelTokens = tokenize(label);
            const groupTokens = tokenize(group);
            const keywordTokens = tokenize(profile?.keywords.join(' ') || '');
            const contextTokens = tokenize(profile?.contexts.join(' ') || '');
            const aliasTokens = tokenize(profile?.aliases?.join(' ') || '');
            const summaryTokens = tokenize(profile?.summary || '');
            const componentTokens = tokenize(item.component.replace(/-/g, ' '));

            const reasons: string[] = [];
            let score = 0;

            if (normalizeText(label).includes(normalizedQuery)) {
                score += 40;
                reasons.push('label match');
            }
            if (normalizeText(group).includes(normalizedQuery) && normalizedQuery.length > 2) {
                score += 14;
                reasons.push(`${group} context`);
            }

            let keywordHits = 0;
            let contextHits = 0;

            for (const token of queryTokens) {
                if (token.length < 2) continue;

                if (includesToken(labelTokens, token)) {
                    score += 18;
                    keywordHits += 1;
                    continue;
                }
                if (includesToken(aliasTokens, token) || includesToken(componentTokens, token)) {
                    score += 12;
                    keywordHits += 1;
                    continue;
                }
                if (includesToken(keywordTokens, token)) {
                    score += 10;
                    keywordHits += 1;
                    continue;
                }
                if (includesToken(contextTokens, token) || includesToken(groupTokens, token)) {
                    score += 8;
                    contextHits += 1;
                    continue;
                }
                if (includesToken(summaryTokens, token)) {
                    score += 4;
                }
            }

            for (const intent of INTENT_BOOSTS) {
                const matchedTerms = intent.terms.filter(term => normalizedQuery.includes(normalizeText(term)));
                if (matchedTerms.length === 0) continue;
                if (!intent.components.includes(item.component)) continue;

                score += matchedTerms.length >= 2 ? 18 : 10;
                reasons.push(intent.label);
            }

            if (openComponents.has(item.component)) {
                score += 2;
                reasons.push('already open');
            }

            if (keywordHits > 0) {
                reasons.push(keywordHits > 1 ? 'keyword hits' : 'keyword');
            }
            if (contextHits > 0) {
                reasons.push(contextHits > 1 ? 'context hits' : 'context');
            }

            if (score <= 0) return null;

            const profileReason = profile?.summary
                ? profile.summary.split('.')[0]
                : `${label} widget`;
            const reason = reasons.length > 0
                ? `${reasons.slice(0, 2).join(' + ')}: ${profileReason}`
                : profileReason;

            return { item, score, reason };
        })
        .filter((match): match is WidgetSearchMatch => Boolean(match))
        .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label));
}
