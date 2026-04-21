/**
 * SmartActions.tsx — Phase 3 Frontend Component
 *
 * Sub-views:
 * 1. Templates — CRUD for reply templates with variable support
 * 2. Quick Actions — AI draft, calendar extraction, workitem/Trello/assign
 * 3. Batch Ops — Multi-select operations panel
 *
 * Standalone component integrated into InboxZero as the ⚡ Actions tab.
 */

import { useState, useEffect, useCallback } from 'react';
import { API_BASE as API_ROOT } from '../../config';

const API_BASE = `${API_ROOT}/api/inbox/actions`;

// ── Types ──

interface ReplyTemplate {
    id: string;
    name: string;
    projectId: string | null;
    subjectTemplate: string;
    bodyTemplate: string;
    variables: string[];
    useCount: number;
    createdAt: string;
}

interface DraftResult {
    subject: string;
    body: string;
    confidence: number;
}

interface ExtractedEvent {
    title: string;
    date: string | null;
    time: string | null;
    duration: string | null;
    location: string | null;
    attendees: string[];
    confidence: number;
}

type SubView = 'templates' | 'quick' | 'batch';

// ── Styles ──

const styles: Record<string, React.CSSProperties> = {
    container: { padding: '20px', fontFamily: 'var(--font-body, Inter, sans-serif)' },
    header: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
    tabBtn: {
        padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-subtle, #2a2d35)',
        background: 'var(--bg-secondary, #16191f)', color: 'var(--text-primary, #e8eaed)',
        cursor: 'pointer', fontSize: '13px', fontWeight: 500, transition: 'all 0.2s',
    },
    tabBtnActive: {
        background: 'var(--accent, #0088cc)', color: '#fff', borderColor: 'var(--accent, #0088cc)',
    },
    card: {
        background: 'var(--bg-secondary, #16191f)', borderRadius: '12px',
        border: '1px solid var(--border-subtle, #2a2d35)', padding: '16px', marginBottom: '12px',
    },
    cardTitle: { fontSize: '14px', fontWeight: 600, color: 'var(--text-primary, #e8eaed)', marginBottom: '8px' },
    cardSubtext: { fontSize: '12px', color: 'var(--text-secondary, #8b8f98)', marginBottom: '4px' },
    input: {
        width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle, #2a2d35)',
        background: 'var(--bg-primary, #0d0f12)', color: 'var(--text-primary, #e8eaed)', fontSize: '13px',
        marginBottom: '8px', boxSizing: 'border-box' as const,
    },
    textarea: {
        width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle, #2a2d35)',
        background: 'var(--bg-primary, #0d0f12)', color: 'var(--text-primary, #e8eaed)', fontSize: '13px',
        minHeight: '80px', resize: 'vertical' as const, marginBottom: '8px', boxSizing: 'border-box' as const,
        fontFamily: 'inherit',
    },
    btn: {
        padding: '8px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
        fontSize: '13px', fontWeight: 500, transition: 'all 0.2s',
    },
    btnPrimary: { background: 'var(--accent, #0088cc)', color: '#fff' },
    btnDanger: { background: '#dc2626', color: '#fff' },
    btnGhost: { background: 'transparent', color: 'var(--text-secondary, #8b8f98)', border: '1px solid var(--border-subtle, #2a2d35)' },
    badge: {
        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
        fontWeight: 600, marginLeft: '6px',
    },
    grid: { display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' },
    statusMsg: { padding: '12px', borderRadius: '8px', marginBottom: '12px', fontSize: '13px' },
    success: { background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)' },
    error: { background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)' },
    section: { marginBottom: '24px' },
    sectionTitle: { fontSize: '16px', fontWeight: 600, color: 'var(--text-primary, #e8eaed)', marginBottom: '12px' },
    row: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' },
    draftBox: {
        background: 'var(--bg-primary, #0d0f12)', borderRadius: '8px', padding: '16px',
        border: '1px solid var(--border-subtle, #2a2d35)', marginTop: '12px',
    },
    eventCard: {
        background: 'var(--bg-primary, #0d0f12)', borderRadius: '8px', padding: '12px',
        border: '1px solid var(--border-subtle, #2a2d35)', marginBottom: '8px',
    },
    empty: { textAlign: 'center' as const, padding: '40px', color: 'var(--text-secondary, #8b8f98)' },
};

function confidencePillStyle(confidence: number): React.CSSProperties {
    return {
        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '11px',
        fontWeight: 600, marginLeft: '6px',
        background: confidence >= 0.7 ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)',
        color: confidence >= 0.7 ? '#10b981' : '#f59e0b',
    };
}

