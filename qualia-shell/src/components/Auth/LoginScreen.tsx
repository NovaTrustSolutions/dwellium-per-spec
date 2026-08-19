/**
 * LoginScreen — local account authority for Dwellium.
 *
 * Flow: splash (name + promise + "Sign in" / Google) → shared access password → email + password
 * (045-D2: the Andy / Lisa / Archi picker is gone; the email resolves the
 * account against LOCAL_ACCOUNTS + overrides). Validated client-side, then a
 * REAL backend session via `login`; `loginLocal` only on the explicit offline
 * choice. Local-first: these credentials are a gate, not hardened security.
 *
 * Google login is retained behind VITE_GOOGLE_LOGIN=true (off by default).
 */

import { useState, type FormEvent } from 'react';
import { useUser } from '../../context/UserContext';
import { AlertCircle, Shield } from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';
import { useEffectiveAccounts, isPasswordSet } from './localAccounts';
import './LoginScreen.css';

// Re-exported so tests (and any importer) can read the base roster.
export { LOCAL_ACCOUNTS } from './localAccounts';

/** Shared access password (stage 1 gate). */
const GATE_PASSWORD = 'Comet2878!';

/** Google login is kept in the code but hidden unless explicitly enabled. */
const GOOGLE_LOGIN_ENABLED = (import.meta.env.VITE_GOOGLE_LOGIN as string | undefined) === 'true';

/** 046-F3 front door: product name + one-line promise on the FIRST paint. */
const PRODUCT_NAME = 'Dwellium';
const VALUE_STATEMENT = 'Your properties, your inbox, your AI — one screen.';

type Stage = 'gate' | 'credential';

interface LoginScreenProps {
    onTenantMode?: () => void;
}

