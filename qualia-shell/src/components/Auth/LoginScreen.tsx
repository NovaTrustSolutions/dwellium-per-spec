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
    { email: 'andy@dwellium.com', name: 'Andy', role: 'god', color: 'var(--accent)', initials: 'A', pw: 'admin123' },
    { email: 'lisa@zpgroup.io', name: 'Lisa', role: 'corporate', color: '#3b82f6', initials: 'L', pw: 'corp123' },
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

    // Quick-access avatars log straight in — no passphrase gate (frictionless local demo login).
    const handleQuickSelect = async (user: typeof QUICK_USERS[0]) => {
        setSelectedUser(user.email);
        setError('');
        setLoading(true);
        const result = await login(user.email, user.pw);
        if (!result.success) {
            setError(result.error || 'Login failed');
            setSelectedUser(null);
        }
        setLoading(false);
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
                        {/* Quick Select */}
                        <div className="login-quick">
                            <span className="login-quick__label">Quick Access</span>
                            <div className="login-quick__grid">
                                {QUICK_USERS.map(u => (
                                    <button
                                        key={u.email}
                                        className={`login-avatar spotlight-card ${selectedUser === u.email ? 'login-avatar--active' : ''}`}
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
                                    border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)',
                                    borderRadius: 12,
                                    color: 'var(--text-secondary)',
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
                                    (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--accent) 15%, transparent)';
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
