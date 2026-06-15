import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen, { LOCAL_ACCOUNTS } from '../components/Auth/LoginScreen';

const auth = vi.hoisted(() => ({
    loginLocal: vi.fn(),
    loginWithGoogle: vi.fn(),
}));

vi.mock('../context/UserContext', () => ({
    useUser: () => auth,
}));

vi.mock('../components/Auth/GoogleSignInButton', () => ({
    default: ({ onCredential }: { onCredential: (credential: string) => Promise<unknown> }) => (
        <button onClick={() => void onCredential('google-id-token')}>Continue with Google</button>
    ),
}));

const GATE = 'Comet2878!';
const andy = LOCAL_ACCOUNTS.find((a) => a.name === 'Andy')!;

describe('LoginScreen local multi-step login', () => {
    beforeEach(() => {
        auth.loginLocal.mockReset();
        auth.loginWithGoogle.mockReset();
    });

    it('gates on the access password before showing the roster, with Google hidden by default', () => {
        render(<LoginScreen />);

        expect(screen.getByLabelText('Access password')).toBeInTheDocument();
        expect(document.querySelectorAll('.login-avatar__name')).toHaveLength(0);
        expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Access password'), { target: { value: 'nope' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        expect(screen.getByText(/incorrect access password/i)).toBeInTheDocument();
        expect(document.querySelectorAll('.login-avatar__name')).toHaveLength(0);
    });

    it('after the gate, signs a user in with their own email + password', () => {
        render(<LoginScreen />);

        fireEvent.change(screen.getByLabelText('Access password'), { target: { value: GATE } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        const names = [...document.querySelectorAll('.login-avatar__name')].map((n) => n.textContent);
        expect(names).toEqual(['Andy', 'Lisa', 'Archi']);
        expect(screen.getByRole('button', { name: /Lisa/ })).toBeDisabled();

        fireEvent.click(screen.getByRole('button', { name: /Andy/ }));
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();

        // Wrong password → no login, error shown.
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: andy.email } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(auth.loginLocal).not.toHaveBeenCalled();
        expect(screen.getByText(/incorrect email or password/i)).toBeInTheDocument();

        // Correct creds → loginLocal with the stable id + role.
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: andy.password } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(auth.loginLocal).toHaveBeenCalledWith({
            id: andy.id,
            name: 'Andy',
            email: andy.email,
            role: 'god',
        });
    });
});