export default function LoginScreen({ onTenantMode }: LoginScreenProps) {
    const { login, loginLocal, loginWithGoogle } = useUser();
    const effectiveAccounts = useEffectiveAccounts();
    const [hasClicked, setHasClicked] = useState(false);
    const [stage, setStage] = useState<Stage>('gate');
    const [gateInput, setGateInput] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [offlineOffer, setOfflineOffer] = useState(false);

    const submitGate = (event?: FormEvent) => {
        event?.preventDefault();
        setError('');
        if (gateInput === GATE_PASSWORD) {
            setGateInput('');
            setStage('credential');
        } else {
            setError('Incorrect access password.');
        }
    };

    /** Resolve the typed email against the roster (+ current overrides). */
    const resolveAccount = () => {
        const wanted = email.trim().toLowerCase();
        return effectiveAccounts.find(a => a.enabled && a.email.toLowerCase() === wanted) ?? null;
    };

    const submitCredential = async (event?: FormEvent) => {
        event?.preventDefault();
        setError('');
        setOfflineOffer(false);
        const acct = resolveAccount();
        if (!acct) {
            setError('Incorrect email or password.');
            return;
        }
        if (!isPasswordSet(acct)) {
            setError('Password not set yet — ask the Architect to set it in Control Panel → Accounts.');
            return;
        }
        if (password !== acct.password) {
            setError('Incorrect email or password.');
            return;
        }
        // HARDENED (2026-07-10, F-016 follow-up): the local gate is only stage
        // one — a REAL backend session is required so API keys, workspaces and
        // Google links persist server-side and follow the user across machines.
        // Offline entry exists but only as an EXPLICIT user choice below.
        setBusy(true);
        const result = await login(acct.email, acct.backendPassword ?? password);
        setBusy(false);
        if (result.success) return;
        if (result.offline) {
            setOfflineOffer(true);
            return;
        }
        setError(result.error === 'Invalid credentials'
            ? "Server rejected this account's seeded credentials — ask the Architect to reconcile the roster."
            : (result.error || 'Server sign-in failed.'));
    };

    const continueOffline = () => {
        const acct = resolveAccount();
        if (!acct) return;
        setOfflineOffer(false);
        loginLocal({ id: acct.id, name: acct.name, email: acct.email, role: acct.role });
    };

    return (
        <>
            <video
                className="login-video-bg"
                poster="/assets/hero-bg.webp"
                muted
                loop
                playsInline
                preload="none"
                autoPlay={hasClicked}
                key={hasClicked ? 'play' : 'idle'}
            >
                {hasClicked && <source src="/assets/nebula-bg-1280.mp4" type="video/mp4" />}
            </video>

            <div
                className={`login-start-overlay ${hasClicked ? 'is-hidden' : ''}`}
                onClick={() => setHasClicked(true)}
            >
                {!hasClicked && (
                    <div className="login-front">
                        <h1 className="login-front__name">{PRODUCT_NAME}</h1>
                        <p className="login-front__value">{VALUE_STATEMENT}</p>
                        <button type="button" className="login-primary-btn" onClick={() => setHasClicked(true)}>Sign in</button>
                        {GOOGLE_LOGIN_ENABLED && (
                            <div className="login-front__google">
                                <GoogleSignInButton onCredential={loginWithGoogle} />
                            </div>
                        )}
                        {onTenantMode && (
                            <button type="button" className="login-tenant-link" onClick={e => { e.stopPropagation(); onTenantMode(); }}>
                                Resident? Sign in here
                            </button>
                        )}
                    </div>
                )}
            </div>

            <div className={`login-backdrop ${hasClicked ? 'is-active' : ''}`}>
                <div className="login-bg-orb login-bg-orb--1" />
                <div className="login-bg-orb login-bg-orb--2" />
                <div className="login-bg-orb login-bg-orb--3" />

                <div className="login-container">
                    <div className="login-header">
                        <img src="/assets/astra-strata-logo.png" alt="AstraStrata Property Management" className="login-logo-img" width={640} height={640} />
                    </div>

                    <div className="login-card">
                        {error && (
                            <div className="login-error">
                                <AlertCircle size={14} />
                                {error}
                            </div>
                        )}

                        {stage === 'gate' && (
                            <form className="login-step" onSubmit={submitGate}>
                                <span className="login-quick__label">Account Login</span>
                                <h2>Enter access password</h2>
                                <p>Enter the AstraStrata access password to continue.</p>
                                <input
                                    type="password"
                                    className="login-input"
                                    aria-label="Access password"
                                    placeholder="Access password"
                                    value={gateInput}
                                    onChange={(event) => setGateInput(event.target.value)}
                                    // focus without scrollIntoView so the logo card stays visible on short viewports
                                    ref={(el) => el?.focus({ preventScroll: true })}
                                />
                                <button type="submit" className="login-primary-btn" disabled={!gateInput}>Continue</button>
                            </form>
                        )}

                        {stage === 'credential' && (
                            <form className="login-step" onSubmit={(event) => { void submitCredential(event); }}>
                                <span className="login-quick__label">Account Login</span>
                                <h2>Sign in</h2>
                                <input
                                    type="email"
                                    className="login-input"
                                    aria-label="Email"
                                    placeholder="Email"
                                    autoComplete="username"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    ref={(el) => el?.focus({ preventScroll: true })}
                                />
                                <input
                                    type="password"
                                    className="login-input"
                                    aria-label="Password"
                                    placeholder="Password"
                                    autoComplete="current-password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                />
                                <button type="submit" className="login-primary-btn" disabled={!email || !password || busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                                {offlineOffer && (
                                    <div className="login-offline-offer" role="alert" style={{
                                        marginTop: 12, padding: '12px 14px', borderRadius: 10,
                                        border: '1px solid rgba(245,158,11,0.4)', background: 'rgba(245,158,11,0.08)',
                                        fontSize: 12.5, lineHeight: 1.5,
                                    }}>
                                        <p style={{ margin: 0 }}>
                                            Can't reach the server. You can enter offline, but <strong>nothing you
                                            save will sync to your account</strong> — API keys, workspaces and email
                                            links would stay on this device only.
                                        </p>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                                            <button type="button" className="login-primary-btn" style={{ flex: 1 }}
                                                onClick={() => { void submitCredential(); }}>Retry server sign-in</button>
                                            <button type="button" className="login-back" style={{ flex: 1, justifyContent: 'center' }}
                                                onClick={continueOffline}>Continue offline</button>
                                        </div>
                                    </div>
                                )}
                            </form>
                        )}

                        {GOOGLE_LOGIN_ENABLED && stage === 'gate' && (
                            <div className="login-google-alt">
                                <div className="login-divider"><span>or</span></div>
                                <GoogleSignInButton onCredential={loginWithGoogle} />
                            </div>
                        )}

                        <div className="login-footer">
                            <Shield size={12} />
                            <span>Account-scoped · Secrets encrypted</span>
                        </div>

                        {onTenantMode && (
                            <button className="login-tenant-link" onClick={onTenantMode} type="button">
                                Resident? Sign in here
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
