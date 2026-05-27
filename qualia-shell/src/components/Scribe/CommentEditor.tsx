/**
 * Inline comment editor popup — positioned near the comment's anchor
 * in the editor. Supports view, edit, delete, resolve, and "Submit to
 * Agent" (which triggers callLlm with the comment as editing instruction).
 *
 * Ported from Holocron's CommentEditor.tsx (Cycle 7). Adapted: uses
 * callLlm directly instead of ChatPane dispatch. Electron IPC removed.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { EditorView } from '@codemirror/view';
import { useScribeStore, type DocComment, type Redline } from './scribeStore';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { COMMENT_REDLINE_SYSTEM_PROMPT, parseRedlineResponse } from './redlinePrompt';

interface Props {
    getView: () => EditorView | null;
}

export function CommentEditor({ getView }: Props) {
    const activeFilepath = useScribeStore((s) => s.activeFilepath);
    const editingCommentId = useScribeStore((s) => s.editingCommentId);
    const comments = useScribeStore((s) => s.comments);
    const { integrations } = useIntegrations();

    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const [posBump, setPosBump] = useState(0);

    const comment = editingCommentId
        ? comments.find((c) => c.id === editingCommentId)
        : null;

    useEffect(() => {
        if (!editingCommentId) return;
        const view = getView();
        if (!view) return;
        const onScroll = () => setPosBump((n) => n + 1);
        view.scrollDOM.addEventListener('scroll', onScroll);
        window.addEventListener('resize', onScroll);
        return () => {
            view.scrollDOM.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [editingCommentId, getView]);

    useEffect(() => {
        if (!editingCommentId) return;
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target) return;
            if (wrapperRef.current && wrapperRef.current.contains(target)) return;
            if (target.closest('.cm-comment-indicator, [data-comment-id]')) return;
            discardIfEmpty();
            useScribeStore.getState().setEditingCommentId(null);
        };
        document.addEventListener('mousedown', onMouseDown, true);
        return () => document.removeEventListener('mousedown', onMouseDown, true);
    }, [editingCommentId]);

    useEffect(() => {
        if (!comment) return;
        if (!comment.body) {
            setDraft('');
            setEditing(true);
        } else {
            setEditing(false);
        }
    }, [editingCommentId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    const discardIfEmpty = useCallback(() => {
        const state = useScribeStore.getState();
        const c = state.comments.find((x) => x.id === state.editingCommentId);
        if (!c || c.body !== '') return;
        state.deleteComment(c.id);
        if (c.filepath) void state.persistComments(c.filepath);
    }, []);

    void posBump;

    if (!comment || !activeFilepath) return null;

    const view = getView();
    if (!view) return null;

    const docLen = view.state.doc.length;
    const safeFrom = Math.max(0, Math.min(comment.from, docLen));
    const coords = view.coordsAtPos(safeFrom);
    if (!coords) return null;

    const top = coords.bottom + 4;
    const left = coords.left;

    const saveEdit = () => {
        const body = draft.trim();
        if (!body) return;
        useScribeStore.getState().updateCommentBody(comment.id, body);
        setEditing(false);
        void useScribeStore.getState().persistComments(activeFilepath);
    };

    const cancelEdit = () => {
        if (!comment.body) {
            discardIfEmpty();
            useScribeStore.getState().setEditingCommentId(null);
            return;
        }
        setEditing(false);
        setDraft('');
    };

    const handleDelete = () => {
        useScribeStore.getState().deleteComment(comment.id);
        useScribeStore.getState().setEditingCommentId(null);
        void useScribeStore.getState().persistComments(activeFilepath);
    };

    const handleResolve = () => {
        useScribeStore.getState().resolveComment(comment.id);
        useScribeStore.getState().setEditingCommentId(null);
        void useScribeStore.getState().persistComments(activeFilepath);
    };

    const handleSubmitToAgent = async () => {
        if (!hasActiveLlm(integrations.llm) || submitting) return;
        setSubmitting(true);
        try {
            const safeTo = Math.max(safeFrom, Math.min(comment.to, docLen));
            const selectedText = view.state.doc.sliceString(safeFrom, safeTo);
            const res = await callLlm({
                prompt: `Selection:\n${selectedText}\n\nComment:\n${comment.body}`,
                systemPrompt: COMMENT_REDLINE_SYSTEM_PROMPT,
                responseFormat: 'json',
                maxTokens: 2048,
                temperature: 0.3,
            }, integrations.llm);

            if (res) {
                const parsed = parseRedlineResponse(res.text);
                if (parsed) {
                    for (const proposal of parsed.redlines) {
                        const idx = selectedText.indexOf(proposal.originalText);
                        if (idx === -1) continue;
                        const redline: Redline = {
                            id: crypto.randomUUID(),
                            filepath: activeFilepath,
                            from: safeFrom + idx,
                            to: safeFrom + idx + proposal.originalText.length,
                            originalText: proposal.originalText,
                            proposedText: proposal.proposedText,
                            rationale: proposal.rationale,
                            state: 'pending',
                        };
                        useScribeStore.getState().addRedline(redline);
                    }
                }
            }

            useScribeStore.getState().resolveComment(comment.id);
            useScribeStore.getState().setEditingCommentId(null);
            void useScribeStore.getState().persistComments(activeFilepath);
        } catch { /* LLM failed — degrade silently */ }
        finally { setSubmitting(false); }
    };

    return (
        <div
            ref={wrapperRef}
            style={{
                position: 'fixed', top, left, zIndex: 45, width: 340,
                background: '#111', border: '1px solid rgba(214,254,81,0.3)',
                borderLeft: '3px solid #D6FE51', borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.6)', padding: 12,
                fontSize: 12, fontFamily: 'inherit',
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <span>💬</span>
                <span style={{ color: '#808080', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {comment.status === 'resolved' ? 'Resolved' : 'Comment'}
                </span>
                <span style={{ flex: 1 }} />
                <button
                    onClick={() => { discardIfEmpty(); useScribeStore.getState().setEditingCommentId(null); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555', fontSize: 14 }}
                >&times;</button>
            </div>

            {editing ? (
                <textarea
                    ref={inputRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveEdit(); }
                        if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
                    }}
                    rows={3}
                    placeholder="Add a comment..."
                    style={{
                        width: '100%', boxSizing: 'border-box',
                        background: '#0a0a0a', border: '1px solid #333',
                        borderRadius: 4, padding: '6px 8px',
                        color: '#fff', fontSize: 12, fontFamily: 'inherit',
                        outline: 'none', resize: 'vertical',
                    }}
                />
            ) : (
                <div style={{ color: '#ccc', whiteSpace: 'pre-wrap', lineHeight: 1.5, marginBottom: 8 }}>
                    {comment.body || <span style={{ color: '#555', fontStyle: 'italic' }}>(empty)</span>}
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10 }}>
                {editing ? (
                    <>
                        <Btn label="Save" primary disabled={!draft.trim()} onClick={saveEdit} />
                        <Btn label="Cancel" onClick={cancelEdit} />
                    </>
                ) : (
                    <>
                        <Btn label="Edit" onClick={() => { setDraft(comment.body); setEditing(true); }} />
                        <Btn label="Resolve" onClick={handleResolve} />
                        <Btn label="Delete" danger onClick={handleDelete} />
                        <span style={{ flex: 1 }} />
                        {comment.status === 'open' && comment.body && (
                            <Btn
                                label={submitting ? '⏳...' : '✦ Submit'}
                                primary
                                disabled={!hasActiveLlm(integrations.llm) || submitting}
                                onClick={() => void handleSubmitToAgent()}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

function Btn({ label, onClick, primary, danger, disabled }: {
    label: string; onClick: () => void;
    primary?: boolean; danger?: boolean; disabled?: boolean;
}) {
    const bg = primary ? (disabled ? '#333' : '#D6FE51') : 'transparent';
    const color = primary ? (disabled ? '#666' : '#000') : danger ? '#ff4d6d' : '#808080';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                background: bg, border: primary ? 'none' : '1px solid #333',
                color, borderRadius: 4, padding: '4px 10px',
                fontSize: 11, fontWeight: primary ? 700 : 400,
                cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
                opacity: disabled ? 0.5 : 1,
            }}
        >{label}</button>
    );
}
