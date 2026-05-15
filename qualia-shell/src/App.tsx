import { Suspense, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import { PermissionsProvider } from './context/PermissionsContext';
import QueryProvider from './providers/QueryProvider';
import LoginScreen from './components/Auth/LoginScreen';
import AppSuspenseFallback from './components/Shell/AppSuspenseFallback';
import { lazyWithReload } from './utils/lazyWithReload';
import './styles/global.css';
import './styles/skins.css';
import './App.css';

// Phase-7 Task 7.10 — top-level lazy candidates per Cowork Verdict #1
// (lazyWithReload sister-altitude to 30+ widgetRegistry.ts data points)
// + Verdict #5 (AdminShell wrapper consolidates admin-only providers +
// shell components). LoginScreen stays eager — it's the initial-paint
// default at `/` and lazy-loading it would defeat the LCP-reduction lever.
const AdminShell = lazyWithReload(() => import('./components/Shell/AdminShell'));
const TenantLoginScreen = lazyWithReload(() => import('./components/Auth/TenantLoginScreen'));
const TenantPortal = lazyWithReload(() => import('./components/TenantPortal/TenantPortal'));
const SecurityPortal = lazyWithReload(() => import('./components/SecurityPortal/SecurityPortal'));
// PopupShell is a NAMED export (not default) — map to default for lazyWithReload.
const PopupShell = lazyWithReload(() =>
    import('./components/PopupShell/PopupShell').then((m) => ({ default: m.PopupShell })),
);
const OpenJarvisWidget = lazyWithReload(() => import('./components/OpenJarvis/OpenJarvis'));

/** Auth gate — shows login screen until authenticated */
function AuthGate() {
    const { isAuthenticated, isLoading, role } = useUser();
    const [tenantMode, setTenantMode] = useState(false);

    if (isLoading) {
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
                    Validating session…
                </div>
            </div>
        );
    }

    // Branch 3 — AuthGate-internal Suspense per Cowork Verdict #2.
    // Wraps the lazy children (TenantLoginScreen / TenantPortal / AdminShell);
    // eager LoginScreen renders pass-through without showing the fallback.
    return (
        <Suspense fallback={<AppSuspenseFallback variant="viewport" />}>
            {!isAuthenticated ? (
                tenantMode
                    ? <TenantLoginScreen onBackToAdmin={() => setTenantMode(false)} />
                    : <LoginScreen onTenantMode={() => setTenantMode(true)} />
            ) : role === 'tenant' ? (
                <>
                    <TenantPortal />
                    <OpenJarvisWidget />
                </>
            ) : (
                <PermissionsProvider>
                    <AdminShell />
                </PermissionsProvider>
            )}
        </Suspense>
    );
}

export default function App() {
    // Branch 1 — security-portal: standalone /security route per Cowork
    // Verdict #2. SecurityPortal fills the entire viewport (no shell).
    if (window.location.pathname === '/security') {
        return (
            <Suspense fallback={<AppSuspenseFallback variant="viewport" label="Loading security portal…" />}>
                <SecurityPortal />
            </Suspense>
        );
    }

    // Branch 2 — popup mode: /?popup=ComponentName — render just that widget,
    // no sidebar/desktop. Compact popup-fill fallback per Cowork Verdict #2.
    const popupParam = new URLSearchParams(window.location.search).get('popup');
    if (popupParam) {
        return (
            <ThemeProvider>
                <UserProvider>
                    <QueryProvider>
                        <PermissionsProvider>
                            <Suspense fallback={<AppSuspenseFallback variant="popup" />}>
                                <PopupShell component={popupParam} />
                            </Suspense>
                        </PermissionsProvider>
                    </QueryProvider>
                </UserProvider>
            </ThemeProvider>
        );
    }

    // Default branch — AuthGate wraps the lazy admin-shell / tenant-portal
    // / tenant-login-screen children inside Branch 3 Suspense.
    return (
        <ThemeProvider>
            <UserProvider>
                <QueryProvider>
                    <AuthGate />
                </QueryProvider>
            </UserProvider>
        </ThemeProvider>
    );
}
