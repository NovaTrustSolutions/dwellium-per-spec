import { useState, useEffect } from 'react';
import { Building2, DollarSign, Wrench, AlertTriangle, Users, Shield, FileText, Scale, Hash, Calendar, Briefcase } from 'lucide-react';
import { strataGet } from '../strataApi';
import type { Property, Unit, Workitem, PropertyReportCards } from '../strataTypes';
import PropertyTimeline from './PropertyTimeline';

interface LinkedData {
    workitems: Workitem[];
    legal: Workitem[];
    compliance: Workitem[];
    incidents: any[];
    entityLinks: any[];
    summary: { workitems: number; legal: number; compliance: number; incidents: number; entityLinks: number; total: number };
}

interface PropertyOverviewProps {
    property: Property;
    units: Unit[];
    linkedData: LinkedData | null;
}

function KPIStat({ icon, label, value, color, bg, sub }: {
    icon: React.ReactNode; label: string; value: string; color: string; bg: string; sub?: string;
}) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: '16px 20px', flex: 1, minWidth: 140,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <div style={{
                    width: 32, height: 32, borderRadius: 8, display: 'flex',
                    alignItems: 'center', justifyContent: 'center', background: bg, color,
                }}>{icon}</div>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: '#e2e8f0', lineHeight: 1 }}>{value}</div>
            {sub && <div style={{ fontSize: 10, color: '#64748b', marginTop: 4 }}>{sub}</div>}
        </div>
    );
}

