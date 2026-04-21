/**
 * useA11y.ts — Accessibility utility hooks
 *
 * Provides reusable A11y primitives:
 *  - useFocusTrap: Traps focus within a container (for modals/dialogs)
 *  - useAnnounce: Sends live region announcements for screen readers
 *  - useTabNavigation: Keyboard arrow-nav + ARIA for tab interfaces
 */

import { useRef, useEffect, useCallback } from 'react';

// ── Focus Trap ──────────────────────────────────────────────────
/**
 * Traps Tab / Shift+Tab focus inside a container element.
 * Restores focus to the previously-focused element on unmount.
 *
 * @param active — whether the trap is active (e.g. modal is open)
 * @returns ref to attach to the trapping container
 */
export function useFocusTrap<T extends HTMLElement = HTMLDivElement>(active: boolean) {
    const containerRef = useRef<T>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!active) return;

        // Save the currently focused element so we can restore it on close
        previousFocusRef.current = document.activeElement as HTMLElement;

        const container = containerRef.current;
        if (!container) return;

        // Focus the first focusable element (or the container itself)
        const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

        const firstFocusable = container.querySelector<HTMLElement>(focusableSelector);
        requestAnimationFrame(() => {
            if (firstFocusable) firstFocusable.focus();
            else container.focus();
        });

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;

            const focusables = Array.from(container.querySelectorAll<HTMLElement>(focusableSelector));
            if (focusables.length === 0) return;

            const first = focusables[0];
            const last = focusables[focusables.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        };

        container.addEventListener('keydown', handleKeyDown);
        return () => {
            container.removeEventListener('keydown', handleKeyDown);
            // Restore focus
            previousFocusRef.current?.focus();
        };
    }, [active]);

    return containerRef;
}


// ── Live Region Announcer ───────────────────────────────────────
/**
 * Returns an `announce` function that pushes text into a hidden
 * ARIA live region so screen readers speak it.
 *
 * The live region (`#a11y-live-region`) must exist in the DOM.
 * See SkipToContent component below for the mount point.
 */
export function useAnnounce() {
    return useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
        let region = document.getElementById('a11y-live-region');
        if (!region) {
            region = document.createElement('div');
            region.id = 'a11y-live-region';
            region.className = 'sr-only';
            region.setAttribute('aria-live', 'polite');
            region.setAttribute('aria-atomic', 'true');
            document.body.appendChild(region);
        }

        // Change aria-live if assertive
        region.setAttribute('aria-live', priority);

        // Clear → set (forces re-announce even if same text)
        region.textContent = '';
        requestAnimationFrame(() => {
            region!.textContent = message;
        });
    }, []);
}


// ── Tab Navigation Helper ───────────────────────────────────────
/**
 * Returns props + handlers for a keyboard-navigable tab interface.
 * Supports Left/Right arrow key navigation and Home/End.
 *
 * @param tabs — array of tab objects with `id` keys
 * @param activeTabId — the currently selected tab id
 * @param onSelect — callback when a tab is selected via keyboard
 */
export function useTabNavigation(
    tabs: { id: string }[],
    activeTabId: string,
    onSelect: (id: string) => void,
) {
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        const currentIdx = tabs.findIndex(t => t.id === activeTabId);
        if (currentIdx < 0) return;

        let nextIdx: number | undefined;

        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
                e.preventDefault();
                nextIdx = (currentIdx + 1) % tabs.length;
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                nextIdx = (currentIdx - 1 + tabs.length) % tabs.length;
                break;
            case 'Home':
                e.preventDefault();
                nextIdx = 0;
                break;
            case 'End':
                e.preventDefault();
                nextIdx = tabs.length - 1;
                break;
        }

        if (nextIdx !== undefined) {
            onSelect(tabs[nextIdx].id);
            // Focus the newly active tab button
            const tabEl = document.getElementById(`tab-${tabs[nextIdx].id}`);
            tabEl?.focus();
        }
    }, [tabs, activeTabId, onSelect]);

    /** Get ARIA props for a tab button */
    const getTabProps = useCallback((tabId: string) => ({
        id: `tab-${tabId}`,
        role: 'tab' as const,
        'aria-selected': tabId === activeTabId,
        'aria-controls': `tabpanel-${tabId}`,
        tabIndex: tabId === activeTabId ? 0 : -1,
    }), [activeTabId]);

    /** Get ARIA props for the tab panel */
    const getPanelProps = useCallback((tabId: string) => ({
        id: `tabpanel-${tabId}`,
        role: 'tabpanel' as const,
        'aria-labelledby': `tab-${tabId}`,
        tabIndex: 0,
    }), []);

    return { handleKeyDown, getTabProps, getPanelProps };
}
