import { getAuthToken } from '../../context/UserContext';
/**
 * NotebookLMContext.tsx
 *
 * Dwellium widget for managing NotebookLM notebooks as AI context sources.
 * - List all notebooks registered for context
 * - Toggle notebooks on/off as ARA/Honcho context sources
 * - Add notebooks by ID + title
 * - Shows which notebooks are actively feeding into ARA
 */

import React, { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import './NotebookLMContext.css';

interface NLMNotebook {
    id: string;
    title: string;
    enabled: boolean;
    description?: string;
    sourceCount?: number;
    updatedAt?: string;
}

// getAuthToken imported from UserContext (line 1)

function authHeaders() {
    const token = getAuthToken();
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

export default function NotebookLMContext() {
    const [notebooks, setNotebooks] = useState<NLMNotebook[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [adding, setAdding] = useState(false);
    const [newId, setNewId] = useState('');
    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [saveStatus, setSaveStatus] = useState('');
    const [toggling, setToggling] = useState<Set<string>>(new Set());

    const loadNotebooks = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await fetch(`${API_BASE}/api/v1/notebooklm/notebooks`, {
                headers: authHeaders(),
            });
            const json = await res.json();
            if (json.success) {
                setNotebooks(json.data || []);
            } else {
                setError(json.error || 'Failed to load notebooks');
            }
        } catch (e: any) {
            setError('Backend unreachable — is the server running?');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadNotebooks();
    }, [loadNotebooks]);

    async function toggleNotebook(nb: NLMNotebook) {
        setToggling((prev) => new Set(prev).add(nb.id));
        try {
            const res = await fetch(`${API_BASE}/api/v1/notebooklm/enabled`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    notebookId: nb.id,
                    title: nb.title,
                    description: nb.description || '',
                    enabled: !nb.enabled,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setNotebooks((prev) =>
                    prev.map((n) => (n.id === nb.id ? { ...n, enabled: !n.enabled } : n))
                );
                setSaveStatus(`✓ ${nb.title} ${!nb.enabled ? 'enabled' : 'disabled'} as context source`);
                setTimeout(() => setSaveStatus(''), 3000);
            }
        } catch (_e) {
            setError('Toggle failed');
        } finally {
            setToggling((prev) => {
                const next = new Set(prev);
                next.delete(nb.id);
                return next;
            });
        }
    }

    async function addNotebook(e: React.FormEvent) {
        e.preventDefault();
        if (!newId.trim() || !newTitle.trim()) return;

        try {
            const res = await fetch(`${API_BASE}/api/v1/notebooklm/enabled`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    notebookId: newId.trim(),
                    title: newTitle.trim(),
                    description: newDesc.trim(),
                    enabled: true,
                }),
            });
            const json = await res.json();
            if (json.success) {
                setSaveStatus(`✓ "${newTitle}" added and enabled`);
                setTimeout(() => setSaveStatus(''), 3000);
                setNewId('');
                setNewTitle('');
                setNewDesc('');
                setAdding(false);
                loadNotebooks();
            } else {
                setError(json.error || 'Failed to add notebook');
            }
        } catch (_e) {
            setError('Failed to add notebook');
        }
    }

    async function removeNotebook(id: string) {
        try {
            await fetch(`${API_BASE}/api/v1/notebooklm/notebooks/${encodeURIComponent(id)}`, {
                method: 'DELETE',
                headers: authHeaders(),
            });
            setNotebooks((prev) => prev.filter((n) => n.id !== id));
            setSaveStatus('✓ Notebook removed');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (_e) {
            setError('Remove failed');
        }
    }

    const enabledCount = notebooks.filter((n) => n.enabled).length;

    return (
        <div className="nlm-widget">
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
                            Get the notebook ID from NotebookLM URL:{' '}
                            <code>notebooklm.google.com/notebooklm?corpus=<strong>[ID]</strong></code>
                        </p>

                        <div className="nlm-form-group">
                            <label className="nlm-form-label">Notebook ID *</label>
                            <input
                                className="nlm-form-input"
                                value={newId}
                                onChange={(e) => setNewId(e.target.value)}
                                placeholder="e.g. AHkbfAU3Jdn7K9…"
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
        </div>
    );
}
