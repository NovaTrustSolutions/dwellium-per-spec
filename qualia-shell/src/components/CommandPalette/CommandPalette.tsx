import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockItem } from '../../data/types';
import { useWindows } from '../../context/WindowContext';
import { rankWidgetSearchResults } from '../Sidebar/widgetSearch';
import { API_BASE } from '../../config';
import { getIcon } from '../Sidebar/iconMap';
import { parseCommand, recallMemory, type ParsedCommand } from '../../lib/dwelliumCommands';
import { requestAraPrompt } from '../../lib/llmRouter';
import { searchTranscriptions, type TranscriptHit } from '../../lib/transcriptSearch';
import { hiddenWidgetsStore } from '../../lib/hiddenWidgetsStore';
import './CommandPalette.css';

const API_ROOT = API_BASE.replace(/\/+$/, '');
const FILES_API = `${API_ROOT}/api/files`;
const INBOX_API = `${API_ROOT}/api/inbox`;

interface TaskItem {
    id: string;
    title: string;
    description: string;
    source: string;
    projectId: string;
    urgency: 'high' | 'medium' | 'low';
    status: 'open' | 'in_progress' | 'done';
    createdAt: string;
}

interface FileItem {
    id: string;
    name: string;
    type: string;
    projectId?: string;
    projectName?: string;
    tags?: string[];
    createdAt?: string;
    updatedAt?: string;
}

interface NoteItem {
    id: string;
    title: string;
    content: string;
    created_at?: string;
    updated_at?: string;
}

interface InboxMessageItem {
    id: string;
    subject: string;
    sender: string;
    snippet: string;
    body?: string;
    summary?: string;
    signalClass: 'signal' | 'noise' | 'low_priority';
    urgency: 'high' | 'medium' | 'low';
    status: 'pending' | 'approved' | 'archived' | 'deleted';
    routedToProject?: string;
    createdAt?: string;
    updatedAt?: string;
}

type CommandResultKind = 'command' | 'memory' | 'widget' | 'window' | 'task' | 'inbox' | 'file' | 'note' | 'transcript';

interface CommandResult {
    id: string;
    kind: CommandResultKind;
    score: number;
    icon: string;
    title: string;
    subtitle: string;
    meta: string;
    reason: string;
    actionLabel: string;
    payload: unknown;
    semanticSnippet?: string;
}

const PROJECT_NAMES: Record<string, string> = {
    'proj-invoicing': 'Invoicing',
    'proj-msa': 'MSA Management',
    'proj-onboarding': 'Onboarding',
    'proj-gdpr': 'GDPR / Privacy',
    'proj-inventory': 'Inventory',
    'proj-brand-guidelines': 'Brand Guidelines',
    'proj-reports': 'Financial Reports',
    'proj-hive': 'The Hive',
    'proj-dashboard': 'AI-Dashboard369',
    'unrouted': 'Unrouted',
};

const KIND_LABELS: Record<CommandResultKind, string> = {
    command: 'Command',
    memory: 'Memory',
    widget: 'Widget',
    window: 'Open Window',
    task: 'Task',
    inbox: 'Inbox',
    file: 'Document',
    note: 'Note',
    transcript: 'Transcript',
};

const SECTION_ORDER: CommandResultKind[] = ['command', 'window', 'widget', 'memory', 'task', 'inbox', 'file', 'note', 'transcript'];
const SECTION_TITLES: Record<CommandResultKind, string> = {
    command: 'Command',
    memory: 'Memory',
    window: 'Open Windows',
    widget: 'Widgets',
    task: 'Tasks',
    inbox: 'Inbox Messages',
    file: 'Documents',
    note: 'Notes',
    transcript: 'Audio Transcripts',
};
const SECTION_LIMITS: Record<CommandResultKind, number> = {
    command: 3,
    memory: 5,
    window: 5,
    widget: 6,
    task: 6,
    inbox: 6,
    file: 6,
    note: 5,
    transcript: 5,
};

interface ResultSection {
    kind: CommandResultKind;
    title: string;
    items: CommandResult[];
}

