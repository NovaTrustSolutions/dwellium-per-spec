/**
 * "Use a different Google account" flow (2026-07-02): the GIS personalized
 * button pins to the browser's primary Google session with no chooser. The
 * fallback launches the OAuth implicit id_token flow with
 * prompt=select_account, which always shows Google's account picker.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { startSelectAccountSignIn } from '../components/Auth/GoogleSignInButton';

describe('startSelectAccountSignIn', () => {
    let assigned: string | null = null;

    beforeEach(() => {
        assigned = null;
        sessionStorage.clear();
        vi.stubGlobal('location', {
            ...window.location,
            origin: 'https://argyleholocron.netlify.app',
            assign: (url: string) => { assigned = url; },
        });
    });

    it('navigates to the Google auth endpoint with prompt=select_account and an id_token response', () => {
        startSelectAccountSignIn('client-123.apps.googleusercontent.com');
        expect(assigned).toBeTruthy();
        const url = new URL(assigned!);
        expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
        expect(url.searchParams.get('prompt')).toBe('select_account');
        expect(url.searchParams.get('response_type')).toBe('id_token');
        expect(url.searchParams.get('client_id')).toBe('client-123.apps.googleusercontent.com');
        expect(url.searchParams.get('redirect_uri')).toBe('https://argyleholocron.netlify.app/');
        expect(url.searchParams.get('scope')).toBe('openid email profile');
    });

    it('stashes matching state + nonce for the redirect-return verification', () => {
        startSelectAccountSignIn('client-123');
        const url = new URL(assigned!);
        expect(url.searchParams.get('state')).toBe(sessionStorage.getItem('dwellium-google-state'));
        expect(url.searchParams.get('nonce')).toBe(sessionStorage.getItem('dwellium-google-nonce'));
        expect(url.searchParams.get('state')).toBeTruthy();
        expect(url.searchParams.get('nonce')).toBeTruthy();
    });
});
