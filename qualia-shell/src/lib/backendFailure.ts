/**
 * backendFailure — classifies a non-OK HTTP status into a reason + a
 * user-facing note. Originally lived in googleAccounts.ts but is not
 * Google-specific (plan 060 phase 2); moved here and re-exported from
 * googleAccounts.ts so existing importers keep working.
 */

/**
 * Why a request failed. Only `missing-route` means the backend lacks a route;
 * everything else is a live backend saying no (rate limiter, expired session,
 * outage) and must not be reported as "apply the backend patch" — that
 * mislabel sent people to the wrong fix.
 */
export type GoogleAccountsFailure = 'missing-route' | 'unauthorized' | 'rate-limited' | 'unavailable' | 'network';

export function classifyBackendFailure(status: number): { reason: GoogleAccountsFailure; error: string } {
    if (status === 404) return { reason: 'missing-route', error: 'Backend multi-account route not found — apply the backend patch.' };
    if (status === 401 || status === 403) return { reason: 'unauthorized', error: `The backend rejected your session (${status}) — sign out and back in.` };
    if (status === 429) return { reason: 'rate-limited', error: 'The backend is rate-limiting requests right now — retry in a minute.' };
    return { reason: 'unavailable', error: `The backend answered ${status} — it may be restarting; retry shortly.` };
}

/** One-line note for a status card; only the missing-route case points at the backend patch. */
export function failureNote(reason: GoogleAccountsFailure | undefined, error?: string): string {
    switch (reason) {
        case 'missing-route':
            return 'Multi-account connect needs the backend OAuth routes. Apply the backend patch (Docs/Google_MultiAccount_Backend.md) and set up a Google Cloud OAuth app.';
        case 'unauthorized':
            return error ?? 'The backend rejected your session — sign out and back in.';
        case 'rate-limited':
            return error ?? 'The backend is rate-limiting requests right now — retry in a minute.';
        case 'unavailable':
        case 'network':
        default:
            return error ?? 'The backend could not be reached — retry shortly.';
    }
}