function normalizeText(input: string): string {
    return input.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(input: string): string[] {
    return normalizeText(input).split(/[\s-]+/).filter(Boolean);
}

function includesToken(tokens: string[], needle: string): boolean {
    return tokens.some(token => token === needle || token.startsWith(needle) || needle.startsWith(token));
}

function clamp(text: string, max = 110): string {
    if (!text) return '';
    const singleLine = text.replace(/\s+/g, ' ').trim();
    if (singleLine.length <= max) return singleLine;
    return `${singleLine.slice(0, max - 1)}…`;
}

function isDefined<T>(value: T | null | undefined): value is T {
    return value != null;
}

function buildTaskResults(tasks: TaskItem[], query: string): CommandResult[] {
    const q = query.trim();
    const normalizedQuery = normalizeText(q);
    const qTokens = tokenize(q);

    return tasks
        .map((task) => {
            const titleTokens = tokenize(task.title);
            const descTokens = tokenize(task.description || '');
            const projectName = PROJECT_NAMES[task.projectId] || task.projectId;
            const projectTokens = tokenize(projectName);
            const statusTokens = tokenize(task.status.replace(/_/g, ' '));
            const sourceTokens = tokenize(task.source);

            let score = 0;
            const reasons: string[] = [];

            if (!q) {
                const urgencyBase = task.urgency === 'high' ? 44 : task.urgency === 'medium' ? 34 : 24;
                const statusPenalty = task.status === 'done' ? -12 : task.status === 'in_progress' ? 0 : 8;
                score = urgencyBase + statusPenalty;
                if (task.urgency === 'high') reasons.push('high urgency');
                if (task.status === 'open') reasons.push('open task');
            } else {
                if (normalizeText(task.title).includes(normalizedQuery)) {
                    score += 44;
                    reasons.push('title match');
                }
                if (normalizeText(projectName).includes(normalizedQuery) && normalizedQuery.length > 2) {
                    score += 12;
                    reasons.push('project match');
                }
                if (normalizeText(task.description || '').includes(normalizedQuery) && normalizedQuery.length > 3) {
                    score += 10;
                }

                for (const token of qTokens) {
                    if (token.length < 2) continue;
                    if (includesToken(titleTokens, token)) {
                        score += 18;
                        continue;
                    }
                    if (includesToken(projectTokens, token)) {
                        score += 12;
                        continue;
                    }
                    if (includesToken(statusTokens, token) || includesToken(sourceTokens, token)) {
                        score += 8;
                        continue;
                    }
                    if (includesToken(descTokens, token)) {
                        score += 6;
                    }
                }

                if (/(urgent|priority|asap|today|overdue)/i.test(q) && task.urgency === 'high') {
                    score += 16;
                    reasons.push('priority intent');
                }
                if (/(done|completed|closed)/i.test(q) && task.status === 'done') {
                    score += 10;
                    reasons.push('status intent');
                }
                if (/(email|gmail|inbox)/i.test(q) && task.source === 'inbox') {
                    score += 10;
                    reasons.push('email task');
                }
            }

            if (task.status !== 'done') score += 3;
            if (task.urgency === 'high') score += 4;

            if (score <= 0) return null;

            return {
                id: `task:${task.id}`,
                kind: 'task' as const,
                score,
                icon: task.urgency === 'high' ? '' : task.urgency === 'medium' ? '' : '',
                title: task.title,
                subtitle: clamp(task.description || '', 90),
                meta: `${projectName} · ${task.status.replace('_', ' ')} · ${task.source}`,
                reason: reasons.join(' + ') || 'task relevance',
                actionLabel: 'Open in Tasks',
                payload: task,
            };
        })
        .filter(isDefined)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, q ? 10 : 6);
}

