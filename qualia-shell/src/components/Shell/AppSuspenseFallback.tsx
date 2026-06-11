/**
 * AppSuspenseFallback — Phase-7 Task 7.10 shared Suspense fallback for
 * App.tsx's 3 branch-local Suspense boundaries (security-portal / popup /
 * AuthGate-internal).
 *
 * Two altitude-matched variants per Cowork Verdict #4 at Task 7.10 PRE0:
 *  - "viewport": full-viewport branded spinner; sister-shape to AuthGate
 *    isLoading at App.tsx L145-162. Used by Branch 1 (security-portal) and
 *    Branch 3 (AuthGate-internal lazy children: TenantLoginScreen /
 *    TenantPortal / AdminShell). Default label "Loading…".
 *  - "popup": compact text-only fallback; sister-shape to PopupShell's
 *    existing internal Suspense fallback at PopupShell.tsx L130-139.
 *    Used by Branch 2 (popup). Default label "Loading widget…".
 *
 * The `spin` keyframe animation is defined globally at `styles/global.css`
 * (used by AuthGate isLoading + Desktop WidgetLoader).
 */

interface Props {
    variant: 'viewport' | 'popup';
    label?: string;
}

export default function AppSuspenseFallback({ variant, label }: Props) {
    if (variant === 'popup') {
        return (
            <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--accent)', fontSize: 13,
            }}>
                {label ?? 'Loading widget…'}
            </div>
        );
    }

    // variant === 'viewport'
    // UIX-21: branded loading screen — token bg + ambient accent glow + glowing
    // ring (lazy boundaries fire app-wide, so this screen is seen often)
    return (
        <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'radial-gradient(60% 50% at 50% 40%, color-mix(in srgb, var(--accent) 4%, transparent) 0%, transparent 70%), var(--bg-desktop, #000)',
            color: 'var(--text-tertiary)', fontSize: 14,
            fontFamily: 'var(--font-primary, "Hanken Grotesk", -apple-system, sans-serif)',
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: 28, height: 28, margin: '0 auto 14px',
                    border: '2px solid color-mix(in srgb, var(--accent) 25%, transparent)', borderTopColor: 'var(--accent)',
                    borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                    boxShadow: '0 0 16px color-mix(in srgb, var(--accent) 20%, transparent)',
                }} />
                {label ?? 'Loading…'}
            </div>
        </div>
    );
}
