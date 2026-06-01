/**
 * backendStatus — turn a raw fetch/throw message into an honest, user-facing
 * reason, and tell whether a failure is "the backend isn't running" vs a real
 * application error.
 *
 * Why: across the app, a failed data load used to surface either nothing
 * (silent catch) or a cryptic "Failed to fetch". When the cause is simply that
 * the Dwellium backend isn't up, the UI should SAY that — so the user isn't
 * left wondering whether their data is gone or the app is broken.
 */

// Network-level failures a browser/fetch produces when the host is unreachable
// (Chrome "Failed to fetch", Safari "Load failed", Firefox "NetworkError…"),
// plus common connection-refused phrasings.
const BACKEND_DOWN_PATTERNS =
    /failed to fetch|load failed|networkerror|network request failed|err_connection|econnrefused|connection refused|fetch failed|are you online|net::err/i;

/** True when the error message looks like "the backend host is unreachable". */
export function isBackendDownMessage(raw: string | null | undefined): boolean {
    if (!raw) return false;
    return BACKEND_DOWN_PATTERNS.test(raw);
}

/** True for a thrown value that looks like the backend being unreachable. */
export function isBackendDownError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
    return isBackendDownMessage(msg);
}

export const BACKEND_DOWN_MESSAGE =
    'The Dwellium backend isn’t reachable. Start the backend (or set VITE_API_URL) to load live data.';

/**
 * Map a raw error string to a friendly, accurate explanation. Backend-down
 * failures get the specific message; anything else passes through (so genuine
 * app errors aren't masked).
 */
export function friendlyLoadError(raw: string | null | undefined): string {
    if (isBackendDownMessage(raw)) return BACKEND_DOWN_MESSAGE;
    const t = (raw ?? '').trim();
    return t.length > 0 ? t : 'Something went wrong loading this data.';
}
