/**
 * Foundry — Document Intake pipeline widget (spec §7.4).
 * Capture → Triage (AI tags/target/quality) → Review → Admit. Items track
 * separately from ingested documents, persisted per-user via foundryStore.
 */
import { useState, useContext, useSyncExternalStore, useCallback } from 'react';
import { Inbox, Sparkles, Check, X, Trash2, Link2, FileText } from 'lucide-react';
import { UserContext } from '../../context/UserContext';
import { useIntegrations } from '../../hooks/useIntegrations';
import { callLlm, hasActiveLlm } from '../../lib/llmClient';
import {
    foundryStore, foundryUserIdHolder, captureItem, applyTriage, admitItem, rejectItem,
    updateItem, clearFoundry, heuristicTriage, type FoundryItem, type TriageResult,
} from './foundryStore';

const ACCENT = '#D6FE51';
const PIPE = ['Capture', 'Triage', 'Review', 'Admit'];

export default function Foundry() {
    const { integrations } = useIntegrations();
    const llmReady = hasActiveLlm(integrations.llm);
    const userCtx = useContext(UserContext);
    foundryUserIdHolder.current = userCtx?.user?.id ?? null;
    const items: FoundryItem[] = useSyncExternalStore(foundryStore.subscribe, foundryStore.getSnapshot, foundryStore.getServerSnapshot);

    const [text, setText] = useState('');
    const [url, setUrl] = useState('');
    const [busy, setBusy] = useState(false);

    const triage = useCallback(async (content: string): Promise<{ result: TriageResult; by: 'llm' | 'heuristic' }> => {
        if (hasActiveLlm(integrations.llm)) {
            try {
                const res = await callLlm({
                    systemPrompt: 'You triage a captured document for a knowledge base. Respond JSON only: {"tags": string[] (3-6), "target": string|null (suggested domain/project/thread), "qualityScore": number (0-100), "assessment": string (one sentence)}.',
                    prompt: content.slice(0, 4000),
                    responseFormat: 'json', maxTokens: 400, temperature: 0.2,
                }, integrations.llm);
                if (res?.text) {
                    const fence = res.text.match(/```(?:json)?\s*([\s\S]*?)```/i);
                    const o = JSON.parse(fence ? fence[1] : res.text);
                    return {
                        result: {
                            tags: Array.isArray(o.tags) ? o.tags.filter((x: unknown) => typeof x === 'string') : [],
                            target: typeof o.target === 'string' ? o.target : null,
                            qualityScore: typeof o.qualityScore === 'number' ? o.qualityScore : null,
                            assessment: typeof o.assessment === 'string' ? o.assessment : null,
                        },
                        by: 'llm',
                    };
                }
            } catch { /* fall through to heuristic */ }
        }
        return { result: heuristicTriage(content), by: 'heuristic' };
    }, [integrations.llm]);

    const onCapture = async () => {
        const content = text.trim();
        if (!content || busy) return;
        setBusy(true);
        try {
            const item = captureItem({ sourceType: url.trim() ? 'url' : 'paste', rawContent: content, sourceUrl: url.trim() || null });
            if (item) {
                const { result, by } = await triage(content);
                applyTriage(item.id, result, by);
                setText(''); setUrl('');
            }
        } finally {
            setBusy(false);
        }
    };

    const review = items.filter((i) => i.status === 'captured' || i.status === 'triaged');
    const admitted = items.filter((i) => i.status === 'admitted');
    const rejected = items.filter((i) => i.status === 'rejected');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', background: '#000', color: '#ccc', fontFamily: 'inherit', fontSize: 13, overflow: 'hidden' }}>
            {/* Header + pipeline */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #222', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Inbox size={15} style={{ color: ACCENT }} />
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#888', flex: 1 }}>Foundry · Intake</span>
                    {items.length > 0 && <button onClick={() => clearFoundry()} title="Clear all items" style={{ background: 'none', border: '1px solid #333', color: '#777', borderRadius: 5, padding: '3px 9px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>Clear</button>}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {PIPE.map((p, i) => (
                        <span key={p} style={{ fontSize: 10, padding: '2px 9px', borderRadius: 999, background: 'rgba(214,254,81,0.06)', border: '1px solid #222', color: '#888', letterSpacing: '0.04em' }}>{i + 1}. {p}</span>
                    ))}
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
                {/* Capture form */}
                <div style={{ border: '1px solid #222', borderRadius: 8, padding: 12, marginBottom: 18, background: '#070707' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                        <Link2 size={13} style={{ color: '#666' }} />
                        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Source URL (optional)" style={{ flex: 1, background: '#000', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 12, padding: '6px 9px', outline: 'none', fontFamily: 'inherit' }} />
                    </div>
                    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste content to capture into the knowledge pipeline…" rows={4} style={{ width: '100%', boxSizing: 'border-box', background: '#000', border: '1px solid #333', borderRadius: 6, color: '#fff', fontSize: 13, padding: '8px 10px', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                        <button onClick={() => void onCapture()} disabled={busy || !text.trim()} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 15px', borderRadius: 7, border: 'none', background: (busy || !text.trim()) ? '#1a1a1a' : ACCENT, color: (busy || !text.trim()) ? '#666' : '#000', fontSize: 12, fontWeight: 700, cursor: (busy || !text.trim()) ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                            <Sparkles size={13} /> {busy ? 'Triaging…' : 'Capture & Triage'}
                        </button>
                        <span style={{ fontSize: 11, color: '#666' }}>{llmReady ? 'AI triage' : 'heuristic triage (add an LLM for AI)'}</span>
                    </div>
                </div>

                {/* Review queue */}
                <SectionTitle label={`Needs review (${review.length})`} />
                {review.length === 0 && <Empty text="Nothing to review. Capture something above." />}
                {review.map((it) => (
                    <ReviewCard key={it.id} item={it} onAdmit={() => admitItem(it.id)} onReject={() => rejectItem(it.id)} onTags={(tags) => updateItem(it.id, { tags })} onTarget={(target) => updateItem(it.id, { target })} />
                ))}

                {admitted.length > 0 && (
                    <>
                        <SectionTitle label={`Admitted (${admitted.length})`} />
                        {admitted.map((it) => <MiniRow key={it.id} item={it} kind="admitted" />)}
                    </>
                )}
                {rejected.length > 0 && (
                    <>
                        <SectionTitle label={`Rejected (${rejected.length})`} />
                        {rejected.map((it) => <MiniRow key={it.id} item={it} kind="rejected" />)}
                    </>
                )}
            </div>
        </div>
    );
}

function SectionTitle({ label }: { label: string }) {
    return <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: ACCENT, margin: '14px 0 8px' }}>{label}</div>;
}
function Empty({ text }: { text: string }) {
    return <div style={{ padding: '12px', color: '#555', fontSize: 12 }}>{text}</div>;
}

