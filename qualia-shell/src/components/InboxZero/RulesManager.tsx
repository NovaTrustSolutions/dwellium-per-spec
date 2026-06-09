/**
 * Rules Manager — Phase 1.1.2, 1.2.2, 1.3.4, 1.3.5, 1.4.3, 1.5.4, 1.5.5
 *
 * Comprehensive routing rules management panel with:
 *  - Rule CRUD (list, add, edit, delete, toggle, reorder)
 *  - Prompt-to-rule AI engine (natural language → rules)
 *  - Rule execution stats & history
 *  - Knowledge base management
 *  - AI provider status
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE as API_ROOT } from '../../config';

const API = `${API_ROOT}/api/v1/inbox/rules`;

// ── Types ──

interface RoutingRule {
    id: string;
    name: string;
    field: 'subject' | 'sender' | 'body' | 'any';
    pattern: string;
    targetProjectId: string;
    urgency: 'high' | 'medium' | 'low';
    priority: number;
    enabled: boolean;
}

interface RuleStats {
    ruleId: string;
    ruleName: string;
    hitCount: number;
    avgConfidence: number;
    lastFired: string;
    avgTimeMs: number;
}

interface KnowledgeEntry {
    id: string;
    title: string;
    content: string;
    type: string;
    charCount: number;
    createdAt: string;
}

interface AIProvider {
    name: string;
    configured: boolean;
    model?: string;
}

// ── Sub-views ──

type RulesView = 'list' | 'stats' | 'knowledge' | 'ai-settings' | 'add';

// ── Component ──

export default function RulesManager() {
    const [view, setView] = useState<RulesView>('list');
    const [rules, setRules] = useState<RoutingRule[]>([]);
    const [stats, setStats] = useState<RuleStats[]>([]);
    const [knowledge, setKnowledge] = useState<KnowledgeEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Form state
    const [editingRule, setEditingRule] = useState<RoutingRule | null>(null);
    const [promptText, setPromptText] = useState('');
    const [promptLoading, setPromptLoading] = useState(false);
    const [promptPreview, setPromptPreview] = useState<RoutingRule[] | null>(null);

    // Knowledge form
    const [knowledgeTitle, setKnowledgeTitle] = useState('');
    const [knowledgeContent, setKnowledgeContent] = useState('');

    // AI providers
    const [aiProviders, setAIProviders] = useState<AIProvider[]>([]);
    const [activeProvider, setActiveProvider] = useState('');
    const [fallbackChain, setFallbackChain] = useState<string[]>([]);

    // Form for adding/editing
    const [formName, setFormName] = useState('');
    const [formField, setFormField] = useState<'subject' | 'sender' | 'body' | 'any'>('any');
    const [formPattern, setFormPattern] = useState('');
    const [formTarget, setFormTarget] = useState('');
    const [formUrgency, setFormUrgency] = useState<'high' | 'medium' | 'low'>('medium');
    const [formPriority, setFormPriority] = useState(50);

    // ── Data Fetching ──

    const fetchRules = useCallback(async () => {
        try {
            const res = await fetch(API);
            if (res.ok) {
                const data = await res.json();
                setRules(data.rules || []);
            }
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${API}/stats`);
            if (res.ok) {
                const data = await res.json();
                setStats(data.perRule || []);
            }
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    const fetchKnowledge = useCallback(async () => {
        try {
            const res = await fetch(`${API}/knowledge`);
            if (res.ok) {
                const data = await res.json();
                setKnowledge(data.entries || []);
            }
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    const fetchAIProviders = useCallback(async () => {
        try {
            const res = await fetch(`${API}/ai-providers`);
            if (res.ok) {
                const data = await res.json();
                setAIProviders(data.providers || []);
                setActiveProvider(data.activeProvider || '');
                setFallbackChain(data.fallbackChain || []);
            }
        } catch (e: any) {
            setError(e.message);
        }
    }, []);

    useEffect(() => {
        setLoading(true);
        Promise.all([fetchRules(), fetchStats()]).finally(() => setLoading(false));
    }, [fetchRules, fetchStats]);

    useEffect(() => {
        if (view === 'knowledge') fetchKnowledge();
        if (view === 'ai-settings') fetchAIProviders();
    }, [view, fetchKnowledge, fetchAIProviders]);

    // ── Auto-dismiss success message ──
    useEffect(() => {
        if (success) {
            const t = setTimeout(() => setSuccess(null), 3500);
            return () => clearTimeout(t);
        }
    }, [success]);

    // ── Rule CRUD ──

    const handleCreateRule = async () => {
        if (!formName || !formPattern || !formTarget) {
            setError('Name, pattern, and target are required');
            return;
        }
        try {
            const res = await fetch(API, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName, field: formField, pattern: formPattern,
                    targetProjectId: formTarget, urgency: formUrgency, priority: formPriority, enabled: true,
                }),
            });
            if (res.ok) {
                setSuccess('Rule created');
                resetForm();
                setView('list');
                fetchRules();
            } else {
                const d = await res.json();
                setError(d.error || 'Failed to create rule');
            }
        } catch (e: any) { setError(e.message); }
    };

    const handleUpdateRule = async () => {
        if (!editingRule) return;
        try {
            const res = await fetch(`${API}/${editingRule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: formName, field: formField, pattern: formPattern,
                    targetProjectId: formTarget, urgency: formUrgency, priority: formPriority,
                }),
            });
            if (res.ok) {
                setSuccess('Rule updated');
                setEditingRule(null);
                resetForm();
                setView('list');
                fetchRules();
            } else {
                const d = await res.json();
                setError(d.error || 'Failed to update');
            }
        } catch (e: any) { setError(e.message); }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm('Delete this routing rule?')) return;
        try {
            const res = await fetch(`${API}/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setSuccess('Rule deleted');
                fetchRules();
            }
        } catch (e: any) { setError(e.message); }
    };

    const handleToggleRule = async (id: string) => {
        try {
            const res = await fetch(`${API}/${id}/toggle`, { method: 'POST' });
            if (res.ok) fetchRules();
        } catch (e: any) { setError(e.message); }
    };

    const resetForm = () => {
        setFormName(''); setFormField('any'); setFormPattern('');
        setFormTarget(''); setFormUrgency('medium'); setFormPriority(50);
        setEditingRule(null);
    };

    const startEdit = (r: RoutingRule) => {
        setEditingRule(r);
        setFormName(r.name); setFormField(r.field); setFormPattern(r.pattern);
        setFormTarget(r.targetProjectId); setFormUrgency(r.urgency); setFormPriority(r.priority);
        setView('add');
    };

    // ── Prompt to Rule ──

    const handlePromptPreview = async () => {
        if (!promptText.trim()) return;
        setPromptLoading(true);
        setPromptPreview(null);
        try {
            const res = await fetch(`${API}/from-prompt`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction: promptText }),
            });
            if (res.ok) {
                const data = await res.json();
                setPromptPreview(data.rules || []);
            } else {
                const d = await res.json();
                setError(d.error || 'Failed to generate rules');
            }
        } catch (e: any) { setError(e.message); }
        finally { setPromptLoading(false); }
    };

    const handlePromptSave = async () => {
        if (!promptText.trim()) return;
        setPromptLoading(true);
        try {
            const res = await fetch(`${API}/from-prompt/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction: promptText }),
            });
            if (res.ok) {
                const data = await res.json();
                setSuccess(`Created ${data.rules.length} rule(s) from prompt`);
                setPromptText('');
                setPromptPreview(null);
                fetchRules();
            } else {
                const d = await res.json();
                setError(d.error || 'Failed to save rules');
            }
        } catch (e: any) { setError(e.message); }
        finally { setPromptLoading(false); }
    };

    // ── Knowledge ──

    const handleAddKnowledge = async () => {
        if (!knowledgeTitle || !knowledgeContent) {
            setError('Title and content are required');
            return;
        }
        try {
            const res = await fetch(`${API}/knowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: knowledgeTitle, content: knowledgeContent }),
            });
            if (res.ok) {
                setSuccess('Knowledge entry added');
                setKnowledgeTitle(''); setKnowledgeContent('');
                fetchKnowledge();
            }
        } catch (e: any) { setError(e.message); }
    };

    const handleDeleteKnowledge = async (id: string) => {
        try {
            const res = await fetch(`${API}/knowledge/${id}`, { method: 'DELETE' });
            if (res.ok) { setSuccess('Entry removed'); fetchKnowledge(); }
        } catch (e: any) { setError(e.message); }
    };

    // ── Urgency Badge ──
    const urgencyBadge = (u: string) => {
        const map: Record<string, string> = { high: '🔴', medium: '🟡', low: '🟢' };
        return map[u] || '⚪';
    };

    // ── Render ──

    if (loading) {
        return <div className="iz-section" style={{ padding: '2rem', textAlign: 'center', opacity: 0.6 }}>Loading rules engine...</div>;
    }

    return (
        <div className="iz-section" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Alerts */}
            {error && (
                <div className="iz-alert" style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-primary)' }}>⚠️ {error}</span>
                    <button aria-label="Dismiss error" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem' }}>×</button>
                </div>
            )}
            {success && (
                <div style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '8px', padding: '0.75rem 1rem', color: 'var(--text-primary)' }}>
                    ✅ {success}
                </div>
            )}

            {/* Sub-navigation */}
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {([
                    { id: 'list' as RulesView, label: '📋 Rules', count: rules.length },
                    { id: 'add' as RulesView, label: editingRule ? '✏️ Edit' : '➕ Add' },
                    { id: 'stats' as RulesView, label: '📊 Analytics' },
                    { id: 'knowledge' as RulesView, label: '🧠 Knowledge' },
                    { id: 'ai-settings' as RulesView, label: '🤖 AI' },
                ]).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => { if (tab.id === 'add' && view !== 'add') resetForm(); setView(tab.id); }}
                        style={{
                            padding: '0.5rem 1rem',
                            borderRadius: '6px',
                            border: view === tab.id ? '1px solid var(--accent)' : '1px solid var(--border)',
                            background: view === tab.id ? 'var(--accent)' : 'var(--card-bg)',
                            color: view === tab.id ? '#fff' : 'var(--text-primary)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: view === tab.id ? 600 : 400,
                            transition: 'all 0.2s ease',
                        }}
                    >
                        {tab.label}
                        {tab.count !== undefined && <span style={{ marginLeft: '0.35rem', opacity: 0.7 }}>({tab.count})</span>}
                    </button>
                ))}
            </div>

            {/* ════════════════════════════════════ */}
            {/* PROMPT-TO-RULE ENGINE (always visible) */}
            {/* ════════════════════════════════════ */}
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-primary)', fontSize: '0.9rem' }}>🪄 Describe a rule in plain English</h4>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <textarea
                        value={promptText}
                        onChange={e => setPromptText(e.target.value)}
                        placeholder='e.g. "Route all emails from vendor@example.com about invoices to vendor billing with high urgency"'
                        style={{
                            flex: 1, minHeight: '3rem', padding: '0.6rem', borderRadius: '6px',
                            border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))',
                            color: 'var(--text-primary)', resize: 'vertical', fontSize: '0.85rem', fontFamily: 'inherit',
                        }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        <button
                            onClick={handlePromptPreview}
                            disabled={promptLoading || !promptText.trim()}
                            style={{
                                padding: '0.5rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border)',
                                background: 'var(--surface-bg)', color: 'var(--text-primary)', cursor: 'pointer',
                                fontSize: '0.8rem', opacity: promptLoading ? 0.5 : 1,
                            }}
                        >
                            {promptLoading ? '⏳' : '👁️'} Preview
                        </button>
                        <button
                            onClick={handlePromptSave}
                            disabled={promptLoading || !promptText.trim()}
                            style={{
                                padding: '0.5rem 0.8rem', borderRadius: '6px', border: 'none',
                                background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 600, opacity: promptLoading ? 0.5 : 1,
                            }}
                        >
                            {promptLoading ? '⏳' : '💾'} Save
                        </button>
                    </div>
                </div>

                {/* Preview results */}
                {promptPreview && promptPreview.length > 0 && (
                    <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: 'rgba(59,130,246,0.08)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.2)' }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
                            AI generated {promptPreview.length} rule(s):
                        </div>
                        {promptPreview.map((r, i) => (
                            <div key={i} style={{ padding: '0.5rem', background: 'var(--card-bg)', borderRadius: '6px', marginBottom: '0.35rem', fontSize: '0.82rem' }}>
                                <strong style={{ color: 'var(--text-primary)' }}>{r.name}</strong>
                                <span style={{ marginLeft: '0.5rem', color: 'var(--text-secondary)' }}>
                                    [{r.field}] <code style={{ background: 'rgba(0,0,0,0.1)', padding: '0 4px', borderRadius: '3px' }}>{r.pattern}</code> → {r.targetProjectId} {urgencyBadge(r.urgency)}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ════════════════════════════════════ */}
            {/* RULES LIST VIEW */}
            {/* ════════════════════════════════════ */}
            {view === 'list' && (
                <div>
                    {rules.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                            No routing rules yet. Create one manually or describe one above.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {[...rules].sort((a, b) => a.priority - b.priority).map(rule => (
                                <div key={rule.id} style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                                    background: rule.enabled ? 'var(--card-bg)' : 'rgba(120,120,120,0.08)',
                                    border: '1px solid var(--border)', borderRadius: '8px',
                                    opacity: rule.enabled ? 1 : 0.55,
                                    transition: 'all 0.2s ease',
                                }}>
                                    {/* Priority indicator */}
                                    <div style={{
                                        width: '28px', height: '28px', borderRadius: '50%',
                                        background: 'var(--surface-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0,
                                    }}>{rule.priority}</div>

                                    {/* Rule info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
                                            <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{rule.name}</span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--surface-bg)', padding: '1px 6px', borderRadius: '4px' }}>{rule.field}</span>
                                            <span>{urgencyBadge(rule.urgency)}</span>
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                            <code style={{ background: 'rgba(0,0,0,0.08)', padding: '0 4px', borderRadius: '3px', fontSize: '0.75rem' }}>{rule.pattern}</code>
                                            <span style={{ margin: '0 0.35rem' }}>→</span>
                                            <span style={{ fontWeight: 500 }}>{rule.targetProjectId}</span>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                        <button onClick={() => handleToggleRule(rule.id)} title={rule.enabled ? 'Disable' : 'Enable'}
                                            aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'} aria-pressed={rule.enabled}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem' }}>
                                            {rule.enabled ? '✅' : '⬜'}
                                        </button>
                                        <button onClick={() => startEdit(rule)} title="Edit" aria-label="Edit rule"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>✏️</button>
                                        <button onClick={() => handleDeleteRule(rule.id)} title="Delete" aria-label="Delete rule"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════ */}
            {/* ADD / EDIT RULE FORM */}
            {/* ════════════════════════════════════ */}
            {view === 'add' && (
                <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1.25rem' }}>
                    <h4 style={{ margin: '0 0 1rem 0', color: 'var(--text-primary)' }}>{editingRule ? `Edit: ${editingRule.name}` : 'New Routing Rule'}</h4>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Name</label>
                            <input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Vendor invoices"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Match Field</label>
                            <select value={formField} onChange={e => setFormField(e.target.value as any)}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)' }}>
                                <option value="any">Any Field</option>
                                <option value="subject">Subject</option>
                                <option value="sender">Sender</option>
                                <option value="body">Body</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pattern (regex)</label>
                            <input value={formPattern} onChange={e => setFormPattern(e.target.value)} placeholder="invoice|bill|payment"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Route To (project ID)</label>
                            <input value={formTarget} onChange={e => setFormTarget(e.target.value)} placeholder="proj-vendor-billing"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)' }} />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Urgency</label>
                            <select value={formUrgency} onChange={e => setFormUrgency(e.target.value as any)}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)' }}>
                                <option value="high">🔴 High</option>
                                <option value="medium">🟡 Medium</option>
                                <option value="low">🟢 Low</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Priority (lower = first)</label>
                            <input type="number" value={formPriority} onChange={e => setFormPriority(parseInt(e.target.value))} min={1} max={1000}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button onClick={editingRule ? handleUpdateRule : handleCreateRule}
                            style={{ padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600 }}>
                            {editingRule ? '💾 Save Changes' : '➕ Create Rule'}
                        </button>
                        <button onClick={() => { resetForm(); setView('list'); }}
                            style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}

            {/* ════════════════════════════════════ */}
            {/* STATS VIEW */}
            {/* ════════════════════════════════════ */}
            {view === 'stats' && (
                <div>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>📊 Rule Execution Analytics</h4>
                    {stats.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>No execution data yet. Rules will log stats as emails are processed.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {stats.map(s => (
                                <div key={s.ruleId} style={{
                                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: '0.5rem',
                                    padding: '0.75rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px',
                                    fontSize: '0.83rem', alignItems: 'center',
                                }}>
                                    <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.ruleName || s.ruleId}</div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--accent)' }}>{s.hitCount}</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>hits</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{(s.avgConfidence * 100).toFixed(0)}%</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>confidence</div>
                                    </div>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{s.avgTimeMs.toFixed(0)}ms</div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>avg time</div>
                                    </div>
                                    <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                        {s.lastFired ? new Date(s.lastFired).toLocaleDateString() : '—'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════ */}
            {/* KNOWLEDGE BASE VIEW */}
            {/* ════════════════════════════════════ */}
            {view === 'knowledge' && (
                <div>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>🧠 Knowledge Base</h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                        Add organizational context that helps the AI make smarter routing decisions.
                    </p>

                    {/* Add form */}
                    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1rem' }}>
                        <input value={knowledgeTitle} onChange={e => setKnowledgeTitle(e.target.value)} placeholder="Title (e.g. 'Vendor contacts')"
                            style={{ width: '100%', padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)' }} />
                        <textarea value={knowledgeContent} onChange={e => setKnowledgeContent(e.target.value)} placeholder="Content that helps AI route emails better..."
                            style={{ width: '100%', minHeight: '4rem', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input-bg, var(--surface-bg))', color: 'var(--text-primary)', resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem' }} />
                        <button onClick={handleAddKnowledge} disabled={!knowledgeTitle || !knowledgeContent}
                            style={{ marginTop: '0.5rem', padding: '0.5rem 1rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--text-primary)', cursor: 'pointer', fontWeight: 600, opacity: (!knowledgeTitle || !knowledgeContent) ? 0.5 : 1 }}>
                            ➕ Add Entry
                        </button>
                    </div>

                    {/* Entries */}
                    {knowledge.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>No entries yet. Add context about your organization.</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {knowledge.map(k => (
                                <div key={k.id} style={{ padding: '0.75rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{k.title}</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{k.charCount} chars</span>
                                            <button aria-label="Delete knowledge entry" onClick={() => handleDeleteKnowledge(k.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}>🗑️</button>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, whiteSpace: 'pre-wrap', maxHeight: '4rem', overflow: 'hidden' }}>{k.content}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════ */}
            {/* AI PROVIDER SETTINGS VIEW */}
            {/* ════════════════════════════════════ */}
            {view === 'ai-settings' && (
                <div>
                    <h4 style={{ margin: '0 0 0.75rem 0', color: 'var(--text-primary)' }}>🤖 AI Provider Configuration</h4>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Active Provider</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent)', textTransform: 'capitalize' }}>{activeProvider || '—'}</div>
                        </div>
                        <div style={{ padding: '1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '10px' }}>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.25rem' }}>Fallback Chain</div>
                            <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>{fallbackChain.join(' → ') || '—'}</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {aiProviders.map(p => (
                            <div key={p.name} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '0.75rem 1rem', background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: '8px',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '1.1rem' }}>{p.configured ? '✅' : '❌'}</span>
                                    <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: 'capitalize' }}>{p.name}</span>
                                    {p.model && <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--surface-bg)', padding: '1px 6px', borderRadius: '4px' }}>{p.model}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    {p.name === activeProvider && (
                                        <span style={{ fontSize: '0.7rem', background: 'var(--accent)', color: 'var(--text-primary)', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>ACTIVE</span>
                                    )}
                                    <span style={{ fontSize: '0.75rem', color: p.configured ? 'var(--text-secondary)' : 'rgba(239,68,68,0.8)' }}>
                                        {p.configured ? 'Configured' : 'Not configured'}
                                    </span>
                                </div>
                            </div>
                        ))}

                        {aiProviders.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-secondary)' }}>
                                Unable to fetch provider info. Make sure the backend is running.
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(59,130,246,0.08)', borderRadius: '8px', border: '1px solid rgba(59,130,246,0.15)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        💡 Set <code style={{ background: 'rgba(0,0,0,0.1)', padding: '0 4px', borderRadius: '3px' }}>AI_PROVIDER</code> and <code style={{ background: 'rgba(0,0,0,0.1)', padding: '0 4px', borderRadius: '3px' }}>AI_FALLBACK_CHAIN</code> in your <code>.env</code> to configure.
                    </div>
                </div>
            )}
        </div>
    );
}
