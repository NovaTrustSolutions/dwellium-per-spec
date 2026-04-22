/**
 * SecurityPortal — Standalone simplified incident-filing form for security teams.
 *
 * Accessible via /security path. No sidebar, no shell chrome.
 * Uses a configurable security access token for authentication.
 * Posts incidents to the existing /api/dwellium/incidents endpoint.
 */

import { useState, useEffect } from 'react';
import { API_BASE } from '../../config';
import './SecurityPortal.css';

const CATEGORIES = [
    { id: 'vehicle', label: 'Vehicle Incident', emoji: '🚗' },
    { id: 'fire', label: 'Fire', emoji: '🔥' },
    { id: 'flood', label: 'Flood / Water Damage', emoji: '💧' },
    { id: 'security', label: 'Security Breach', emoji: '🔒' },
    { id: 'trespass', label: 'Trespassing', emoji: '🚷' },
    { id: 'vandalism', label: 'Vandalism', emoji: '🎨' },
    { id: 'injury', label: 'Personal Injury', emoji: '🏥' },
    { id: 'noise', label: 'Noise Complaint', emoji: '🔊' },
    { id: 'theft', label: 'Theft', emoji: '🕵️' },
    { id: 'other', label: 'Other', emoji: '📋' },
];

interface PropertyOption {
    id: string;
    name: string;
}

