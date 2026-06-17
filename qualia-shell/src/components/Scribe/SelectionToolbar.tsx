/**
 * Floating toolbar that appears above text selections in the editor.
 * "Send to Agent" triggers callLlm directly (self-contained per
 * architecture decision §8 — no external chat panel).
 *
 * Ported from Holocron's SelectionToolbar.tsx (Cycle 6). Adapted:
 * sends to callLlm instead of ChatPane, applies returned redlines
 * as scribeStore entries.
 */
import { useEffect, useRef } from 'react';
import { MessageSquare, Link, Bot, Hourglass, Sparkles } from 'lucide-react';
import { useScribeStore, type Redline } from './scribeStore';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { REDLINE_SYSTEM_PROMPT, parseRedlineResponse } from './redlinePrompt';
import { AI_ACTIONS, buildActionSystemPrompt, buildSummarizePreface, type AiAction } from './aiActions';
import { getActiveEditorView } from './markdownConfig';

const TOOLBAR_HEIGHT = 36;
const GAP_ABOVE_SELECTION = 8;

export function SelectionToolbar() {
    const selectionToolbar = useScribeStore((s) => s.selectionToolbar);
    const redlineLoading = useScribeStore((s) => s.redlineLoading);
    const { integrations } = useIntegrations();
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!selectionToolbar) return;
        const onMouseDown = (e: MouseEvent) => {
            if (ref.current && ref.current.contains(e.target as Node)) return;
            if (e.button === 2) return;
            useScribeStore.getState().setSelectionToolbar(null);
        };
        document.addEventListener('mousedown', onMouseDown, true);
        return () => document.removeEventListener('mousedown', onMouseDown, true);
    }, [selectionToolbar]);

    if (!selectionToolbar) return null;
    const { x, y, from, to, text, filepath } = selectionToolbar;

    const top = Math.max(8, y - TOOLBAR_HEIGHT - GAP_ABOVE_SELECTION);
    const left = Math.max(8, Math.min(window.innerWidth - 8, x));
    const llmReady = hasActiveLlm(integrations.llm);

    const handleAddComment = () => {
        useScribeStore.getState().addComment(filepath, from, to);
        useScribeStore.getState().setSelectionToolbar(null);
    };

    // Source link: wrap the selection in a markdown link to a cited source.
    // Lives in the doc text, so it persists + renders as a clickable source in
    // the preview. (Empty selection → inserts an inline source link.)
    const handleAddSource = () => {
        const view = getActiveEditorView();
        const url = (typeof window !== 'undefined'
            ? window.prompt('Source URL or citation for this selection:', 'https://')
            : null);
        useScribeStore.getState().setSelectionToolbar(null);
        if (!view || !url) return;
        const label = text.trim() || 'source';
        const insert = `[${label}](${url})`;
        view.dispatch({ changes: { from, to, insert }, selection: { anchor: from + insert.length } });
        view.focus();
    };

    const handleSendToAra = () => {
        // Fire the cross-component event the AraMiniPanel listens for.
        window.dispatchEvent(new CustomEvent('scribe:send-to-ara', {
            detail: {
                text,
                preface: 'Please review this passage and tell me what you think:',
            },
        }));
        useScribeStore.getState().setSelectionToolbar(null);
    };

    const runRedline = async (systemPrompt: string) => {
        if (!llmReady || redlineLoading) return;
        useScribeStore.getState().setSelectionToolbar(null);
        useScribeStore.getState().setRedlineLoading(true);

        try {
            const res = await callLlm({
                prompt: text,
                systemPrompt,
                responseFormat: 'json',
                maxTokens: 2048,
                temperature: 0.3,
            }, integrations.llm);

            if (!res) {
                useScribeStore.getState().setRedlineLoading(false);
                return;
            }

            const parsed = parseRedlineResponse(res.text);
            if (!parsed || parsed.redlines.length === 0) {
                useScribeStore.getState().setRedlineLoading(false);
                return;
            }

            for (const proposal of parsed.redlines) {
                const idx = text.indexOf(proposal.originalText);
                if (idx === -1) continue;

                const redline: Redline = {
                    id: crypto.randomUUID(),
                    filepath,
                    from: from + idx,
                    to: from + idx + proposal.originalText.length,
                    originalText: proposal.originalText,
                    proposedText: proposal.proposedText,
                    rationale: proposal.rationale,
                    state: 'pending',
                };
                useScribeStore.getState().addRedline(redline);
            }
        } catch {
            // LLM call failed — silently degrade
        } finally {
            useScribeStore.getState().setRedlineLoading(false);
        }
    };

    // Discrete AI writing helpers (Docs parity): Rewrite / Fix / Translate via
    // the redline flow (user accepts/rejects), Summarize via the ARA panel.
    const handleAiAction = (action: AiAction) => {
        if (action.mode === 'ara') {
            window.dispatchEvent(new CustomEvent('scribe:send-to-ara', {
                detail: { text, preface: buildSummarizePreface() },
            }));
            useScribeStore.getState().setSelectionToolbar(null);
            return;
        }
        let opts: { language?: string } | undefined;
        if (action.id === 'translate') {
            const language = typeof window !== 'undefined'
                ? window.prompt('Translate to which language?', 'Spanish')
                : null;
            if (!language) return; // user cancelled
            opts = { language };
        }
        void runRedline(buildActionSystemPrompt(action.id, opts));
    };

    return (
        <div
            ref={ref}
            style={{
                position: 'fixed',
                top,
                left,
                transform: 'translateX(-50%)',
                zIndex: 50,
                height: TOOLBAR_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '0 6px',
                background: '#111',
                border: '1px solid #333',
                borderRadius: 999,
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                userSelect: 'none',
                fontSize: 12,
            }}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <button
                title="Add a comment to this selection"
                onClick={handleAddComment}
                style={{
                    background: 'transparent',
                    border: '1px solid #444',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    transition: 'background 100ms, color 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#222'; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#ccc'; }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><MessageSquare size={14} aria-hidden /> Comment</span>
            </button>
            <button
                title="Link this selection to a source / citation"
                onClick={handleAddSource}
                style={{
                    background: 'transparent',
                    border: '1px solid #444',
                    color: '#c9a44c',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    transition: 'background 100ms, color 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2410'; e.currentTarget.style.color = '#e7c879'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#c9a44c'; }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Link size={14} aria-hidden /> Source</span>
            </button>
            <button
                title="Send this selection to ARA in the floating panel"
                onClick={handleSendToAra}
                style={{
                    background: 'transparent',
                    border: '1px solid #444',
                    color: '#9ad7ff',
                    cursor: 'pointer',
                    padding: '6px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    transition: 'background 100ms, color 100ms',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#1a2530'; e.currentTarget.style.color = '#cfe9ff'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ad7ff'; }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Bot size={14} aria-hidden /> Send to ARA</span>
            </button>
            <button
                title={llmReady ? 'Send selection to AI for editing suggestions' : 'Configure an LLM in Settings → API Keys'}
                onClick={() => void runRedline(REDLINE_SYSTEM_PROMPT)}
                disabled={!llmReady || redlineLoading}
                style={{
                    background: llmReady ? '#D6FE51' : '#333',
                    border: 'none',
                    color: llmReady ? '#000' : '#666',
                    cursor: llmReady && !redlineLoading ? 'pointer' : 'not-allowed',
                    padding: '6px 14px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    transition: 'background 100ms, transform 80ms',
                    opacity: redlineLoading ? 0.6 : 1,
                }}
                onMouseEnter={(e) => { if (llmReady && !redlineLoading) e.currentTarget.style.background = '#e0ff6e'; }}
                onMouseLeave={(e) => { if (llmReady) e.currentTarget.style.background = '#D6FE51'; }}
            >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    {redlineLoading ? <><Hourglass size={14} aria-hidden /> Thinking...</> : <><Sparkles size={14} aria-hidden /> Redline</>}
                </span>
            </button>

            {/* Docs-parity AI writing helpers — one tap each. Icon-only to stay
                compact; aria-label carries the discernible name for a11y. */}
            {llmReady && AI_ACTIONS.map((action) => (
                <button
                    key={action.id}
                    title={action.title}
                    aria-label={action.label}
                    onClick={() => handleAiAction(action)}
                    disabled={redlineLoading}
                    style={{
                        background: 'transparent',
                        border: '1px solid #444',
                        color: '#ddd',
                        cursor: redlineLoading ? 'not-allowed' : 'pointer',
                        padding: '6px 8px',
                        borderRadius: 999,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        transition: 'background 100ms',
                    }}
                    onMouseEnter={(e) => { if (!redlineLoading) e.currentTarget.style.background = '#222'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                    <action.icon size={14} aria-hidden />
                </button>
            ))}
        </div>
    );
}
