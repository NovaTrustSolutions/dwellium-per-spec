/**
 * CorporateReview — Upload, triage, approve, and convert documents to workitems.
 * Corporate-level document review pipeline for the Strata dashboard.
 *
 * Phase-3 Task 3.8 retrofit: GR-13 observability (ErrorBoundary wrap +
 * 6 try/catch-wrapped Sentry breadcrumbs + 11 data-testid anchors) +
 * raw fetch → strataApi rewire (1 strataGet + 4 strataPost + 1
 * strataUpload) + 5 isStaticMode write-guards on all POST sites with a
 * sticky `statusFeedback` banner above the status filter row. Mirrors
 * Task 3.7 (ProjectsModule) Inner/Outer split shape and Task 2.8
 * (SentimentModule) strataApi rewire shape — see commit body.
 */
import { useState, useEffect, useCallback } from 'react';
import {
    Upload, Filter, CheckCircle2, XCircle, Clock, FileText,
    Search, RefreshCw, AlertTriangle, Plus
} from 'lucide-react';
import { strataGet, strataPost, strataUpload, isStaticMode } from '../strataApi';
import type { ReviewStatus, DocPriority, ReviewDocument } from '../strataTypes';
import { ErrorBoundary } from '../../ErrorBoundary/ErrorBoundary';
import { Sentry } from '../../../services/sentry';

const STATUS_COLORS: Record<ReviewStatus, string> = {
    pending: '#eab308',
    triaged: '#3b82f6',
    approved: '#22c55e',
    rejected: '#ef4444',
};

const PRIORITY_COLORS: Record<DocPriority, string> = {
    critical: '#ef4444',
    high: '#f97316',
    medium: '#eab308',
    low: '#22c55e',
};

const CATEGORIES = ['Invoice', 'Lease', 'Compliance', 'Insurance', 'Legal', 'Tax', 'Other'];

type WriteAction = 'Upload' | 'Triage' | 'Approve' | 'Reject' | 'Create workitem';

function staticModeMessage(action: WriteAction): string {
    return `🗒️ ${action} requires backend mode (static deck is read-only).`;
}

