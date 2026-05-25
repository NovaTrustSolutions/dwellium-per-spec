import { Suspense, useEffect, useState } from 'react';
import { WINDOW_COMPONENTS } from '../Shell/Desktop';
import { LayoutProvider } from '../../context/LayoutContext';
import { HierarchyProvider } from '../../context/HierarchyContext';
import { WindowProvider } from '../../context/WindowContext';
import '../../styles/global.css';
import '../../styles/skins.css';

// Dock-back message type the main shell listens for
export interface DockBackMessage {
    type: 'qualia-dock-back';
    component: string;
    title: string;
    icon: string;
}

export function PopupShell({ component }: { component: string }) {
    const Component = WINDOW_COMPONENTS[component] as React.FC | undefined;
    const [meta, setMeta] = useState<{ title: string; icon: string }>({ title: component, icon: '🪟' });
    const [docking, setDocking] = useState(false);

    // Restore skin + load metadata
    useEffect(() => {
        const savedSkin = localStorage.getItem('dwellium-skin') || 'default';
        document.documentElement.setAttribute('data-skin', savedSkin);

        const popupKey = `dwellium-popup-${component}`;
        try {
            const stored = JSON.parse(localStorage.getItem(popupKey) || '{}');
            const title = stored.title || component;
            const icon = stored.icon || '🪟';
            setMeta({ title, icon });
            document.title = `${icon} ${title} — Qualia`;
        } catch { /* ignore */ }
    }, [component]);

    // Dock back: send to main window and close popup
    const handleDockBack = () => {
        if (!window.opener) {
            alert('Cannot dock back — main window is closed. Open Qualia and try again.');
            return;
        }
        setDocking(true);
        const msg: DockBackMessage = {
            type: 'qualia-dock-back',
            component,
            title: meta.title,
            icon: meta.icon,
        };
        // postMessage to the parent/opener window
        window.opener.postMessage(msg, window.opener.location?.origin ?? '*');
        // Give it 300ms then close self
        setTimeout(() => window.close(), 300);
    };

    if (!Component) {
        return (
            <div style={{
                position: 'fixed', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-base, #0d1117)', color: 'var(--text-secondary, #94a3b8)',
                fontFamily: 'Inter, -apple-system, sans-serif', fontSize: 14,
            }}>
                Unknown widget: <code style={{ marginLeft: 8 }}>{component}</code>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-base, #0d1117)',
            overflow: 'hidden',
            fontFamily: 'Inter, -apple-system, sans-serif',
        }}>
            {/* ── Popup Titlebar with Dock Back ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 14px',
                height: 40,
                flexShrink: 0,
                background: 'rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
                userSelect: 'none',
            }}>
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #e2e8f0)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta.title}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary, #64748b)', marginRight: 4 }}>
                    Standalone window
                </span>
                {/* Dock Back button */}
                <button
                    onClick={handleDockBack}
                    disabled={docking}
                    title="Send this widget back into the Qualia shell (dock back)"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 12px',
                        background: docking ? 'rgba(99,102,241,0.3)' : 'rgba(99,102,241,0.15)',
                        border: '1px solid rgba(99,102,241,0.35)',
                        borderRadius: 8,
                        color: '#a5b4fc',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: docking ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                        letterSpacing: '0.01em',
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                        if (!docking) {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.28)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.6)';
                        }
                    }}
                    onMouseLeave={e => {
                        if (!docking) {
                            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(99,102,241,0.15)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(99,102,241,0.35)';
                        }
                    }}
                >
                    {docking ? '⏳ Docking…' : '⇤ Dock Back'}
                </button>
            </div>

            {/* ── Widget Content ──
                Popup mode bypasses AdminShell, so widgets that call
                useHierarchy / useWindows / useLayout (ara-console, file-manager,
                notepad, control-panel, etc.) would throw "must be used within
                Provider" without these wrappers. AdminShell.tsx stacks the
                same three providers around <Sidebar /> + <Desktop />. */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Suspense fallback={
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#6366f1', fontSize: 13,
                    }}>
                        Loading widget…
                    </div>
                }>
                    <LayoutProvider>
                        <HierarchyProvider>
                            <WindowProvider>
                                <Component />
                            </WindowProvider>
                        </HierarchyProvider>
                    </LayoutProvider>
                </Suspense>
            </div>
        </div>
    );
}
