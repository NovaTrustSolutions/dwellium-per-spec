/**
 * Home Upkeep AI — Proactive Maintenance Intelligence Widget
 *
 * Tracks building systems against expected lifespans, flags
 * upcoming inspections, analyzes photos for wear, and generates
 * proactive alerts before small problems become expensive disasters.
 */

import { useState, useEffect, useCallback } from 'react';
import './HomeUpkeepAI.css';
import { API_BASE } from '../../config';

const API = `${API_BASE}/api/maintenance`;

// ============================================
// TYPES
// ============================================

interface DashboardStats {
    totalSystems: number;
    criticalAlerts: number;
    warningAlerts: number;
    overdueInspections: number;
    healthScore: number;
    categoryCounts: Record<string, number>;
}

interface BuildingSystem {
    id: string;
    propertyId: string;
    propertyName: string;
    category: string;
    name: string;
    manufacturer?: string;
    model?: string;
    installedDate: string;
    expectedLifespanYears: number;
    lastInspected?: string;
    condition: 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
    notes?: string;
}

interface MaintenanceAlert {
    id: string;
    systemId: string;
    systemName: string;
    propertyName: string;
    category: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    message: string;
    dueDate?: string;
    status: string;
}

interface TimelineItem {
    systemId: string;
    systemName: string;
    propertyName: string;
    category: string;
    ageYears: number;
    lifespanYears: number;
    lifespanPct: number;
    remainingYears: number;
    condition: string;
    lastInspected: string | null;
    replacementDate: string;
}

interface SystemTemplate {
    category: string;
    name: string;
    lifespanYears: number;
}

type Tab = 'dashboard' | 'alerts' | 'systems' | 'inspect';

// ============================================
// CATEGORY ICONS
// ============================================

const CATEGORY_ICONS: Record<string, string> = {
    'Plumbing': '🚿',
    'HVAC': '❄️',
    'Roofing': '🏠',
    'Exterior': '🏡',
    'Electrical': '⚡',
    'Appliances': '🍳',
    'Structure': '🧱',
    'Safety': '🧯',
    'Landscaping': '🌿',
};

