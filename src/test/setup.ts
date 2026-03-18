/**
 * Test Setup — Global configuration for Vitest + jsdom
 *
 * Provides:
 * - @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 * - localStorage stub
 * - fetch mock helper
 */

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';

// ── localStorage stub ──────────────────────────────────────────────────────
const storage: Record<string, string> = {};

const localStorageMock: Storage = {
    getItem: (key: string) => storage[key] ?? null,
    setItem: (key: string, value: string) => { storage[key] = value; },
    removeItem: (key: string) => { delete storage[key]; },
    clear: () => { Object.keys(storage).forEach(k => delete storage[k]); },
    get length() { return Object.keys(storage).length; },
    key: (index: number) => Object.keys(storage)[index] ?? null,
};

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// ── Reset between tests ────────────────────────────────────────────────────
afterEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
});
