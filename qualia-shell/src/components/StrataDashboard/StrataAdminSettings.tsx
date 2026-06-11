import { useState, useEffect, useCallback, useMemo } from 'react';
import { useUser } from '../../context/UserContext';
import {
    Shield, Users as UsersIcon, Save, RefreshCw, Check, AlertCircle,
    ChevronDown, ChevronRight, Search, ToggleLeft, ToggleRight,
} from 'lucide-react';
import './StrataDashboard.css';

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
}

type PermissionsMap = Record<string, boolean>;

/* ── module grouping helpers ── */
interface PermGroup {
    label: string;
    keys: string[];
}

function groupByModule(keys: string[]): PermGroup[] {
    const moduleKeys = keys.filter(k => k.startsWith('strata:module:'));
    const widgetKeys = keys.filter(k => k.startsWith('widget:'));
    const sectionKeys = keys.filter(k => k.startsWith('section:'));

    // Group sub-permissions by their parent module
    const subMap = new Map<string, string[]>();
    for (const key of keys) {
        if (key.startsWith('strata:') && !key.startsWith('strata:module:')) {
            const parts = key.split(':');
            const mod = parts[1]; // e.g. 'properties', 'leasing'
            if (!subMap.has(mod)) subMap.set(mod, []);
            subMap.get(mod)!.push(key);
        }
    }

    const groups: PermGroup[] = [];

    // Top-level modules
    if (moduleKeys.length > 0) {
        groups.push({ label: '📋 Strata Modules (Top-Level Navigation)', keys: moduleKeys });
    }

    // Sub-permissions grouped by module
    const sortedModules = [...subMap.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [mod, modKeys] of sortedModules) {
        const label = mod.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        groups.push({ label: `🔹 ${label}`, keys: modKeys.sort() });
    }

    // Widgets
    if (widgetKeys.length > 0) {
        groups.push({ label: '🧩 Widgets & Apps', keys: widgetKeys });
    }

    // Sections
    if (sectionKeys.length > 0) {
        groups.push({ label: '⚙️ System Sections', keys: sectionKeys });
    }

    return groups;
}

function formatKeyName(key: string): string {
    const parts = key.split(':');
    return parts[parts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ── styles ── */
const accordionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '14px 16px',
    background: 'rgba(0,0,0,0.25)',
    borderRadius: '10px',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.06)',
    transition: 'all 0.2s ease',
    width: '100%',
    textAlign: 'left',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontWeight: 600,
};

const toggleStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    borderRadius: '6px',
    border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
    background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 600,
    transition: 'all 0.15s',
};

