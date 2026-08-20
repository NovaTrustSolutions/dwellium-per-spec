/**
 * localAccounts — the local quick-access sign-in roster + an editable
 * credentials overlay.
 *
 * The base roster (Andy / Lisa / Archi) ships in code; a god user (the
 * Architect) can change any account's password and enable/disable accounts at
 * runtime via Control Panel → Accounts. Those changes persist as an OVERRIDE
 * layer in localStorage and are merged over the base by `getEffectiveAccounts`.
 *
 * Local-first: like the original hardcoded roster, these credentials are a
 * client-side gate, NOT hardened security (passwords compared in the browser,
 * stored unencrypted on THIS device). The override store is device-local
 * (no per-user / One Save sync) because the roster is app-global.
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';

export interface LocalAccount {
    /** Stable id — scopes this user's per-account stores. */
    id: string;
    name: string;
    email: string;
    /** Effective client-side gate password ('' = not set yet). */
    password: string;
    /** Seeded backend credential for the REAL server session (data/users.json
     *  seed). Absent = no backend user; sign-in offers explicit offline mode. */
    backendPassword?: string;
    role: string;
    color: string;
    initials: string;
    /** Disabled accounts render in the roster but can't sign in. */
    enabled: boolean;
}

export const ROLE_LABELS: Record<string, string> = {
    god: 'God Mode',
    corporate: 'Corporate',
};

/**
 * Base roster. Ids match data/users.json (Andy/Lisa) + the Architect id so
 * existing per-user data carries over. NO account ships with a password
 * (plan 014 — committed god-password literals + personal email removed):
 * passwords are set at RUNTIME by the Architect (Control Panel → Accounts,
 * persisted in the override store below). Production sign-in is Google
 * Identity Services with backend verification; this roster is the dev/offline
 * path — see `checkLocalPassword` for the DEV-only bootstrap.
 */
export const LOCAL_ACCOUNTS: LocalAccount[] = [
    { id: '9a921527-84b0-497f-b682-45df315c13d1', name: 'Andy', email: 'andy@dwellium.com', password: '', backendPassword: 'admin123', role: 'god', color: 'var(--accent)', initials: 'A', enabled: true },
    { id: 'b5d3ac0c-f276-402d-b8ef-9a96fe42b570', name: 'Lisa', email: 'lisa@zpgroup.io', password: '', backendPassword: 'corp123', role: 'corporate', color: '#3b82f6', initials: 'L', enabled: true },
    { id: 'architect-9a921527', name: 'Archi', email: 'architect@dwellium.com', password: '', role: 'god', color: 'var(--accent)', initials: 'AR', enabled: true },
];

/** Per-account override (only the fields the Architect can change). */
export interface AccountOverride {
    password?: string;
    enabled?: boolean;
}
type Overrides = Record<string, AccountOverride>;

const KEY = 'dwellium:local-accounts';

function deserialize(raw: string | null): Overrides {
    if (!raw) return {};
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Overrides) : {};
    } catch {
        return {};
    }
}

export const accountOverridesStore = createLocalStorageStore<Overrides>({
    key: KEY,
    deserializer: deserialize,
    defaultValue: {},
});

function persist(next: Overrides): void {
    accountOverridesStore.set(next, () => {
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sandboxed / private */ }
    });
}

/** Merge the override layer over the base roster. */
export function applyOverrides(base: LocalAccount[], ov: Overrides): LocalAccount[] {
    return base.map(a => {
        const o = ov[a.id];
        if (!o) return a;
        return {
            ...a,
            password: o.password ?? a.password,
            enabled: o.enabled ?? a.enabled,
        };
    });
}

/** The roster with the current overrides applied (non-reactive read). */
export function getEffectiveAccounts(): LocalAccount[] {
    return applyOverrides(LOCAL_ACCOUNTS, accountOverridesStore.getSnapshot());
}

/** True when the account has a usable (non-empty) effective password. */
export function isPasswordSet(account: LocalAccount): boolean {
    return (account.password ?? '') !== '';
}

export type LocalPasswordCheck = 'ok' | 'not-set' | 'mismatch';

/**
 * Client-side password check shared by LoginScreen + SessionExpiredModal.
 *
 * DEV bootstrap (plan 014): no committed passwords ship in the roster, so on
 * a fresh device every account starts empty — and nobody could sign in to set
 * one. In DEV builds only, an empty-password account passes this gate with any
 * typed password; the backend login (or the user's EXPLICIT offline choice)
 * remains the real verifier. Production builds hard-block until the Architect
 * sets a password at runtime (Control Panel → Accounts) — never a committed
 * literal.
 */
export function checkLocalPassword(
    account: LocalAccount,
    typed: string,
    dev: boolean = import.meta.env.DEV,
): LocalPasswordCheck {
    if (!isPasswordSet(account)) return dev ? 'ok' : 'not-set';
    return typed === account.password ? 'ok' : 'mismatch';
}

/** Architect action: set/replace an account's sign-in password. */
export function setAccountPassword(id: string, password: string): void {
    const ov = { ...accountOverridesStore.getSnapshot() };
    ov[id] = { ...ov[id], password };
    persist(ov);
}

/** Architect action: enable/disable an account in the roster. */
export function setAccountEnabled(id: string, enabled: boolean): void {
    const ov = { ...accountOverridesStore.getSnapshot() };
    ov[id] = { ...ov[id], enabled };
    persist(ov);
}

/** Test/escape-hatch reset. */
export function resetAccountOverrides(): void {
    accountOverridesStore.set({}, () => {
        try { localStorage.removeItem(KEY); } catch { /* sandboxed */ }
    });
}

/** Reactive roster-with-overrides for components. */
export function useEffectiveAccounts(): LocalAccount[] {
    const ov = useSyncExternalStore(
        accountOverridesStore.subscribe,
        accountOverridesStore.getSnapshot,
        accountOverridesStore.getServerSnapshot,
    );
    return applyOverrides(LOCAL_ACCOUNTS, ov);
}
