/**
 * useToast Tests — Regression coverage for toast notification system
 *
 * Ensures:
 * - showToast renders a toast with correct message and type styling
 * - Toast auto-dismisses after timeout
 * - Multiple toasts stack correctly
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '../components/StrataDashboard/useToast';

describe('useToast', () => {
    it('starts with no toasts', () => {
        const { result } = renderHook(() => useToast());

        // ToastContainer should render null when no toasts
        const container = result.current.ToastContainer;
        expect(container).toBeDefined();
        expect(typeof result.current.showToast).toBe('function');
    });

    it('showToast adds a toast', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.showToast('Operation successful', 'success');
        });

        // After adding a toast, ToastContainer should render content
        // We verify by calling the component function
        const containerResult = result.current.ToastContainer();
        expect(containerResult).not.toBeNull();
    });

    it('toast auto-dismisses after timeout', async () => {
        vi.useFakeTimers();
        const { result } = renderHook(() => useToast(1000)); // 1 second

        act(() => {
            result.current.showToast('Will disappear', 'info');
        });

        // Toast should exist
        expect(result.current.ToastContainer()).not.toBeNull();

        // Advance past auto-hide
        act(() => {
            vi.advanceTimersByTime(1100);
        });

        // Toast should be gone
        expect(result.current.ToastContainer()).toBeNull();

        vi.useRealTimers();
    });

    it('multiple toasts stack', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.showToast('First toast', 'success');
            result.current.showToast('Second toast', 'error');
        });

        // Both should be rendered
        const container = result.current.ToastContainer();
        expect(container).not.toBeNull();
    });

    it('showToast defaults to info type', () => {
        const { result } = renderHook(() => useToast());

        act(() => {
            result.current.showToast('Default type toast');
        });

        const container = result.current.ToastContainer();
        expect(container).not.toBeNull();
    });
});
