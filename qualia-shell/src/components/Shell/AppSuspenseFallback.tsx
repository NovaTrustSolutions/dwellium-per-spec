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
                color: '#6366f1', fontSize: 13,
            }}>
                {label ?? 'Loading widget…'}
            </div>
        );
    }

    // variant === 'viewport'
    return (
        <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#0a0e1a', color: '#64748b', fontSize: 14,
            fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{
                    width: 24, height: 24, margin: '0 auto 12px',
                    border: '2px solid rgba(99,102,241,0.3)', borderTopColor: '#6366f1',
                    borderRadius: '50%', animation: 'spin 0.6s linear infinite',
                }} />
                {label ?? 'Loading…'}
            </div>
        </div>
    );
}
