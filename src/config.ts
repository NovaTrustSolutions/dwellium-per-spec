/**
 * Qualia Shell — Centralized Configuration
 *
 * All runtime configuration values live here.
 * Environment variables are injected at build time via Vite's
 * `import.meta.env.VITE_*` convention.
 */

/** Backend API base URL — no trailing slash */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
