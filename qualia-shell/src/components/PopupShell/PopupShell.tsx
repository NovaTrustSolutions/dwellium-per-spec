import { Suspense, useEffect, useState } from 'react';
import { AppWindow, Hourglass } from 'lucide-react';
import { WINDOW_COMPONENTS } from '../Shell/Desktop';
import { WIDGET_REGISTRY } from '../../registry/widgetRegistry';
import { LayoutProvider } from '../../context/LayoutContext';
import { HierarchyProvider } from '../../context/HierarchyContext';
import { WindowProvider } from '../../context/WindowContext';
import { requestDockBack } from '../../lib/popoutDock';
import '../../styles/global.css';
import '../../styles/skins.css';

export function PopupShell({ component }: { component: string }) {
    const Component = WINDOW_COMPONENTS[component] as React.FC | undefined;
    // Registry label is the honest default title (falls back to the raw id).
    const registryLabel = WIDGET_REGISTRY[component]?.label ?? component;
    const [meta, setMeta] = useState<{ title: string; icon: string }>({ title: registryLabel, icon: '' });
    const [docking, setDocking] = useState(false);
    const [dockError, setDockError] = useState('');

    // Restore theme + skin + load metadata
    useEffect(() => {
        // HTML master themes only (cosmos default). Legacy ids → cosmos.
        const VALID = new Set(['cosmos','deep-dark','simple-black','cyberpunk','synthwave','solarized','rose-pine','mocha','dracula','obsidian','tokyo-night','gruvbox','apple-dark','nord','latte','corporate']);
        const stored = localStorage.getItem('dwellium-theme') || localStorage.getItem('qualia-theme') || 'cosmos';
        const savedTheme = VALID.has(stored) ? stored : 'cosmos';
        document.documentElement.className = `theme-${savedTheme}`;
        document.documentElement.setAttribute('data-theme', savedTheme);

        // Skin system retired — force no-override default so themes own the palette.
        document.documentElement.setAttribute('data-skin', 'default');

        const popupKey = `dwellium-popup-${component}`;
        let title = registryLabel;
        let icon = '';
        try {
            const stored = JSON.parse(localStorage.getItem(popupKey) || '{}');
            title = stored.title || registryLabel;
            icon = stored.icon || '';
        } catch { /* ignore — registry label stands */ }
        setMeta({ title, icon });
        // Document title even when localStorage is unreadable/absent.
        document.title = `${icon ? `${icon} ` : ''}${title} — Qualia`;
    }, [component, registryLabel]);

    // Dock back: ask a main Dwellium window to adopt this widget (opener
    // postMessage, else BroadcastChannel). The popup closes ONLY after a main
    // window acks; on timeout it keeps the widget and says so honestly.
    const handleDockBack = async () => {
        setDocking(true);
        setDockError('');
        const acked = await requestDockBack({ component, title: meta.title, icon: meta.icon });
        if (acked) {
            window.close();
            return;
        }
        setDocking(false);
        setDockError("Couldn't dock — main window not found");
    };

    if (!Component) {
        return (
            <div style={{
                position: 'fixed', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg-desktop, #000000)', color: 'var(--text-secondary, #868F97)',
                fontFamily: "var(--font-primary, 'Hanken Grotesk', -apple-system, sans-serif)", fontSize: 14,
            }}>
                Unknown widget: <code style={{ marginLeft: 8 }}>{component}</code>
            </div>
        );
    }

    return (
        <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', flexDirection: 'column',
            background: 'var(--bg-desktop, #000000)',
            overflow: 'hidden',
            fontFamily: "var(--font-primary, 'Hanken Grotesk', -apple-system, sans-serif)",
        }}>
            {/* ── Popup Titlebar with Dock Back ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '0 14px',
                height: 40,
                flexShrink: 0,
                background: '#0e0e0e',
                borderBottom: '1px solid #222222',
                userSelect: 'none',
            }}>
                <span style={{ fontSize: 16, display: 'inline-flex', alignItems: 'center' }}>{meta.icon ? meta.icon : <AppWindow size={16} aria-hidden />}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text-primary, #ffffff)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {meta.title}
                </span>
                <span role={dockError ? 'alert' : undefined} style={{ fontSize: 11, color: dockError ? 'var(--accent, #D6FE51)' : 'var(--text-tertiary, #555555)', marginRight: 4 }}>
                    {dockError || 'Standalone window'}
                </span>
                {/* Dock Back button */}
                <button
                    onClick={handleDockBack}
                    disabled={docking}
                    title="Send this widget back into the Qualia shell (dock back)"
                    style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 12px',
                        background: docking ? 'color-mix(in srgb, var(--accent) 30%, transparent)' : 'color-mix(in srgb, var(--accent) 10%, transparent)',
                        border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                        borderRadius: 4,
                        color: 'var(--accent)',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: docking ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        transition: 'all 0.15s ease',
                        letterSpacing: '0.01em',
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                        if (!docking) {
                            (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 20%, transparent)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--accent) 50%, transparent)';
                        }
                    }}
                    onMouseLeave={e => {
                        if (!docking) {
                            (e.currentTarget as HTMLButtonElement).style.background = 'color-mix(in srgb, var(--accent) 10%, transparent)';
                            (e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--accent) 30%, transparent)';
                        }
                    }}
                >
                    {docking ? <><Hourglass size={13} aria-hidden /> Docking…</> : '⇤ Dock Back'}
                </button>
            </div>

            {/* ── Widget Content ──
                Popup mode bypasses AdminShell, so widgets that call
                useHierarchy / useWindows / useLayout (ara-console, file-manager,
                notepad, control-panel, etc.) would throw "must be used within
                Provider" without these wrappers. AdminShell.tsx stacks the
                same three providers around <Sidebar /> + <Desktop />.
                height: calc(100% - 40px) ensures children with height:100%
                (like strata-shell) resolve against a concrete pixel height. */}
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', height: 'calc(100% - 40px)' }}>
                <Suspense fallback={
                    <div style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--accent)', fontSize: 13,
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
