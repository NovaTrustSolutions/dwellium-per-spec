/**
 * App version, derived at build time from the commit count as ⌊n/100⌋.(n mod 100)
 * via the `__APP_VERSION__` define in vite.config.ts (e.g. 100→"1.0", 213→"2.13").
 * It refreshes on every deploy. Falls back to "0.0" in any context where the
 * define isn't applied (vitest, SSR pre-build) — `typeof` keeps that safe.
 */
export const APP_VERSION: string = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0';
