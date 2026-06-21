/**
 * LoginScreen — local account authority for Dwellium.
 *
 * Flow: splash "Click to login" → shared access password → user selection
 * (Andy / Lisa / Archi) → that user's own email + password. Validated
 * client-side against LOCAL_ACCOUNTS, then handed to `loginLocal`, which builds
 * a stable-id session so each user's LLM keys + saved workflows persist and stay
 * isolated. Local-first: these credentials are a gate, not hardened security.
 *
 * Google login is retained behind VITE_GOOGLE_LOGIN=true (off by default).
 */

import { useState, type FormEvent } from 'react';
import { useUser } from '../../context/UserContext';
import { AlertCircle, ArrowLeft, Shield } from 'lucide-react';
import GoogleSignInButton from './GoogleSignInButton';
import { useEffectiveAccounts, isPasswordSet, ROLE_LABELS, type LocalAccount } from './localAccounts';
import './LoginScreen.css';

// Re-exported so tests (and any importer) can read the base roster.
export { LOCAL_ACCOUNTS } from './localAccounts';

/** Shared access password (stage 1 gate). */
const GATE_PASSWORD = 'Comet2878!';

/** Google login is kept in the code but hidden unless explicitly enabled. */
const GOOGLE_LOGIN_ENABLED = (import.meta.env.VITE_GOOGLE_LOGIN as string | undefined) === 'true';

type Stage = 'gate' | 'select' | 'credential';

interface LoginScreenProps {
    onTenantMode?: () => void;
}

export default function LoginScreen({ onTenantMode }: LoginScreenProps) {
    const { loginLocal, loginWithGoogle } = useUser();
    const effectiveAccounts = useEffectiveAccounts();
    const [hasClicked, setHasClicked] = useState(false);
    const [stage, setStage] = useState<Stage>('gate');
    const [gateInput, setGateInput] = useState('');
    const [selected, setSelected] = useState<LocalAccount | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const submitGate = (event?: FormEvent) => {
        event?.preventDefault();
        setError('');
        if (gateInput === GATE_PASSWORD) {
            setGateInput('');
            setStage('select');
        } else {
            setError('Incorrect access password.');
        }
    };

    const pickAccount = (account: LocalAccount) => {
        if (!account.enabled) return;
        setSelected(account);
        setEmail('');
        setPassword('');
        setError('');
        setStage('credential');
    };

    const submitCredential = (event?: FormEvent) => {
        event?.preventDefault();
        setError('');
        if (!selected) return;
        // Re-resolve against current overrides (Archi may have just set it).
        const acct = effectiveAccounts.find(a => a.id === selected.id) ?? selected;
        if (!isPasswordSet(acct)) {
            setError('Password not set yet — ask the Architect to set it in Control Panel → Accounts.');
            return;
        }
        const emailOk = email.trim().toLowerCase() === acct.email.toLowerCase();
        const passwordOk = password === acct.password;
        if (emailOk && passwordOk) {
            loginLocal({ id: acct.id, name: acct.name, email: acct.email, role: acct.role });
        } else {
            setError('Incorrect email or password.');
        }
    };

    const backToSelect = () => {
        setSelected(null);
        setEmail('');
        setPassword('');
        setError('');
        setStage('select');
    };

    return (
        <>
            <video
                className="login-video-bg"
                poster="/assets/hero-bg.png"
                muted
                loop
                playsInline
                preload="none"
                autoPlay={hasClicked}
                key={hasClicked ? 'play' : 'idle'}
            >
                {hasClicked && <source src="/assets/nebula-bg.mp4" type="video/mp4" />}
            </video>

            <div
                className={`login-start-overlay ${hasClicked ? 'is-hidden' : ''}`}
                onClick={() => setHasClicked(true)}
            >
                <div className="login-start-text">Click to Login</div>
            </div>

            <div className={`login-backdrop ${hasClicked ? 'is-active' : ''}`}>
                <div className="login-bg-orb login-bg-orb--1" />
                <div className="login-bg-orb login-bg-orb--2" />
                <div className="login-bg-orb login-bg-orb--3" />

                <div className="login-container">
                    <div className="login-header">
                        <img src="/assets/astra-strata-logo.png" alt="AstraStrata Property Management" className="login-logo-img" />
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
                                    autoFocus
                                />
                                <button type="submit" className="login-primary-btn" disabled={!gateInput}>Continue</button>
                            </form>
                        )}

                        {stage === 'select' && (
                            <div className="login-step">
                                <span className="login-quick__label">Select Account</span>
                                <h2>Who's signing in?</h2>
                                <div className="login-quick__grid">
                                    {effectiveAccounts.map((account) => (
                                        <button
                                            key={account.id}
                                            type="button"
                                            className={`login-avatar spotlight-card ${account.enabled ? '' : 'is-disabled'}`}
                                            onClick={() => pickAccount(account)}
                                            disabled={!account.enabled}
                                            title={account.enabled ? `${account.name} — ${ROLE_LABELS[account.role] ?? account.role}` : `${account.name} — coming soon`}
                                        >
                                            <div className="login-avatar__circle" style={{ background: account.color }}>{account.initials}</div>
                                            <span className="login-avatar__name">{account.name}</span>
                                            <span className="login-avatar__role" style={{ color: account.enabled ? account.color : 'var(--text-tertiary)' }}>
                                                {account.enabled ? (ROLE_LABELS[account.role] ?? account.role) : 'Coming soon'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {stage === 'credential' && selected && (
                            <form className="login-step" onSubmit={submitCredential}>
                                <button type="button" className="login-back" onClick={backToSelect}>
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <div className="login-credential__who">
                                    <div className="login-avatar__circle" style={{ background: selected.color }}>{selected.initials}</div>
                                    <div className="login-credential__who-text">
                                        <strong>{selected.name}</strong>
                                        <span>{ROLE_LABELS[selected.role] ?? selected.role}</span>
                                    </div>
                                </div>
                                <input
                                    type="email"
                                    className="login-input"
                                    aria-label="Email"
                                    placeholder="Email"
                                    autoComplete="username"
                                    value={email}
                                    onChange={(event) => setEmail(event.target.value)}
                                    autoFocus
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
                                <button type="submit" className="login-primary-btn" disabled={!email || !password}>Sign in</button>
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
