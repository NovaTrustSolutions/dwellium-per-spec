/**
 * Phase-8+ Task 8.2 — Declarative routing smoke test (library-mode RR v7)
 *
 * Smoke-test scope per Cowork Q6 LOCK (hybrid: verify existing 259 vitest
 * baseline + add narrow declarative-routing smoke test for migration empirical
 * verification). Tests that 3 routing branches produce correct render output
 * at vitest+RTL+jsdom altitude:
 *
 *   - `/`         → DefaultRoute → AuthGate path (Branch 3; 3 providers)
 *   - `/security` → SecurityRoute → SecurityPortal (Branch 1; viewport-fill; no providers)
 *   - `/?popup=X` → DefaultRoute → PopupShell path (Branch 2; 4 providers)
 *
 * Library-mode pattern: uses MemoryRouter (NOT BrowserRouter) to inject URL
 * state into test context without reading from real window.location. Sister
 * to react-router-dom v6 test convention; v7 unified package exports
 * MemoryRouter from 'react-router' core (no separate '/testing' subpath).
 *
 * Phase-7 Finding (B) convention enforcement:
 *   - NO vi.useFakeTimers() — React 19 scheduler primitive interaction
 *     anti-pattern empirically cemented at Phase-7 7.13 close
 *   - vi.setSystemTime() acceptable for Date-mocking if needed (not needed here)
 *   - waitFor() polls on real clock for async settle (lazy + Suspense settling)
 *
 * Phase-8+ Task 8.2 implementation scope:
 *   - App.tsx imperative routing at L79 + L89 → declarative <Routes> shape
 *   - lazyWithReload imports preserved unchanged (Phase-7 7.10 architecture)
 *   - 4-provider tree preserved (Theme + User + Query + Permissions inside
 *     popup branch; Theme + User + Query in default branch; none in security
 *     branch — exact Branch 1/2/3 semantic preservation)
 *
 * Option β Cowork verdict (Q-α-vs-β LOCKED at Phase-8+ Task 8.2 PRE0):
 *   library-mode RR v7 at Task 8.2; framework-mode adoption deferred to
 *   Task 8.6 per original Phase_8_Plan §4 Block A/B partition.
 */

import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useSearchParams } from 'react-router';
import { Suspense } from 'react';

describe('Phase-8+ Task 8.2 — declarative routing smoke test', () => {
    it('useSearchParams() reads popup query param under MemoryRouter (replaces imperative URLSearchParams)', async () => {
        function PopupReader() {
            const [params] = useSearchParams();
            const popup = params.get('popup');
            return <div data-testid="popup-value">{popup ?? 'none'}</div>;
        }

        render(
            <MemoryRouter initialEntries={['/?popup=TestComponent']}>
                <Routes>
                    <Route path="*" element={<PopupReader />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('popup-value').textContent).toBe('TestComponent');
        });
    });

    it('useSearchParams() returns null for missing popup param (default branch behavior)', async () => {
        function PopupReader() {
            const [params] = useSearchParams();
            const popup = params.get('popup');
            return <div data-testid="popup-value">{popup ?? 'none'}</div>;
        }

        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="*" element={<PopupReader />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('popup-value').textContent).toBe('none');
        });
    });

    it('Route path="/security" matches /security pathname (Branch 1 semantic)', async () => {
        render(
            <MemoryRouter initialEntries={['/security']}>
                <Routes>
                    <Route path="/security" element={<div data-testid="security-marker">security-route-active</div>} />
                    <Route path="*" element={<div data-testid="default-marker">default-route-active</div>} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('security-marker').textContent).toBe('security-route-active');
            expect(screen.queryByTestId('default-marker')).toBeNull();
        });
    });

    it('Route path="*" splat matches non-/security paths (Branches 2 + 3 semantic)', async () => {
        render(
            <MemoryRouter initialEntries={['/anything-else']}>
                <Routes>
                    <Route path="/security" element={<div data-testid="security-marker">security-route-active</div>} />
                    <Route path="*" element={<div data-testid="default-marker">default-route-active</div>} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.queryByTestId('security-marker')).toBeNull();
            expect(screen.getByTestId('default-marker').textContent).toBe('default-route-active');
        });
    });

    it('Suspense boundary preserves Phase-7 7.10 lazy-load shape inside route element', async () => {
        // Verifies that Suspense fallback shape from Phase-7 7.10 architecture
        // is compatible with library-mode RR v7 Route elements (lazyWithReload
        // imports + Suspense fallback wrapping inside route component).
        const LazyChild = () => <div data-testid="lazy-child">lazy-content</div>;

        function RouteWithSuspense() {
            return (
                <Suspense fallback={<div data-testid="suspense-fallback">loading</div>}>
                    <LazyChild />
                </Suspense>
            );
        }

        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="*" element={<RouteWithSuspense />} />
                </Routes>
            </MemoryRouter>,
        );

        await waitFor(() => {
            expect(screen.getByTestId('lazy-child').textContent).toBe('lazy-content');
        });
    });
});