function buildInboxResults(items: InboxMessageItem[], query: string): CommandResult[] {
    const q = query.trim();
    const normalizedQuery = normalizeText(q);
    const qTokens = tokenize(q);

    return items
        .map((item) => {
            const subjectTokens = tokenize(item.subject || '');
            const senderTokens = tokenize(item.sender || '');
            const summaryText = item.summary || item.snippet || '';
            const summaryTokens = tokenize(summaryText);
            const bodyTokens = tokenize(item.body || '');
            const signalTokens = tokenize(item.signalClass.replace(/_/g, ' '));
            const statusTokens = tokenize(item.status);
            const urgencyTokens = tokenize(item.urgency);

            let score = 0;
            const reasons: string[] = [];

            if (!q) {
                const signalBoost = item.signalClass === 'signal' ? 20 : item.signalClass === 'low_priority' ? 10 : 4;
                const urgencyBoost = item.urgency === 'high' ? 18 : item.urgency === 'medium' ? 10 : 4;
                const statusBoost = item.status === 'pending' ? 18 : item.status === 'approved' ? 8 : -4;
                score = signalBoost + urgencyBoost + statusBoost + 16;
                if (item.signalClass === 'signal') reasons.push('signal item');
                if (item.status === 'pending') reasons.push('pending');
            } else {
                if (normalizeText(item.subject || '').includes(normalizedQuery)) {
                    score += 42;
                    reasons.push('subject match');
                }
                if (normalizeText(item.sender || '').includes(normalizedQuery) && normalizedQuery.length > 2) {
                    score += 18;
                    reasons.push('sender match');
                }
                if (normalizeText(summaryText).includes(normalizedQuery) && normalizedQuery.length > 3) {
                    score += 12;
                }

                for (const token of qTokens) {
                    if (token.length < 2) continue;
                    if (includesToken(subjectTokens, token)) {
                        score += 18;
                        continue;
                    }
                    if (includesToken(senderTokens, token)) {
                        score += 14;
                        continue;
                    }
                    if (includesToken(signalTokens, token) || includesToken(statusTokens, token) || includesToken(urgencyTokens, token)) {
                        score += 9;
                        continue;
                    }
                    if (includesToken(summaryTokens, token)) {
                        score += 7;
                        continue;
                    }
                    if (includesToken(bodyTokens, token)) {
                        score += 4;
                    }
                }

                if (/(email|mail|inbox|message)/i.test(q)) {
                    score += 8;
                    reasons.push('inbox intent');
                }
                if (/(pending|triage|unread)/i.test(q) && item.status === 'pending') {
                    score += 10;
                    reasons.push('pending intent');
                }
                if (/(important|priority|urgent)/i.test(q) && (item.signalClass === 'signal' || item.urgency === 'high')) {
                    score += 12;
                    reasons.push('priority intent');
                }
            }

            if (item.signalClass === 'signal') score += 4;
            if (item.urgency === 'high') score += 4;
            if (score <= 0) return null;

            const urgencyIcon = item.urgency === 'high' ? '' : item.urgency === 'medium' ? '' : '';
            const signalLabel = item.signalClass.replace('_', ' ');

            return {
                id: `inbox:${item.id}`,
                kind: 'inbox' as const,
                score,
                icon: urgencyIcon,
                title: item.subject || '(No Subject)',
                subtitle: clamp(summaryText || item.snippet || '', 90),
                meta: `${item.sender} · ${signalLabel} · ${item.status}`,
                reason: reasons.join(' + ') || 'inbox relevance',
                actionLabel: 'Open Inbox Zero',
                payload: item,
            };
        })
        .filter(isDefined)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, q ? 10 : 6);
}

function buildWindowResults(
    windows: ReturnType<typeof useWindows>['windows'],
    dockItems: DockItem[],
    query: string
): CommandResult[] {
    const q = query.trim();
    const normalizedQuery = normalizeText(q);
    const qTokens = tokenize(q);
    const dockByComponent = new Map(dockItems.map(item => [item.component, item]));

    return windows
        .map((win) => {
            const dock = dockByComponent.get(win.component);
            const title = win.title || dock?.label || win.component;
            const metaText = [win.component, dock?.group, win.minimized ? 'minimized' : 'visible'].filter(Boolean).join(' ');
            const titleTokens = tokenize(title);
            const metaTokens = tokenize(metaText);

            let score = 0;
            const reasons: string[] = [];

            if (!q) {
                score = 42 + Math.min(win.zIndex, 50);
                if (win.minimized) score -= 6;
                reasons.push(win.minimized ? 'open (minimized)' : 'open window');
            } else {
                if (normalizeText(title).includes(normalizedQuery)) {
                    score += 48;
                    reasons.push('title match');
                }
                for (const token of qTokens) {
                    if (token.length < 2) continue;
                    if (includesToken(titleTokens, token)) {
                        score += 18;
                        continue;
                    }
                    if (includesToken(metaTokens, token)) {
                        score += 10;
                        continue;
                    }
                }
                if (/(window|open|current|active)/i.test(q)) {
                    score += 10;
                    reasons.push('window intent');
                }
                if (win.minimized && /(minimized|hidden|restore)/i.test(q)) {
                    score += 10;
                    reasons.push('restore intent');
                }
            }

            if (score <= 0) return null;

            return {
                id: `window:${win.id}`,
                kind: 'window' as const,
                score,
                icon: win.icon || dock?.icon || '',
                title,
                subtitle: dock?.group || 'Open window',
                meta: `${win.minimized ? 'Minimized' : 'Visible'} · z${win.zIndex}`,
                reason: reasons.join(' + ') || 'window relevance',
                actionLabel: win.minimized ? 'Restore Window' : 'Focus Window',
                payload: win,
            };
        })
        .filter(isDefined)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, q ? 8 : 5);
}