function ReportCard({ icon, label, items, color }: {
    icon: React.ReactNode; label: string; items: { text: string; value: string | number; warn?: boolean }[]; color: string;
}) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 200,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ color }}>{icon}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {items.map(item => (
                    <div key={item.text} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 12, color: '#94a3b8' }}>{item.text}</span>
                        <span style={{
                            fontSize: 13, fontWeight: 700,
                            color: item.warn ? '#ef4444' : '#e2e8f0',
                        }}>{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function PropertyOverview({ property, units, linkedData }: PropertyOverviewProps) {
    const [reportCards, setReportCards] = useState<PropertyReportCards | null>(null);

    useEffect(() => {
        strataGet<PropertyReportCards>(`/property-report-cards/${property.id}`)
            .then(setReportCards)
            .catch(() => {});
    }, [property.id]);

    // ── KPI calculations ──
    const totalUnits = units.length;
    const occupiedUnits = units.filter(u => u.status === 'occupied').length;
    const occupancyRate = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
    const totalRent = units.reduce((sum, u) => sum + (u.rentAmount ?? 0), 0);

    const openWorkOrders = reportCards?.workOrders?.totalOpen ?? linkedData?.workitems?.filter(w => w.status === 'open' || w.status === 'in_progress').length ?? 0;
    const highPriority = reportCards?.workOrders?.highPriority ?? linkedData?.workitems?.filter(w => w.priority === 'high' && w.status !== 'completed' && w.status !== 'cancelled').length ?? 0;

    // ── Unit status colors ──
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'occupied': return '#10b981';
            case 'vacant': return '#3b82f6';
            case 'turn': return '#f59e0b';
            case 'maintenance': return '#ef4444';
            default: return '#64748b';
        }
    };

    const rc = reportCards;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── KPI Row ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <KPIStat
                    icon={<Building2 size={16} />}
                    label="Occupancy"
                    value={`${occupancyRate}%`}
                    color="#6366f1"
                    bg="rgba(214,254,81,0.15)"
                    sub={`${occupiedUnits} of ${totalUnits} units`}
                />
                <KPIStat
                    icon={<DollarSign size={16} />}
                    label="Total Rent"
                    value={`$${totalRent.toLocaleString()}`}
                    color="#10b981"
                    bg="rgba(16,185,129,0.15)"
                    sub="Monthly revenue"
                />
                <KPIStat
                    icon={<Wrench size={16} />}
                    label="Open Work Orders"
                    value={String(openWorkOrders)}
                    color="#f59e0b"
                    bg="rgba(245,158,11,0.15)"
                    sub={highPriority > 0 ? `${highPriority} high priority` : undefined}
                />
                <KPIStat
                    icon={<AlertTriangle size={16} />}
                    label="High Priority"
                    value={String(highPriority)}
                    color={highPriority > 0 ? '#ef4444' : '#64748b'}
                    bg={highPriority > 0 ? 'rgba(239,68,68,0.15)' : 'rgba(100,116,139,0.15)'}
                />
            </div>

            {/* ── Unit Snapshot ── */}
            {totalUnits > 0 && (
                <div className="s-glass-card" style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Users size={16} color="#6366f1" />
                            Unit Snapshot
                        </h3>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                            <span style={{ color: '#10b981', fontWeight: 600 }}>● {occupiedUnits} Occupied</span>
                            <span style={{ color: '#3b82f6', fontWeight: 600 }}>● {units.length - occupiedUnits} Vacant</span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {[...units].sort((a, b) => {
                            const numA = parseInt(String(a.unitNumber).replace(/\D/g, '')) || 0;
                            const numB = parseInt(String(b.unitNumber).replace(/\D/g, '')) || 0;
                            return numA - numB || String(a.unitNumber).localeCompare(String(b.unitNumber));
                        }).map(u => (
                            <div key={u.id} style={{
                                width: 48, height: 48, borderRadius: 8,
                                background: 'rgba(255,255,255,0.03)',
                                border: `2px solid ${getStatusColor(u.status)}`,
                                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                fontSize: 10, fontWeight: 600, color: '#cbd5e1', gap: 1,
                            }}>
                                <span>{u.unitNumber}</span>
                                <span style={{ fontSize: 7, color: getStatusColor(u.status), textTransform: 'uppercase' }}>{u.status}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Operational Report Cards (real DB data) ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <ReportCard
                    icon={<Shield size={14} />}
                    label="Insurance"
                    color="#06b6d4"
                    items={rc ? [
                        { text: 'Active Policies', value: rc.insurance.activePolicies },
                        { text: 'Expiring Soon', value: rc.insurance.expiringSoon, warn: rc.insurance.expiringSoon > 0 },
                        { text: 'Next Expiry', value: rc.insurance.nearestExpiry ? new Date(rc.insurance.nearestExpiry).toLocaleDateString() : '—' },
                    ] : [
                        { text: 'Loading…', value: '—' },
                    ]}
                />
                <ReportCard
                    icon={<FileText size={14} />}
                    label="Compliance"
                    color="#a78bfa"
                    items={rc ? [
                        { text: 'Compliant', value: rc.compliance.compliant },
                        { text: 'Missing', value: rc.compliance.missing, warn: rc.compliance.missing > 0 },
                        { text: 'Expiring', value: rc.compliance.expiring, warn: rc.compliance.expiring > 0 },
                    ] : [
                        { text: 'Loading…', value: '—' },
                    ]}
                />
                <ReportCard
                    icon={<Briefcase size={14} />}
                    label="Vendors"
                    color="#f59e0b"
                    items={rc ? [
                        { text: 'Active Vendors', value: rc.vendors.activeCount },
                        { text: 'Open Incidents', value: rc.openIncidents, warn: rc.openIncidents > 0 },
                    ] : [
                        { text: 'Loading…', value: '—' },
                    ]}
                />
                <ReportCard
                    icon={<Calendar size={14} />}
                    label="Lease Health"
                    color="#10b981"
                    items={rc ? [
                        { text: 'Expiring ≤ 30d', value: rc.leaseHealth.expiringIn30, warn: rc.leaseHealth.expiringIn30 > 0 },
                        { text: 'Expiring ≤ 60d', value: rc.leaseHealth.expiringIn60 },
                        { text: 'Expired (occupied)', value: rc.leaseHealth.expired, warn: rc.leaseHealth.expired > 0 },
                    ] : [
                        { text: 'Loading…', value: '—' },
                    ]}
                />
            </div>

            {/* ── Property Info Summary ── */}
            <div className="s-glass-card" style={{ padding: '16px 20px' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={16} color="#818cf8" />
                    Property Details
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px 16px', fontSize: 12 }}>
                    {[
                        { label: 'Type', value: property.metadata?.propertyType || property.type },
                        { label: 'Status', value: property.status },
                        { label: 'Units', value: String(totalUnits) },
                        { label: 'Owner', value: property.metadata?.owner },
                        { label: 'City', value: property.city || property.metadata?.city },
                        { label: 'State', value: property.state || property.metadata?.state },
                        { label: 'Year Built', value: property.yearBuilt ? String(property.yearBuilt) : property.metadata?.yearBuilt },
                        { label: 'Manager', value: property.propertyManager || property.metadata?.siteManager },
                        { label: 'County', value: property.metadata?.county },
                    ].filter(f => f.value).map(f => (
                        <div key={f.label}>
                            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{f.label}</div>
                            <div style={{ color: '#cbd5e1', marginTop: 1 }}>{f.value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Activity Timeline (replaces old "Recent Activity") ── */}
            <PropertyTimeline propertyId={property.id} />
        </div>
    );
}
