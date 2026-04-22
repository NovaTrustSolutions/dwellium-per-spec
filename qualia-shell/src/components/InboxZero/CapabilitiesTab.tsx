/**
 * CapabilitiesTab — Feature matrix / capability toggle view for InboxZero
 *
 * Shows all platform capabilities grouped by category with live/beta/planned status,
 * progress bars, and toggle controls. Self-contained with own state management.
 * Extracted from InboxZero.tsx monolith (Phase 2.1).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { CAPABILITIES_DATA, CAPABILITIES_STORAGE_KEY } from './InboxZeroTypes';

export default function CapabilitiesTab() {
    const [expandedCaps, setExpandedCaps] = useState<Set<string>>(new Set());
    const [capabilityToggles, setCapabilityToggles] = useState<Record<string, boolean>>(() => {
        try {
            const saved = localStorage.getItem(CAPABILITIES_STORAGE_KEY);
            if (saved) return JSON.parse(saved);
        } catch { /* ignore */ }
        const defaults: Record<string, boolean> = {};
        CAPABILITIES_DATA.forEach(cat => { defaults[cat.id] = true; });
        return defaults;
    });

    useEffect(() => {
        localStorage.setItem(CAPABILITIES_STORAGE_KEY, JSON.stringify(capabilityToggles));
    }, [capabilityToggles]);

    const toggleCapExpand = (id: string) => {
        setExpandedCaps(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const totalFeatures = useMemo(() => CAPABILITIES_DATA.reduce((sum, cat) => sum + cat.features.length, 0), []);
    const enabledCategories = useMemo(() => CAPABILITIES_DATA.filter(cat => capabilityToggles[cat.id] !== false).length, [capabilityToggles]);

    return (
        <div className="iz-cap">
            {/* Summary banner */}
            <div className="iz-cap__banner">
                <div className="iz-cap__banner-stats">
                    <div className="iz-cap__stat">
                        <span className="iz-cap__stat-value">{enabledCategories}/{CAPABILITIES_DATA.length}</span>
                        <span className="iz-cap__stat-label">Categories Active</span>
                    </div>
                    <div className="iz-cap__stat">
                        <span className="iz-cap__stat-value">{totalFeatures}</span>
                        <span className="iz-cap__stat-label">Total Features</span>
                    </div>
                </div>
            </div>

            {/* Category cards */}
            <div className="iz-cap__list">
                {CAPABILITIES_DATA.map(cat => {
                    const isExpanded = expandedCaps.has(cat.id);
                    const isEnabled = capabilityToggles[cat.id] !== false;
                    const liveCount = cat.features.filter(f => f.status === 'live').length;
                    const betaCount = cat.features.filter(f => f.status === 'beta').length;
                    const readyPct = Math.round(((liveCount + betaCount) / cat.features.length) * 100);

                    return (
                        <div
                            key={cat.id}
                            className={`iz-cap__card ${isExpanded ? 'iz-cap__card--expanded' : ''} ${!isEnabled ? 'iz-cap__card--disabled' : ''}`}
                            style={{ '--cap-color': cat.color } as React.CSSProperties}
                        >
                            <div className="iz-cap__header" onClick={() => toggleCapExpand(cat.id)}>
                                <span className="iz-cap__icon">{cat.icon}</span>
                                <div className="iz-cap__title-area">
                                    <span className="iz-cap__title">{cat.title}</span>
                                    <span className="iz-cap__desc">{cat.description}</span>
                                    {/* Progress bar */}
                                    <div className="iz-cap__progress" style={{ marginTop: '6px' }}>
                                        <div className="iz-cap__progress-bar" style={{ width: '100%', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.08)' }}>
                                            <div style={{ width: `${readyPct}%`, height: '100%', borderRadius: '2px', background: `linear-gradient(90deg, ${cat.color}, ${cat.color}99)`, transition: 'width 0.4s ease' }} />
                                        </div>
                                        <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: '6px' }}>{readyPct}%</span>
                                    </div>
                                </div>
                                <div className="iz-cap__meta">
                                    <span className="iz-cap__count" style={{ color: cat.color, background: cat.color + '18' }}>
                                        {liveCount}/{cat.features.length}
                                    </span>
                                    {!isEnabled && <span className="iz-cap__disabled-badge">OFF</span>}
                                    <span className="iz-cap__chevron">{isExpanded ? '▾' : '▸'}</span>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="iz-cap__features">
                                    {cat.features.map((feat, idx) => {
                                        const statusColor = feat.status === 'live' ? '#22c55e' : feat.status === 'beta' ? '#f59e0b' : '#6b7280';
                                        const statusLabel = feat.status.toUpperCase();
                                        return (
                                            <div key={idx} className="iz-cap__feature">
                                                <span className="iz-cap__feature-dot" style={{ background: isEnabled ? statusColor : '#374151' }} />
                                                <div className="iz-cap__feature-info">
                                                    <span className="iz-cap__feature-name">
                                                        {feat.name}
                                                        <span style={{
                                                            marginLeft: '8px',
                                                            fontSize: '9px',
                                                            fontWeight: 700,
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            background: statusColor + '22',
                                                            color: statusColor,
                                                            letterSpacing: '0.5px',
                                                            verticalAlign: 'middle',
                                                        }}>{statusLabel}</span>
                                                    </span>
                                                    <span className="iz-cap__feature-desc">{feat.description}</span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