function CorporateReviewInner() {
    const [docs, setDocs] = useState<ReviewDocument[]>([]);
    const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState<ReviewDocument | null>(null);
    const [showUpload, setShowUpload] = useState(false);
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [uploadCategory, setUploadCategory] = useState('Invoice');
    const [uploadPriority, setUploadPriority] = useState<DocPriority>('medium');
    const [uploadNotes, setUploadNotes] = useState('');
    const [feedback, setFeedback] = useState<string | null>(null);
    const [statusFeedback, setStatusFeedback] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const fetchDocs = useCallback(async () => {
        try {
            const params: Record<string, string> = {};
            if (filter !== 'all') params.status = filter;
            if (search) params.search = search;
            const data = await strataGet<ReviewDocument[]>('/corporate-review', params);
            setDocs(data);
        } catch {
            // Backend route not available — show empty
            setDocs([]);
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.fetch',
                    message: 'corporate-review.fetch.error',
                    level: 'warning',
                });
            } catch { /* Sentry no-op when DSN unset */ }
        }
    }, [filter, search]);

    useEffect(() => {
        fetchDocs();
        try {
            Sentry.addBreadcrumb({
                category: 'ui.load',
                message: 'corporate-review.module.loaded',
                level: 'info',
                data: { staticMode: isStaticMode },
            });
        } catch { /* Sentry no-op when DSN unset */ }
    }, [fetchDocs]);

    const showToast = (msg: string) => {
        setFeedback(msg);
        setTimeout(() => setFeedback(null), 3000);
    };

    const handleUpload = async () => {
        if (!uploadFile) return;
        if (isStaticMode) {
            setStatusFeedback(staticModeMessage('Upload'));
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.submit',
                    message: 'corporate-review.upload.skipped',
                    level: 'info',
                    data: { filename: uploadFile.name, category: uploadCategory, priority: uploadPriority },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            setShowUpload(false);
            setUploadFile(null);
            setUploadNotes('');
            return;
        }
        setLoading(true);
        try {
            Sentry.addBreadcrumb({
                category: 'ui.submit',
                message: 'corporate-review.upload.sent',
                level: 'info',
                data: { filename: uploadFile.name, size: uploadFile.size, category: uploadCategory, priority: uploadPriority },
            });
        } catch { /* Sentry no-op when DSN unset */ }
        try {
            const formData = new FormData();
            formData.append('file', uploadFile);
            formData.append('category', uploadCategory);
            formData.append('priority', uploadPriority);
            formData.append('notes', uploadNotes);
            await strataUpload<ReviewDocument>('/corporate-review/upload', formData);
            showToast('📄 Document uploaded');
            setShowUpload(false);
            setUploadFile(null);
            setUploadNotes('');
            fetchDocs();
        } catch {
            showToast('❌ Upload failed');
        }
        setLoading(false);
    };

    const submitWrite = async (
        doc: ReviewDocument,
        action: Exclude<WriteAction, 'Upload'>,
        path: string,
        body: unknown,
        successToast: string,
        failureToast: string,
    ) => {
        if (isStaticMode) {
            setStatusFeedback(staticModeMessage(action));
            try {
                Sentry.addBreadcrumb({
                    category: 'ui.submit',
                    message: 'corporate-review.submit.skipped',
                    level: 'info',
                    data: { docId: doc.id, action: action.toLowerCase().replace(' ', '-') },
                });
            } catch { /* Sentry no-op when DSN unset */ }
            return;
        }
        try {
            Sentry.addBreadcrumb({
                category: 'ui.submit',
                message: 'corporate-review.submit.sent',
                level: 'info',
                data: { docId: doc.id, action: action.toLowerCase().replace(' ', '-') },
            });
        } catch { /* Sentry no-op when DSN unset */ }
        try {
            await strataPost(path, body);
            showToast(successToast);
            fetchDocs();
        } catch {
            showToast(failureToast);
        }
    };

    const triageDoc = (doc: ReviewDocument, priority: DocPriority) =>
        submitWrite(doc, 'Triage', `/corporate-review/${doc.id}/triage`, { priority },
            '✅ Document triaged', '❌ Triage failed');

    const approveDoc = (doc: ReviewDocument) =>
        submitWrite(doc, 'Approve', `/corporate-review/${doc.id}/approve`, {},
            '✅ Document approved', '❌ Approval failed');

    const rejectDoc = (doc: ReviewDocument) =>
        submitWrite(doc, 'Reject', `/corporate-review/${doc.id}/reject`, {},
            '🚫 Document rejected', '❌ Rejection failed');

    const createWorkitem = (doc: ReviewDocument) =>
        submitWrite(doc, 'Create workitem', `/corporate-review/${doc.id}/create-workitem`, {},
            '🔗 Workitem created from document', '❌ Failed to create workitem');

    const filtered = docs.filter(d =>
        (filter === 'all' || d.status === filter) &&
        (!search || d.filename.toLowerCase().includes(search.toLowerCase()) || d.category.toLowerCase().includes(search.toLowerCase()))
    );

    const counts = {
        pending: docs.filter(d => d.status === 'pending').length,
        triaged: docs.filter(d => d.status === 'triaged').length,
        approved: docs.filter(d => d.status === 'approved').length,
        rejected: docs.filter(d => d.status === 'rejected').length,
    };

    const cardStyle: React.CSSProperties = {
        background: 'rgba(30,30,50,0.85)', borderRadius: 10, padding: 16,
        border: '1px solid rgba(255,255,255,0.08)',
    };

    return (
        <div data-testid="corporate-review-module" className="strata-module" style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
            {/* Static-mode write-guard banner (sticky-until-replaced) */}
            {statusFeedback && (
                <div
                    className="s-glass-card"
                    style={{
                        padding: '8px 12px', color: '#fbbf24', fontSize: 12,
                        borderColor: 'rgba(251,191,36,0.4)', display: 'flex', alignItems: 'center', gap: 8,
                    }}
                >
                    <AlertTriangle size={14} /> {statusFeedback}
                </div>
            )}

            {/* Status Bar */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {(['all', 'pending', 'triaged', 'approved', 'rejected'] as const).map(s => (
                    <button
                        key={s}
                        data-testid={`corporate-review-status-filter-${s}`}
                        onClick={() => setFilter(s)}
                        style={{
                            padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600,
                            background: filter === s ? (s === 'all' ? '#6366f1' : STATUS_COLORS[s]) : 'rgba(255,255,255,0.06)',
                            color: filter === s ? '#fff' : '#aaa',
                        }}
                    >
                        {s === 'all' ? `All (${docs.length})` : `${s.charAt(0).toUpperCase() + s.slice(1)} (${counts[s]})`}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button
                    data-testid="corporate-review-upload-btn"
                    onClick={() => setShowUpload(true)}
                    style={{
                        padding: '6px 16px', borderRadius: 8, border: 'none', background: '#6366f1',
                        color: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                    }}
                >
                    <Upload size={14} /> Upload Document
                </button>
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '6px 12px' }}>
                <Search size={14} style={{ color: '#888' }} />
                <input
                    data-testid="corporate-review-search-input"
                    value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents..."
                    style={{ flex: 1, background: 'transparent', border: 'none', color: '#eee', fontSize: 13, outline: 'none' }}
                />
                <button
                    data-testid="corporate-review-refresh-btn"
                    onClick={fetchDocs}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer' }}
                >
                    <RefreshCw size={14} />
                </button>
            </div>

            {/* Document List */}
            <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {filtered.length === 0 && (
                    <div style={{ textAlign: 'center', color: '#666', padding: 40 }}>
                        <FileText size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                        <p>No documents found</p>
                    </div>
                )}
                {filtered.map(doc => (
                    <div
                        key={doc.id}
                        data-testid={`corporate-review-card-${doc.id}`}
                        onClick={() => setSelected(selected?.id === doc.id ? null : doc)}
                        style={{
                            ...cardStyle, cursor: 'pointer',
                            borderColor: selected?.id === doc.id ? '#6366f1' : 'rgba(255,255,255,0.08)',
                            transition: 'border-color 0.2s',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FileText size={16} style={{ color: '#6366f1' }} />
                            <span style={{ flex: 1, fontWeight: 600, fontSize: 14, color: '#eee' }}>{doc.filename}</span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: STATUS_COLORS[doc.status] + '22', color: STATUS_COLORS[doc.status], fontWeight: 600 }}>
                                {doc.status.toUpperCase()}
                            </span>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: PRIORITY_COLORS[doc.priority] + '22', color: PRIORITY_COLORS[doc.priority], fontWeight: 600 }}>
                                {doc.priority}
                            </span>
                            <span style={{ fontSize: 11, color: '#888' }}>{doc.category}</span>
                        </div>
                        {doc.notes && <p style={{ fontSize: 12, color: '#999', margin: '6px 0 0 26px' }}>{doc.notes}</p>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 26, fontSize: 11, color: '#666' }}>
                            <Clock size={11} /> {new Date(doc.createdAt).toLocaleDateString()} • by {doc.uploadedBy}
                            {doc.workitemId && <span style={{ color: '#22c55e' }}>• Workitem linked</span>}
                        </div>

                        {/* Expanded actions */}
                        {selected?.id === doc.id && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingLeft: 26 }}>
                                {doc.status === 'pending' && (
                                    <>
                                        <button
                                            data-testid={`corporate-review-action-triage-high-${doc.id}`}
                                            onClick={e => { e.stopPropagation(); triageDoc(doc, 'high'); }}
                                            style={btnStyle('#3b82f6')}
                                        >
                                            <Filter size={12} /> Triage (High)
                                        </button>
                                        <button
                                            data-testid={`corporate-review-action-triage-med-${doc.id}`}
                                            onClick={e => { e.stopPropagation(); triageDoc(doc, 'medium'); }}
                                            style={btnStyle('#eab308')}
                                        >
                                            <Filter size={12} /> Triage (Med)
                                        </button>
                                    </>
                                )}
                                {(doc.status === 'pending' || doc.status === 'triaged') && (
                                    <>
                                        <button
                                            data-testid={`corporate-review-action-approve-${doc.id}`}
                                            onClick={e => { e.stopPropagation(); approveDoc(doc); }}
                                            style={btnStyle('#22c55e')}
                                        >
                                            <CheckCircle2 size={12} /> Approve
                                        </button>
                                        <button
                                            data-testid={`corporate-review-action-reject-${doc.id}`}
                                            onClick={e => { e.stopPropagation(); rejectDoc(doc); }}
                                            style={btnStyle('#ef4444')}
                                        >
                                            <XCircle size={12} /> Reject
                                        </button>
                                    </>
                                )}
                                {doc.status === 'approved' && !doc.workitemId && (
                                    <button
                                        data-testid={`corporate-review-action-create-workitem-${doc.id}`}
                                        onClick={e => { e.stopPropagation(); createWorkitem(doc); }}
                                        style={btnStyle('#6366f1')}
                                    >
                                        <Plus size={12} /> Create Workitem
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* Upload Modal */}
            {showUpload && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 }}
                    onClick={() => setShowUpload(false)}>
                    <div style={{ ...cardStyle, width: 420, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 16px', color: '#eee', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Upload size={16} /> Upload Document for Review
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <input type="file" onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                style={{ color: '#ccc', fontSize: 13 }} />
                            <label style={{ fontSize: 12, color: '#888' }}>Category</label>
                            <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px', color: '#eee', fontSize: 13 }}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <label style={{ fontSize: 12, color: '#888' }}>Priority</label>
                            <select value={uploadPriority} onChange={e => setUploadPriority(e.target.value as DocPriority)}
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px', color: '#eee', fontSize: 13 }}>
                                <option value="critical">Critical</option>
                                <option value="high">High</option>
                                <option value="medium">Medium</option>
                                <option value="low">Low</option>
                            </select>
                            <label style={{ fontSize: 12, color: '#888' }}>Notes</label>
                            <textarea value={uploadNotes} onChange={e => setUploadNotes(e.target.value)}
                                rows={3} placeholder="Additional notes..."
                                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 10px', color: '#eee', fontSize: 13, resize: 'vertical' }} />
                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                                <button onClick={() => setShowUpload(false)} style={btnStyle('#666')}>Cancel</button>
                                <button onClick={handleUpload} disabled={!uploadFile || loading} style={btnStyle('#6366f1')}>
                                    {loading ? 'Uploading...' : 'Upload'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Toast */}
            {feedback && (
                <div style={{
                    position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                    background: '#1a1a2e', border: '1px solid rgba(99,102,241,0.4)', borderRadius: 8,
                    padding: '10px 20px', color: '#eee', fontSize: 13, zIndex: 1000,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}>
                    {feedback}
                </div>
            )}
        </div>
    );
}

function btnStyle(color: string): React.CSSProperties {
    return {
        padding: '4px 12px', borderRadius: 6, border: 'none', background: color + '22',
        color, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
    };
}

export default function CorporateReview() {
    return (
        <ErrorBoundary
            fallback={
                <div className="s-glass-card" style={{ padding: 14, color: '#f87171', fontSize: 12 }}>
                    Corporate Review module unavailable.
                </div>
            }
        >
            <CorporateReviewInner />
        </ErrorBoundary>
    );
}
