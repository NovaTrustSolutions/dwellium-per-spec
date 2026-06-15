import { useCallback, useEffect, useRef, useState } from 'react';
import { getGoogleClientId, loadGoogleIdentityServices } from '../../services/googleIdentity';
import './GoogleSignInButton.css';

interface GoogleSignInButtonProps {
    onCredential: (credential: string) => Promise<{ success: boolean; error?: string }>;
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
            {busy && <span className="google-signin__status">Signing in with Google...</span>}
            {error && <div role="alert" className="google-signin__error">{error}</div>}
        </div>
    );
}
