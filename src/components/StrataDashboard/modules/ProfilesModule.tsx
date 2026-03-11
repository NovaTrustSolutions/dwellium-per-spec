/**
 * ProfilesModule — Unified Entity Browser for Strata
 *
 * Sub-tabs: Properties, Units, Tenants, Contractors, Employees, Owners, Corporate
 * Each tab shows a searchable table from the entity_profiles + properties/units backend.
 */

import { useState, useEffect, useCallback } from 'react';
import {
    Building2, Home, UserCircle, HardHat, Briefcase, Landmark, Globe,
    RefreshCw, Search, ChevronRight, MapPin, Phone, Mail,
} from 'lucide-react';
import { useUser } from '../../../context/UserContext';
import { API_BASE } from '../../../config';

const API = API_BASE;

interface Entity {
    id: string;
    entityType: string;
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    metadata: Record<string, any>;
    propertyIds: string[];
    status: string;
    createdAt: string;
}

interface Property {
    id: string;
    name: string;
    address: string | null;
    type: string;
    unitCount: number;
    status: string;
}

interface Unit {
    id: string;
    propertyId: string;
    unitNumber: string;
    bedrooms: number;
    bathrooms: number;
    sqFt: number;
    rentAmount: number;
    status: string;
}

type ProfileTab = 'properties' | 'units' | 'tenants' | 'contractors' | 'employees' | 'owners' | 'corporate';

const TABS: { id: ProfileTab; label: string; icon: React.ReactNode; entityType?: string }[] = [
    { id: 'properties', label: 'Properties', icon: <Building2 size={14} /> },
    { id: 'units', label: 'Units', icon: <Home size={14} /> },
    { id: 'tenants', label: 'Tenants', icon: <UserCircle size={14} />, entityType: 'tenant' },
    { id: 'contractors', label: 'Contractors', icon: <HardHat size={14} />, entityType: 'contractor' },
    { id: 'employees', label: 'Employees', icon: <Briefcase size={14} />, entityType: 'employee' },
    { id: 'owners', label: 'Owners', icon: <Landmark size={14} />, entityType: 'owner' },
    { id: 'corporate', label: 'Corporate', icon: <Globe size={14} />, entityType: 'corporate' },
];

const card: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 20,
    flex: 1,
};

const thStyle: React.CSSProperties = {
    textAlign: 'left', padding: '10px 14px', fontSize: 10,
    fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase',
    color: '#64748b', borderBottom: '1px solid rgba(255,255,255,0.06)',
};

const tdStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 13, color: '#cbd5e1',
    borderBottom: '1px solid rgba(255,255,255,0.04)',
};

