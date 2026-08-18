/**
 * SessionExpiredModal — password re-auth (2026-08-18, Ilya hit the Google-only
 * trap live: 72 h backend sessions expire, Google verification failed, no
 * password path). Mirrors LoginScreen.submitCredential.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SessionExpiredModal from '../components/Auth/SessionExpiredModal';
import { LOCAL_ACCOUNTS } from '../components/Auth/localAccounts';

const auth = vi.hoisted(() => ({
    user: { email: 'andy@dwellium.com', name: 'Andy' },
    login: vi.fn(),
    loginLocal: vi.fn(),
    loginWithGoogle: vi.fn(),
    logout: vi.fn(),
}));
vi.mock('../context/UserContext', () => ({ useUser: () => auth }));
vi.mock('../components/Auth/GoogleSignInButton', () => ({
    default: () => <button>Continue with Google</button>,
}));

const andy = LOCAL_ACCOUNTS.find(a => a.name === 'Andy')!;

function fillAndSubmit(password: string, email = andy.email) {
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: password } });
    fireEvent.click(screen.getByRole('button', { name: /sign in with password/i }));
}

describe('SessionExpiredModal password re-auth', () => {
    beforeEach(() => {
        auth.login.mockReset().mockResolvedValue({ success: true });
        auth.loginLocal.mockReset();
    });

    it('offers a password path (email prefilled) alongside Google and Log out', () => {
        render(<SessionExpiredModal />);
        expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('andy@dwellium.com');
        expect(screen.getByRole('button', { name: /sign in with password/i })).toBeTruthy();
        expect(screen.getByText('Continue with Google')).toBeTruthy();
        expect(screen.getByRole('button', { name: /log out instead/i })).toBeTruthy();
    });

    it('correct local password → backend login() with the account backend password', async () => {
        render(<SessionExpiredModal />);
        fillAndSubmit(andy.password);
        await waitFor(() => expect(auth.login).toHaveBeenCalledWith(andy.email, andy.backendPassword ?? andy.password));
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('wrong password → inline error, no backend call', async () => {
        render(<SessionExpiredModal />);
        fillAndSubmit('nope');
        expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
        expect(auth.login).not.toHaveBeenCalled();
    });

    it('backend offline → explicit "Continue offline" → loginLocal (workspace kept)', async () => {
        auth.login.mockResolvedValue({ success: false, offline: true });
        render(<SessionExpiredModal />);
        fillAndSubmit(andy.password);
        const offline = await screen.findByRole('button', { name: /continue offline/i });
        fireEvent.click(offline);
        expect(auth.loginLocal).toHaveBeenCalledWith(expect.objectContaining({ email: andy.email, role: andy.role }));
    });
});