const CONDITION_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
    'excellent': { color: '#22c55e', bg: 'rgba(16,185,129,0.12)', label: 'Excellent' },
    'good': { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', label: 'Good' },
    'fair': { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Fair' },
    'poor': { color: '#f97316', bg: 'rgba(249,115,22,0.12)', label: 'Poor' },
    'critical': { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Critical' },
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
    'critical': { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', icon: '🔴' },
    'warning': { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', icon: '🟡' },
    'info': { color: '#3b82f6', bg: 'rgba(59,130,246,0.10)', icon: '🔵' },
};

// ============================================
// MAIN COMPONENT
// ============================================

export default function HomeUpkeepAI() {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [systems, setSystems] = useState<BuildingSystem[]>([]);
    const [alerts, setAlerts] = useState<MaintenanceAlert[]>([]);
    const [timeline, setTimeline] = useState<TimelineItem[]>([]);
    const [templates, setTemplates] = useState<SystemTemplate[]>([]);
    const [loading, setLoading] = useState(true);

    // Add system modal
    const [showAddModal, setShowAddModal] = useState(false);
    const [addForm, setAddForm] = useState({
        category: '', name: '', manufacturer: '', model: '',
        installedDate: '', expectedLifespanYears: 10,
        condition: 'good' as BuildingSystem['condition'],
        propertyName: 'Main Property',
    });

    // Inspect tab
    const [inspectSystem, setInspectSystem] = useState('');
    const [inspectCondition, setInspectCondition] = useState<BuildingSystem['condition']>('good');
    const [inspectNotes, setInspectNotes] = useState('');
    const [inspectPhoto, setInspectPhoto] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [inspections, setInspections] = useState<any[]>([]);

    // Fetch all data
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [statsRes, systemsRes, alertsRes, timelineRes, templatesRes] = await Promise.all([
                fetch(`${API}/stats`), fetch(`${API}/systems`),
                fetch(`${API}/alerts`), fetch(`${API}/timeline`),
                fetch(`${API}/templates`),
            ]);
            setStats(await statsRes.json());
            setSystems(await systemsRes.json());
            setAlerts(await alertsRes.json());
            setTimeline(await timelineRes.json());
            setTemplates(await templatesRes.json());
        } catch (err) { console.error('[HomeUpkeepAI] Fetch failed:', err); }
        setLoading(false);
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Fetch inspections when inspect tab is active
    useEffect(() => {
        if (activeTab === 'inspect') {
            fetch(`${API}/inspections`).then(r => r.json()).then(setInspections).catch(() => { });
        }
    }, [activeTab]);

    // ──── ADD SYSTEM ────
    const handleAddSystem = async () => {
        if (!addForm.category || !addForm.name || !addForm.installedDate) return;
        try {
            await fetch(`${API}/systems`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(addForm),
            });
            setShowAddModal(false);
            setAddForm({ category: '', name: '', manufacturer: '', model: '', installedDate: '', expectedLifespanYears: 10, condition: 'good', propertyName: 'Main Property' });
            fetchData();
        } catch (err) { console.error('Failed to add system:', err); }
    };

    const handleTemplateSelect = (t: SystemTemplate) => {
        setAddForm(prev => ({ ...prev, category: t.category, name: t.name, expectedLifespanYears: t.lifespanYears }));
    };

    // ──── ALERT ACTIONS ────
    const handleAlertAction = async (id: string, status: string) => {
        try {
            await fetch(`${API}/alerts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            fetchData();
        } catch (err) { console.error('Alert action failed:', err); }
    };

    // ──── PHOTO UPLOAD & ANALYSIS ────
    const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            setInspectPhoto(base64);
        };
        reader.readAsDataURL(file);
    };

    const handleAnalyzePhoto = async () => {
        if (!inspectPhoto || !inspectSystem) return;
        const sys = systems.find(s => s.id === inspectSystem);
        setAnalyzing(true);
        try {
            const res = await fetch(`${API}/analyze-photo`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ photoBase64: inspectPhoto, systemName: sys?.name || 'Unknown' }),
            });
            const data = await res.json();
            setAnalysisResult(data.analysis || 'No analysis returned.');
        } catch (err) { setAnalysisResult('Analysis failed. Check API key.'); }
        setAnalyzing(false);
    };

    const handleLogInspection = async () => {
        if (!inspectSystem || !inspectNotes) return;
        try {
            await fetch(`${API}/inspections`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemId: inspectSystem,
                    condition: inspectCondition,
                    notes: inspectNotes,
                    analysisResult: analysisResult || undefined,
                }),
            });
            setInspectNotes('');
            setInspectPhoto(null);
            setAnalysisResult('');
            fetchData();
            // Refresh inspections
            const res = await fetch(`${API}/inspections`);
            setInspections(await res.json());
        } catch (err) { console.error('Log inspection failed:', err); }
    };

    // ──── HEALTH SCORE RING ────
    const renderHealthRing = (score: number) => {
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (score / 100) * circumference;
        const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';

        return (
            <div className="huai-health-ring">
                <svg viewBox="0 0 120 120" className="huai-health-ring__svg">
                    <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                    <circle
                        cx="60" cy="60" r={radius} fill="none"
                        stroke={color} strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        transform="rotate(-90 60 60)"
                        className="huai-health-ring__progress"
                    />
                </svg>
                <div className="huai-health-ring__value" style={{ color }}>
                    <span className="huai-health-ring__number">{score}</span>
                    <span className="huai-health-ring__label">health</span>
                </div>
            </div>
        );
    };

    // ──── TAB: DASHBOARD ────
    const renderDashboard = () => {
        if (!stats) return <div className="huai-loading">Loading stats…</div>;

        return (
            <div className="huai-dashboard">
                {/* Health Score + KPIs */}
                <div className="huai-dashboard__top">
                    {renderHealthRing(stats.healthScore)}
                    <div className="huai-dashboard__kpis">
                        <div className="huai-kpi huai-kpi--systems">
                            <span className="huai-kpi__value">{stats.totalSystems}</span>
                            <span className="huai-kpi__label">tracked systems</span>
                        </div>
                        <div className="huai-kpi huai-kpi--critical">
                            <span className="huai-kpi__value">{stats.criticalAlerts}</span>
                            <span className="huai-kpi__label">critical alerts</span>
                        </div>
                        <div className="huai-kpi huai-kpi--warning">
                            <span className="huai-kpi__value">{stats.warningAlerts}</span>
                            <span className="huai-kpi__label">warnings</span>
                        </div>
                        <div className="huai-kpi huai-kpi--overdue">
                            <span className="huai-kpi__value">{stats.overdueInspections}</span>
                            <span className="huai-kpi__label">overdue inspections</span>
                        </div>
                    </div>
                </div>

                {/* Lifespan Timeline */}
                <div className="huai-dashboard__section">
                    <h3 className="huai-section-title">🔋 System Lifespan Monitor</h3>
                    <div className="huai-timeline-list">
                        {timeline.slice(0, 8).map(item => {
                            const barColor = item.lifespanPct >= 90 ? '#ef4444'
                                : item.lifespanPct >= 70 ? '#f59e0b'
                                    : item.lifespanPct >= 50 ? '#3b82f6' : '#22c55e';
                            return (
                                <div key={item.systemId} className="huai-timeline-item">
                                    <div className="huai-timeline-item__header">
                                        <span className="huai-timeline-item__icon">
                                            {CATEGORY_ICONS[item.category] || '🔧'}
                                        </span>
                                        <span className="huai-timeline-item__name">{item.systemName}</span>
                                        <span className="huai-timeline-item__age" style={{ color: barColor }}>
                                            {item.lifespanPct >= 100 ? 'OVERDUE' : `${item.remainingYears}yr left`}
                                        </span>
                                    </div>
                                    <div className="huai-timeline-item__bar-bg">
                                        <div
                                            className="huai-timeline-item__bar-fill"
                                            style={{ width: `${Math.min(100, item.lifespanPct)}%`, backgroundColor: barColor }}
                                        />
                                    </div>
                                    <div className="huai-timeline-item__detail">
                                        <span>{item.ageYears}yr / {item.lifespanYears}yr</span>
                                        <span className="huai-timeline-item__replace">Replace by {item.replacementDate}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Category Breakdown */}
                <div className="huai-dashboard__section">
                    <h3 className="huai-section-title">📊 Systems by Category</h3>
                    <div className="huai-category-grid">
                        {Object.entries(stats.categoryCounts).map(([cat, count]) => (
                            <div key={cat} className="huai-category-card">
                                <span className="huai-category-card__icon">{CATEGORY_ICONS[cat] || '🔧'}</span>
                                <span className="huai-category-card__count">{count}</span>
                                <span className="huai-category-card__label">{cat}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    // ──── TAB: ALERTS ────
    const renderAlerts = () => {
        if (alerts.length === 0) {
            return (
                <div className="huai-empty">
                    <span className="huai-empty__icon">✅</span>
                    <p>No active alerts — all systems healthy!</p>
                </div>
            );
        }

        return (
            <div className="huai-alerts">
                <div className="huai-alerts__summary">
                    <span className="huai-alerts__count">{alerts.length} active alerts</span>
                </div>
                <div className="huai-alerts__list">
                    {alerts.map(alert => {
                        const sev = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
                        return (
                            <div key={alert.id} className="huai-alert-card" style={{ borderLeftColor: sev.color, backgroundColor: sev.bg }}>
                                <div className="huai-alert-card__header">
                                    <span className="huai-alert-card__icon">{sev.icon}</span>
                                    <div className="huai-alert-card__info">
                                        <h4 className="huai-alert-card__title">{alert.title}</h4>
                                        <span className="huai-alert-card__category">
                                            {CATEGORY_ICONS[alert.category] || '🔧'} {alert.category} · {alert.propertyName}
                                        </span>
                                    </div>
                                    <span className="huai-alert-card__severity" style={{ color: sev.color }}>
                                        {alert.severity.toUpperCase()}
                                    </span>
                                </div>
                                <p className="huai-alert-card__message">{alert.message}</p>
                                {alert.dueDate && (
                                    <span className="huai-alert-card__due">📅 Due: {alert.dueDate}</span>
                                )}
                                <div className="huai-alert-card__actions">
                                    <button className="huai-btn huai-btn--sm huai-btn--resolve" onClick={() => handleAlertAction(alert.id, 'resolved')}>✅ Resolve</button>
                                    <button className="huai-btn huai-btn--sm huai-btn--snooze" onClick={() => handleAlertAction(alert.id, 'snoozed')}>💤 Snooze</button>
                                    <button className="huai-btn huai-btn--sm huai-btn--dismiss" onClick={() => handleAlertAction(alert.id, 'dismissed')}>✕ Dismiss</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // ──── TAB: SYSTEMS ────
    const renderSystems = () => {
        const grouped = systems.reduce<Record<string, BuildingSystem[]>>((acc, s) => {
            (acc[s.category] = acc[s.category] || []).push(s);
            return acc;
        }, {});

        return (
            <div className="huai-systems">
                <div className="huai-systems__toolbar">
                    <span className="huai-systems__count">{systems.length} systems tracked</span>
                    <button className="huai-btn huai-btn--primary" onClick={() => setShowAddModal(true)}>
                        ＋ Add System
                    </button>
                </div>

                {Object.entries(grouped).map(([category, items]) => (
                    <div key={category} className="huai-system-group">
                        <h4 className="huai-system-group__title">
                            {CATEGORY_ICONS[category] || '🔧'} {category}
                            <span className="huai-system-group__count">{items.length}</span>
                        </h4>
                        <div className="huai-system-group__list">
                            {items.map(sys => {
                                const tl = timeline.find(t => t.systemId === sys.id);
                                const cond = CONDITION_CONFIG[sys.condition] || CONDITION_CONFIG.good;
                                const barColor = (tl?.lifespanPct || 0) >= 90 ? '#ef4444'
                                    : (tl?.lifespanPct || 0) >= 70 ? '#f59e0b' : '#22c55e';
                                return (
                                    <div key={sys.id} className="huai-system-card">
                                        <div className="huai-system-card__header">
                                            <span className="huai-system-card__name">{sys.name}</span>
                                            <span className="huai-system-card__condition" style={{ color: cond.color, backgroundColor: cond.bg }}>
                                                {cond.label}
                                            </span>
                                        </div>
                                        {sys.manufacturer && (
                                            <span className="huai-system-card__meta">{sys.manufacturer} {sys.model || ''}</span>
                                        )}
                                        <div className="huai-system-card__bar-row">
                                            <div className="huai-system-card__bar-bg">
                                                <div className="huai-system-card__bar-fill" style={{ width: `${Math.min(100, tl?.lifespanPct || 0)}%`, backgroundColor: barColor }} />
                                            </div>
                                            <span className="huai-system-card__pct" style={{ color: barColor }}>{tl?.lifespanPct || 0}%</span>
                                        </div>
                                        <div className="huai-system-card__detail">
                                            <span>Installed: {sys.installedDate}</span>
                                            <span>Lifespan: {sys.expectedLifespanYears}yr</span>
                                            {sys.lastInspected && <span>Last inspected: {sys.lastInspected}</span>}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    // ──── TAB: INSPECT ────
    const renderInspect = () => (
        <div className="huai-inspect">
            <div className="huai-inspect__form">
                <h3 className="huai-section-title">📸 Log Inspection</h3>

                <label className="huai-label">System</label>
                <select className="huai-select" value={inspectSystem} onChange={e => setInspectSystem(e.target.value)}>
                    <option value="">— Select system —</option>
                    {systems.map(s => (
                        <option key={s.id} value={s.id}>
                            {CATEGORY_ICONS[s.category]} {s.name}
                        </option>
                    ))}
                </select>

                <label className="huai-label">Condition</label>
                <div className="huai-condition-selector">
                    {(['excellent', 'good', 'fair', 'poor', 'critical'] as const).map(c => {
                        const cfg = CONDITION_CONFIG[c];
                        return (
                            <button
                                key={c}
                                className={`huai-condition-btn ${inspectCondition === c ? 'huai-condition-btn--active' : ''}`}
                                style={{ borderColor: inspectCondition === c ? cfg.color : 'transparent', color: cfg.color }}
                                onClick={() => setInspectCondition(c)}
                            >
                                {cfg.label}
                            </button>
                        );
                    })}
                </div>

                <label className="huai-label">Notes</label>
                <textarea
                    className="huai-textarea"
                    rows={3}
                    value={inspectNotes}
                    onChange={e => setInspectNotes(e.target.value)}
                    placeholder="Describe what you observed…"
                />

                <label className="huai-label">📷 Upload Photo (optional)</label>
                <input type="file" accept="image/*" className="huai-file-input" onChange={handlePhotoUpload} />

                {inspectPhoto && (
                    <div className="huai-inspect__photo-actions">
                        <button className="huai-btn huai-btn--analyze" onClick={handleAnalyzePhoto} disabled={analyzing}>
                            {analyzing ? '🔍 Analyzing…' : '🤖 Analyze with AI'}
                        </button>
                    </div>
                )}

                {analysisResult && (
                    <div className="huai-inspect__analysis">
                        <h4>🤖 AI Analysis</h4>
                        <p>{analysisResult}</p>
                    </div>
                )}

                <button className="huai-btn huai-btn--primary huai-btn--lg" onClick={handleLogInspection} disabled={!inspectSystem || !inspectNotes}>
                    💾 Log Inspection
                </button>
            </div>

            {/* Recent Inspections */}
            <div className="huai-inspect__history">
                <h3 className="huai-section-title">📋 Recent Inspections</h3>
                {inspections.length === 0 ? (
                    <p className="huai-empty-text">No inspections logged yet.</p>
                ) : (
                    <div className="huai-inspect__list">
                        {inspections.slice(0, 10).map((insp: any) => {
                            const cond = CONDITION_CONFIG[insp.condition] || CONDITION_CONFIG.good;
                            const sys = systems.find(s => s.id === insp.systemId);
                            return (
                                <div key={insp.id} className="huai-inspection-card">
                                    <div className="huai-inspection-card__header">
                                        <span className="huai-inspection-card__system">{sys?.name || 'Unknown'}</span>
                                        <span className="huai-inspection-card__condition" style={{ color: cond.color }}>{cond.label}</span>
                                        <span className="huai-inspection-card__date">{insp.inspectionDate}</span>
                                    </div>
                                    <p className="huai-inspection-card__notes">{insp.notes}</p>
                                    {insp.analysisResult && (
                                        <div className="huai-inspection-card__ai">
                                            <span>🤖</span> {insp.analysisResult.substring(0, 120)}…
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );

    // ──── ADD SYSTEM MODAL ────
    const renderAddModal = () => {
        if (!showAddModal) return null;

        const categories = [...new Set(templates.map(t => t.category))];

        return (
            <div className="huai-modal-overlay" onClick={() => setShowAddModal(false)}>
                <div className="huai-modal" onClick={e => e.stopPropagation()}>
                    <div className="huai-modal__header">
                        <h3>＋ Add Building System</h3>
                        <button className="huai-modal__close" onClick={() => setShowAddModal(false)}>✕</button>
                    </div>

                    {/* Quick templates */}
                    <div className="huai-modal__templates">
                        <h4 className="huai-label">Quick Add from Template</h4>
                        <div className="huai-template-chips">
                            {categories.map(cat => (
                                <details key={cat} className="huai-template-group">
                                    <summary className="huai-template-group__title">
                                        {CATEGORY_ICONS[cat] || '🔧'} {cat}
                                    </summary>
                                    <div className="huai-template-group__items">
                                        {templates.filter(t => t.category === cat).map(t => (
                                            <button key={t.name} className="huai-template-chip" onClick={() => handleTemplateSelect(t)}>
                                                {t.name} <span className="huai-template-chip__years">{t.lifespanYears}yr</span>
                                            </button>
                                        ))}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </div>

                    <div className="huai-modal__form">
                        <div className="huai-form-row">
                            <div className="huai-form-group">
                                <label className="huai-label">Category</label>
                                <input className="huai-input" value={addForm.category} onChange={e => setAddForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. HVAC" />
                            </div>
                            <div className="huai-form-group">
                                <label className="huai-label">System Name</label>
                                <input className="huai-input" value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Central AC" />
                            </div>
                        </div>
                        <div className="huai-form-row">
                            <div className="huai-form-group">
                                <label className="huai-label">Installed Date</label>
                                <input type="date" className="huai-input" value={addForm.installedDate} onChange={e => setAddForm(p => ({ ...p, installedDate: e.target.value }))} />
                            </div>
                            <div className="huai-form-group">
                                <label className="huai-label">Expected Lifespan (years)</label>
                                <input type="number" className="huai-input" value={addForm.expectedLifespanYears} onChange={e => setAddForm(p => ({ ...p, expectedLifespanYears: parseInt(e.target.value) || 10 }))} />
                            </div>
                        </div>
                        <div className="huai-form-row">
                            <div className="huai-form-group">
                                <label className="huai-label">Manufacturer (optional)</label>
                                <input className="huai-input" value={addForm.manufacturer} onChange={e => setAddForm(p => ({ ...p, manufacturer: e.target.value }))} />
                            </div>
                            <div className="huai-form-group">
                                <label className="huai-label">Model (optional)</label>
                                <input className="huai-input" value={addForm.model} onChange={e => setAddForm(p => ({ ...p, model: e.target.value }))} />
                            </div>
                        </div>
                        <div className="huai-form-row">
                            <div className="huai-form-group huai-form-group--full">
                                <label className="huai-label">Property Name</label>
                                <input className="huai-input" value={addForm.propertyName} onChange={e => setAddForm(p => ({ ...p, propertyName: e.target.value }))} />
                            </div>
                        </div>

                        <label className="huai-label">Condition</label>
                        <div className="huai-condition-selector">
                            {(['excellent', 'good', 'fair', 'poor', 'critical'] as const).map(c => {
                                const cfg = CONDITION_CONFIG[c];
                                return (
                                    <button
                                        key={c}
                                        className={`huai-condition-btn ${addForm.condition === c ? 'huai-condition-btn--active' : ''}`}
                                        style={{ borderColor: addForm.condition === c ? cfg.color : 'transparent', color: cfg.color }}
                                        onClick={() => setAddForm(p => ({ ...p, condition: c }))}
                                    >
                                        {cfg.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="huai-modal__actions">
                            <button className="huai-btn huai-btn--ghost" onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button className="huai-btn huai-btn--primary" onClick={handleAddSystem} disabled={!addForm.category || !addForm.name || !addForm.installedDate}>
                                Add System
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ──── RENDER ────
    const tabs: { id: Tab; icon: string; label: string }[] = [
        { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
        { id: 'alerts', icon: '⚠️', label: `Alerts${alerts.length ? ` (${alerts.length})` : ''}` },
        { id: 'systems', icon: '📋', label: 'Systems' },
        { id: 'inspect', icon: '📸', label: 'Inspect' },
    ];

    return (
        <div className="huai">
            {/* Header */}
            <div className="huai-header">
                <div className="huai-header__brand">
                    <span className="huai-header__icon">🔧</span>
                    <div>
                        <h2 className="huai-header__title">Home Upkeep AI</h2>
                        <p className="huai-header__subtitle">Proactive Maintenance Intelligence</p>
                    </div>
                </div>
                <button className="huai-btn huai-btn--ghost huai-btn--refresh" onClick={fetchData} disabled={loading}>
                    ↻ Refresh
                </button>
            </div>

            {/* Tabs */}
            <div className="huai-tabs">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        className={`huai-tab ${activeTab === tab.id ? 'huai-tab--active' : ''}`}
                        onClick={() => setActiveTab(tab.id)}
                    >
                        <span className="huai-tab__icon">{tab.icon}</span>
                        <span className="huai-tab__label">{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="huai-content">
                {loading ? (
                    <div className="huai-loading">
                        <div className="huai-loading__spinner" />
                        <p>Loading maintenance data…</p>
                    </div>
                ) : (
                    <>
                        {activeTab === 'dashboard' && renderDashboard()}
                        {activeTab === 'alerts' && renderAlerts()}
                        {activeTab === 'systems' && renderSystems()}
                        {activeTab === 'inspect' && renderInspect()}
                    </>
                )}
            </div>

            {renderAddModal()}
        </div>
    );
}
