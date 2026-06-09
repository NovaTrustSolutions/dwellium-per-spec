import { getAuthToken } from '../../context/UserContext';
/**
 * NotebookLMContext.tsx
 *
 * Dwellium widget for managing NotebookLM notebooks as AI context sources.
 *
 * 2026-05-28 update (per Ilya): NotebookLM has NO public API. This widget
 * cannot "fetch your notebooks" automatically — Google doesn't expose them.
 * What it CAN do:
 *   • Reuse the Google email you already connected for Calendar/Gmail
 *   • Open notebooklm.google.com with ?authuser=<email> so you land in
 *     the right Google account
 *   • Track notebook IDs/URLs you register manually as ARA/Honcho context
 *   • Persist the list per-user in localStorage (backend bridge service
 *     optional; widget no longer panics when /api/v1/notebooklm is missing)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE } from '../../config';
import { useIntegrations } from '../../hooks/useIntegrations';
import './NotebookLMContext.css';
import OpenNotebookPanel from './OpenNotebookPanel';

interface NLMNotebook {
    id: string;
    title: string;
    enabled: boolean;
    description?: string;
    sourceCount?: number;
    updatedAt?: string;
}

const LS_KEY_NOTEBOOKS = 'dwellium-notebooklm-notebooks';
const LS_KEY_EMAIL_OVERRIDE = 'dwellium-notebooklm-email-override';

function authHeaders() {
    const token = getAuthToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

// Parse "https://notebooklm.google.com/notebook/<id>" or bare ID
// into the notebook ID. Returns null if input is empty.
function parseNotebookInput(raw: string): { id: string; sourceUrl?: string } | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // URL form
    try {
        const url = new URL(trimmed);
        // notebooklm.google.com/notebook/<id> OR notebooklm.google.com/?authuser=…&notebook=<id>
        const pathMatch = url.pathname.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
        if (pathMatch) return { id: pathMatch[1], sourceUrl: trimmed };
        const queryId = url.searchParams.get('notebook');
        if (queryId) return { id: queryId, sourceUrl: trimmed };
    } catch { /* not a URL — fall through to bare-ID branch */ }
    // Bare ID — accept anything ≥ 8 chars of [-A-Za-z0-9_]
    if (/^[a-zA-Z0-9_-]{8,}$/.test(trimmed)) return { id: trimmed };
    return null;
}