export default function SecurityPortal() {
    const [authenticated, setAuthenticated] = useState(false);
    const [accessCode, setAccessCode] = useState('');
    const [authError, setAuthError] = useState('');
    const [properties, setProperties] = useState<PropertyOption[]>([]);
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState('');

    // Form state
    const [propertyId, setPropertyId] = useState('');
    const [category, setCategory] = useState('security');
    const [severity, setSeverity] = useState('medium');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [reportedBy, setReportedBy] = useState('');
    const [witnesses, setWitnesses] = useState('');
    const [policeReport, setPoliceReport] = useState('');

    // Auth
    const handleAuth = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/security-access`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: accessCode }),
            });
            const data = await res.json();
            if (data.success) {
                setAuthenticated(true);
                setAuthError('');
                // Store token for subsequent requests
                sessionStorage.setItem('security_token', data.token || accessCode);
                // Load properties
                fetchProperties(data.token || accessCode);
            } else {
                setAuthError('Invalid access code');
            }
        } catch {
            setAuthError('Connection error');
        }
    };

    const fetchProperties = async (token: string) => {
        try {
            const res = await fetch(`${API_BASE}/api/dwellium/properties`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await res.json();
            if (Array.isArray(data)) setProperties(data.map((p: any) => ({ id: p.id, name: p.name })));
        } catch { /* fallback — empty list */ }
    };

    // Submit incident
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!propertyId || !title.trim()) return;
        setSubmitting(true);
        setSubmitError('');

        try {
            const token = sessionStorage.getItem('security_token') || '';
            await fetch(`${API_BASE}/api/dwellium/incidents`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    propertyId,
                    category,
                    severity,
                    title: title.trim(),
                    description: description.trim(),
                    reportedBy: reportedBy.trim() || 'Security Team',
                    witnesses: witnesses.split(',').map(w => w.trim()).filter(Boolean),
                    policeReportNumber: policeReport.trim() || null,
                }),
            });
            setSubmitted(true);
        } catch {
            setSubmitError('Failed to submit. Please try again.');
        }
        setSubmitting(false);
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setWitnesses('');
        setPoliceReport('');
        setSubmitted(false);
    };

    // ── Auth screen ──
    if (!authenticated) {
        return (
            <div className="sp-container">
                <div className="sp-auth-card">
                    <div className="sp-logo">🛡️</div>
                    <h1 className="sp-title">Security Portal</h1>
                    <p className="sp-subtitle">Dwellium Incident Reporting</p>
                    <div className="sp-auth-form">
                        <input
                            type="password"
                            value={accessCode}
                            onChange={e => setAccessCode(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAuth()}
                            placeholder="Enter security access code"
                            className="sp-input sp-input-lg"
                            autoFocus
                        />
                        {authError && <p className="sp-error">{authError}</p>}
                        <button onClick={handleAuth} className="sp-btn sp-btn-primary" disabled={!accessCode.trim()}>
                            Access Portal
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Submitted confirmation ──
    if (submitted) {
        return (
            <div className="sp-container">
                <div className="sp-auth-card">
                    <div className="sp-logo sp-logo-success">✅</div>
                    <h1 className="sp-title">Incident Reported</h1>
                    <p className="sp-subtitle">Your report has been submitted and management has been notified.</p>
                    <button onClick={resetForm} className="sp-btn sp-btn-primary" style={{ marginTop: 20 }}>
                        File Another Report
                    </button>
                </div>
            </div>
        );
    }

    // ── Main form ──
    return (
        <div className="sp-container">
            <div className="sp-form-card">
                <div className="sp-form-header">
                    <span className="sp-logo-sm">🛡️</span>
                    <div>
                        <h1 className="sp-form-title">File Incident Report</h1>
                        <p className="sp-form-subtitle">All fields marked * are required</p>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="sp-form">
                    {/* Property */}
                    <div className="sp-field">
                        <label className="sp-label">Property *</label>
                        <select value={propertyId} onChange={e => setPropertyId(e.target.value)} className="sp-select" required>
                            <option value="">— Select Property —</option>
                            {properties.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Category grid */}
                    <div className="sp-field">
                        <label className="sp-label">Category *</label>
                        <div className="sp-category-grid">
                            {CATEGORIES.map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    className={`sp-category-btn ${category === cat.id ? 'sp-category-btn--active' : ''}`}
                                    onClick={() => setCategory(cat.id)}
                                >
                                    <span className="sp-category-emoji">{cat.emoji}</span>
                                    <span className="sp-category-label">{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Severity */}
                    <div className="sp-field">
                        <label className="sp-label">Severity *</label>
                        <div className="sp-severity-row">
                            {(['low', 'medium', 'high'] as const).map(s => (
                                <button
                                    key={s}
                                    type="button"
                                    className={`sp-severity-btn sp-severity-${s} ${severity === s ? 'sp-severity--active' : ''}`}
                                    onClick={() => setSeverity(s)}
                                >
                                    {s.charAt(0).toUpperCase() + s.slice(1)}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Title */}
                    <div className="sp-field">
                        <label className="sp-label">Incident Title *</label>
                        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description"
                            className="sp-input" required />
                    </div>

                    {/* Description */}
                    <div className="sp-field">
                        <label className="sp-label">Details</label>
                        <textarea value={description} onChange={e => setDescription(e.target.value)}
                            placeholder="Detailed description of the incident…" className="sp-textarea" rows={4} />
                    </div>

                    {/* Reporter + Witnesses */}
                    <div className="sp-field-row">
                        <div className="sp-field">
                            <label className="sp-label">Reported By</label>
                            <input value={reportedBy} onChange={e => setReportedBy(e.target.value)}
                                placeholder="Your name" className="sp-input" />
                        </div>
                        <div className="sp-field">
                            <label className="sp-label">Witnesses (comma-separated)</label>
                            <input value={witnesses} onChange={e => setWitnesses(e.target.value)}
                                placeholder="John Doe, Jane Smith" className="sp-input" />
                        </div>
                    </div>

                    {/* Police report */}
                    <div className="sp-field">
                        <label className="sp-label">Police Report # (if applicable)</label>
                        <input value={policeReport} onChange={e => setPoliceReport(e.target.value)}
                            placeholder="e.g., 2026-03-001" className="sp-input" />
                    </div>

                    {submitError && (
                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                            ✗ {submitError}
                        </div>
                    )}

                    {/* Submit */}
                    <button type="submit" className="sp-btn sp-btn-primary sp-btn-submit" disabled={submitting || !propertyId || !title.trim()}>
                        {submitting ? 'Submitting…' : '🛡️ Submit Incident Report'}
                    </button>
                </form>
            </div>
        </div>
    );
}