export default function StrataAdminSettings() {
    const { authFetch, user: currentUser } = useUser();
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [permissions, setPermissions] = useState<PermissionsMap>({});
    const [allKeys, setAllKeys] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

    // Fetch all users on mount
    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authFetch('/api/auth/users');
            if (!res.ok) throw new Error('Failed to fetch users');
            const data = await res.json();
            setUsers(data);
            if (data.length > 0) {
                const candidate = data.find((u: User) => u.id !== currentUser?.id) || data[0];
                setSelectedUserId(candidate.id);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [authFetch, currentUser]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    // Fetch permissions when selected user changes
    useEffect(() => {
        if (!selectedUserId) return;

        async function fetchPerms() {
            setLoading(true);
            setError(null);
            try {
                const res = await authFetch(`/api/auth/permissions/${selectedUserId}`);
                if (!res.ok) {
                    const errInfo = await res.json().catch(() => ({}));
                    throw new Error(errInfo.error || 'Failed to fetch permissions');
                }
                const data = await res.json();
                setPermissions(data.permissions);
                setAllKeys(data.keys);
            } catch (err: any) {
                setError(err.message);
                setPermissions({});
            } finally {
                setLoading(false);
            }
        }
        fetchPerms();
    }, [selectedUserId, authFetch]);

    const handleToggle = (key: string) => {
        setPermissions(prev => ({
            ...prev,
            [key]: !prev[key]
        }));
    };

    const handleBulkToggle = (keys: string[], value: boolean) => {
        setPermissions(prev => {
            const updated = { ...prev };
            for (const key of keys) updated[key] = value;
            return updated;
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setError(null);
        setSuccessMsg(null);
        try {
            const res = await authFetch(`/api/auth/permissions/${selectedUserId}`, {
                method: 'PUT',
                body: JSON.stringify({ permissions })
            });
            if (!res.ok) throw new Error('Failed to save permissions');
            setSuccessMsg('Permissions saved successfully');
            setTimeout(() => setSuccessMsg(null), 3000);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    const toggleGroupExpanded = (label: string) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(label)) next.delete(label);
            else next.add(label);
            return next;
        });
    };

    const expandAll = () => setExpandedGroups(new Set(groups.map(g => g.label)));
    const collapseAll = () => setExpandedGroups(new Set());

    // Build groups
    const groups = useMemo(() => groupByModule(allKeys), [allKeys]);

    // Filter groups by search
    const filteredGroups = useMemo(() => {
        if (!searchQuery.trim()) return groups;
        const q = searchQuery.toLowerCase();
        return groups
            .map(g => ({
                ...g,
                keys: g.keys.filter(k =>
                    k.toLowerCase().includes(q) ||
                    formatKeyName(k).toLowerCase().includes(q)
                ),
            }))
            .filter(g => g.keys.length > 0);
    }, [groups, searchQuery]);

    const selectedUser = users.find(u => u.id === selectedUserId);

    // Stats
    const totalGranted = Object.values(permissions).filter(Boolean).length;
    const totalKeys = allKeys.length;

    return (
        <div className="s-dashboard" style={{ paddingBottom: '40px' }}>
            <div className="s-header">
                <div>
                    <h1 className="s-header__title">
                        <Shield size={24} style={{ marginRight: '10px', verticalAlign: 'middle', color: 'var(--s-brand)' }} />
                        Strata Access Settings
                    </h1>
                    <p className="s-header__subtitle">Manage granular widget, module, and section visibility for every user</p>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
                {/* User Selector Column */}
                <div className="s-glass-card" style={{ alignSelf: 'start', position: 'sticky', top: '24px' }}>
                    <h3 style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <UsersIcon size={18} /> User Selection
                    </h3>

                    {loading && users.length === 0 ? (
                        <div className="s-loading" style={{ minHeight: '100px' }}>Loading...</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {users.map(u => (
                                <button
                                    key={u.id}
                                    onClick={() => setSelectedUserId(u.id)}
                                    style={{
                                        padding: '12px',
                                        borderRadius: '8px',
                                        background: selectedUserId === u.id ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${selectedUserId === u.id ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'transparent'}`,
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        color: 'var(--text-primary)',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{u.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                        {u.role}
                                        {u.role === 'god' && <span style={{ color: '#f59e0b', marginLeft: '6px' }}>★</span>}
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Permission stats for selected user */}
                    {!loading && selectedUserId && (
                        <div style={{
                            marginTop: '16px',
                            padding: '12px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '8px',
                            fontSize: '12px',
                            color: 'var(--text-secondary)',
                        }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
                                {selectedUser?.name || '—'}
                            </div>
                            <div style={{
                                height: '4px',
                                borderRadius: '2px',
                                background: 'rgba(255,255,255,0.08)',
                                overflow: 'hidden',
                                marginBottom: '6px',
                            }}>
                                <div style={{
                                    height: '100%',
                                    width: totalKeys ? `${(totalGranted / totalKeys) * 100}%` : '0%',
                                    background: 'var(--s-brand)',
                                    borderRadius: '2px',
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>
                            <div>{totalGranted} / {totalKeys} permissions granted</div>
                        </div>
                    )}
                </div>

                {/* Permissions configuration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {selectedUser?.role === 'god' && (
                        <div style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            padding: '16px',
                            borderRadius: '12px',
                            color: '#fcd34d',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <AlertCircle size={20} />
                            <div>This user has the <strong>god</strong> role and implicitly possesses all permissions. Overrides below are not required.</div>
                        </div>
                    )}

                    {error && (
                        <div style={{ color: '#ef4444', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                            Error: {error}
                        </div>
                    )}

                    {!loading && selectedUserId && (
                        <>
                            {/* Toolbar: Search + Save + Expand/Collapse */}
                            <div className="s-glass-card" style={{ padding: '16px' }}>
                                <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {/* Search */}
                                    <div style={{
                                        flex: '1 1 240px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        background: 'rgba(0,0,0,0.3)',
                                        borderRadius: '8px',
                                        padding: '8px 12px',
                                        border: '1px solid rgba(255,255,255,0.08)',
                                    }}>
                                        <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                        <input
                                            type="text"
                                            placeholder="Search permissions..."
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                outline: 'none',
                                                color: 'var(--text-primary)',
                                                fontSize: '13px',
                                                width: '100%',
                                            }}
                                        />
                                    </div>

                                    <button onClick={expandAll} style={toggleStyle}>
                                        <ChevronDown size={14} /> Expand All
                                    </button>
                                    <button onClick={collapseAll} style={toggleStyle}>
                                        <ChevronRight size={14} /> Collapse All
                                    </button>

                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="s-btn s-btn-primary"
                                        style={{ display: 'flex', gap: '8px', alignItems: 'center', marginLeft: 'auto' }}
                                    >
                                        {saving ? <RefreshCw size={16} className="spinning" /> : <Save size={16} />}
                                        Save Changes
                                    </button>
                                </div>

                                {successMsg && (
                                    <div style={{
                                        color: '#22c55e',
                                        padding: '10px 12px',
                                        background: 'rgba(16, 185, 129, 0.1)',
                                        borderRadius: '8px',
                                        marginTop: '12px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '13px',
                                    }}>
                                        <Check size={16} /> {successMsg}
                                    </div>
                                )}
                            </div>

                            {/* Accordion Groups */}
                            {filteredGroups.map(group => {
                                const isExpanded = expandedGroups.has(group.label);
                                const grantedCount = group.keys.filter(k => permissions[k]).length;
                                const allGranted = grantedCount === group.keys.length;
                                const noneGranted = grantedCount === 0;

                                return (
                                    <div key={group.label}>
                                        <button
                                            onClick={() => toggleGroupExpanded(group.label)}
                                            style={{
                                                ...accordionHeaderStyle,
                                                borderColor: isExpanded ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'rgba(255,255,255,0.06)',
                                            }}
                                        >
                                            {isExpanded
                                                ? <ChevronDown size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                                                : <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                                            }
                                            <span style={{ flex: 1 }}>{group.label}</span>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 500,
                                                color: allGranted ? '#22c55e' : noneGranted ? '#ef4444' : '#f59e0b',
                                                background: allGranted ? 'rgba(16,185,129,0.12)' : noneGranted ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)',
                                                padding: '2px 8px',
                                                borderRadius: '10px',
                                            }}>
                                                {grantedCount}/{group.keys.length}
                                            </span>
                                        </button>

                                        {isExpanded && (
                                            <div style={{
                                                padding: '12px 16px 16px',
                                                background: 'rgba(15,23,42,0.4)',
                                                borderRadius: '0 0 10px 10px',
                                                border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
                                                borderTop: 'none',
                                                marginTop: '-4px',
                                            }}>
                                                {/* Bulk toggle row */}
                                                <div style={{
                                                    display: 'flex',
                                                    gap: '8px',
                                                    marginBottom: '12px',
                                                    paddingBottom: '10px',
                                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                                }}>
                                                    <button
                                                        onClick={() => handleBulkToggle(group.keys, true)}
                                                        style={toggleStyle}
                                                    >
                                                        <ToggleRight size={14} /> Select All
                                                    </button>
                                                    <button
                                                        onClick={() => handleBulkToggle(group.keys, false)}
                                                        style={{ ...toggleStyle, color: '#ef4444', borderColor: 'rgba(248,113,113,0.25)', background: 'rgba(248,113,113,0.08)' }}
                                                    >
                                                        <ToggleLeft size={14} /> Deselect All
                                                    </button>
                                                </div>

                                                <div style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                                                    gap: '8px',
                                                }}>
                                                    {group.keys.map(key => (
                                                        <label key={key} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '10px',
                                                            padding: '10px 12px',
                                                            background: permissions[key] ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'rgba(0,0,0,0.2)',
                                                            borderRadius: '8px',
                                                            cursor: 'pointer',
                                                            border: permissions[key] ? '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' : '1px solid transparent',
                                                            transition: 'all 0.15s ease',
                                                        }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={!!permissions[key]}
                                                                onChange={() => handleToggle(key)}
                                                                style={{ accentColor: 'var(--s-brand)', width: '16px', height: '16px', flexShrink: 0 }}
                                                            />
                                                            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                                                <span style={{
                                                                    fontSize: '13px',
                                                                    color: permissions[key] ? '#e2e8f0' : '#94a3b8',
                                                                    fontWeight: permissions[key] ? 600 : 400,
                                                                }}>
                                                                    {formatKeyName(key)}
                                                                </span>
                                                                <span style={{
                                                                    fontSize: '10px',
                                                                    color: 'var(--text-tertiary)',
                                                                    fontFamily: 'monospace',
                                                                    overflow: 'hidden',
                                                                    textOverflow: 'ellipsis',
                                                                    whiteSpace: 'nowrap',
                                                                }}>
                                                                    {key}
                                                                </span>
                                                            </div>
                                                        </label>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}

                            {filteredGroups.length === 0 && searchQuery && (
                                <div style={{
                                    textAlign: 'center',
                                    padding: '40px',
                                    color: 'var(--text-tertiary)',
                                    fontSize: '14px',
                                }}>
                                    No permissions matching "{searchQuery}"
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
