/**
 * Strata API — router / module barrel.
 *
 * Routes every call to either the real backend (strataApi.backend) or
 * the in-memory fixtures + localStorage stub (strataApi.static).
 *
 *   VITE_USE_STATIC_API=true   → static mode (no backend dependency)
 *   VITE_USE_STATIC_API=false  → backend mode (default; hits /api/dwellium)
 *   (unset)                    → backend mode
 *
 * The shape contract (PaginatedResponse, function signatures) is
 * identical in both impls — callers can't tell which one they're
 * talking to. This lets Playwright baselines, dev-box setups, and
 * sandboxed CI runs all work without the sibling backend running.
 */

import * as backendImpl from './strataApi.backend';
import * as staticImpl from './strataApi.static';

// Vite inlines import.meta.env.VITE_* at build time. String compare is
// deliberate — env vars are always strings when set via CLI/.env.
const RAW_FLAG = import.meta.env.VITE_USE_STATIC_API;
const USE_STATIC =
    RAW_FLAG === true || RAW_FLAG === 'true' || RAW_FLAG === '1';

const impl = USE_STATIC ? staticImpl : backendImpl;

// Task 2.8 — module-level static-mode detection. SentimentModule
// imports this to short-circuit POST writes in static-mode builds.
// Must use the canonical USE_STATIC derivation (3-form aware: true,
// 'true', '1') — inline `import.meta.env.VITE_USE_STATIC_API ===
// 'true'` checks at the module level would silently diverge from the
// router's own routing decision when the flag is set as boolean true
// or '1', causing static-mode builds to send POSTs to a backend that
// isn't there.
export const isStaticMode = USE_STATIC;

// One-shot console breadcrumb so devs can tell which mode is active.
// Using a window flag to dedupe across HMR reloads.
if (typeof window !== 'undefined' && !(window as any).__strataApiModeLogged) {
    (window as any).__strataApiModeLogged = true;
    // eslint-disable-next-line no-console
    console.info(
        `[strataApi] mode=${USE_STATIC ? 'static (fixtures + localStorage)' : 'backend (/api/dwellium proxy)'}`
    );
}

export function strataGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    return impl.strataGet<T>(path, params);
}

export function strataPost<T>(path: string, body: unknown): Promise<T> {
    return impl.strataPost<T>(path, body);
}

// Task 3.8 — multipart upload precedent. Mirrors strataPost shape but
// takes FormData directly (not a JSON body). Backend mode forwards the
// FormData via fetch without a Content-Type header (the browser sets
// the multipart boundary automatically); static mode constructs a
// mock-shape response from the FormData fields. Established here for
// CorporateReview's /upload path; reusable for any future multipart
// surfaces.
export function strataUpload<T>(path: string, formData: FormData): Promise<T> {
    return impl.strataUpload<T>(path, formData);
}

export function strataPut<T>(path: string, body: unknown): Promise<T> {
    return impl.strataPut<T>(path, body);
}

export function strataDelete(path: string): Promise<void> {
    return impl.strataDelete(path);
}

// ── Cursor Pagination ──────────────────────────────────────
// Re-export PaginatedResponse type so existing imports from strataTypes
// and consumers continue to resolve. Both impls export the same shape.
export type PaginatedResponse<T> = backendImpl.PaginatedResponse<T>;

export function strataGetPaginated<T>(
    path: string,
    params?: Record<string, string>
): Promise<PaginatedResponse<T>> {
    return impl.strataGetPaginated<T>(path, params);
}
