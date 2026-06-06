import { Suspense, useState } from 'react';
import { BrowserRouter, Routes, Route, useSearchParams } from 'react-router';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import { PermissionsProvider } from './context/PermissionsContext';
import QueryProvider from './providers/QueryProvider';
import LoginScreen from './components/Auth/LoginScreen';
import SessionExpiredModal from './components/Auth/SessionExpiredModal';
import AppSuspenseFallback from './components/Shell/AppSuspenseFallback';
import BackendConnectionBanner from './components/Shell/BackendConnectionBanner';
import { lazyWithReload } from './utils/lazyWithReload';
import './styles/global.css';
import './styles/skins.css';
import './App.css';

// Phase-7 Task 7.10 — top-level lazy candidates per Cowork Verdict #1
// (lazyWithReload sister-altitude to 30+ widgetRegistry.ts data points)
// + Verdict #5 (AdminShell wrapper consolidates admin-only providers +
// shell components). LoginScreen stays eager — it's the initial-paint
// default at `/` and lazy-loading it would defeat the LCP-reduction lever.
// Phase-8+ Task 8.2 preserves all 6 lazyWithReload imports unchanged
// (library-mode RR v7 migration; Option β LOCK; framework-mode adoption
// deferred to Task 8.6).
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
    const { isAuthenticated, isLoading, role, sessionExpired } = useUser();
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

    // Branch 3 — AuthGate-internal Suspense per Phase-7 Task 7.10 Cowork Verdict #2.
    // Wraps the lazy children (TenantLoginScreen / TenantPortal / AdminShell);
    // eager LoginScreen renders pass-through without showing the fallback.
    return (
        <>
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
            {/* Recoverable re-auth: a definitively-dead session keeps the shell
               mounted and overlays this modal instead of bouncing to login. */}
            {isAuthenticated && sessionExpired && <SessionExpiredModal />}
        </>
    );
}

// Phase-8+ Task 8.2 — route component: /security (Branch 1 semantic preserved).
// Standalone viewport-fill; no provider tree (sister to original Branch 1 shape).
// Phase-8+ Task 8.6 — promoted from local function to named export to bridge
// RR v7 framework-mode route registry at `qualia-shell/app/routes/security.tsx`.
export function SecurityRoute() {
    return (
        <Suspense fallback={<AppSuspenseFallback variant="viewport" label="Loading security portal…" />}>
            <SecurityPortal />
        </Suspense>
    );
}

// Phase-8+ Task 8.2 — route component: default (Branches 2 + 3 semantic preserved).
// Uses useSearchParams() hook to read ?popup= query param declaratively
// (replaces imperative URLSearchParams(window.location.search) at original L89).
// Popup branch retains 4-provider tree (Theme + User + Query + Permissions);
// AuthGate default branch retains 3-provider tree (Theme + User + Query;
// PermissionsProvider remains scoped to admin-shell sub-branch inside AuthGate).
// Phase-8+ Task 8.6 — promoted from local function to named export to bridge
// RR v7 framework-mode route registry at `qualia-shell/app/routes/default.tsx`.
export function DefaultRoute() {
    const [searchParams] = useSearchParams();
    const popupParam = searchParams.get('popup');

    // Branch 2 — popup mode: /?popup=ComponentName render just that widget,
    // no sidebar/desktop. Compact popup-fill fallback.
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

    // Branch 3 — default: AuthGate wraps the lazy admin-shell / tenant-portal
    // / tenant-login-screen children inside its internal Suspense.
    return (
        <ThemeProvider>
            <UserProvider>
                <QueryProvider>
                    <BackendConnectionBanner />
                    <AuthGate />
                </QueryProvider>
            </UserProvider>
        </ThemeProvider>
    );
}

// Phase-8+ Task 8.2 — declarative routing migration via react-router v7 library-mode.
// Replaces original imperative routing at L79 (window.location.pathname) + L89
// (URLSearchParams(window.location.search)) with <BrowserRouter> + <Routes> +
// <Route> declarative shape. 3-branch routing semantics preserved byte-for-byte:
//   - /security        → SecurityRoute (Branch 1; viewport-fill; no providers)
//   - /?popup=key      → DefaultRoute → popup conditional (Branch 2; 4 providers)
//   - / (default + any other path via splat) → DefaultRoute → AuthGate (Branch 3; 3 providers)
// Option β Cowork verdict (Q-α-vs-β LOCKED at PRE0): library-mode RR v7 at Task 8.2;
// framework-mode adoption (@react-router/dev plugin + app/ directory + entry.client.tsx)
// deferred to Task 8.6 per original Phase_8_Plan §4 Block A/B partition.
export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/security" element={<SecurityRoute />} />
                <Route path="*" element={<DefaultRoute />} />
            </Routes>
        </BrowserRouter>
    );
}
