/**
 * AdminShell — Phase-7 Task 7.10 admin-shell wrapper consolidation.
 *
 * Consolidates the admin-only branch of App.tsx (post-auth, non-tenant role)
 * into a single dynamically-imported chunk per Cowork Bonus Verdict #5 at
 * Task 7.10 PRE0 close. Wraps the 3 admin-only providers
 * (LayoutProvider / HierarchyProvider / WindowProvider) + ShellLayout
 * (Sidebar / Desktop / CommandPalette / OpenJarvisWidget) so they move out
 * of the eager index chunk and into the AdminShell lazy chunk.
 *
 * Cumulative LoC moved into AdminShell chunk: ~5,201
 * (1,104 providers + 4,097 components).
 *
 * PermissionsProvider stays eager at the App.tsx outer layer (shared by the
 * popup branch); LoginScreen stays eager (initial-paint default at `/`).
 *
 * ShellLayout below is moved verbatim from App.tsx L22-138 — five useEffects
 * (popstate / skin / drag-and-drop / dock-back / keyboard shortcuts) plus
 * the shell-div render. Behavior unchanged; only the module boundary moved.
 */

import { useEffect } from 'react';
import { LayoutProvider } from '../../context/LayoutContext';
import { HierarchyProvider } from '../../context/HierarchyContext';
import { WindowProvider, useWindows } from '../../context/WindowContext';
import Sidebar from '../Sidebar/Sidebar';
import Desktop from './Desktop';
import CommandPalette from '../CommandPalette/CommandPalette';
import OpenJarvisWidget from '../OpenJarvis/OpenJarvis';
import type { DockBackMessage } from '../PopupShell/PopupShell';

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

export default function AdminShell() {
    return (
        <LayoutProvider>
            <HierarchyProvider>
                <WindowProvider>
                    <ShellLayout />
                </WindowProvider>
            </HierarchyProvider>
        </LayoutProvider>
    );
}
