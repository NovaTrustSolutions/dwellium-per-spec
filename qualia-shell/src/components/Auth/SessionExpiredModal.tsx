/**
 * SessionExpiredModal — recoverable re-authentication.
 *
 * Rendered by AuthGate ONLY when the backend has definitively rejected the
 * session (UserContext `sessionExpired === true`) while a user is still present.
 * It overlays the existing shell — open windows, layout, and in-progress work
 * stay mounted behind it — so signing back in resumes exactly where the user
 * left off, instead of bouncing them to the login screen and losing state.
 *
 * On a successful login(), UserContext flips `sessionExpired` back to false and
 * this modal unmounts automatically. "Log out instead" performs a full logout.
 */
import { useState, type FormEvent } from 'react';
import { useUser } from '../../context/UserContext';
import GoogleSignInButton from './GoogleSignInButton';
import { getEffectiveAccounts, isPasswordSet } from './localAccounts';

const overlay: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 2147483000, // above all shell windows
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(6, 8, 16, 0.72)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    fontFamily: 'Inter, -apple-system, sans-serif',
};

const card: React.CSSProperties = {
    width: 'min(92vw, 380px)',
    padding: '28px 26px',
    borderRadius: 14,
    background: '#0f1422',
    border: '1px solid rgba(99,102,241,0.28)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    color: '#e5e9f0',
};

const title: React.CSSProperties = { margin: 0, fontSize: 18, fontWeight: 650 };
const sub: React.CSSProperties = { margin: 0, fontSize: 13, lineHeight: 1.5, color: '#9aa4b8' };
const secondaryBtn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
    background: 'transparent', color: '#9aa4b8', fontSize: 13,
    border: '1px solid rgba(148,163,184,0.22)',
};
const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9,
    background: 'rgba(148,163,184,0.08)', color: '#e5e9f0', fontSize: 14,
    border: '1px solid rgba(148,163,184,0.22)', outline: 'none',
};
const errorBox: React.CSSProperties = {
    margin: 0, padding: '10px 12px', borderRadius: 9, fontSize: 13,
    background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.35)', color: '#fca5a5',
};
const divider: React.CSSProperties = { textAlign: 'center', fontSize: 12, color: '#6b7280', margin: '2px 0' };

export default function SessionExpiredModal({
    heading,
    message,
    onDismiss,
}: {
    /** Override the "Session expired" heading (e.g. local-account upgrade flow). */
    heading?: string;
    /** Override the default explainer line. */
    message?: string;
    /** When provided, shows a dismiss button (used by the non-forced local-account flow). */
    onDismiss?: () => void;
}) {
    const { user, login, loginLocal, loginWithGoogle, logout } = useUser();
    // 2026-08-18 (Ilya hit this live): backend sessions last 72 h and there is
    // no refresh route, so this modal is a ROUTINE event — and the seeded
    // accounts sign in with a PASSWORD, not Google. Google alone trapped the
    // user when its verification failed. Password re-auth mirrors
    // LoginScreen.submitCredential exactly (local gate → backend login →
    // explicit offline fallback) so behaviour is identical to a fresh login.
    const [email, setEmail] = useState(user?.email ?? '');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [offlineOffer, setOfflineOffer] = useState(false);

    const resolveAccount = () => {
        const wanted = email.trim().toLowerCase();
        return getEffectiveAccounts().find(a => a.enabled && a.email.toLowerCase() === wanted) ?? null;
    };

    const submitPassword = async (event: FormEvent) => {
        event.preventDefault();
        setError('');
        setOfflineOffer(false);
        const acct = resolveAccount();
        if (!acct || !isPasswordSet(acct) || password !== acct.password) {
            setError('Incorrect email or password.');
            return;
        }
        setBusy(true);
        const result = await login(acct.email, acct.backendPassword ?? password);
        setBusy(false);
        if (result.success) return; // UserContext flips sessionExpired → modal unmounts
        if (result.offline) { setOfflineOffer(true); return; }
        setError(result.error || 'Server sign-in failed.');
    };

    const continueOffline = () => {
        const acct = resolveAccount();
        if (!acct) return;
        loginLocal({ id: acct.id, name: acct.name, email: acct.email, role: acct.role });
    };

    return (
        <div role="dialog" aria-modal="true" aria-label={heading ?? 'Session expired'} style={overlay}>
            <div style={card}>
                <h2 style={title}>{heading ?? 'Session expired'}</h2>
                <p style={sub}>
                    {message ?? `Sign in again as ${user?.email || 'your account'} to pick up right where you left off. Your workspace is still open behind this.`}
                </p>
                <form onSubmit={submitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <input
                        type="email"
                        aria-label="Email"
                        placeholder="Email"
                        autoComplete="username"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        style={input}
                    />
                    <input
                        type="password"
                        aria-label="Password"
                        placeholder="Password"
                        autoComplete="current-password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        style={input}
                        // eslint-disable-next-line jsx-a11y/no-autofocus -- modal re-auth: password is the only action
                        autoFocus
                    />
                    {error && <p role="alert" style={errorBox}>{error}</p>}
                    {offlineOffer && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <p style={sub}>Server unreachable — continue offline? Changes sync when it's back.</p>
                            <button type="button" className="btn-secondary" onClick={continueOffline}>Continue offline</button>
                        </div>
                    )}
                    <button type="submit" className="btn-primary" disabled={busy || !password}>
                        {busy ? 'Signing in…' : 'Sign in with password'}
                    </button>
                </form>
                <div style={divider}>or</div>
                <GoogleSignInButton onCredential={loginWithGoogle} />
                {onDismiss ? (
                    <button type="button" onClick={onDismiss} style={secondaryBtn}>
                        Not now
                    </button>
                ) : (
                    <button type="button" onClick={logout} style={secondaryBtn}>
                        Log out instead
                    </button>
                )}
            </div>
        </div>
    );
}
