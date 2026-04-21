/**
 * LoginScreen — Full-screen auth gate for Dwellium
 *
 * Shows quick-select avatars for seeded users + manual email/password form.
 * Styled to match the Dwellium dark theme with glassmorphism.
 */

import { useState, FormEvent } from 'react';
import { useUser } from '../../context/UserContext';
import { LogIn, AlertCircle, Shield, Eye, EyeOff } from 'lucide-react';
import './LoginScreen.css';

const QUICK_USERS = [
    { email: 'andy@dwellium.com', name: 'Andy', role: 'god', color: '#6366f1', initials: 'A', pw: 'admin123' },
    { email: 'lisa@zpgroup.io', name: 'Lisa', role: 'corporate', color: '#3b82f6', initials: 'L', pw: 'corp123' },
    { email: 'wendy@dwellium.com', name: 'Wendy', role: 'management', color: '#10b981', initials: 'W', pw: 'mgmt123' },
    { email: 'candace@dwellium.com', name: 'Candace', role: 'management', color: '#f59e0b', initials: 'C', pw: 'mgmt123' },
    { email: 'grieve@dwellium.com', name: 'Grieve', role: 'advisor', color: '#8b5cf6', initials: 'G', pw: 'adv123' },
    { email: 'baldwin@dwellium.com', name: 'Baldwin', role: 'advisor', color: '#a855f7', initials: 'B', pw: 'adv123' },
    { email: 'leo@dwellium.com', name: 'Leo', role: 'advisor', color: '#7c3aed', initials: 'Lo', pw: 'adv123' },
    { email: 'lee@dwellium.com', name: 'Lee', role: 'maintenance', color: '#ef4444', initials: 'Le', pw: 'maint123' },
    { email: 'jose@dwellium.com', name: 'Jose', role: 'maintenance', color: '#f97316', initials: 'J', pw: 'maint123' },
];

const ROLE_LABELS: Record<string, string> = {
    god: 'God Mode',
    corporate: 'Corporate',
    management: 'Management',
    maintenance: 'Maintenance',
    advisor: 'Advisor',
};

interface LoginScreenProps {
    onTenantMode?: () => void;
}

