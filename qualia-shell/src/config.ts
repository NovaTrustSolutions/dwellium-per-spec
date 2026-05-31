/**
 * Qualia Shell — Centralized Configuration
 *
 * All runtime configuration values live here.
 * Environment variables are injected at build time via Vite's
 * `import.meta.env.VITE_*` convention.
 */

/**
 * Backend API base URL — no trailing slash.
 *
 * Resolution order:
 *   1. Explicit build-time override `VITE_API_URL` (use this when the frontend
 *      and backend live on different hosts).
 *   2. In a browser on a NON-localhost origin with no override → the SAME origin
 *      (relative ''), so a deployed build calls its own `/api/*` (where a reverse
 *      proxy routes to the backend) instead of a hard-coded `http://localhost:3000`
 *      it can never reach. This was the silent failure behind "it doesn't send".
 *   3. Otherwise (local dev, or SSR with no `window`) → `http://localhost:3000`.
 */
function resolveApiBase(): string {
    const explicit = import.meta.env.VITE_API_URL as string | undefined;
    if (explicit) return explicit.replace(/\/$/, '');
    if (typeof window !== 'undefined' && window.location) {
        const host = window.location.hostname;
        const isLocal =
            host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '[::1]';
        if (!isLocal) return ''; // same-origin relative — deployed builds hit their own /api/*
    }
    return 'http://localhost:3000';
}

export const API_BASE = resolveApiBase();