function loadLocalNotebooks(): NLMNotebook[] {
    try {
        const raw = localStorage.getItem(LS_KEY_NOTEBOOKS);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
}

function saveLocalNotebooks(list: NLMNotebook[]): void {
    try { localStorage.setItem(LS_KEY_NOTEBOOKS, JSON.stringify(list)); } catch { /* sandboxed */ }
}

export default function NotebookLMContext() {
    const { integrations } = useIntegrations();

    // Google account email — pulled from the SAME bundle used for Calendar +
    // Gmail. Priority: explicit user override → Calendar email → Gmail email.
    const googleEmail = useMemo(() => {
        try {
            const override = localStorage.getItem(LS_KEY_EMAIL_OVERRIDE);
            if (override && override.trim()) return override.trim();
        } catch { /* sandboxed */ }
        return integrations?.google?.calendar?.email
            ?? integrations?.google?.gmail?.email
            ?? '';
    }, [integrations]);
    const [emailInput, setEmailInput] = useState(googleEmail);
    useEffect(() => { setEmailInput(googleEmail); }, [googleEmail]);
    const [emailEditing, setEmailEditing] = useState(false);
    const [tab, setTab] = useState<'notebooklm' | 'open-notebook'>('notebooklm');

    // Notebook list — localStorage first, backend bridge as opt-in upgrade
    const [notebooks, setNotebooks] = useState<NLMNotebook[]>(() => loadLocalNotebooks());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const [newId, setNewId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [saveStatus, setSaveStatus] = useState('');
    const [toggling, setToggling] = useState<Set<string>>(new Set());
    const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);

    const loadNotebooks = useCallback(async () => {
        setLoading(true);
        setError('');
        // Always reflect the localStorage snapshot immediately so the UI is responsive
        setNotebooks(loadLocalNotebooks());
        try {
            const res = await fetch(`${API_BASE}/api/v1/notebooklm/notebooks`, {
                headers: authHeaders(),
            });
            const ct = res.headers.get('content-type') || '';
            if (res.status === 404 || !ct.includes('application/json')) {
                // Backend bridge service not present — that's normal now. We
                // operate purely on localStorage. No error UI needed.
                setBridgeAvailable(false);
                return;
            }
            const json = await res.json();
            if (json.success) {
                setBridgeAvailable(true);
                // Backend wins if it has any notebooks; otherwise local wins.
                if (Array.isArray(json.data) && json.data.length > 0) {
                    setNotebooks(json.data);
                    saveLocalNotebooks(json.data);
                }
            }
        } catch { /* offline / non-JSON — fall through to localStorage */
            setBridgeAvailable(false);
        } finally {
            setLoading(false);
        }
    }, []);

    // Persist any local mutation
    useEffect(() => { saveLocalNotebooks(notebooks); }, [notebooks]);

    useEffect(() => {
        loadNotebooks();
    }, [loadNotebooks]);

    async function toggleNotebook(nb: NLMNotebook) {
        setToggling((prev) => new Set(prev).add(nb.id));
        // Optimistic local update — survives whether or not the bridge service answers
        setNotebooks((prev) =>
            prev.map((n) => (n.id === nb.id ? { ...n, enabled: !n.enabled } : n))
        );
        if (bridgeAvailable) {
            try {
                await fetch(`${API_BASE}/api/v1/notebooklm/enabled`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        notebookId: nb.id,
                        title: nb.title,
                        description: nb.description || '',
                        enabled: !nb.enabled,
                    }),
                });
            } catch { /* local state already updated; bridge is best-effort */ }
        }
        setSaveStatus(`✓ ${nb.title} ${!nb.enabled ? 'enabled' : 'disabled'} as ARA context`);
        setTimeout(() => setSaveStatus(''), 3000);
        setToggling((prev) => {
            const next = new Set(prev);
            next.delete(nb.id);
            return next;
        });
    }

    async function addNotebook(e: React.FormEvent) {
        e.preventDefault();
        if (!newId.trim() || !newTitle.trim()) return;
        // Parse: accept either a NotebookLM URL or a bare notebook ID
        const parsed = parseNotebookInput(newId);
        if (!parsed) {
            setError('Could not parse notebook ID/URL. Paste the full URL from notebooklm.google.com/notebook/… or the ID after /notebook/.');
            return;
        }
        const nb: NLMNotebook = {
            id: parsed.id,
            title: newTitle.trim(),
            enabled: true,
            description: newDesc.trim() || undefined,
            updatedAt: new Date().toISOString(),
        };
        // Local upsert (replace any existing with same ID)
        setNotebooks((prev) => {
            const without = prev.filter((n) => n.id !== nb.id);
            return [nb, ...without];
        });
        if (bridgeAvailable) {
            try {
                await fetch(`${API_BASE}/api/v1/notebooklm/enabled`, {
                    method: 'POST',
                    headers: authHeaders(),
                    body: JSON.stringify({
                        notebookId: nb.id,
                        title: nb.title,
                        description: nb.description || '',
                        enabled: true,
                    }),
                });
            } catch { /* bridge optional */ }
        }
        setSaveStatus(`✓ "${nb.title}" added and enabled`);
        setTimeout(() => setSaveStatus(''), 3000);
        setNewId('');
        setNewTitle('');
        setNewDesc('');
        setAdding(false);
    }

    async function removeNotebook(id: string) {
        setNotebooks((prev) => prev.filter((n) => n.id !== id));
        if (bridgeAvailable) {
            try {
                await fetch(`${API_BASE}/api/v1/notebooklm/notebooks/${encodeURIComponent(id)}`, {
                    method: 'DELETE',
                    headers: authHeaders(),
                });
            } catch { /* bridge optional */ }
        }
        setSaveStatus('✓ Notebook removed');
        setTimeout(() => setSaveStatus(''), 3000);
    }

    // Open notebooklm.google.com forcing the correct Google account if email is known.
    // ?authuser=<email> tells Google's auth system which session to use when the user
    // is signed into multiple Google accounts in the same browser.
    function openNotebookLM(notebookId?: string) {
        const base = notebookId
            ? `https://notebooklm.google.com/notebook/${encodeURIComponent(notebookId)}`
            : 'https://notebooklm.google.com';
        const url = googleEmail
            ? `${base}${base.includes('?') ? '&' : '?'}authuser=${encodeURIComponent(googleEmail)}`
            : base;
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function commitEmailOverride() {
        try {
            const v = emailInput.trim();
            if (v) localStorage.setItem(LS_KEY_EMAIL_OVERRIDE, v);
            else localStorage.removeItem(LS_KEY_EMAIL_OVERRIDE);
        } catch { /* sandboxed */ }
        setEmailEditing(false);
    }

    const enabledCount = notebooks.filter((n) => n.enabled).length;

    return (
        <div className="nlm-widget">
            <div style={{ display: 'flex', gap: 4, padding: '8px 10px 0', background: 'var(--bg-desktop)', borderBottom: '1px solid #222' }}>
                {(['notebooklm', 'open-notebook'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        style={{
                            padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            border: 'none', background: 'transparent',
                            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                            color: tab === t ? '#D6FE51' : '#888',
                        }}
                    >{t === 'notebooklm' ? 'NotebookLM' : 'Open Notebook'}</button>
                ))}
            </div>
            {tab === 'open-notebook' ? <OpenNotebookPanel /> : (
            <>
            {/* Connected Google account — read-only when set via Calendar/Gmail,
                editable inline if the user wants to override or use a different
                Google account for NotebookLM than for Calendar. */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', background: 'var(--bg-desktop)',
                borderBottom: '1px solid #222', fontSize: 12,
            }}>
                <span style={{ color: '#666', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 }}>Google</span>
                {emailEditing ? (
                    <>
                        <input
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="you@gmail.com"
                            onKeyDown={(e) => { if (e.key === 'Enter') commitEmailOverride(); else if (e.key === 'Escape') { setEmailInput(googleEmail); setEmailEditing(false); } }}
                            autoFocus
                            style={{
                                flex: 1, padding: '4px 8px', minWidth: 0,
                                background: 'var(--bg-desktop)', color: 'var(--text-primary)',
                                border: '1px solid var(--accent)', borderRadius: 4,
                                fontSize: 12, fontFamily: 'inherit', outline: 'none',
                            }}
                        />
                        <button onClick={commitEmailOverride} style={{
                            padding: '4px 10px', background: 'var(--accent)', color: 'var(--text-inverse)',
                            border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 11,
                        }}>Save</button>
                    </>
                ) : (
                    <>
                        <span style={{ color: googleEmail ? '#D6FE51' : '#888', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {googleEmail || 'No Google account connected — set up Calendar/Gmail in Settings → API Keys, or paste an email here.'}
                        </span>
                        <button onClick={() => setEmailEditing(true)} title="Edit Google email" style={{
                            padding: '4px 8px', background: 'transparent', color: 'var(--text-tertiary)',
                            border: '1px solid #333', borderRadius: 4, cursor: 'pointer', fontSize: 11,
                        }}>{googleEmail ? 'Change' : 'Set'}</button>
                        <button onClick={() => openNotebookLM()} title="Open notebooklm.google.com in a new tab" style={{
                            padding: '4px 10px', background: 'var(--accent)', color: 'var(--text-inverse)',
                            border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 700, fontSize: 11,
                        }}>Open NotebookLM ↗</button>
                    </>
                )}
            </div>

            {/* Header */}
            <div className="nlm-header">
                <div className="nlm-header-left">
                    <span className="nlm-icon">📓</span>
                    <div>
                        <h2 className="nlm-title">NotebookLM</h2>
                        <p className="nlm-subtitle">Knowledge Sources for ARA &amp; Honcho</p>
                    </div>
                </div>
                <div className="nlm-status-badge">
                    {enabledCount > 0 ? (
                        <span className="nlm-badge nlm-badge--active">{enabledCount} active</span>
                    ) : (
                        <span className="nlm-badge nlm-badge--idle">None active</span>
                    )}
                </div>
            </div>

            {/* Info bar */}
            <div className="nlm-info">
                <span className="nlm-info-icon">ℹ️</span>
                <p>
                    Enabled notebooks are automatically queried on every ARA / Honcho conversation and the
                    relevant answers injected into the AI&rsquo;s context — without you having to ask.
                </p>
            </div>

            {/* Status toast */}
            {saveStatus && <div className="nlm-toast nlm-toast--success">{saveStatus}</div>}
            {error && (
                <div className="nlm-toast nlm-toast--error">
                    ⚠️ {error}{' '}
                    <button className="nlm-toast-close" onClick={() => setError('')}>✕</button>
                </div>
            )}

            {/* Notebook list */}
            <div className="nlm-list">
                {loading ? (
                    <div className="nlm-loading">
                        <span className="nlm-spinner" />
                        Loading notebooks…
                    </div>
                ) : notebooks.length === 0 ? (
                    <div className="nlm-empty">
                        <div className="nlm-empty-icon">📚</div>
                        <p className="nlm-empty-title">No notebooks added yet</p>
                        <p className="nlm-empty-sub">Add a notebook below to use it as an ARA knowledge source.</p>
                    </div>
                ) : (
                    notebooks.map((nb) => (
                        <div key={nb.id} className={`nlm-item ${nb.enabled ? 'nlm-item--enabled' : ''}`}>
                            <div className="nlm-item-body">
                                <div className="nlm-item-icon">{nb.enabled ? '📗' : '📔'}</div>
                                <div className="nlm-item-info">
                                    <div className="nlm-item-title">{nb.title}</div>
                                    {nb.description && (
                                        <div className="nlm-item-desc">{nb.description}</div>
                                    )}
                                    <div className="nlm-item-meta">
                                        <code className="nlm-item-id">{nb.id.slice(0, 20)}…</code>
                                        {nb.sourceCount != null && (
                                            <span className="nlm-item-sources">
                                                {nb.sourceCount} source{nb.sourceCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="nlm-item-actions">
                                {/* Open this specific notebook in NotebookLM with the right Google account */}
                                <button
                                    onClick={() => openNotebookLM(nb.id)}
                                    title={googleEmail ? `Open "${nb.title}" in NotebookLM as ${googleEmail}` : `Open "${nb.title}" in NotebookLM`}
                                    style={{
                                        padding: '4px 8px', fontSize: 11,
                                        background: 'transparent', color: 'var(--accent)',
                                        border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', borderRadius: 4,
                                        cursor: 'pointer',
                                    }}
                                >Open ↗</button>
                                {/* Toggle switch */}
                                <button
                                    className={`nlm-toggle ${nb.enabled ? 'nlm-toggle--on' : ''}`}
                                    onClick={() => toggleNotebook(nb)}
                                    disabled={toggling.has(nb.id)}
                                    title={nb.enabled ? 'Disable as context source' : 'Enable as context source'}
                                >
                                    {toggling.has(nb.id) ? '…' : nb.enabled ? 'Enabled' : 'Disabled'}
                                </button>
                                <button
                                    className="nlm-remove"
                                    onClick={() => removeNotebook(nb.id)}
                                    title="Remove from Dwellium"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Add notebook form */}
            <div className="nlm-add-section">
                {!adding ? (
                    <button className="nlm-add-btn" onClick={() => setAdding(true)}>
                        + Add Notebook
                    </button>
                ) : (
                    <form className="nlm-add-form" onSubmit={addNotebook}>
                        <h3 className="nlm-add-heading">Add NotebookLM Notebook</h3>
                        <p className="nlm-add-hint">
                            Paste the full URL from a notebook page:{' '}
                            <code>notebooklm.google.com/notebook/<strong>[ID]</strong></code>
                            {' '}— or just the ID after <code>/notebook/</code>. We'll parse either.
                        </p>

                        <div className="nlm-form-group">
                            <label className="nlm-form-label">Notebook URL or ID *</label>
                            <input
                                className="nlm-form-input"
                                value={newId}
                                onChange={(e) => setNewId(e.target.value)}
                                placeholder="https://notebooklm.google.com/notebook/abc123… or just abc123…"
                                required
                            />
                        </div>
                        <div className="nlm-form-group">
                            <label className="nlm-form-label">Display Name *</label>
                            <input
                                className="nlm-form-input"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g. Dwellium Operations Guide"
                                required
                            />
                        </div>
                        <div className="nlm-form-group">
                            <label className="nlm-form-label">Description (optional)</label>
                            <input
                                className="nlm-form-input"
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                                placeholder="What does this notebook contain?"
                            />
                        </div>

                        <div className="nlm-form-actions">
                            <button type="submit" className="nlm-form-save">✓ Add &amp; Enable</button>
                            <button type="button" className="nlm-form-cancel" onClick={() => setAdding(false)}>
                                Cancel
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {/* How it works */}
            <div className="nlm-how-section">
                <h4 className="nlm-how-title">How It Works</h4>
                <ol className="nlm-how-list">
                    <li>Add a notebook from your NotebookLM account using its ID</li>
                    <li>Toggle it <strong>Enabled</strong></li>
                    <li>Every time you chat with ARA, Stella, or Honcho, the notebook is queried with your message</li>
                    <li>Relevant answers are injected into the AI context automatically — no copy/paste needed</li>
                </ol>
            </div>
            </>
            )}
        </div>
    );
}
