import { useCallback, useEffect, useRef, useState } from 'react';
import { getGoogleClientId, loadGoogleIdentityServices } from '../../services/googleIdentity';
import './GoogleSignInButton.css';

interface GoogleSignInButtonProps {
    onCredential: (credential: string) => Promise<{ success: boolean; error?: string }>;
}

/**
 * Full account-chooser fallback (2026-07-02). The GIS personalized button pins
 * to the browser's primary Google session with no way to pick another account.
 * This launches the OAuth implicit ID-token flow with `prompt=select_account`,
 * which ALWAYS shows Google's account picker. The redirect lands back on the
 * app origin with `#id_token=…`; UserContext's mount handler verifies
 * state+nonce and completes the same backend login as the GIS button.
 * Requires `<origin>/` registered as an Authorized redirect URI on the client.
 */
export function startSelectAccountSignIn(clientId: string): void {
    const rand = () => {
        try { return crypto.randomUUID().replace(/-/g, ''); } catch { return `${Date.now()}${Math.random()}`.replace(/\./g, ''); }
    };
    const nonce = rand();
    const state = rand();
    try {
        sessionStorage.setItem('dwellium-google-nonce', nonce);
        sessionStorage.setItem('dwellium-google-state', state);
    } catch { /* sandboxed */ }
    const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'id_token',
        scope: 'openid email profile',
        redirect_uri: `${window.location.origin}/`,
        nonce,
        state,
        prompt: 'select_account',
    });
    window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

export default function GoogleSignInButton({ onCredential }: GoogleSignInButtonProps) {
    const hostRef = useRef<HTMLDivElement>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const clientId = getGoogleClientId();

    const handleCredential = useCallback(async (response: { credential?: string }) => {
        if (!response.credential || busy) return;
        setBusy(true);
        setError('');
        const result = await onCredential(response.credential);
        if (!result.success) setError(result.error || 'Google sign-in failed');
        setBusy(false);
    }, [busy, onCredential]);

    useEffect(() => {
        let active = true;
        if (!clientId) {
            setError('Google login needs VITE_GOOGLE_CLIENT_ID configured.');
            return;
        }
        void loadGoogleIdentityServices()
            .then(() => {
                if (!active || !hostRef.current) return;
                const accounts = (window as any).google?.accounts?.id;
                if (!accounts) throw new Error('Google Identity Services is unavailable');
                accounts.initialize({
                    client_id: clientId,
                    callback: handleCredential,
                    auto_select: false,
                });
                hostRef.current.replaceChildren();
                accounts.renderButton(hostRef.current, {
                    theme: 'outline',
                    size: 'large',
                    shape: 'pill',
                    text: 'continue_with',
                    width: 320,
                });
            })
            .catch((err) => {
                if (active) setError(err instanceof Error ? err.message : 'Google sign-in failed to load');
            });
        return () => { active = false; };
    }, [clientId, handleCredential]);

    return (
        <div className={`google-signin ${busy ? 'google-signin--busy' : ''}`}>
            <div ref={hostRef} className="google-signin__button" aria-label="Continue with Google" />
            {clientId && (
                <button
                    type="button"
                    onClick={() => startSelectAccountSignIn(clientId)}
                    style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: '#8ab4f8', fontSize: 12.5, padding: '6px 4px 0',
                        textDecoration: 'underline', textUnderlineOffset: 3,
                    }}
                >
                    Use a different Google account
                </button>
            )}
            {busy && <span className="google-signin__status">Signing in with Google...</span>}
            {error && <div role="alert" className="google-signin__error">{error}</div>}
        </div>
    );
}
