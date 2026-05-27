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
import { useScribeStore, type Redline } from './scribeStore';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import { REDLINE_SYSTEM_PROMPT, parseRedlineResponse } from './redlinePrompt';

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

    const handleSendToAgent = async () => {
        if (!llmReady || redlineLoading) return;
        useScribeStore.getState().setSelectionToolbar(null);
        useScribeStore.getState().setRedlineLoading(true);

        try {
            const res = await callLlm({
                prompt: text,
                systemPrompt: REDLINE_SYSTEM_PROMPT,
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
                title={llmReady ? 'Send selection to AI for editing suggestions' : 'Configure an LLM in Settings → API Keys'}
                onClick={() => void handleSendToAgent()}
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
                {redlineLoading ? '⏳ Thinking...' : '✦ Redline'}
            </button>
        </div>
    );
}
