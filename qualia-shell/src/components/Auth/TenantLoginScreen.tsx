/**
 * TenantLoginScreen — Premium resident portal login
 *
 * Converted from the standalone Astra Strata HTML/CSS/JS login page.
 * Shows a branded split-screen layout with glassmorphism login card.
 * Uses the existing UserContext.login() for real authentication.
 */

import { useState, useEffect, useRef, FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, Key, Loader2, Lock, Mail, Zap } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import './TenantLoginScreen.css';

interface TenantLoginScreenProps {
    onBackToAdmin?: () => void;
}

export default function TenantLoginScreen({ onBackToAdmin }: TenantLoginScreenProps) {
    const { login } = useUser();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const particlesRef = useRef<HTMLDivElement>(null);

    // ── Create floating particles ──
    useEffect(() => {
        const container = particlesRef.current;
        if (!container) return;

        const count = window.innerWidth < 768 ? 10 : 25;

        for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'tenant-login__particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDelay = Math.random() * 10 + 's';
            p.style.animationDuration = 8 + Math.random() * 8 + 's';
            const size = 1 + Math.random() * 2;
            p.style.width = size + 'px';
            p.style.height = size + 'px';
            container.appendChild(p);
        }

        return () => {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
        };
    }, []);

    // ── Handle login ──
    const handleLogin = async (e: FormEvent) => {
        e.preventDefault();
        if (!email || !password) {
            setError('Please enter your email and password');
            return;
        }

        setLoading(true);
        setError('');

        const result = await login(email, password);

        if (!result.success) {
            setError(result.error || 'Invalid credentials. Please try again.');
            setLoading(false);
        } else {
            setSuccess(true);
            // AuthGate will handle the redirect once auth state updates
        }
    };

    return (
        <div className="tenant-login">
            {/* Background */}
            <div className="tenant-login__bg" />

            {/* Ambient Particles */}
            <div className="tenant-login__particles" ref={particlesRef} />

            {/* Main Content */}
            <main className="tenant-login__layout">

                {/* Left: Branding Panel */}
                <section className="tenant-login__brand">
                    <div className="tenant-login__brand-inner">

                        {/* Logo */}
                        <div className="tenant-login__logo">
                            <svg className="tenant-login__logo-icon" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                                {/* Skyline buildings */}
                                <rect x="30" y="30" width="12" height="50" rx="1" fill="url(#tl-bldg1)" />
                                <rect x="45" y="15" width="14" height="65" rx="1" fill="url(#tl-bldg2)" />
                                <rect x="62" y="25" width="11" height="55" rx="1" fill="url(#tl-bldg3)" />
                                <rect x="76" y="35" width="10" height="45" rx="1" fill="url(#tl-bldg1)" />
                                {/* Windows */}
                                <rect x="33" y="36" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.5)" />
                                <rect x="33" y="44" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.4)" />
                                <rect x="33" y="52" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.3)" />
                                <rect x="49" y="22" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.5)" />
                                <rect x="49" y="30" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.4)" />
                                <rect x="49" y="38" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.5)" />
                                <rect x="49" y="46" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.3)" />
                                <rect x="55" y="30" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.4)" />
                                <rect x="55" y="38" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.3)" />
                                <rect x="65" y="32" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.5)" />
                                <rect x="65" y="40" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.4)" />
                                <rect x="79" y="42" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.5)" />
                                {/* Swoosh arc */}
                                <path d="M15 72 Q60 50 110 68" stroke="url(#tl-swoosh)" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                                <path d="M18 76 Q60 54 108 72" stroke="url(#tl-swoosh2)" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.5" />
                                {/* Star sparkle */}
                                <g transform="translate(100, 22)" className="tenant-login__star-sparkle">
                                    <line x1="0" y1="-8" x2="0" y2="8" stroke="white" strokeWidth="1.5" opacity="0.8" />
                                    <line x1="-8" y1="0" x2="8" y2="0" stroke="white" strokeWidth="1.5" opacity="0.8" />
                                    <line x1="-5" y1="-5" x2="5" y2="5" stroke="white" strokeWidth="1" opacity="0.5" />
                                    <line x1="5" y1="-5" x2="-5" y2="5" stroke="white" strokeWidth="1" opacity="0.5" />
                                </g>
                                {/* Small sparkles */}
                                <circle cx="38" cy="22" r="1.2" fill="white" opacity="0.4" className="tenant-login__small-sparkle" />
                                <circle cx="85" cy="28" r="1" fill="white" opacity="0.3" className="tenant-login__small-sparkle" />
                                <circle cx="92" cy="42" r="0.8" fill="white" opacity="0.35" className="tenant-login__small-sparkle" />
                                {/* Gradients */}
                                <defs>
                                    <linearGradient id="tl-bldg1" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#1a5276" />
                                        <stop offset="100%" stopColor="#0a2647" />
                                    </linearGradient>
                                    <linearGradient id="tl-bldg2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#2471a3" />
                                        <stop offset="100%" stopColor="#154360" />
                                    </linearGradient>
                                    <linearGradient id="tl-bldg3" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#1b4f72" />
                                        <stop offset="100%" stopColor="#0b2f4a" />
                                    </linearGradient>
                                    <linearGradient id="tl-swoosh" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#5dade2" />
                                        <stop offset="50%" stopColor="#c0c0c0" />
                                        <stop offset="100%" stopColor="#2e86c1" />
                                    </linearGradient>
                                    <linearGradient id="tl-swoosh2" x1="0" y1="0" x2="1" y2="0">
                                        <stop offset="0%" stopColor="#2e86c1" />
                                        <stop offset="100%" stopColor="#85c1e9" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            <div className="tenant-login__logo-text">
                                <span className="tenant-login__logo-name">
                                    <span className="tenant-login__logo-strata">Strata</span>
                                    <span className="tenant-login__logo-astra">Astra</span>
                                </span>
                                <span className="tenant-login__logo-tagline">— Property Management —</span>
                            </div>
                        </div>

                        {/* Headline */}
                        <h1 className="tenant-login__title">
                            Welcome to Your<br />
                            <span className="tenant-login__text-gradient">Resident Portal</span>
                        </h1>
                        <p className="tenant-login__subtitle">
                            Manage payments, maintenance requests, and lease documents
                            — all in one secure, elegant platform.
                        </p>

                        {/* Trust indicators */}
                        <div className="tenant-login__trust-bar">
                            <div className="tenant-login__trust-item">
                                <span className="tenant-login__trust-icon"><Lock size={14} /></span>
                                <span>256-bit Encrypted</span>
                            </div>
                            <div className="tenant-login__trust-item">
                                <span className="tenant-login__trust-icon"><Zap size={14} /></span>
                                <span>24/7 Support</span>
                            </div>
                            <div className="tenant-login__trust-item">
                                <span className="tenant-login__trust-icon"><Check size={14} /></span>
                                <span>SOC 2 Compliant</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Right: Login Card */}
                <section className="tenant-login__panel">
                    <div className="tenant-login__card">
                        <div className="tenant-login__card-header">
                            <h2 className="tenant-login__card-title">Sign In</h2>
                            <p className="tenant-login__card-desc">Access your resident dashboard</p>
                        </div>

                        <form onSubmit={handleLogin}>
                            {error && (
                                <div className="tenant-login__error">
                                    {error}
                                </div>
                            )}

                            <div className="tenant-login__input-group">
                                <label className="tenant-login__input-label" htmlFor="tl-email">
                                    Email Address
                                </label>
                                <div className="tenant-login__input-wrapper">
                                    <span className="tenant-login__input-icon"><Mail size={14} /></span>
                                    <input
                                        type="email"
                                        id="tl-email"
                                        className="tenant-login__input-field"
                                        placeholder="resident@example.com"
                                        required
                                        autoComplete="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        disabled={loading}
                                    />
                                </div>
                            </div>

                            <div className="tenant-login__input-group">
                                <label className="tenant-login__input-label" htmlFor="tl-password">
                                    Password
                                </label>
                                <div className="tenant-login__input-wrapper">
                                    <span className="tenant-login__input-icon"><Key size={14} /></span>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        id="tl-password"
                                        className="tenant-login__input-field"
                                        placeholder="Enter your password"
                                        required
                                        autoComplete="current-password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        disabled={loading}
                                    />
                                    <button
                                        type="button"
                                        className="tenant-login__input-toggle"
                                        onClick={() => setShowPassword(!showPassword)}
                                        tabIndex={-1}
                                    >
                                        {showPassword ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>

                            <div className="tenant-login__form-options">
                                <label className="tenant-login__checkbox-label">
                                    <input
                                        type="checkbox"
                                        className="tenant-login__checkbox"
                                        checked={rememberMe}
                                        onChange={e => setRememberMe(e.target.checked)}
                                    />
                                    <span className="tenant-login__checkbox-custom" />
                                    Remember me
                                </label>
                                <button type="button" className="tenant-login__link-subtle">
                                    Forgot password?
                                </button>
                            </div>

                            <button
                                type="submit"
                                className="tenant-login__btn"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <span className="tenant-login__spinner"><Loader2 size={16} aria-hidden /></span>
                                        <span>{success ? 'Welcome!' : 'Signing in...'}</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Sign In</span>
                                        <span className="tenant-login__btn-arrow"><ArrowRight size={16} aria-hidden /></span>
                                    </>
                                )}
                            </button>
                        </form>

                        <div className="tenant-login__divider">
                            <span>or continue with</span>
                        </div>

                        {/* Social Login Buttons */}
                        <div className="tenant-login__social">
                            <button className="tenant-login__social-btn" title="Sign in with Google" type="button">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                </svg>
                            </button>
                            <button className="tenant-login__social-btn" title="Sign in with Apple" type="button">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                                </svg>
                            </button>
                            <button className="tenant-login__social-btn" title="Sign in with Microsoft" type="button">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                                    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
                                    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
                                    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
                                </svg>
                            </button>
                        </div>

                        {/* Staff login link */}
                        {onBackToAdmin && (
                            <button
                                className="tenant-login__staff-link"
                                onClick={onBackToAdmin}
                                type="button"
                            >
                                <ArrowLeft size={14} aria-hidden /> Staff login
                            </button>
                        )}
                    </div>
                </section>

            </main>

            {/* Bottom Bar */}
            <footer className="tenant-login__footer">
                <span>© 2026 StrataAstra Property Management</span>
                <div className="tenant-login__footer-links">
                    <a href="#">Privacy</a>
                    <a href="#">Terms</a>
                    <a href="#">Help</a>
                </div>
            </footer>
        </div>
    );
}
