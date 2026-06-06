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
const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#9aa4b8' };
const input: React.CSSProperties = {
    padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(148,163,184,0.28)',
    background: '#0a0e1a', color: '#e5e9f0', fontSize: 14, outline: 'none',
};
const errBox: React.CSSProperties = {
    fontSize: 12.5, color: '#fca5a5', background: 'rgba(239,68,68,0.12)',
    border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 10px',
};
const primaryBtn: React.CSSProperties = {
    padding: '10px 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
    background: '#6366f1', color: '#fff', fontSize: 14, fontWeight: 600,
};
const secondaryBtn: React.CSSProperties = {
    padding: '8px 14px', borderRadius: 9, cursor: 'pointer',
    background: 'transparent', color: '#9aa4b8', fontSize: 13,
    border: '1px solid rgba(148,163,184,0.22)',
};

export default function SessionExpiredModal() {
    const { user, login, logout } = useUser();
    const [email, setEmail] = useState(user?.email ?? '');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const onSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError(null);
        const res = await login(email, password);
        setBusy(false);
        if (!res.success) {
            setError(res.error || 'Sign in failed. Please try again.');
            return;
        }
        // Success → UserContext clears `sessionExpired`; this modal unmounts.
    };

    return (
        <div role="dialog" aria-modal="true" aria-label="Session expired" style={overlay}>
            <form onSubmit={onSubmit} style={card}>
                <h2 style={title}>Session expired</h2>
                <p style={sub}>
                    Your session timed out. Sign in to pick up right where you left off —
                    your workspace is still open behind this.
                </p>
                <label style={label}>
                    Email
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="username"
                        style={input}
                        required
                    />
                </label>
                <label style={label}>
                    Password
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete="current-password"
                        autoFocus
                        style={input}
                        required
                    />
                </label>
                {error && <div role="alert" style={errBox}>{error}</div>}
                <button type="submit" disabled={busy} style={primaryBtn}>
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
                <button type="button" onClick={logout} style={secondaryBtn}>
                    Log out instead
                </button>
            </form>
        </div>
    );
}