export default function LoginScreen({ onTenantMode }: LoginScreenProps) {
    const { login } = useUser();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [hasClicked, setHasClicked] = useState(false);

    // Password gate state
    const [pendingUser, setPendingUser] = useState<typeof QUICK_USERS[0] | null>(null);
    const [gatePassword, setGatePassword] = useState('');
    const [gateError, setGateError] = useState('');

    const GATE_PASSPHRASE = 'Comet2878!';

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Email and password are required');
            return;
        }
        setLoading(true);
        setError('');
        const result = await login(email, password);
        if (!result.success) {
            setError(result.error || 'Login failed');
        }
        setLoading(false);
    };

    const handleQuickSelect = (user: typeof QUICK_USERS[0]) => {
        setPendingUser(user);
        setGatePassword('');
        setGateError('');
        setSelectedUser(user.email);
    };

    const handleGateSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (gatePassword !== GATE_PASSPHRASE) {
            setGateError('Incorrect passphrase');
            return;
        }
        if (!pendingUser) return;
        setLoading(true);
        setGateError('');
        const result = await login(pendingUser.email, pendingUser.pw);
        if (!result.success) {
            setGateError(result.error || 'Login failed');
            setLoading(false);
            return;
        }
        setLoading(false);
        setPendingUser(null);
        setSelectedUser(null);
    };

    const handleGateCancel = () => {
        setPendingUser(null);
        setSelectedUser(null);
        setGatePassword('');
        setGateError('');
    };

    return (
        <>
            {/* Nebula video background */}
            <video
                className="login-video-bg"
                autoPlay
                muted
                loop
                playsInline
            >
                <source src="/assets/nebula-bg.mp4" type="video/mp4" />
            </video>

            {/* Initial click overlay */}
            <div
                className={`login-start-overlay ${hasClicked ? 'is-hidden' : ''}`}
                onClick={() => setHasClicked(true)}
            >
                <div className="login-start-text">Click to Access Terminal</div>
            </div>

            <div className={`login-backdrop ${hasClicked ? 'is-active' : ''}`}>
                {/* Decorative background elements */}
                <div className="login-bg-orb login-bg-orb--1" />
                <div className="login-bg-orb login-bg-orb--2" />
                <div className="login-bg-orb login-bg-orb--3" />

                <div className="login-container">
                    {/* Header outside of card for separate animation */}
                    <div className="login-header">
                        <img src="/assets/astra-strata-logo.png" alt="AstraStrata Property Management" className="login-logo-img" />
                    </div>

                    <div className="login-card">
                        {/* ─── Password Gate Modal ─── */}
                        {pendingUser && (
                            <div style={{
                                position: 'fixed', inset: 0, zIndex: 9999,
                                background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <form onSubmit={handleGateSubmit} style={{
                                    background: 'linear-gradient(145deg, rgba(15,15,30,0.95), rgba(20,20,40,0.95))',
                                    border: '1px solid rgba(99,102,241,0.25)', borderRadius: 20,
                                    padding: '36px 32px', width: 380, maxWidth: '90vw',
                                    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                                }}>
                                    <div style={{ textAlign: 'center', marginBottom: 20 }}>
                                        <div style={{
                                            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
                                            background: pendingUser.color, display: 'flex', alignItems: 'center',
                                            justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff',
                                        }}>{pendingUser.initials}</div>
                                        <div style={{ fontSize: 18, fontWeight: 700, color: '#e2e8f0' }}>
                                            Welcome, {pendingUser.name}
                                        </div>
                                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                                            Enter passphrase to continue
                                        </div>
                                    </div>

                                    {gateError && (
                                        <div style={{
                                            padding: '8px 12px', marginBottom: 14, borderRadius: 8,
                                            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                            color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
                                        }}>
                                            <AlertCircle size={14} /> {gateError}
                                        </div>
                                    )}

                                    <input
                                        type="password"
                                        value={gatePassword}
                                        onChange={e => setGatePassword(e.target.value)}
                                        placeholder="Passphrase..."
                                        autoFocus
                                        style={{
                                            width: '100%', padding: '12px 16px', borderRadius: 12,
                                            border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(0,0,0,0.3)',
                                            color: '#e2e8f0', fontSize: 14, outline: 'none',
                                            fontFamily: 'Inter, -apple-system, sans-serif',
                                            boxSizing: 'border-box',
                                        }}
                                    />

                                    <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                                        <button type="button" onClick={handleGateCancel} style={{
                                            flex: 1, padding: '10px 0', borderRadius: 12, border: '1px solid rgba(100,116,139,0.3)',
                                            background: 'none', color: '#94a3b8', fontSize: 13, cursor: 'pointer',
                                            fontFamily: 'Inter, -apple-system, sans-serif', fontWeight: 600,
                                        }}>Cancel</button>
                                        <button type="submit" disabled={loading} style={{
                                            flex: 2, padding: '10px 0', borderRadius: 12, border: 'none',
                                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', color: '#fff',
                                            fontSize: 13, cursor: 'pointer', fontWeight: 700,
                                            fontFamily: 'Inter, -apple-system, sans-serif',
                                            opacity: loading ? 0.6 : 1,
                                        }}>{loading ? 'Authenticating...' : 'Unlock'}</button>
                                    </div>
                                </form>
                            </div>
                        )}

                        {/* Quick Select */}
                        <div className="login-quick">
                            <span className="login-quick__label">Quick Access</span>
                            <div className="login-quick__grid">
                                {QUICK_USERS.map(u => (
                                    <button
                                        key={u.email}
                                        className={`login-avatar ${selectedUser === u.email ? 'login-avatar--active' : ''}`}
                                        onClick={() => handleQuickSelect(u)}
                                        disabled={loading}
                                        title={`${u.name} — ${ROLE_LABELS[u.role]}`}
                                    >
                                        <div className="login-avatar__circle" style={{ background: u.color }}>
                                            {u.initials}
                                        </div>
                                        <span className="login-avatar__name">{u.name}</span>
                                        <span className="login-avatar__role" style={{ color: u.color }}>
                                            {ROLE_LABELS[u.role]}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="login-divider">
                            <span>or sign in manually</span>
                        </div>

                        {/* Form */}
                        <form className="login-form" onSubmit={handleSubmit}>
                            {error && (
                                <div className="login-error">
                                    <AlertCircle size={14} />
                                    {error}
                                </div>
                            )}

                            <div className="login-field">
                                <label htmlFor="login-email">Email</label>
                                <input
                                    id="login-email"
                                    type="email"
                                    placeholder="user@dwellium.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    autoComplete="email"
                                />
                            </div>

                            <div className="login-field">
                                <label htmlFor="login-password">Password</label>
                                <div className="login-field__password">
                                    <input
                                        id="login-password"
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                    />
                                    <button
                                        type="button"
                                        className="login-field__eye"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <button type="submit" className="login-submit" disabled={loading}>
                                {loading ? (
                                    <span className="login-spinner" />
                                ) : (
                                    <>
                                        <LogIn size={16} />
                                        Sign In
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="login-footer">
                            <Shield size={12} />
                            <span>Local-first · Data stays on your machine</span>
                        </div>

                        {onTenantMode && (
                            <button
                                className="login-tenant-link"
                                onClick={onTenantMode}
                                type="button"
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    width: '100%',
                                    marginTop: 16,
                                    padding: '10px 0',
                                    background: 'none',
                                    border: '1px solid rgba(99,102,241,0.15)',
                                    borderRadius: 12,
                                    color: '#94a3b8',
                                    fontSize: 13,
                                    cursor: 'pointer',
                                    fontFamily: 'Inter, -apple-system, sans-serif',
                                    transition: 'all 0.2s',
                                }}
                                onMouseEnter={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(93,173,226,0.4)';
                                    (e.currentTarget as HTMLElement).style.color = '#5dade2';
                                }}
                                onMouseLeave={e => {
                                    (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.15)';
                                    (e.currentTarget as HTMLElement).style.color = '#94a3b8';
                                }}
                            >
                                🏠 Resident? Sign in here →
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
