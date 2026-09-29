/**
 * RulesManager — routing-rule CRUD, plan 066 §5c.
 * Rules are global config: reads for any inbox user, writes gated by `canEdit`
 * (caller passes `isGod`; the backend also enforces `requireRole('god')` on writes).
 * Prompt-to-rule, stats, knowledge and AI-provider panels were dropped — none of
 * that has a backend behind it in this plan.
 */
import { useState, useEffect, useCallback } from 'react';
import { Check, ClipboardList, Pencil, Plus, Save, Square, Trash2 } from 'lucide-react';

type AuthFetch = (url: string, init?: RequestInit) => Promise<Response>;

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

interface RulesManagerProps {
    apiBase: string;
    authFetch: AuthFetch;
    canEdit: boolean;
}

type View = 'list' | 'form';

function toast(detail: string) {
    window.dispatchEvent(new CustomEvent('qualia-toast', { detail }));
}

const urgencyColor: Record<RoutingRule['urgency'], string> = {
    high: 'var(--danger)',
    medium: 'var(--warning)',
    low: 'var(--success)',
};

export default function RulesManager({ apiBase, authFetch, canEdit }: RulesManagerProps) {
    const API = `${apiBase}/rules`;
    const [view, setView] = useState<View>('list');
    const [rules, setRules] = useState<RoutingRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);

    const [formName, setFormName] = useState('');
    const [formField, setFormField] = useState<RoutingRule['field']>('any');
    const [formPattern, setFormPattern] = useState('');
    const [formTarget, setFormTarget] = useState('');
    const [formUrgency, setFormUrgency] = useState<RoutingRule['urgency']>('medium');
    const [formPriority, setFormPriority] = useState(50);

    const fetchRules = useCallback(async () => {
        setLoading(true);
        try {
            const res = await authFetch(API);
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                setRules(data.data || []);
            } else {
                setError(data.error || `Failed to load rules (${res.status})`);
            }
        } catch (e: any) {
            setError(e?.message || 'Network error');
        } finally {
            setLoading(false);
        }
    }, [API, authFetch]);

    useEffect(() => { fetchRules(); }, [fetchRules]);

    const resetForm = () => {
        setFormName(''); setFormField('any'); setFormPattern('');
        setFormTarget(''); setFormUrgency('medium'); setFormPriority(50);
        setEditingId(null);
    };

    const startAdd = () => { resetForm(); setError(null); setView('form'); };

    const startEdit = (r: RoutingRule) => {
        setEditingId(r.id);
        setFormName(r.name); setFormField(r.field); setFormPattern(r.pattern);
        setFormTarget(r.targetProjectId); setFormUrgency(r.urgency); setFormPriority(r.priority);
        setError(null);
        setView('form');
    };

    const handleSave = async () => {
        if (!formName.trim() || !formPattern.trim() || !formTarget.trim()) {
            setError('Name, pattern, and target are required');
            return;
        }
        setError(null);
        const payload = {
            name: formName, field: formField, pattern: formPattern,
            targetProjectId: formTarget, urgency: formUrgency, priority: formPriority,
            // An edit is a partial PUT — never re-enable a rule the operator turned off.
            ...(editingId ? {} : { enabled: true }),
        };
        try {
            const res = editingId
                ? await authFetch(`${API}/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
                : await authFetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                toast(editingId ? 'Rule updated' : 'Rule created');
                resetForm();
                setView('list');
                fetchRules();
            } else {
                setError(data.error || `Failed to save rule (${res.status})`);
            }
        } catch (e: any) {
            setError(e?.message || 'Network error');
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this routing rule?')) return;
        try {
            const res = await authFetch(`${API}/${id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                toast('Rule deleted');
                fetchRules();
            } else {
                toast(data.error || `Failed to delete rule (${res.status})`);
            }
        } catch {
            toast('Network error');
        }
    };

    const handleToggle = async (rule: RoutingRule) => {
        try {
            const res = await authFetch(`${API}/${rule.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ enabled: !rule.enabled }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success !== false) {
                fetchRules();
            } else {
                toast(data.error || `Failed to update rule (${res.status})`);
            }
        } catch {
            toast('Network error');
        }
    };

    // Only the first load replaces the panel; a refetch after a mutation keeps the list (and focus) in place.
    if (loading && rules.length === 0) {
        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading rules…</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {error && (
                <div style={{
                    background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)',
                    borderRadius: '8px', padding: '0.75rem 1rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                    <span style={{ color: 'var(--text-primary)' }}>{error}</span>
                    <button aria-label="Dismiss error" onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: '1.1rem' }}>×</button>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <ClipboardList size={16} aria-hidden /> Routing Rules <span style={{ color: 'var(--text-secondary)' }}>({rules.length})</span>
                </h3>
                {canEdit && view === 'list' && (
                    <button
                        onClick={startAdd}
                        style={{ padding: '0.5rem 0.9rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--text-inverse)', cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                    >
                        <Plus size={14} aria-hidden /> New Rule
                    </button>
                )}
            </div>

            {view === 'list' && (
                rules.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                        No routing rules yet.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {[...rules].sort((a, b) => a.priority - b.priority).map(rule => (
                            <div key={rule.id} style={{
                                display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem',
                                background: rule.enabled ? 'var(--bg-surface)' : 'var(--bg-surface-hover)',
                                border: '1px solid var(--border-default)', borderRadius: '8px',
                            }}>
                                <div style={{
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    background: 'var(--bg-surface-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0,
                                }}>{rule.priority}</div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.88rem' }}>{rule.name}</span>
                                        {!rule.enabled && <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', border: '1px solid var(--border-default)', borderRadius: '4px', padding: '0 5px' }}>Disabled</span>}
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-surface-elevated)', padding: '1px 6px', borderRadius: '4px' }}>{rule.field}</span>
                                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: urgencyColor[rule.urgency], display: 'inline-block' }} aria-hidden />
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                        <code style={{ background: 'var(--bg-surface-elevated)', padding: '0 4px', borderRadius: '3px', fontSize: '0.75rem' }}>{rule.pattern}</code>
                                        <span style={{ margin: '0 0.35rem' }}>→</span>
                                        <span style={{ fontWeight: 500 }}>{rule.targetProjectId}</span>
                                    </div>
                                </div>

                                {canEdit && (
                                    <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                                        <button onClick={() => handleToggle(rule)} title={rule.enabled ? 'Disable' : 'Enable'}
                                            aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'} aria-pressed={rule.enabled}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', color: 'var(--text-primary)' }}>
                                            {rule.enabled ? <Check size={16} aria-hidden /> : <Square size={16} aria-hidden />}
                                        </button>
                                        <button onClick={() => startEdit(rule)} title="Edit" aria-label="Edit rule"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}><Pencil size={16} aria-hidden /></button>
                                        <button onClick={() => handleDelete(rule.id)} title="Delete" aria-label="Delete rule"
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}><Trash2 size={16} aria-hidden /></button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )
            )}

            {canEdit && view === 'form' && (
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: '10px', padding: '1.25rem' }}>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '14px', color: 'var(--text-primary)' }}>{editingId ? 'Edit Rule' : 'New Routing Rule'}</h3>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <div>
                            <label htmlFor="rm-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Name</label>
                            <input id="rm-name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Vendor invoices"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }} />
                        </div>
                        <div>
                            <label htmlFor="rm-field" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Match Field</label>
                            <select id="rm-field" value={formField} onChange={e => setFormField(e.target.value as RoutingRule['field'])}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>
                                <option value="any">Any Field</option>
                                <option value="subject">Subject</option>
                                <option value="sender">Sender</option>
                                <option value="body">Body</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="rm-pattern" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Pattern (regex)</label>
                            <input id="rm-pattern" value={formPattern} onChange={e => setFormPattern(e.target.value)} placeholder="invoice|bill|payment"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem' }} />
                        </div>
                        <div>
                            <label htmlFor="rm-target" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Route To (project ID)</label>
                            <input id="rm-target" value={formTarget} onChange={e => setFormTarget(e.target.value)} placeholder="proj-vendor-billing"
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }} />
                        </div>
                        <div>
                            <label htmlFor="rm-urgency" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Urgency</label>
                            <select id="rm-urgency" value={formUrgency} onChange={e => setFormUrgency(e.target.value as RoutingRule['urgency'])}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }}>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="rm-priority" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Priority (lower = first)</label>
                            <input id="rm-priority" type="number" value={formPriority} onChange={e => setFormPriority(parseInt(e.target.value, 10) || 0)} min={0} max={1000}
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'var(--bg-surface-elevated)', color: 'var(--text-primary)' }} />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                        <button onClick={handleSave}
                            style={{ padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--text-inverse)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                            {editingId ? <><Save size={14} aria-hidden /> Save Changes</> : <><Plus size={14} aria-hidden /> Create Rule</>}
                        </button>
                        <button onClick={() => { resetForm(); setError(null); setView('list'); }}
                            style={{ padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid var(--border-default)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
