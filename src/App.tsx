import { useEffect, useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { UserProvider, useUser } from './context/UserContext';
import { PermissionsProvider } from './context/PermissionsContext';
import { HierarchyProvider } from './context/HierarchyContext';
import { WindowProvider, useWindows } from './context/WindowContext';
import { LayoutProvider } from './context/LayoutContext';
import QueryProvider from './providers/QueryProvider';
import Sidebar from './components/Sidebar/Sidebar';
import Desktop from './components/Shell/Desktop';
import CommandPalette from './components/CommandPalette/CommandPalette';
import LoginScreen from './components/Auth/LoginScreen';
import TenantLoginScreen from './components/Auth/TenantLoginScreen';
import TenantPortal from './components/TenantPortal/TenantPortal';
import SecurityPortal from './components/SecurityPortal/SecurityPortal';
import OpenJarvisWidget from './components/OpenJarvis/OpenJarvis'; // Unified Antigravity widget
import { PopupShell, type DockBackMessage } from './components/PopupShell/PopupShell';
import './styles/global.css';
import './styles/skins.css';
import './App.css';

function ShellLayout() {
    const { windows, closeWindow, openWindow } = useWindows();

    // ── Prevent browser back button from crashing the SPA ──
    // The app uses React state for navigation, not URL routing.
    // Without this, pressing browser back navigates away and causes a white screen.
    useEffect(() => {
        // Push an initial history state so there's something to "go back" to
        window.history.pushState({ dwellium: true }, '', window.location.href);

        const handlePopState = () => {
            // Re-push state to keep the user on the page
            window.history.pushState({ dwellium: true }, '', window.location.href);
        };

        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    // ── Restore saved skin on mount ──
    useEffect(() => {
        const savedSkin = localStorage.getItem('dwellium-skin') || 'default';
        document.documentElement.setAttribute('data-skin', savedSkin);

        // Listen for skin changes dispatched from ControlPanel
        const onSkinChange = (e: CustomEvent) => {
            const skin = e.detail as string;
            document.documentElement.setAttribute('data-skin', skin);
            localStorage.setItem('dwellium-skin', skin);
        };
        window.addEventListener('qualia-skin-change', onSkinChange as EventListener);
        return () => window.removeEventListener('qualia-skin-change', onSkinChange as EventListener);
    }, []);

    // ── Block all file drag-and-drop outside designated drop zones ──
    // Prevents accidental file drops from navigating away or causing errors.
    // Components like TranscriptionHub's upload area call e.stopPropagation()
    // on their own drop handlers, so they still work normally.
    useEffect(() => {
        const blockDrag = (e: DragEvent) => {
            // Allow if the target has an explicit drop zone class
            const target = e.target as HTMLElement;
            if (target?.closest?.('.th-mock-upload-area') || target?.closest?.('.file-manager')) return;
            e.preventDefault();
            e.dataTransfer!.effectAllowed = 'none';
            e.dataTransfer!.dropEffect = 'none';
        };

        const blockDrop = (e: DragEvent) => {
            const target = e.target as HTMLElement;
            if (target?.closest?.('.th-mock-upload-area') || target?.closest?.('.file-manager')) return;
            e.preventDefault();
        };

        window.addEventListener('dragover', blockDrag, true);
        window.addEventListener('dragenter', blockDrag, true);
        window.addEventListener('drop', blockDrop, true);

        return () => {
            window.removeEventListener('dragover', blockDrag, true);
            window.removeEventListener('dragenter', blockDrag, true);
            window.removeEventListener('drop', blockDrop, true);
        };
    }, []);

    // ── Dock-back listener: popup sends postMessage → shell docks widget into quadrant ──
    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            try {
                const msg = e.data as DockBackMessage;
                if (msg?.type !== 'qualia-dock-back') return;
                const { component, title, icon } = msg;
                if (!component) return;
                // Focus this window so user sees it
                window.focus();
                // Open the widget in the best available quadrant
                openWindow(component, title || component, icon || '🪟');
                window.dispatchEvent(new CustomEvent('qualia-toast', {
                    detail: `"${title}" docked back ↩`,
                }));
            } catch { /* ignore malformed messages */ }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [openWindow]);

    // Global keyboard shortcuts
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Cmd/Ctrl+W to close the topmost window
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                const visible = windows.filter(w => !w.minimized);
                if (visible.length > 0) {
                    const topWindow = visible.reduce((a, b) => a.zIndex > b.zIndex ? a : b);
                    closeWindow(topWindow.id);
                }
            }
            // Cmd+Shift+2 — open Two Brains split-screen
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '2') {
                e.preventDefault();
                window.dispatchEvent(new CustomEvent('qualia-open-widget', { detail: 'two-brains' }));
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [windows, closeWindow]);

    return (
        <div className="shell">
            <Sidebar />
            <Desktop />
            <CommandPalette />
            <OpenJarvisWidget />
        </div>
    );
}

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

    if (!isAuthenticated) {
        return tenantMode
            ? <TenantLoginScreen onBackToAdmin={() => setTenantMode(false)} />
            : <LoginScreen onTenantMode={() => setTenantMode(true)} />;
    }

    // Tenant users get their own portal
    if (role === 'tenant') {
        return (
            <>
                <TenantPortal />
                <OpenJarvisWidget />
            </>
        );
    }

    return (
        <PermissionsProvider>
            <LayoutProvider>
                <HierarchyProvider>
                    <WindowProvider>
                        <ShellLayout />
                    </WindowProvider>
                </HierarchyProvider>
            </LayoutProvider>
        </PermissionsProvider>
    );
}

export default function App() {
    // Path-based routing for standalone portals
    if (window.location.pathname === '/security') {
        return <SecurityPortal />;
    }

    // Popup mode: /?popup=ComponentName — render just that widget, no sidebar/desktop
    const popupParam = new URLSearchParams(window.location.search).get('popup');
    if (popupParam) {
        return (
            <ThemeProvider>
                <UserProvider>
                    <QueryProvider>
                        <PermissionsProvider>
                            <PopupShell component={popupParam} />
                        </PermissionsProvider>
                    </QueryProvider>
                </UserProvider>
            </ThemeProvider>
        );
    }

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