function ReviewCard({ item, onAdmit, onReject, onTags, onTarget }: {
    item: FoundryItem; onAdmit: () => void; onReject: () => void; onTags: (t: string[]) => void; onTarget: (t: string | null) => void;
}) {
    const [tagText, setTagText] = useState(item.tags.join(', '));
    return (
        <div style={{ border: '1px solid #222', borderRadius: 8, padding: 12, marginBottom: 10, background: '#0a0a0a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                {item.sourceType === 'url' ? <Link2 size={12} style={{ color: '#666' }} /> : <FileText size={12} style={{ color: '#666' }} />}
                <span style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{item.sourceType}</span>
                {item.qualityScore != null && <span style={{ marginLeft: 'auto', fontSize: 10, color: item.qualityScore >= 60 ? ACCENT : '#ffce3a' }}>quality {item.qualityScore}</span>}
                {item.triagedBy && <span style={{ fontSize: 9, color: '#555' }}>· {item.triagedBy}</span>}
            </div>
            <div style={{ fontSize: 12, color: '#bbb', lineHeight: 1.6, maxHeight: 60, overflow: 'hidden', marginBottom: 8 }}>{item.rawContent.slice(0, 220)}{item.rawContent.length > 220 ? '…' : ''}</div>
            {item.assessment && <div style={{ fontSize: 11, color: '#888', fontStyle: 'italic', marginBottom: 8 }}>{item.assessment}</div>}
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input value={tagText} onChange={(e) => { setTagText(e.target.value); onTags(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)); }} placeholder="tags, comma, separated" style={{ flex: 1, background: '#000', border: '1px solid #2a2a2a', borderRadius: 5, color: '#ddd', fontSize: 11, padding: '5px 8px', outline: 'none', fontFamily: 'inherit' }} />
                <input value={item.target ?? ''} onChange={(e) => onTarget(e.target.value || null)} placeholder="target location" style={{ flex: 1, background: '#000', border: '1px solid #2a2a2a', borderRadius: 5, color: '#ddd', fontSize: 11, padding: '5px 8px', outline: 'none', fontFamily: 'inherit' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={onAdmit} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: 'none', background: ACCENT, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}><Check size={13} /> Admit</button>
                <button onClick={onReject} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 14px', borderRadius: 6, border: '1px solid #333', background: 'transparent', color: '#ff8da5', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}><X size={13} /> Reject</button>
            </div>
        </div>
    );
}

function MiniRow({ item, kind }: { item: FoundryItem; kind: 'admitted' | 'rejected' }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4, border: '1px solid #1a1a1a', borderRadius: 6, background: '#070707' }}>
            {kind === 'admitted' ? <Check size={12} style={{ color: ACCENT, flexShrink: 0 }} /> : <Trash2 size={12} style={{ color: '#666', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 11, color: kind === 'admitted' ? '#bbb' : '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.rawContent.slice(0, 80)}</span>
            {item.tags.length > 0 && <span style={{ fontSize: 9, color: '#555' }}>{item.tags.slice(0, 3).join(' · ')}</span>}
        </div>
    );
}
