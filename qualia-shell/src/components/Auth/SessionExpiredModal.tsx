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
import { useUser } from '../../context/UserContext';
import GoogleSignInButton from './GoogleSignInButton';

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

export default function SessionExpiredModal() {
    const { user, loginWithGoogle, logout } = useUser();

    return (
        <div role="dialog" aria-modal="true" aria-label="Session expired" style={overlay}>
            <div style={card}>
                <h2 style={title}>Session expired</h2>
                <p style={sub}>
                    Sign in with {user?.email || 'the same Google account'} to pick up right where you left off.
                    Your workspace is still open behind this.
                </p>
                <GoogleSignInButton onCredential={loginWithGoogle} />
                <button type="button" onClick={logout} style={secondaryBtn}>
                    Log out instead
                </button>
            </div>
        </div>
    );
}
