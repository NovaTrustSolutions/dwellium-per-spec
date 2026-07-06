/**
 * autoStartServices — kick the account-backed services once per real login
 * (2026-07-06 Andy: "whenever I log in, all services should be working and
 * start automatically").
 *
 * Runs ONLY for backend-verified sessions (quick-access static tokens are
 * client-side-only by design — the backend rejects them, F-016). Once per
 * session token it:
 *   1. Refreshes the connected-Google-accounts list from the backend (so the
 *      Control Panel and Inbox Zero see link state without a manual visit).
 *   2. If ANY enabled Google account is linked, fires the Gmail fetch so
 *      Inbox Zero starts pulling mail immediately — no manual "Fetch now".
 *
 * Everything is fire-and-forget and silent on failure: a down backend or an
 * unlinked Google account must never block the shell; the widgets surface
 * their own offline/link states.
 */
import { API_BASE } from '../config';
import { listGoogleAccounts } from './googleAccounts';

let ranForSession: string | null = null;

/** Test-only escape hatch. */
export function resetAutoStart(): void {
    ranForSession = null;
}

export async function autoStartServices(sessionKey: string): Promise<void> {
    if (typeof window === 'undefined') return;
    if (!sessionKey || ranForSession === sessionKey) return;
    ranForSession = sessionKey;
    try {
        const r = await listGoogleAccounts();
        const hasEnabledAccount = r.available && r.accounts.some(a => a.enabled);
        if (hasEnabledAccount) {
            await fetch(`${API_BASE}/api/gmail/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ maxResults: 20 }),
            });
        }
    } catch {
        /* backend offline / not linked — silent by design */
    }
}