export default function ProfilesModule() {
    const { hasPermission, authFetch } = useUser();
    const [tab, setTab] = useState<ProfileTab>('properties');
    const [search, setSearch] = useState('');
    const [entities, setEntities] = useState<Entity[]>([]);
    const [properties, setProperties] = useState<Property[]>([]);
    const [units, setUnits] = useState<Unit[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

    const TAB_PERMS: Record<ProfileTab, string> = {
        properties: 'strata:profiles:properties',
        units: 'strata:profiles:units',
        tenants: 'strata:profiles:tenants',
        contractors: 'strata:profiles:contractors',
        employees: 'strata:profiles:employees',
        owners: 'strata:profiles:owners',
        corporate: 'strata:profiles:corporate',
    };
    const visibleTabs = TABS.filter(t => hasPermission(TAB_PERMS[t.id]));

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === 'properties') {
                const res = await authFetch(`${API}/api/dwellium/properties`);
                if (res.ok) setProperties(await res.json());
            } else if (tab === 'units') {
                const res = await authFetch(`${API}/api/dwellium/units`);
                if (res.ok) setUnits(await res.json());
            } else {
                const tabDef = TABS.find(t => t.id === tab);
                const res = await authFetch(`${API}/api/dwellium/entities?type=${tabDef?.entityType || tab}`);
                if (res.ok) setEntities(await res.json());
            }
        } catch { /* silent */ }
        setLoading(false);
    }, [tab]);

    useEffect(() => {
        fetchData();
        setSelectedEntity(null);
        setSearch('');
    }, [tab, fetchData]);

    /* ── Filtered data ── */
    const q = search.toLowerCase();
    const filteredEntities = entities.filter(e =>
        e.name.toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q)
    );
    const filteredProperties = properties.filter(p =>
        p.name.toLowerCase().includes(q) || (p.address || '').toLowerCase().includes(q)
    );
    const filteredUnits = units.filter(u =>
        u.unitNumber.toLowerCase().includes(q) || u.propertyId.toLowerCase().includes(q)
    );

    /* ── Status badge ── */
    const statusBadge = (s: string) => {
        const colors: Record<string, string> = {
            active: '#10b981', occupied: '#3b82f6', vacant: '#f59e0b',
            inactive: '#64748b', maintenance: '#ef4444',
        };
        return (
            <span style={{
                padding: '2px 8px', borderRadius: 6, fontSize: 10, fontWeight: 600,
                background: `${colors[s] || '#64748b'}20`, color: colors[s] || '#64748b',
                textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
                {s}
            </span>
        );
    };

    return (
        <div className="strata-module" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* ── Sub-tabs ── */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {visibleTabs.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setTab(t.id)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '7px 14px', border: 'none', borderRadius: 8,
                            background: tab === t.id ? 'rgba(99,102,241,0.15)' : 'transparent',
                            color: tab === t.id ? '#818cf8' : '#94a3b8',
                            fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            fontFamily: 'inherit', transition: 'all 0.15s',
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}

                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                        <input
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{
                                padding: '6px 12px 6px 30px', border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                                color: '#e2e8f0', fontSize: 12, fontFamily: 'inherit',
                                outline: 'none', width: 180,
                            }}
                        />
                    </div>
                    <button
                        onClick={fetchData}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            padding: '6px 10px', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 8, background: 'rgba(255,255,255,0.04)',
                            color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                        }}
                    >
                        <RefreshCw size={12} className={loading ? 'spin' : ''} /> Refresh
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
                {/* ── Main table ── */}
                <div style={{ ...card, minWidth: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        {tab === 'properties' ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Name</th>
                                        <th style={thStyle}>Address</th>
                                        <th style={thStyle}>Type</th>
                                        <th style={thStyle}>Units</th>
                                        <th style={thStyle}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredProperties.length === 0 ? (
                                        <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>
                                            {loading ? 'Loading…' : 'No properties found'}
                                        </td></tr>
                                    ) : filteredProperties.map(p => (
                                        <tr key={p.id} style={{ cursor: 'pointer' }}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{p.name}</td>
                                            <td style={tdStyle}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <MapPin size={12} color="#64748b" /> {p.address || '—'}
                                                </span>
                                            </td>
                                            <td style={tdStyle}>{p.type}</td>
                                            <td style={tdStyle}>{p.unitCount}</td>
                                            <td style={tdStyle}>{statusBadge(p.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : tab === 'units' ? (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Unit #</th>
                                        <th style={thStyle}>Bed / Bath</th>
                                        <th style={thStyle}>Sq Ft</th>
                                        <th style={thStyle}>Rent</th>
                                        <th style={thStyle}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUnits.length === 0 ? (
                                        <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>
                                            {loading ? 'Loading…' : 'No units found'}
                                        </td></tr>
                                    ) : filteredUnits.map(u => (
                                        <tr key={u.id}
                                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                            onMouseLeave={e => (e.currentTarget.style.background = '')}
                                        >
                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{u.unitNumber}</td>
                                            <td style={tdStyle}>{u.bedrooms}bd / {u.bathrooms}ba</td>
                                            <td style={tdStyle}>{u.sqFt.toLocaleString()}</td>
                                            <td style={tdStyle}>${u.rentAmount.toLocaleString()}</td>
                                            <td style={tdStyle}>{statusBadge(u.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Name</th>
                                        <th style={thStyle}>Email</th>
                                        <th style={thStyle}>Phone</th>
                                        <th style={thStyle}>Status</th>
                                        <th style={thStyle}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEntities.length === 0 ? (
                                        <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#64748b' }}>
                                            {loading ? 'Loading…' : `No ${tab} found`}
                                        </td></tr>
                                    ) : filteredEntities.map(e => (
                                        <tr key={e.id} style={{ cursor: 'pointer' }}
                                            onClick={() => setSelectedEntity(e)}
                                            onMouseEnter={ev => (ev.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                            onMouseLeave={ev => (ev.currentTarget.style.background = '')}
                                        >
                                            <td style={{ ...tdStyle, fontWeight: 600 }}>{e.name}</td>
                                            <td style={tdStyle}>
                                                {e.email ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Mail size={12} color="#64748b" /> {e.email}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={tdStyle}>
                                                {e.phone ? (
                                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <Phone size={12} color="#64748b" /> {e.phone}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={tdStyle}>{statusBadge(e.status)}</td>
                                            <td style={tdStyle}>
                                                <ChevronRight size={14} color="#64748b" />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                {/* ── Detail drawer ── */}
                {selectedEntity && (
                    <div style={{
                        ...card, maxWidth: 320, minWidth: 280,
                        animation: 'slideIn 0.2s ease-out',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>
                                    {selectedEntity.name}
                                </h3>
                                <span style={{
                                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                                    letterSpacing: 1, color: '#818cf8',
                                }}>
                                    {selectedEntity.entityType}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedEntity(null)}
                                style={{
                                    background: 'none', border: 'none', color: '#64748b',
                                    cursor: 'pointer', fontSize: 18, lineHeight: 1,
                                }}
                            >×</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
                            {selectedEntity.email && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                                    <Mail size={14} color="#64748b" /> {selectedEntity.email}
                                </div>
                            )}
                            {selectedEntity.phone && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                                    <Phone size={14} color="#64748b" /> {selectedEntity.phone}
                                </div>
                            )}
                            {selectedEntity.address && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#94a3b8' }}>
                                    <MapPin size={14} color="#64748b" /> {selectedEntity.address}
                                </div>
                            )}

                            <div style={{
                                marginTop: 8, padding: '12px 14px',
                                background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                                    Properties
                                </div>
                                {selectedEntity.propertyIds.length > 0 ? (
                                    selectedEntity.propertyIds.map(pid => (
                                        <div key={pid} style={{ fontSize: 12, color: '#94a3b8', padding: '2px 0' }}>
                                            <Building2 size={11} style={{ marginRight: 6, verticalAlign: -1 }} />
                                            {pid}
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ fontSize: 12, color: '#475569' }}>No linked properties</div>
                                )}
                            </div>

                            <div style={{
                                padding: '12px 14px',
                                background: 'rgba(255,255,255,0.02)', borderRadius: 8,
                                border: '1px solid rgba(255,255,255,0.04)',
                            }}>
                                <div style={{ fontSize: 10, fontWeight: 600, color: '#64748b', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                                    Metadata
                                </div>
                                <pre style={{
                                    margin: 0, fontSize: 11, color: '#94a3b8',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                                }}>
                                    {JSON.stringify(selectedEntity.metadata, null, 2)}
                                </pre>
                            </div>

                            <div style={{ fontSize: 11, color: '#475569', marginTop: 4 }}>
                                Created {new Date(selectedEntity.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
