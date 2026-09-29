/**
 * DraftReplyPanel — AI reply drafting, plan 066 §5f.
 * POST `${apiBase}/${itemId}/draft`; never sends. The handoff copies the draft
 * body to the clipboard and opens the target widget for the operator to paste
 * into (the cross-widget bus carries no payload).
 *
 * Templates, batch ops, calendar extraction and workitem creation were dropped
 * here — none of them has a backend route in this plan.
 */
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Hourglass, Sparkles } from 'lucide-react';
import { getDraftHandoffs, openWidgetHandoff, type WidgetHandoff } from './inboxLinkage';

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

interface DraftResult {
    subject: string;
    body: string;
    confidence: number;
}

interface DraftReplyPanelProps {
    itemId: string;
    apiBase: string;
    authFetch: AuthFetch;
}

function toast(detail: string) {
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail }));
}

function confidencePillStyle(confidence: number): CSSProperties {
    return {
        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
        fontWeight: 600, marginLeft: '6px',
        background: confidence >= 0.7 ? 'color-mix(in srgb, var(--success) 20%, transparent)' : 'color-mix(in srgb, var(--warning) 20%, transparent)',
        color: confidence >= 0.7 ? 'var(--success)' : 'var(--warning)',
    };
}

export function DraftReplyPanel({ itemId, apiBase, authFetch }: DraftReplyPanelProps) {
    const [instruction, setInstruction] = useState('');
    const [loading, setLoading] = useState(false);
    const [draft, setDraft] = useState<DraftResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const generateDraft = async () => {
        setLoading(true);
        setError(null);
        setDraft(null);
        try {
            const res = await authFetch(`${apiBase}/${itemId}/draft`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction: instruction.trim() || undefined }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false && data.data) {
                setDraft(data.data);
            } else {
                setError(data.error || `Draft failed (${res.status})`);
            }
        } catch (e: any) {
            setError(e?.message || 'Network error');
        }
        setLoading(false);
    };

    const handoff = async (h: WidgetHandoff) => {
        let copied = false;
        try {
            await navigator.clipboard.writeText(draft?.body || '');
            copied = true;
        } catch {
            // clipboard may be unavailable (permissions, non-secure context) — still open the widget
        }
        openWidgetHandoff(h);
        toast(copied
            ? `Draft copied — paste it where you need it (${h.label})`
            : `Couldn't copy the draft — select it above and copy it by hand (${h.label})`);
    };

    return (
        <div style={{ padding: '16px' }}>
            <label htmlFor={`iz-draft-instruction-${itemId}`} style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                Special instruction (optional)
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
                <input
                    id={`iz-draft-instruction-${itemId}`}
                    value={instruction}
                    onChange={e => setInstruction(e.target.value)}
                    placeholder="e.g. 'be apologetic', 'schedule a viewing'"
                    style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '13px', boxSizing: 'border-box' }}
                />
                <button
                    onClick={generateDraft}
                    disabled={loading}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--text-inverse)', cursor: 'pointer', fontSize: '13px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: loading ? 0.6 : 1 }}
                >
                    {loading ? <><Hourglass size={14} aria-hidden /> Generating…</> : <><Sparkles size={14} aria-hidden /> Generate Draft</>}
                </button>
            </div>

            {error && (
                <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '8px', background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', fontSize: '13px' }}>
                    {error}
                </div>
            )}

            {draft && (
                <div style={{ marginTop: '12px', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ color: 'var(--text-primary)' }}>{draft.subject}</strong>
                        <span style={confidencePillStyle(draft.confidence)}>{Math.round(draft.confidence * 100)}% conf</span>
                    </div>
                    <div style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                        {draft.body}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Open in:</span>
                        {getDraftHandoffs(draft).map(h => (
                            <button
                                key={h.widgetId}
                                onClick={() => handoff(h)}
                                aria-label={h.label}
                                title={h.label}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '12px' }}
                            >
                                {h.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
