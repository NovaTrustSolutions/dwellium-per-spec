/**
 * api.ts — Single source of truth for all API base URLs
 *
 * Every component must import from here instead of defining its own API_BASE.
 * This prevents the 4-different-API_BASE problem in InboxZero.
 */

/** Root backend URL (e.g. http://localhost:3000) */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/** Inbox endpoints */
export const INBOX_API = `${API_BASE}/api/inbox`;

/** Security endpoints */
export const SECURITY_API = `${API_BASE}/api/security`;

/** v1 versioned prefix */
export const API_V1 = `${API_BASE}/api/v1`;

/** Convenience: build a full API URL */
export function apiUrl(path: string): string {
    return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}