function buildFileResults(
    files: FileItem[],
    query: string,
    semanticHits: Map<string, { boost: number; snippet?: string }>
): CommandResult[] {
    const q = query.trim();
    const normalizedQuery = normalizeText(q);
    const qTokens = tokenize(q);

    return files
        .map((file) => {
            const typeLabel = (file.type || 'file').toUpperCase();
            const nameTokens = tokenize(file.name || '');
            const typeTokens = tokenize(file.type || '');
            const projectTokens = tokenize(file.projectName || file.projectId || '');
            const tagTokens = tokenize((file.tags || []).join(' '));
            const semantic = semanticHits.get(file.id);

            let score = 0;
            const reasons: string[] = [];

            if (!q) {
                score = 28;
                reasons.push('recent document');
            } else {
                if (normalizeText(file.name || '').includes(normalizedQuery)) {
                    score += 44;
                    reasons.push('name match');
                }
                for (const token of qTokens) {
                    if (token.length < 2) continue;
                    if (includesToken(nameTokens, token)) {
                        score += 18;
                        continue;
                    }
                    if (includesToken(typeTokens, token) || includesToken(tagTokens, token)) {
                        score += 10;
                        continue;
                    }
                    if (includesToken(projectTokens, token)) {
                        score += 8;
                    }
                }
                if (/(doc|docs|document|pdf|contract|agreement|report|policy)/i.test(q)) {
                    score += 8;
                    reasons.push('document intent');
                }
            }

            if (semantic) {
                score += semantic.boost;
                reasons.push('semantic context');
            }

            if (score <= 0) return null;

            return {
                id: `file:${file.id}`,
                kind: 'file' as const,
                score,
                icon: file.type === 'pdf' ? '' : '',
                title: file.name,
                subtitle: file.projectName || file.projectId || 'Document file',
                meta: [typeLabel, ...(file.tags && file.tags.length ? [file.tags.slice(0, 2).join(', ')] : [])].join(' · '),
                reason: reasons.join(' + ') || 'document relevance',
                actionLabel: 'Open in Docs',
                payload: file,
                semanticSnippet: semantic?.snippet ? clamp(semantic.snippet, 140) : undefined,
            };
        })
        .filter(isDefined)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, q ? 10 : 6);
}

function buildNoteResults(notes: NoteItem[], query: string): CommandResult[] {
    const q = query.trim();
    const normalizedQuery = normalizeText(q);
    const qTokens = tokenize(q);

    return notes
        .map((note) => {
            const titleTokens = tokenize(note.title || '');
            const contentTokens = tokenize(note.content || '');
            let score = 0;
            const reasons: string[] = [];

            if (!q) {
                score = 24;
                reasons.push('recent note');
            } else {
                if (normalizeText(note.title || '').includes(normalizedQuery)) {
                    score += 42;
                    reasons.push('title match');
                }
                if (normalizeText(note.content || '').includes(normalizedQuery) && normalizedQuery.length > 3) {
                    score += 10;
                }
                for (const token of qTokens) {
                    if (token.length < 2) continue;
                    if (includesToken(titleTokens, token)) {
                        score += 18;
                        continue;
                    }
                    if (includesToken(contentTokens, token)) {
                        score += 6;
                    }
                }
                if (/(note|notes|memo|draft|journal)/i.test(q)) {
                    score += 8;
                    reasons.push('note intent');
                }
            }

            if (score <= 0) return null;

            return {
                id: `note:${note.id}`,
                kind: 'note' as const,
                score,
                icon: '',
                title: note.title || 'Untitled Note',
                subtitle: clamp(note.content || '', 90),
                meta: 'Notepad',
                reason: reasons.join(' + ') || 'note relevance',
                actionLabel: 'Open in Notepad',
                payload: note,
            };
        })
        .filter(isDefined)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, q ? 8 : 5);
}

function parseSemanticHits(raw: unknown): Map<string, { boost: number; snippet?: string }> {
    const map = new Map<string, { boost: number; snippet?: string }>();
    if (!Array.isArray(raw)) return map;

    for (const row of raw) {
        const item = row as Record<string, unknown>;
        const fileId = typeof item.fileId === 'string' ? item.fileId : null;
        if (!fileId) continue;
        const similarity = typeof item.similarity === 'number' ? item.similarity : 0;
        const existing = map.get(fileId);
        const boost = Math.max(6, Math.round(similarity * 32));
        const snippet = typeof item.text === 'string' ? item.text : undefined;

        if (!existing || boost > existing.boost) {
            map.set(fileId, { boost, snippet });
        }
    }

    return map;
}

