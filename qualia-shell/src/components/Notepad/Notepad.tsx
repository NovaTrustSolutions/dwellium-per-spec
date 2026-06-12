import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useHierarchy } from '../../context/HierarchyContext';
import { TagInput } from '../Tags/TagInput';
import './Notepad.css';
import { API_BASE } from '../../config';
import { WIDGET_ACTION_EVENT, consumePendingWidgetAction, type WidgetActionRequest } from '../../lib/widgetActions';

// ============================================
// TYPES
// ============================================

interface Note {
    id: string;
    title: string;
    content: string;
    project_id?: string;
    updated_at: string;
    created_at: string;
}

interface MentionItem {
    id: string;
    name: string;
    type: 'task' | 'project' | 'file';
    icon: string;
}

const API_FILES = `${API_BASE}/api/files`;

// ============================================
// COMPONENT
// ============================================

export default function Notepad() {
    const { hierarchy } = useHierarchy();
    const [notes, setNotes] = useState<Note[]>([]);
    const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [showPreview, setShowPreview] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showMentions, setShowMentions] = useState(false);
    const [mentionQuery, setMentionQuery] = useState('');
    const [mentionPos, setMentionPos] = useState({ top: 0, left: 0 });
    const [mentionItems, setMentionItems] = useState<MentionItem[]>([]);

    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Build mention items from hierarchy + backend
    const fetchMentions = useCallback(async (query: string) => {
        const items: MentionItem[] = [];

        // Flatten hierarchy projects as instant mentions
        const flatten = (nodes: any[]) => {
            for (const n of nodes) {
                if (n.type === 'project') {
                    items.push({ id: n.id, name: n.name, type: 'project', icon: '📋' });
                } else if (n.type === 'domain') {
                    items.push({ id: n.id, name: n.name, type: 'project', icon: '📂' });
                }
                if (n.children) flatten(n.children);
            }
        };
        flatten(hierarchy);

        // Fetch files & tasks from backend
        try {
            const [filesRes, tasksRes] = await Promise.allSettled([
                fetch(`${API_BASE}?q=${encodeURIComponent(query)}`),
                fetch(`${API_BASE}/api/tasks?q=${encodeURIComponent(query)}`)
            ]);
            if (filesRes.status === 'fulfilled') {
                const json = await filesRes.value.json();
                if (json.success && Array.isArray(json.data)) {
                    for (const f of json.data.slice(0, 10)) {
                        items.push({ id: f.id, name: f.name, type: 'file', icon: '📄' });
                    }
                }
            }
            if (tasksRes.status === 'fulfilled') {
                const json = await tasksRes.value.json();
                if (json.success && Array.isArray(json.data)) {
                    for (const t of json.data.slice(0, 10)) {
                        items.push({ id: t.id, name: t.title || t.name, type: 'task', icon: '✅' });
                    }
                }
            }
        } catch {
            // Offline — hierarchy items still show
        }

        // Filter by query
        const filtered = query
            ? items.filter(m => m.name.toLowerCase().includes(query.toLowerCase()))
            : items;
        setMentionItems(filtered.slice(0, 12));
    }, [hierarchy]);

    // Fetch mentions when query changes
    useEffect(() => {
        if (showMentions) {
            const debounce = setTimeout(() => fetchMentions(mentionQuery), 200);
            return () => clearTimeout(debounce);
        }
    }, [mentionQuery, showMentions, fetchMentions]);

    // ---- DATA FETCHING ----
    useEffect(() => { fetchNotes(); }, []);

    const fetchNotes = async () => {
        try {
            const q = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
            const res = await fetch(`${API_BASE}/notes${q}`);
            const json = await res.json();
            if (json.success) setNotes(json.data);
        } catch {
            setNotes([
                { id: 'demo-1', title: 'Meeting Notes — Q1 Review', content: '# Q1 Review\n\nDiscussed revenue targets and operational efficiency.\n\n- **Revenue**: On track at 94%\n- **Costs**: Under budget by 8%\n- **Action**: @Review MSA Contract by Friday', updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
                { id: 'demo-2', title: 'ARA Personality Spec', content: '## Mode System\n\n8 operational lenses for ARA, each with distinct voice and logic.\n\n1. Clinical Analyst\n2. Lead Counsel\n3. Chief of Staff\n4. Diplomat\n5. Devil\'s Advocate\n6. Strategic Architect\n7. Creative Partner\n8. Confidant', updated_at: new Date().toISOString(), created_at: new Date().toISOString() },
            ]);
        }
    };

    // ---- AUTO-SAVE ----
    const autoSave = useCallback(async (noteId: string, noteTitle: string, noteContent: string) => {
        setIsSaving(true);
        try {
            await fetch(`${API_BASE}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: noteId, title: noteTitle, content: noteContent })
            });
        } catch {
            // Offline — save will retry
        }
        setIsSaving(false);
    }, []);

    const handleContentChange = (newContent: string) => {
        setContent(newContent);

        // Check for @mention trigger
        const textarea = textareaRef.current;
        if (textarea) {
            const pos = textarea.selectionStart;
            const textBefore = newContent.slice(0, pos);
            const atMatch = textBefore.match(/@(\w*)$/);

            if (atMatch) {
                setMentionQuery(atMatch[1]);
                setShowMentions(true);
                // Position dropdown near cursor
                const lineHeight = 24;
                const lines = textBefore.split('\n').length;
                setMentionPos({ top: lines * lineHeight + 80, left: 100 });
            } else {
                setShowMentions(false);
            }
        }

        // Debounced auto-save
        if (activeNoteId) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                autoSave(activeNoteId, title, newContent);
            }, 2000);
        }
    };

    const handleTitleChange = (newTitle: string) => {
        setTitle(newTitle);
        if (activeNoteId) {
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                autoSave(activeNoteId, newTitle, content);
            }, 2000);
        }
    };

    // ---- MENTIONS ----
    const insertMention = (item: MentionItem) => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const pos = textarea.selectionStart;
        const textBefore = content.slice(0, pos);
        const textAfter = content.slice(pos);
        const atPos = textBefore.lastIndexOf('@');

        const newContent = textBefore.slice(0, atPos) + `@${item.name}` + textAfter;
        setContent(newContent);
        setShowMentions(false);
    };

    const filteredMentions = mentionItems;

    // ---- NOTE MANAGEMENT ----
    const createNote = () => {
        const id = crypto.randomUUID();
        const newNote: Note = {
            id,
            title: 'Untitled',
            content: '',
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString()
        };
        setNotes(prev => [newNote, ...prev]);
        selectNote(newNote);
    };

    const selectNote = (note: Note) => {
        // Save current before switching
        if (activeNoteId && (title || content)) {
            autoSave(activeNoteId, title, content);
        }

        setActiveNoteId(note.id);
        setTitle(note.title);
        setContent(note.content);
    };

    const openNoteFromPalette = useCallback(async (detail: { noteId?: string; title?: string }) => {
        if (detail.noteId) {
            try {
                const res = await fetch(`${API_BASE}/notes/${detail.noteId}`);
                const json = await res.json();
                if (json?.success && json.data) {
                    const note = json.data as Note;
                    setNotes(prev => {
                        const without = prev.filter(n => n.id !== note.id);
                        return [note, ...without];
                    });
                    setSearchQuery('');
                    selectNote(note);
                    return;
                }
            } catch {
                // Fall through to title search
            }
        }

        if (detail.title) {
            setSearchQuery(detail.title);
        }
    }, [selectNote]);

    // Command Palette deep-link: open a selected note
    useEffect(() => {
        const onOpenNote = (event: Event) => {
            const detail = (event as CustomEvent<{ noteId?: string; title?: string }>).detail;
            if (!detail?.noteId && !detail?.title) return;
            void openNoteFromPalette(detail);
        };

        window.addEventListener('qualia-notepad-open-note', onOpenNote);
        return () => window.removeEventListener('qualia-notepad-open-note', onOpenNote);
    }, [openNoteFromPalette]);

    // P11-7: widget-action bus — 'insert-text' creates a note from the
    // payload ("open notepad and draft a letter in it" lands here). Pending
    // slot covers actions fired while the Notepad chunk was still loading.
    useEffect(() => {
        const apply = (req: WidgetActionRequest) => {
            if (req.verb !== 'insert-text' || !req.payload?.text) return;
            const text = String(req.payload.text);
            const title = String(req.payload.title || text.split('\n')[0].replace(/^#+\s*/, '').slice(0, 60) || 'From ARA');
            const note: Note = {
                id: `note-${Date.now()}`,
                title,
                content: text,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            };
            setNotes(prev => [note, ...prev]);
            selectNote(note);
        };
        const handler = (ev: Event) => {
            consumePendingWidgetAction('notepad'); // live event supersedes slot
            const req = (ev as CustomEvent<WidgetActionRequest>).detail;
            if (req?.widget === 'notepad') apply(req);
        };
        window.addEventListener(WIDGET_ACTION_EVENT, handler);
        const pendingReq = consumePendingWidgetAction('notepad');
        if (pendingReq) apply(pendingReq);
        return () => window.removeEventListener(WIDGET_ACTION_EVENT, handler);
        // selectNote is stable-enough (plain fn) — mount-only listener wiring.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- TOOLBAR ACTIONS ----
    const insertMarkdown = (prefix: string, suffix: string = '') => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = content.slice(start, end);

        const newContent = content.slice(0, start) + prefix + selected + suffix + content.slice(end);
        setContent(newContent);

        setTimeout(() => {
            textarea.focus();
            textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
        }, 0);
    };

    // ---- SEARCH ----
    useEffect(() => {
        const debounce = setTimeout(() => {
            if (searchQuery.length > 1 || searchQuery.length === 0) fetchNotes();
        }, 300);
        return () => clearTimeout(debounce);
    }, [searchQuery]);

    // ---- RENDER ----
    const activeNote = notes.find(n => n.id === activeNoteId);

    return (
        <div className="notepad">
            {/* Sidebar */}
            <div className="np-sidebar">
                <div className="np-sidebar__header">
                    <span className="np-sidebar__title">📝 Notes</span>
                    <button className="np-sidebar__new-btn" onClick={createNote} title="New Note">+</button>
                </div>
                <input className="np-sidebar__search" type="text" placeholder="Search notes..."
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <div className="np-sidebar__list">
                    {notes.map(note => (
                        <div key={note.id}
                            className={`np-note-item ${activeNoteId === note.id ? 'np-note-item--active' : ''}`}
                            onClick={() => selectNote(note)}>
                            <div className="np-note-item__title">{note.title}</div>
                            <div className="np-note-item__preview">{note.content.slice(0, 60).replace(/[#*_]/g, '')}</div>
                            <div className="np-note-item__date">{new Date(note.updated_at).toLocaleDateString()}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Editor */}
            {activeNote || activeNoteId ? (
                <div className="np-editor" style={{ position: 'relative' }}>
                    {/* Toolbar */}
                    <div className="np-editor__toolbar">
                        <button className="np-editor__toolbar-btn" title="Bold" onClick={() => insertMarkdown('**', '**')}>B</button>
                        <button className="np-editor__toolbar-btn" title="Italic" onClick={() => insertMarkdown('*', '*')} style={{ fontStyle: 'italic' }}>I</button>
                        <div className="np-editor__toolbar-divider" />
                        <button className="np-editor__toolbar-btn" title="Heading 1" onClick={() => insertMarkdown('# ')}>H1</button>
                        <button className="np-editor__toolbar-btn" title="Heading 2" onClick={() => insertMarkdown('## ')}>H2</button>
                        <button className="np-editor__toolbar-btn" title="Heading 3" onClick={() => insertMarkdown('### ')}>H3</button>
                        <div className="np-editor__toolbar-divider" />
                        <button className="np-editor__toolbar-btn" title="Code" onClick={() => insertMarkdown('`', '`')}>{'<>'}</button>
                        <button className="np-editor__toolbar-btn" title="Bullet List" onClick={() => insertMarkdown('- ')}>•</button>
                        <button className="np-editor__toolbar-btn" title="Link" onClick={() => insertMarkdown('[', '](url)')}>🔗</button>
                        <div className="np-editor__toolbar-divider" />
                        <button className="np-editor__toolbar-btn" title="Toggle Preview"
                            onClick={() => setShowPreview(!showPreview)}
                            style={{ color: showPreview ? '#D6FE51' : undefined }}>
                            👁
                        </button>
                    </div>

                    {/* Title */}
                    <input className="np-editor__title-input" type="text" placeholder="Note title..."
                        value={title} onChange={e => handleTitleChange(e.target.value)} />

                    {/* Tags → central Tag file (app-wide tagging) */}
                    {activeNoteId && (
                        <div className="np-editor__tags" style={{ padding: '4px 0 8px' }}>
                            <TagInput source="notepad" sourceId={activeNoteId} title={title || 'Untitled'} />
                        </div>
                    )}

                    {/* Content */}
                    <div className="np-editor__content">
                        <textarea
                            ref={textareaRef}
                            className="np-editor__textarea"
                            placeholder="Start writing in Markdown... Type @ to mention a task or project"
                            value={content}
                            onChange={e => handleContentChange(e.target.value)}
                        />
                        {showPreview && (
                            <div className="np-editor__preview">
                                <ReactMarkdown>{content}</ReactMarkdown>
                            </div>
                        )}
                    </div>

                    {/* Mention Dropdown */}
                    {showMentions && filteredMentions.length > 0 && (
                        <div className="np-mention" style={{ top: mentionPos.top, left: mentionPos.left }}>
                            {filteredMentions.map(item => (
                                <div key={item.id} className="np-mention__item" onClick={() => insertMention(item)}>
                                    <span className="np-mention__item-icon">{item.icon}</span>
                                    <span className="np-mention__item-name">{item.name}</span>
                                    <span className="np-mention__item-type">{item.type}</span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Save Status */}
                    <div className="np-save">
                        <span className={`np-save__dot ${isSaving ? 'np-save__dot--saving' : ''}`} />
                        <span>{isSaving ? 'Saving...' : 'Saved'}</span>
                    </div>
                </div>
            ) : (
                <div className="np-empty">
                    <span className="np-empty__icon">📝</span>
                    <span className="np-empty__text">Select a note or create a new one</span>
                </div>
            )}
        </div>
    );
}
