/**
 * DumpMode — Scribe's Brain Dump / Intake surface (spec §5.2).
 *
 * Adapted from the holocron-reference `scribe/DumpMode.tsx`. The reference ran
 * inside Electron and persisted to disk via `window.electronAPI.dumpAppend` +
 * streamed to a local LM. This version is browser-first and backend-optional:
 *
 *   • Dumps persist to a per-user localStorage namespace (`dumpStore`), so they
 *     survive tab switches AND app restarts with no backend — exactly what the
 *     offline Electron build needs.
 *   • The in-flight draft is itself persisted (per user) so a half-written dump
 *     is never lost, matching "save constantly like a regular markdown editor".
 *   • "Report" synthesizes the accumulated dumps through the user's configured
 *     LLM (`callLlm`) entirely in the browser, then opens the result as an
 *     in-memory Scribe document. When no LLM is configured the button explains
 *     itself honestly instead of failing silently.
 *
 * Shares the markdown editor config with the main editor so highlighting is
 * identical.
 */

import { useState, useEffect, useRef, useContext, useSyncExternalStore } from 'react';
import { EditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { Brain } from 'lucide-react';
import { getMarkdownExtensions, registerEditorView } from './markdownConfig';
import { useScribeStore } from './scribeStore';
import {
    dumpStore,
    dumpUserIdHolder,
    appendDump,
    compileBrainDumpMarkdown,
    type DumpEntry,
} from './dumpStore';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';

const ACCENT = '#D6FE51';

export default function DumpMode() {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);

    // Per-user namespace — read UserContext directly (NOT useUser()) so
    // anonymous/test envs degrade to the `_anonymous` namespace gracefully.
    const userCtx = useContext(UserContext);
    const userId = userCtx?.user?.id ?? null;
    dumpUserIdHolder.current = userId;

    const dumps: DumpEntry[] = useSyncExternalStore(
        dumpStore.subscribe,
        dumpStore.getSnapshot,
        dumpStore.getServerSnapshot,
    );

    const editorContainerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);
    const [dumpText, setDumpText] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // Report form state.
    const [showReportForm, setShowReportForm] = useState(false);
    const [reportPrefix, setReportPrefix] = useState('');
    const [reportBusy, setReportBusy] = useState(false);
    const [reportError, setReportError] = useState('');

    const draftKey = `scribe:dump-draft:${userId ?? '_anonymous'}`;

    // Mount CodeMirror with any saved draft. Re-mounts when the user (draftKey)
    // changes so each user loads their own in-flight draft.
    useEffect(() => {
        if (!editorContainerRef.current) return;
        const saved = (() => {
            try { return localStorage.getItem(draftKey) ?? ''; } catch { return ''; }
        })();
        setDumpText(saved);
        const view = new EditorView({
            state: EditorState.create({
                doc: saved,
                extensions: [
                    ...getMarkdownExtensions(),
                    EditorView.updateListener.of((update) => {
                        if (!update.docChanged) return;
                        const text = update.state.doc.toString();
                        setDumpText(text);
                        try {
                            if (text.length > 0) localStorage.setItem(draftKey, text);
                            else localStorage.removeItem(draftKey);
                        } catch { /* quota / private mode — ignore */ }
                    }),
                ],
            }),
            parent: editorContainerRef.current,
        });
        viewRef.current = view;
        const unregister = registerEditorView(view);
        return () => {
            unregister();
            view.destroy();
            viewRef.current = null;
        };
    }, [draftKey]);

    const clearEditor = (): void => {
        setDumpText('');
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
        const view = viewRef.current;
        if (view) {
            view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
        }
    };

    const handleDump = (): void => {
        const content = dumpText.trim();
        if (!content || busy) return;
        setBusy(true);
        setError('');
        try {
            const entry = appendDump(content);
            if (!entry) { setError('Nothing to dump.'); return; }
            clearEditor();
        } finally {
            setBusy(false);
        }
    };

    const handleGenerateReport = async (): Promise<void> => {
        if (reportBusy) return;
        if (dumps.length === 0) { setReportError('No dumps to synthesize yet.'); return; }
        if (!hasActiveLlm(integrations.llm)) {
            setReportError('No LLM configured — add a provider in Settings → API Keys to generate reports.');
            return;
        }
        setReportBusy(true);
        setReportError('');
        try {
            const corpus = compileBrainDumpMarkdown(dumps, 'Brain Dump');
            const res = await callLlm(
                {
                    systemPrompt:
                        'You are a synthesis assistant. You are given a sequence of timestamped "brain dump" prompts captured by one person over time. Produce a single, well-structured Markdown report that organizes the raw thoughts into themes, surfaces decisions and open questions, and ends with a short prioritized list of next actions. Preserve the author\'s intent; do not invent facts. Output Markdown only.',
                    prompt: `Synthesize the following brain dump into a structured report.\n\n${corpus}`,
                    maxTokens: 2048,
                    temperature: 0.3,
                },
                integrations.llm,
            );
            if (!res || !res.text.trim()) {
                setReportError('The LLM returned an empty report. Try again.');
                setReportBusy(false);
                return;
            }
            const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
            const prefix = reportPrefix.trim() || 'Report';
            const filepath = `${prefix}-${stamp}.md`;
            useScribeStore.getState().openInMemoryFile(filepath, res.text.trim());
            setShowReportForm(false);
            setReportPrefix('');
        } catch (e: any) {
            setReportError(e?.message || 'Report generation failed.');
        } finally {
            setReportBusy(false);
        }
    };

    const canDump = dumpText.trim().length > 0 && !busy;
    const showReportButton = dumps.length > 0;

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#000' }}>
            {/* Header strip */}
            <div style={{
                height: 36, display: 'flex', alignItems: 'center', gap: 8,
                padding: '0 16px', borderBottom: '1px solid #222', flexShrink: 0,
            }}>
                <Brain size={14} style={{ color: ACCENT }} />
                <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: '#ccc', fontFamily: 'monospace',
                }}>
                    Brain Dump
                </span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#808080', fontFamily: 'monospace' }}>
                    {dumps.length === 0 ? 'No prompts yet' : `${dumps.length} prompt${dumps.length === 1 ? '' : 's'} so far`}
                </span>
            </div>

            {/* CodeMirror compose surface */}
            <div ref={editorContainerRef} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} />

            {/* Report form */}
            {showReportForm && (
                <div style={{ flexShrink: 0, padding: '10px 16px', borderTop: `1px solid ${ACCENT}40`, background: `${ACCENT}10` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, color: ACCENT, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                            Report name prefix:
                        </span>
                        <input
                            autoFocus
                            value={reportPrefix}
                            onChange={(e) => setReportPrefix(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleGenerateReport();
                                if (e.key === 'Escape') { setShowReportForm(false); setReportPrefix(''); }
                            }}
                            placeholder="Report (default)"
                            disabled={reportBusy}
                            style={{
                                flex: 1, background: '#0a0a0a', border: '1px solid #333',
                                borderRadius: 6, padding: '5px 9px', color: '#fff',
                                fontSize: 12, outline: 'none', fontFamily: 'inherit',
                            }}
                        />
                        <button
                            onClick={() => void handleGenerateReport()}
                            disabled={reportBusy}
                            style={{
                                background: ACCENT, color: '#000', border: 'none', borderRadius: 6,
                                padding: '5px 14px', fontSize: 12, fontWeight: 700,
                                cursor: reportBusy ? 'wait' : 'pointer', fontFamily: 'inherit',
                                opacity: reportBusy ? 0.7 : 1,
                            }}
                        >
                            {reportBusy ? 'Generating…' : 'Generate'}
                        </button>
                        <button
                            onClick={() => { setShowReportForm(false); setReportPrefix(''); setReportError(''); }}
                            disabled={reportBusy}
                            style={{ background: 'none', border: 'none', color: '#808080', fontSize: 14, cursor: 'pointer' }}
                        >
                            ×
                        </button>
                    </div>
                    {reportError && (
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: '#ff6b6b', fontFamily: 'monospace' }}>
                            ⚠ {reportError}
                        </p>
                    )}
                </div>
            )}

            {/* Bottom action bar */}
            <div style={{
                flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 20px', borderTop: '1px solid #222', background: '#0a0a0a',
            }}>
                <span style={{ fontSize: 11, color: '#808080', fontFamily: 'monospace' }}>
                    {dumpText.length} chars
                </span>
                {error && (
                    <span style={{ fontSize: 11, color: '#ff6b6b', fontFamily: 'monospace' }}>⚠ {error}</span>
                )}
                {!llmReady && (
                    <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>
                        · add an LLM in Settings to enable Report
                    </span>
                )}
                <div style={{ flex: 1 }} />
                {showReportButton && (
                    <button
                        onClick={() => setShowReportForm(true)}
                        disabled={reportBusy}
                        title={llmReady
                            ? "Synthesize this brain dump into a structured report"
                            : "Configure an LLM provider in Settings → API Keys to enable this"}
                        style={{
                            padding: '9px 18px', borderRadius: 8, border: '1px solid #333',
                            background: 'transparent', color: '#ccc', fontSize: 13, fontWeight: 600,
                            cursor: reportBusy ? 'wait' : 'pointer', fontFamily: 'inherit',
                            transition: 'color 150ms, border-color 150ms',
                        }}
                        onMouseEnter={(e) => { if (!reportBusy) { e.currentTarget.style.color = ACCENT; e.currentTarget.style.borderColor = ACCENT; } }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#ccc'; e.currentTarget.style.borderColor = '#333'; }}
                    >
                        Report
                    </button>
                )}
                <button
                    onClick={handleDump}
                    disabled={!canDump}
                    title={canDump ? 'Submit dump' : busy ? 'Working…' : 'Type something first'}
                    style={{
                        padding: '11px 28px', borderRadius: 8, border: 'none',
                        background: canDump ? ACCENT : '#1a1a1a',
                        color: canDump ? '#000' : '#666',
                        fontSize: 14, fontWeight: 700, letterSpacing: '0.04em',
                        cursor: canDump ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                        transition: 'background 150ms ease',
                    }}
                >
                    {busy ? 'Submitting…' : 'Dump'}
                </button>
            </div>
        </div>
    );
}
