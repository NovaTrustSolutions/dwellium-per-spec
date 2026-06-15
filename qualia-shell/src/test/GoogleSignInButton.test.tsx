import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import GoogleSignInButton from '../components/Auth/GoogleSignInButton';

describe('GoogleSignInButton', () => {
    let callback: ((response: { credential: string }) => void) | null = null;

    beforeEach(() => {
        vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'client.apps.googleusercontent.com');
        callback = null;
        (window as any).google = {
            accounts: {
                id: {
                    initialize: vi.fn((config: { callback: typeof callback }) => { callback = config.callback; }),
                    renderButton: vi.fn((host: HTMLElement) => {
                        const button = document.createElement('button');
                        button.textContent = 'Google account';
                        button.onclick = () => callback?.({ credential: 'google-id-token' });
                        host.appendChild(button);
                    }),
                },
            },
        };
    });

    afterEach(() => {
        delete (window as any).google;
        vi.unstubAllEnvs();
    });

    it('passes the Google ID token to the Dwellium session exchange', async () => {
        const onCredential = vi.fn().mockResolvedValue({ success: true });
        render(<GoogleSignInButton onCredential={onCredential} />);

        await waitFor(() => expect(screen.getByText('Google account')).toBeInTheDocument());
        fireEvent.click(screen.getByText('Google account'));

        await waitFor(() => expect(onCredential).toHaveBeenCalledWith('google-id-token'));
    });
});