export default function SmartActions() {
    const [subView, setSubView] = useState<SubView>('templates');
    const [templates, setTemplates] = useState<ReplyTemplate[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Template form
    const [showForm, setShowForm] = useState(false);
    const [formName, setFormName] = useState('');
    const [formSubject, setFormSubject] = useState('');
    const [formBody, setFormBody] = useState('');
    const [formProject, setFormProject] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);

    // Quick Actions
    const [quickItemId, setQuickItemId] = useState('');
    const [draftResult, setDraftResult] = useState<DraftResult | null>(null);
    const [draftInstruction, setDraftInstruction] = useState('');
    const [events, setEvents] = useState<ExtractedEvent[]>([]);

    // Batch Ops
    const [batchIds, setBatchIds] = useState('');
    const [batchProject, setBatchProject] = useState('');
    const [batchAssignee, setBatchAssignee] = useState('');

    const clearStatus = useCallback(() => setTimeout(() => setStatus(null), 5000), []);

    // Load templates
    const loadTemplates = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/templates`);
            const data = await res.json();
            if (data.success) setTemplates(data.templates || []);
        } catch { /* ignore */ }
    }, []);

    useEffect(() => { loadTemplates(); }, [loadTemplates]);

    // ── Template CRUD ──

    const handleSaveTemplate = async () => {
        if (!formName.trim() || !formBody.trim()) {
            setStatus({ type: 'error', msg: 'Name and body are required' });
            clearStatus();
            return;
        }

        setLoading(true);
        try {
            const payload = {
                name: formName, bodyTemplate: formBody,
                subjectTemplate: formSubject || undefined,
                projectId: formProject || undefined,
                variables: formBody.match(/\{\{(\w+)\}\}/g)?.map(v => v.replace(/\{\{|\}\}/g, '')) || [],
            };

            const url = editingId ? `${API_BASE}/templates/${editingId}` : `${API_BASE}/templates`;
            const method = editingId ? 'PUT' : 'POST';

            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            const data = await res.json();

            if (data.success) {
                setStatus({ type: 'success', msg: editingId ? 'Template updated' : 'Template created' });
                resetForm();
                loadTemplates();
            } else {
                setStatus({ type: 'error', msg: data.error || 'Failed' });
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        setLoading(false);
        clearStatus();
    };

    const handleDeleteTemplate = async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: 'Template deleted' });
                loadTemplates();
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        clearStatus();
    };

    const editTemplate = (t: ReplyTemplate) => {
        setEditingId(t.id);
        setFormName(t.name);
        setFormSubject(t.subjectTemplate);
        setFormBody(t.bodyTemplate);
        setFormProject(t.projectId || '');
        setShowForm(true);
    };

    const resetForm = () => {
        setEditingId(null);
        setFormName('');
        setFormSubject('');
        setFormBody('');
        setFormProject('');
        setShowForm(false);
    };

    // ── Quick Actions ──

    const generateDraft = async () => {
        if (!quickItemId.trim()) { setStatus({ type: 'error', msg: 'Enter an inbox item ID' }); clearStatus(); return; }
        setLoading(true);
        setDraftResult(null);
        try {
            const res = await fetch(`${API_BASE}/${quickItemId}/draft`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ instruction: draftInstruction || undefined }),
            });
            const data = await res.json();
            if (data.success) {
                setDraftResult(data.draft);
                setStatus({ type: 'success', msg: 'Draft generated!' });
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        setLoading(false);
        clearStatus();
    };

    const extractEvents = async () => {
        if (!quickItemId.trim()) { setStatus({ type: 'error', msg: 'Enter an inbox item ID' }); clearStatus(); return; }
        setLoading(true);
        setEvents([]);
        try {
            const res = await fetch(`${API_BASE}/${quickItemId}/extract-events`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setEvents(data.events || []);
                setStatus({ type: 'success', msg: `Found ${data.total} event(s)` });
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        setLoading(false);
        clearStatus();
    };

    const createWorkitem = async () => {
        if (!quickItemId.trim()) { setStatus({ type: 'error', msg: 'Enter an inbox item ID' }); clearStatus(); return; }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/${quickItemId}/workitem`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({}),
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: `Workitem created: ${data.workitem?.id?.slice(0, 8)}` });
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        setLoading(false);
        clearStatus();
    };

    // ── Batch Operations ──

    const performBatchRoute = async () => {
        const ids = batchIds.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        if (ids.length === 0 || !batchProject.trim()) {
            setStatus({ type: 'error', msg: 'Enter IDs and project' });
            clearStatus();
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/batch/route`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, projectId: batchProject }),
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: `Routed ${data.routed}/${ids.length} items` });
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        setLoading(false);
        clearStatus();
    };

    const performBatchAssign = async () => {
        const ids = batchIds.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        if (ids.length === 0 || !batchAssignee.trim()) {
            setStatus({ type: 'error', msg: 'Enter IDs and assignee' });
            clearStatus();
            return;
        }
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/batch/assign`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, assignee: batchAssignee }),
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: `Assigned ${data.assigned}/${ids.length} items to ${batchAssignee}` });
            } else {
                setStatus({ type: 'error', msg: data.error });
            }
        } catch (err: any) {
            setStatus({ type: 'error', msg: err.message });
        }
        setLoading(false);
        clearStatus();
    };

    // ══════════════════════════════════════════════
    // RENDER
    // ══════════════════════════════════════════════

    return (
        <div style={styles.container}>
            {/* Sub-view tabs */}
            <div style={styles.header}>
                {([
                    { id: 'templates' as SubView, label: '📋 Templates', count: templates.length },
                    { id: 'quick' as SubView, label: '⚡ Quick Actions' },
                    { id: 'batch' as SubView, label: '📦 Batch Ops' },
                ]).map(tab => (
                    <button
                        key={tab.id}
                        style={{ ...styles.tabBtn, ...(subView === tab.id ? styles.tabBtnActive : {}) }}
                        onClick={() => setSubView(tab.id)}
                    >
                        {tab.label}
                        {tab.count !== undefined && tab.count > 0 && (
                            <span style={{ ...styles.badge, background: 'rgba(0,136,204,0.2)', color: '#0088cc' }}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Status message */}
            {status && (
                <div style={{ ...styles.statusMsg, ...(status.type === 'success' ? styles.success : styles.error) }}>
                    {status.type === 'success' ? '✅' : '❌'} {status.msg}
                </div>
            )}

            {/* ──── TEMPLATES SUB-VIEW ──── */}
            {subView === 'templates' && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                        <h3 style={styles.sectionTitle}>Reply Templates</h3>
                        <button
                            style={{ ...styles.btn, ...styles.btnPrimary }}
                            onClick={() => { resetForm(); setShowForm(!showForm); }}
                        >
                            {showForm ? '✕ Cancel' : '+ New Template'}
                        </button>
                    </div>

                    {/* Template Form */}
                    {showForm && (
                        <div style={{ ...styles.card, borderColor: 'var(--accent, #0088cc)' }}>
                            <div style={styles.cardTitle}>{editingId ? 'Edit Template' : 'New Template'}</div>
                            <input style={styles.input} placeholder="Template name" value={formName} onChange={e => setFormName(e.target.value)} />
                            <input style={styles.input} placeholder="Subject template (optional, use {{variable}})" value={formSubject} onChange={e => setFormSubject(e.target.value)} />
                            <textarea style={styles.textarea} placeholder="Body template — use {{name}}, {{date}}, etc." value={formBody} onChange={e => setFormBody(e.target.value)} />
                            <input style={styles.input} placeholder="Project ID (optional)" value={formProject} onChange={e => setFormProject(e.target.value)} />
                            <div style={styles.row}>
                                <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={handleSaveTemplate} disabled={loading}>
                                    {loading ? '⏳ Saving...' : editingId ? '💾 Update' : '✅ Create'}
                                </button>
                                {editingId && (
                                    <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={resetForm}>Cancel</button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Template List */}
                    {templates.length === 0 ? (
                        <div style={styles.empty}>
                            <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                            <div>No reply templates yet. Create one to speed up your workflow.</div>
                        </div>
                    ) : (
                        <div style={styles.grid}>
                            {templates.map(t => (
                                <div key={t.id} style={styles.card}>
                                    <div style={styles.cardTitle}>
                                        {t.name}
                                        <span style={{ ...styles.badge, background: 'rgba(99, 102, 241, 0.2)', color: '#6366f1' }}>
                                            used {t.useCount}x
                                        </span>
                                    </div>
                                    {t.subjectTemplate && (
                                        <div style={styles.cardSubtext}>📧 {t.subjectTemplate}</div>
                                    )}
                                    <div style={{ ...styles.cardSubtext, whiteSpace: 'pre-wrap', maxHeight: '60px', overflow: 'hidden' }}>
                                        {t.bodyTemplate}
                                    </div>
                                    {t.variables.length > 0 && (
                                        <div style={{ marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {t.variables.map(v => (
                                                <span key={v} style={{ ...styles.badge, background: 'rgba(245,158,11,0.2)', color: '#f59e0b' }}>
                                                    {`{{${v}}}`}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                    <div style={{ ...styles.row, marginTop: '10px' }}>
                                        <button style={{ ...styles.btn, ...styles.btnGhost }} onClick={() => editTemplate(t)}>✏️ Edit</button>
                                        <button style={{ ...styles.btn, ...styles.btnDanger }} onClick={() => handleDeleteTemplate(t.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ──── QUICK ACTIONS SUB-VIEW ──── */}
            {subView === 'quick' && (
                <div>
                    <h3 style={styles.sectionTitle}>Quick Actions</h3>
                    <div style={styles.card}>
                        <div style={styles.cardTitle}>Target Inbox Item</div>
                        <input
                            style={styles.input}
                            placeholder="Inbox item ID (paste from triage tab)"
                            value={quickItemId}
                            onChange={e => setQuickItemId(e.target.value)}
                        />
                    </div>

                    {/* AI Draft */}
                    <div style={styles.section}>
                        <div style={styles.card}>
                            <div style={styles.cardTitle}>🤖 AI Auto-Draft</div>
                            <div style={styles.cardSubtext}>Generate a professional reply draft using AI</div>
                            <input
                                style={{ ...styles.input, marginTop: '8px' }}
                                placeholder="Special instruction (optional, e.g. 'be apologetic', 'schedule a viewing')"
                                value={draftInstruction}
                                onChange={e => setDraftInstruction(e.target.value)}
                            />
                            <button
                                style={{ ...styles.btn, ...styles.btnPrimary }}
                                onClick={generateDraft}
                                disabled={loading || !quickItemId.trim()}
                            >
                                {loading ? '⏳ Generating...' : '✨ Generate Draft'}
                            </button>

                            {draftResult && (
                                <div style={styles.draftBox}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <strong style={{ color: 'var(--text-primary, #e8eaed)' }}>{draftResult.subject}</strong>
                                        <span style={confidencePillStyle(draftResult.confidence)}>
                                            {Math.round(draftResult.confidence * 100)}% conf
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--text-secondary, #8b8f98)', whiteSpace: 'pre-wrap', fontSize: '13px' }}>
                                        {draftResult.body}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Calendar Extraction */}
                    <div style={styles.section}>
                        <div style={styles.card}>
                            <div style={styles.cardTitle}>📅 Calendar Event Extraction</div>
                            <div style={styles.cardSubtext}>Extract dates, meetings, and scheduling info from email</div>
                            <button
                                style={{ ...styles.btn, ...styles.btnPrimary, marginTop: '8px' }}
                                onClick={extractEvents}
                                disabled={loading || !quickItemId.trim()}
                            >
                                {loading ? '⏳ Extracting...' : '📅 Extract Events'}
                            </button>

                            {events.length > 0 && (
                                <div style={{ marginTop: '12px' }}>
                                    {events.map((e, i) => (
                                        <div key={i} style={styles.eventCard}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <strong style={{ color: 'var(--text-primary, #e8eaed)', fontSize: '13px' }}>{e.title}</strong>
                                                <span style={confidencePillStyle(e.confidence)}>
                                                    {Math.round(e.confidence * 100)}%
                                                </span>
                                            </div>
                                            <div style={styles.cardSubtext}>
                                                📅 {e.date || 'TBD'} {e.time ? `⏰ ${e.time}` : ''} {e.duration ? `⏱️ ${e.duration}` : ''}
                                            </div>
                                            {e.location && <div style={styles.cardSubtext}>📍 {e.location}</div>}
                                            {e.attendees.length > 0 && (
                                                <div style={styles.cardSubtext}>👤 {e.attendees.join(', ')}</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Workflow Triggers */}
                    <div style={styles.section}>
                        <div style={styles.card}>
                            <div style={styles.cardTitle}>🔧 Workflow Triggers</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                <button
                                    style={{ ...styles.btn, ...styles.btnPrimary }}
                                    onClick={createWorkitem}
                                    disabled={loading || !quickItemId.trim()}
                                >
                                    📝 Create Workitem
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ──── BATCH OPS SUB-VIEW ──── */}
            {subView === 'batch' && (
                <div>
                    <h3 style={styles.sectionTitle}>Batch Operations</h3>
                    <div style={styles.card}>
                        <div style={styles.cardTitle}>📋 Item IDs</div>
                        <div style={styles.cardSubtext}>Enter IDs separated by commas or newlines</div>
                        <textarea
                            style={styles.textarea}
                            placeholder="id-1, id-2, id-3..."
                            value={batchIds}
                            onChange={e => setBatchIds(e.target.value)}
                        />
                    </div>

                    <div style={styles.grid}>
                        {/* Bulk Route */}
                        <div style={styles.card}>
                            <div style={styles.cardTitle}>🔀 Bulk Route</div>
                            <div style={styles.cardSubtext}>Route multiple items to a project</div>
                            <input
                                style={{ ...styles.input, marginTop: '8px' }}
                                placeholder="Project ID"
                                value={batchProject}
                                onChange={e => setBatchProject(e.target.value)}
                            />
                            <button
                                style={{ ...styles.btn, ...styles.btnPrimary }}
                                onClick={performBatchRoute}
                                disabled={loading || !batchIds.trim() || !batchProject.trim()}
                            >
                                {loading ? '⏳...' : '🚀 Route All'}
                            </button>
                        </div>

                        {/* Bulk Assign */}
                        <div style={styles.card}>
                            <div style={styles.cardTitle}>👤 Bulk Assign</div>
                            <div style={styles.cardSubtext}>Assign multiple items to a team member</div>
                            <input
                                style={{ ...styles.input, marginTop: '8px' }}
                                placeholder="Assignee email"
                                value={batchAssignee}
                                onChange={e => setBatchAssignee(e.target.value)}
                            />
                            <button
                                style={{ ...styles.btn, ...styles.btnPrimary }}
                                onClick={performBatchAssign}
                                disabled={loading || !batchIds.trim() || !batchAssignee.trim()}
                            >
                                {loading ? '⏳...' : '👤 Assign All'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
