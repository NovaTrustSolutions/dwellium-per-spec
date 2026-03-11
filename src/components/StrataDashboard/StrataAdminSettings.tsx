import { useState, useEffect, useCallback } from 'react';
import { useUser } from '../../context/UserContext';
import { Shield, Users as UsersIcon, Save, RefreshCw, Check, AlertCircle } from 'lucide-react';
import './StrataDashboard.css';

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
}

type PermissionsMap = Record<string, boolean>;

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
                // exclude god user from direct permission edits usually, or allow it but they have everything
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

    // Grouping keys for neat display
    const strataModuleKeys = allKeys.filter(k => k.startsWith('strata:module:'));
    const strataSectionKeys = allKeys.filter(k => k.startsWith('strata:') && !k.startsWith('strata:module:'));
    const widgetKeys = allKeys.filter(k => k.startsWith('widget:'));
    const otherKeys = allKeys.filter(k => !k.startsWith('strata:') && !k.startsWith('widget:'));

    // Helper to extract cleanly
    const formatName = (key: string) => {
        const parts = key.split(':');
        return parts[parts.length - 1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    };

    const selectedUser = users.find(u => u.id === selectedUserId);

    return (
        <div className="s-dashboard" style={{ paddingBottom: '40px' }}>
            <div className="s-header">
                <div>
                    <h1 className="s-header__title">
                        <Shield size={24} style={{ marginRight: '10px', verticalAlign: 'middle', color: 'var(--s-brand)' }} />
                        Strata Access Settings
                    </h1>
                    <p className="s-header__subtitle">Manage granular widget and section visibility for users</p>
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
                                        background: selectedUserId === u.id ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${selectedUserId === u.id ? 'rgba(99, 102, 241, 0.4)' : 'transparent'}`,
                                        textAlign: 'left',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        color: '#e2e8f0',
                                    }}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{u.name}</div>
                                    <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>{u.role}</div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Permissions configuration */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                            <div>This user has the 'god' role and implicitly possesses all permissions. Overrides below are not required.</div>
                        </div>
                    )}

                    {error && (
                        <div style={{ color: '#ef4444', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px' }}>
                            Error: {error}
                        </div>
                    )}

                    {!loading && selectedUserId && (
                        <>
                            {/* Strata App Modules (Top Level) */}
                            <div className="s-glass-card">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                    <div>
                                        <h3 style={{ margin: 0 }}>Strata Dashboard Modules</h3>
                                        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>Top-level navigation tabs</p>
                                    </div>
                                    <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="s-btn s-btn-primary"
                                        style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                                    >
                                        {saving ? <RefreshCw size={16} className="spinning" /> : <Save size={16} />}
                                        Save Changes
                                    </button>
                                </div>

                                {successMsg && (
                                    <div style={{ color: '#10b981', padding: '12px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <Check size={16} /> {successMsg}
                                    </div>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                                    {strataModuleKeys.map(key => (
                                        <label key={key} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px',
                                            background: 'rgba(0,0,0,0.2)', borderRadius: '8px', cursor: 'pointer',
                                            border: permissions[key] ? '1px solid rgba(99,102,241,0.3)' : '1px solid transparent'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={!!permissions[key]}
                                                onChange={() => handleToggle(key)}
                                                style={{ accentColor: 'var(--s-brand)', width: '16px', height: '16px' }}
                                            />
                                            <span style={{ fontSize: '13px', color: permissions[key] ? '#e2e8f0' : '#94a3b8' }}>{formatName(key)}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Strata Granular Permissions */}
                            <div className="s-glass-card">
                                <div>
                                    <h3 style={{ margin: 0 }}>Granular Section Visibility</h3>
                                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 16px 0' }}>Show/hide specific graphs, tables, and buttons within modules</p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                                    {strataSectionKeys.map(key => {
                                        const moduleMatch = key.match(/strata:([^:]+):/);
                                        const moduleName = moduleMatch ? formatName(moduleMatch[1]) : '';
                                        return (
                                            <label key={key} style={{
                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '12px',
                                                background: 'rgba(0,0,0,0.2)', borderRadius: '8px', cursor: 'pointer',
                                                border: permissions[key] ? '1px solid rgba(16,185,129,0.3)' : '1px solid transparent'
                                            }}>
                                                <input
                                                    type="checkbox"
                                                    checked={!!permissions[key]}
                                                    onChange={() => handleToggle(key)}
                                                    style={{ accentColor: '#10b981', width: '16px', height: '16px' }}
                                                />
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontSize: '13px', color: permissions[key] ? '#e2e8f0' : '#94a3b8' }}>{formatName(key)}</span>
                                                    <span style={{ fontSize: '10px', color: '#64748b' }}>Module: {moduleName}</span>
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Global Widgets & Workstation */}
                            <div className="s-glass-card">
                                <div>
                                    <h3 style={{ margin: 0 }}>Global Apps & Desk Settings</h3>
                                    <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 16px 0' }}>Base workstation access rights</p>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                                    {[...widgetKeys, ...otherKeys].map(key => (
                                        <label key={key} style={{
                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px',
                                            background: 'rgba(0,0,0,0.2)', borderRadius: '8px', cursor: 'pointer',
                                            border: permissions[key] ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent'
                                        }}>
                                            <input
                                                type="checkbox"
                                                checked={!!permissions[key]}
                                                onChange={() => handleToggle(key)}
                                                style={{ accentColor: '#f59e0b', width: '16px', height: '16px' }}
                                            />
                                            <span style={{ fontSize: '13px', color: permissions[key] ? '#e2e8f0' : '#94a3b8', fontFamily: 'monospace' }}>{key}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
