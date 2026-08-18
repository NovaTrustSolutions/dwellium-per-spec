import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginScreen, { LOCAL_ACCOUNTS } from '../components/Auth/LoginScreen';

const auth = vi.hoisted(() => ({
    login: vi.fn(),
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

/** Gate → credential form (045-D2: no account picker in between). */
function passGate() {
    fireEvent.change(screen.getByLabelText('Access password'), { target: { value: GATE } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
}

describe('LoginScreen local multi-step login', () => {
    beforeEach(() => {
        auth.login.mockReset();
        auth.login.mockResolvedValue({ success: true });
        auth.loginLocal.mockReset();
        auth.loginWithGoogle.mockReset();
    });

    it('does not request the nebula video until the user clicks; poster shows first', () => {
        const { container } = render(<LoginScreen />);

        // Before interaction: poster is set and NO <source> for nebula is rendered,
        // so the browser never fetches nebula-bg-1280.mp4 on first paint.
        const video = container.querySelector('video.login-video-bg') as HTMLVideoElement | null;
        expect(video).not.toBeNull();
        expect(video!.getAttribute('poster')).toBe('/assets/hero-bg.webp');
        expect(video!.getAttribute('preload')).toBe('none');
        expect(container.querySelector('source[src*="nebula"]')).toBeNull();

        // Clicking the "Click to Login" overlay opts in → the <source> mounts.
        fireEvent.click(screen.getByText('Click to Login'));
        expect(container.querySelector('source[src*="nebula"]')).not.toBeNull();
    });

    it('gates on the access password before showing the credential form, with Google hidden by default', () => {
        render(<LoginScreen onTenantMode={() => undefined} />);

        expect(screen.getByLabelText('Access password')).toBeInTheDocument();
        expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /resident\? sign in here/i })).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Access password'), { target: { value: 'nope' } });
        fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

        expect(screen.getByText(/incorrect access password/i)).toBeInTheDocument();
        expect(screen.queryByLabelText('Email')).not.toBeInTheDocument();
    });

    it('after the gate, goes straight to email + password (no account picker) and signs in', async () => {
        render(<LoginScreen />);
        passGate();

        // One form: no roster / avatars in between (045-D2).
        expect(document.querySelectorAll('.login-avatar')).toHaveLength(0);
        expect(screen.queryByRole('button', { name: /Andy/ })).not.toBeInTheDocument();
        expect(screen.getByLabelText('Email')).toBeInTheDocument();
        expect(screen.getByLabelText('Password')).toBeInTheDocument();

        // Unknown email → same generic error, nothing called.
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'nobody@example.com' } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: andy.password } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(auth.login).not.toHaveBeenCalled();
        expect(screen.getByText(/incorrect email or password/i)).toBeInTheDocument();

        // Wrong password → no login, error shown.
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: andy.email } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(auth.login).not.toHaveBeenCalled();
        expect(auth.loginLocal).not.toHaveBeenCalled();
        expect(screen.getByText(/incorrect email or password/i)).toBeInTheDocument();

        // Correct creds → REAL backend session via login(); loginLocal is NOT
        // used on the happy path (F-016 hardening).
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: andy.password } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        await vi.waitFor(() => {
            expect(auth.login).toHaveBeenCalledWith(andy.email, andy.backendPassword);
        });
        expect(auth.loginLocal).not.toHaveBeenCalled();
    });

    it('offers EXPLICIT offline entry only when the server is unreachable', async () => {
        auth.login.mockResolvedValue({ success: false, error: 'Cannot reach server', offline: true });
        render(<LoginScreen />);
        passGate();
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: andy.email } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: andy.password } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

        // No silent session: loginLocal only fires after the explicit choice.
        const offlineBtn = await screen.findByRole('button', { name: /continue offline/i });
        expect(auth.loginLocal).not.toHaveBeenCalled();
        fireEvent.click(offlineBtn);
        expect(auth.loginLocal).toHaveBeenCalledWith({
            id: andy.id,
            name: 'Andy',
            email: andy.email,
            role: 'god',
        });
    });

    it('surfaces a server credential rejection instead of entering the shell', async () => {
        auth.login.mockResolvedValue({ success: false, error: 'Invalid credentials' });
        render(<LoginScreen />);
        passGate();
        fireEvent.change(screen.getByLabelText('Email'), { target: { value: andy.email } });
        fireEvent.change(screen.getByLabelText('Password'), { target: { value: andy.password } });
        fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
        expect(await screen.findByText(/server rejected/i)).toBeInTheDocument();
        expect(auth.loginLocal).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: /continue offline/i })).not.toBeInTheDocument();
    });
});