export default function CommandPalette() {
    const { windows, dockItems, openWindow, focusWindow, restoreWindow } = useWindows();
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [tasks, setTasks] = useState<TaskItem[]>([]);
    const [inboxItems, setInboxItems] = useState<InboxMessageItem[]>([]);
    const [files, setFiles] = useState<FileItem[]>([]);
    const [notes, setNotes] = useState<NoteItem[]>([]);
    const [semanticHits, setSemanticHits] = useState<Map<string, { boost: number; snippet?: string }>>(new Map());
    const [loadingTasks, setLoadingTasks] = useState(false);
    const [loadingInbox, setLoadingInbox] = useState(false);
    const [loadingDocs, setLoadingDocs] = useState(false);
    const [remoteWarning, setRemoteWarning] = useState<string>('');

    const inputRef = useRef<HTMLInputElement>(null);
    const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
    const requestSeqRef = useRef(0);
    const tasksLoadedRef = useRef(false);
    const inboxLoadedRef = useRef(false);

    const openPalette = useCallback(() => {
        // Refresh dynamic sources on each open so recent task/inbox changes are searchable.
        tasksLoadedRef.current = false;
        inboxLoadedRef.current = false;
        setIsOpen(true);
        setRemoteWarning('');
        requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
    }, []);

    const closePalette = useCallback(() => {
        setIsOpen(false);
        setSelectedIndex(0);
    }, []);

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                e.stopPropagation();
                openPalette();
                return;
            }
            if (!isOpen) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePalette();
            }
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [isOpen, openPalette, closePalette]);

    useEffect(() => {
        if (!isOpen) return;
        if (tasksLoadedRef.current) return;

        let cancelled = false;
        setLoadingTasks(true);
        fetch('/api/tasks')
            .then(res => res.json())
            .then(json => {
                if (cancelled) return;
                if (json?.success && Array.isArray(json.data)) {
                    setTasks(json.data as TaskItem[]);
                    tasksLoadedRef.current = true;
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRemoteWarning('Task search unavailable (showing widgets/windows/docs only).');
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingTasks(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        if (inboxLoadedRef.current) return;

        let cancelled = false;
        setLoadingInbox(true);
        fetch(`${INBOX_API}?limit=80`)
            .then(res => res.json())
            .then(json => {
                if (cancelled) return;
                if (json?.success && Array.isArray(json.data)) {
                    setInboxItems(json.data as InboxMessageItem[]);
                    inboxLoadedRef.current = true;
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setRemoteWarning(prev => prev || 'Inbox search unavailable (showing other sources).');
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingInbox(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const trimmed = query.trim();
        const reqId = ++requestSeqRef.current;
        const timer = setTimeout(async () => {
            setLoadingDocs(true);
            try {
                const fileUrl = new URL(FILES_API);
                const noteUrl = new URL(`${FILES_API}/notes`);
                if (trimmed) {
                    fileUrl.searchParams.set('q', trimmed);
                    noteUrl.searchParams.set('q', trimmed);
                    fileUrl.searchParams.set('limit', '16');
                    noteUrl.searchParams.set('limit', '12');
                } else {
                    fileUrl.searchParams.set('limit', '10');
                    noteUrl.searchParams.set('limit', '8');
                }

                const requests: Promise<Response>[] = [
                    fetch(fileUrl.toString()),
                    fetch(noteUrl.toString()),
                ];

                const shouldSemanticSearch = trimmed.length >= 3;
                if (shouldSemanticSearch) {
                    requests.push(fetch(`${FILES_API}/search`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: trimmed, topK: 8 }),
                    }));
                }

                const settled = await Promise.allSettled(requests);
                if (reqId !== requestSeqRef.current) return;

                const [filesRes, notesRes, semanticRes] = settled;
                let nextFiles: FileItem[] = [];
                let nextNotes: NoteItem[] = [];
                let nextSemantic = new Map<string, { boost: number; snippet?: string }>();

                if (filesRes.status === 'fulfilled') {
                    const json = await filesRes.value.json();
                    if (json?.success && Array.isArray(json.data)) nextFiles = json.data as FileItem[];
                }

                if (notesRes.status === 'fulfilled') {
                    const json = await notesRes.value.json();
                    if (json?.success && Array.isArray(json.data)) nextNotes = json.data as NoteItem[];
                }

                if (semanticRes && semanticRes.status === 'fulfilled') {
                    const json = await semanticRes.value.json();
                    if (json?.success) nextSemantic = parseSemanticHits(json.data);
                }

                setFiles(nextFiles.filter(file => ['pdf', 'doc', 'docx', 'txt', 'md'].includes((file.type || '').toLowerCase())));
                setNotes(nextNotes);
                setSemanticHits(nextSemantic);
            } catch {
                if (reqId !== requestSeqRef.current) return;
                setRemoteWarning(prev => prev || 'Document search unavailable right now.');
            } finally {
                if (reqId === requestSeqRef.current) setLoadingDocs(false);
            }
        }, 180);

        return () => clearTimeout(timer);
    }, [isOpen, query]);

    const results = useMemo(() => {
        const queryValue = query.trim();
        const openComponents = new Set(windows.map(w => w.component));

        // 2026-06-12 (Ilya): hidden widgets (e.g. retired Terminal) don't
        // surface in ⌘K rows either — the deliberate door is the COMMAND
        // tier ("open terminal" still parses via dwelliumCommands).
        const hiddenSet = new Set(hiddenWidgetsStore.getSnapshot());
        const visibleDockItems = dockItems.filter(item => !hiddenSet.has(item.component));

        const widgetResults: CommandResult[] = rankWidgetSearchResults(visibleDockItems, queryValue || 'open tools', openComponents)
            .slice(0, queryValue ? 10 : 6)
            .map(match => ({
                id: `widget:${match.item.id}`,
                kind: 'widget',
                score: match.score + (queryValue ? 0 : 8),
                icon: match.item.icon,
                title: match.item.label,
                subtitle: match.item.group || 'Widget',
                meta: match.item.component,
                reason: match.reason,
                actionLabel: openComponents.has(match.item.component) ? 'Focus Widget' : 'Open Widget',
                payload: match.item,
            }));

        const windowResults = buildWindowResults(windows, dockItems, queryValue);
        const taskResults = buildTaskResults(tasks, queryValue);
        const inboxResults = buildInboxResults(inboxItems, queryValue);
        const fileResults = buildFileResults(files, queryValue, semanticHits);
        const noteResults = buildNoteResults(notes, queryValue);

        // Talk-to-customize: a parsed command ("switch to research", "accent teal",
        // "save space Morning", "open strata") runs straight from the palette.
        const parsedCmd = queryValue ? parseCommand(queryValue) : null;
        const commandResults: CommandResult[] = parsedCmd
            ? [{ id: `command:${parsedCmd.label}`, kind: 'command', score: 1000, icon: 'wand-2', title: parsedCmd.label, subtitle: 'Run this command', meta: 'talk-to-customize', reason: 'matched intent', actionLabel: 'Run', payload: parsedCmd }]
            : [];
        // Phase-10 B2: multi-word queries no exact parser claims get an
        // "Ask ARA" row — ARA re-runs the tiers + llmRouter normalization
        // ("can you get the strata thing up" → "open strata"). Low score so
        // real matches always rank above it.
        const askAraResults: CommandResult[] = (!parsedCmd && queryValue.trim().split(/\s+/).length >= 2)
            ? [{ id: 'command:ask-ara', kind: 'command', score: 24, icon: 'sparkles', title: `Ask ARA: "${queryValue.trim().slice(0, 60)}"`, subtitle: 'Route with AI', meta: 'ara-route', reason: 'no exact command match', actionLabel: 'Send', payload: { araRoute: true as const, text: queryValue.trim() } }]
            : [];
        // One Memory: recall across honcho + copaw + thought-weaver.
        const memoryResults: CommandResult[] = (queryValue.length >= 3 ? recallMemory(queryValue) : [])
            .slice(0, 6)
            .map(h => ({ id: `memory:${h.id}`, kind: 'memory', score: 28 + h.score, icon: 'brain', title: h.text.slice(0, 90), subtitle: `Memory · ${h.source}`, meta: h.source, reason: 'recall', actionLabel: 'Open Honcho', payload: h }));
        // Speaker-Library 2026-06-12: saved audio transcriptions, searchable
        // by SPEAKER NAME (rank boost), title, or spoken text.
        const transcriptResults: CommandResult[] = (queryValue.length >= 2 ? searchTranscriptions(queryValue) : [])
            .map(h => ({
                id: `transcript:${h.id}`, kind: 'transcript' as const,
                score: h.speakerMatch ? 34 : 24,
                icon: 'mic', title: h.title,
                subtitle: h.speakerMatch ? `Spoken by ${h.speakerMatch}` : (h.snippet || 'Audio transcript'),
                meta: 'transcription', reason: h.speakerMatch ? 'speaker match' : 'text match',
                actionLabel: 'Open Transcript', payload: h,
            }));

        const merged = [...commandResults, ...askAraResults, ...windowResults, ...widgetResults, ...memoryResults, ...transcriptResults, ...taskResults, ...inboxResults, ...fileResults, ...noteResults]
            .sort((a, b) => {
                if (b.score !== a.score) return b.score - a.score;
                if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
                return a.title.localeCompare(b.title);
            });

        return merged;
    }, [query, windows, dockItems, tasks, inboxItems, files, notes, semanticHits]);

    const sections = useMemo<ResultSection[]>(() => {
        const buckets = new Map<CommandResultKind, CommandResult[]>();
        for (const result of results) {
            const bucket = buckets.get(result.kind);
            if (bucket) bucket.push(result);
            else buckets.set(result.kind, [result]);
        }

        return SECTION_ORDER
            .map((kind) => ({
                kind,
                title: SECTION_TITLES[kind],
                items: (buckets.get(kind) || [])
                    .slice()
                    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
                    .slice(0, SECTION_LIMITS[kind]),
            }))
            .filter(section => section.items.length > 0);
    }, [results]);

    const orderedResults = useMemo(
        () => sections.flatMap(section => section.items),
        [sections]
    );

    useEffect(() => {
        if (!isOpen) return;
        setSelectedIndex(0);
    }, [isOpen, query]);

    useEffect(() => {
        if (!isOpen) return;
        const el = itemRefs.current[selectedIndex];
        el?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex, isOpen, orderedResults]);

    const dispatchDeferred = useCallback((eventName: string, detail: unknown, delayMs = 0) => {
        window.setTimeout(() => {
            window.dispatchEvent(new CustomEvent(eventName, { detail }));
        }, delayMs);
    }, []);

    const handleRun = useCallback((result: CommandResult) => {
        if (result.kind === 'command') {
            const payload = result.payload as ParsedCommand | { araRoute: true; text: string };
            if ('araRoute' in payload) {
                // Phase-10 B2: hand the query to ARA (pending-slot bus covers
                // the lazy-chunk mount race) and bring ARA forward.
                window.dispatchEvent(new CustomEvent('dwellium:open-widget', { detail: { widgetId: 'ara-console' } }));
                requestAraPrompt(payload.text);
                closePalette();
                return;
            }
            payload.run();
            closePalette();
            return;
        }
        if (result.kind === 'memory') {
            openWindow('honcho', 'Honcho', 'brain');
            closePalette();
            return;
        }
        if (result.kind === 'widget') {
            const item = result.payload as DockItem;
            const existing = windows.find(w => w.component === item.component);
            if (existing) {
                if (existing.minimized) restoreWindow(existing.id);
                else focusWindow(existing.id);
            } else {
                openWindow(item.component, item.label, item.icon);
            }
            closePalette();
            return;
        }

        if (result.kind === 'window') {
            const win = result.payload as (typeof windows)[number];
            if (win.minimized) restoreWindow(win.id);
            else focusWindow(win.id);
            closePalette();
            return;
        }

        if (result.kind === 'task') {
            const task = result.payload as TaskItem;
            openWindow('tasks', 'Tasks', 'check-square');
            dispatchDeferred('qualia-taskmenu-focus-task', { taskId: task.id, title: task.title });
            closePalette();
            return;
        }

        if (result.kind === 'transcript') {
            // Speaker-Library 2026-06-12: open the saved transcription.
            const hit = result.payload as TranscriptHit;
            openWindow('transcription', 'Transcription Hub', 'mic');
            dispatchDeferred('dwellium:open-transcription-log', { logId: hit.id }, 400);
            closePalette();
            return;
        }

        if (result.kind === 'inbox') {
            const item = result.payload as InboxMessageItem;
            openWindow('inbox-zero', 'Inbox Zero', 'mail-open');
            dispatchDeferred('qualia-inbox-focus-item', {
                itemId: item.id,
                subject: item.subject,
                status: item.status,
            }, 80);
            closePalette();
            return;
        }

        if (result.kind === 'file') {
            const file = result.payload as FileItem;
            openWindow('doc-viewer', 'Docs', 'file-text');
            dispatchDeferred('qualia-docviewer-open-file', { fileId: file.id, name: file.name });
            closePalette();
            return;
        }

        if (result.kind === 'note') {
            const note = result.payload as NoteItem;
            openWindow('notepad', 'Notepad', 'file-edit');
            dispatchDeferred('qualia-notepad-open-note', { noteId: note.id, title: note.title });
            closePalette();
        }
    }, [windows, restoreWindow, focusWindow, openWindow, closePalette, dispatchDeferred]);

    const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (orderedResults.length > 0) setSelectedIndex(idx => (idx + 1) % orderedResults.length);
            return;
        }
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (orderedResults.length > 0) setSelectedIndex(idx => (idx - 1 + orderedResults.length) % orderedResults.length);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            const selected = orderedResults[selectedIndex];
            if (selected) handleRun(selected);
            return;
        }
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closePalette();
            return;
        }
        if (e.key === 'Tab' && orderedResults.length > 0) {
            e.preventDefault();
            setSelectedIndex(idx => (idx + (e.shiftKey ? -1 : 1) + orderedResults.length) % orderedResults.length);
        }
    };

    if (!isOpen) return null;

    const activeResult = orderedResults[selectedIndex] || null;
    const resultIndexById = new Map(orderedResults.map((result, index) => [result.id, index]));

    return (
        <div className="command-palette" role="dialog" aria-modal="true" aria-label="AI search command palette">
            <button className="command-palette__scrim" aria-label="Close command palette" onClick={closePalette} />

            <div className="command-palette__panel">
                <div className="command-palette__header">
                    <div className="command-palette__badge">AI Search</div>
                    <div className="command-palette__title">Unified Command Palette</div>
                    <div className="command-palette__hint">Widgets, open windows, tasks, and documents</div>
                </div>

                <div className="command-palette__input-row">
                    <span className="command-palette__input-icon">⌕</span>
                    <input
                        ref={inputRef}
                        className="command-palette__input"
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={onInputKeyDown}
                        placeholder="Search by keyword or intent (e.g. urgent invoice task, fire inspection report, open docs)"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    {(loadingTasks || loadingInbox || loadingDocs) && <span className="command-palette__loading">Searching…</span>}
                </div>

                {remoteWarning && <div className="command-palette__warning">{remoteWarning}</div>}

                <div className="command-palette__results" role="listbox" aria-label="Search results">
                    {orderedResults.length === 0 ? (
                        <div className="command-palette__empty">
                            <div className="command-palette__empty-icon"></div>
                            <div className="command-palette__empty-title">No matches found</div>
                            <div className="command-palette__empty-subtitle">Try broader keywords or a workflow intent phrase.</div>
                        </div>
                    ) : (
                        sections.map((section) => (
                            <div key={section.kind} className="command-palette__section">
                                <div className="command-palette__section-header">
                                    <span className="command-palette__section-title">{section.title}</span>
                                    <span className="command-palette__section-count">{section.items.length}</span>
                                </div>
                                {section.items.map((result) => {
                                    const index = resultIndexById.get(result.id) ?? -1;
                                    return (
                                        <button
                                            key={result.id}
                                            ref={el => { if (index >= 0) itemRefs.current[index] = el; }}
                                            className={`command-palette__result ${index === selectedIndex ? 'command-palette__result--active' : ''}`}
                                            onMouseEnter={() => { if (index >= 0) setSelectedIndex(index); }}
                                            onClick={() => handleRun(result)}
                                            role="option"
                                            aria-selected={index === selectedIndex}
                                        >
                                            <span className="command-palette__result-icon">{(() => { const Icon = getIcon(result.icon); return Icon ? <Icon size={18} strokeWidth={1.75} /> : result.icon; })()}</span>
                                            <span className="command-palette__result-main">
                                                <span className="command-palette__result-title-row">
                                                    <span className="command-palette__result-title">{result.title}</span>
                                                    <span className={`command-palette__kind command-palette__kind--${result.kind}`}>
                                                        {KIND_LABELS[result.kind]}
                                                    </span>
                                                </span>
                                                <span className="command-palette__result-subtitle">{result.subtitle || ' '}</span>
                                                {result.semanticSnippet && (
                                                    <span className="command-palette__result-snippet">Semantic: {result.semanticSnippet}</span>
                                                )}
                                                <span className="command-palette__result-meta-row">
                                                    <span className="command-palette__result-meta">{result.meta}</span>
                                                    <span className="command-palette__result-reason">{result.reason}</span>
                                                </span>
                                            </span>
                                            <span className="command-palette__result-side">
                                                <span className="command-palette__result-score">{Math.round(result.score)}</span>
                                                <span className="command-palette__result-action">{result.actionLabel}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ))
                    )}
                </div>

                <div className="command-palette__footer">
                    <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
                    <span><kbd>Enter</kbd> Open</span>
                    <span><kbd>Esc</kbd> Close</span>
                    {activeResult && <span className="command-palette__footer-active">{KIND_LABELS[activeResult.kind]} · {activeResult.actionLabel}</span>}
                </div>
            </div>
        </div>
    );
}
