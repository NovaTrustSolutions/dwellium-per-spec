/**
 * perUserIdentity — the single, structural owner of every per-user-store
 * identity holder.
 *
 * ── Why this file exists (the #185 render-loop class) ──────────────────────
 * Historically ~12 per-user stores all ALIASED one shared module-level object
 * (`integrationsUserIdHolder`), and MULTIPLE components wrote `user.id` into
 * that one object during render. When two writers put different values into
 * the single shared object within one render pass, every dynamic-key store
 * keyed on it invalidated its cache on each `getSnapshot()`, so
 * `useSyncExternalStore` saw a new snapshot on every check and React
 * infinite-looped (error #185; shipped once at dbcfe00, rolled back — see
 * FUCKUPS.md F-015).
 *
 * The structural fix (plan 025): each per-user store gets its OWN holder here,
 * and a SINGLE hook (`usePerUserIdentity`) owns writing `user.id` into ALL of
 * them from one place via `setPerUserIdentity`. Because every holder is set to
 * the SAME `user.id` from one call site, two writers can never disagree, and
 * adding a new per-user store or a new component can never re-introduce the
 * loop.
 *
 * ── Invariants (do NOT break) ──────────────────────────────────────────────
 * - Each holder is an INDEPENDENT object (never `const b = a`). Distinctness is
 *   what makes cross-store churn impossible; it is asserted in
 *   `src/test/holderIsolation.test.ts`.
 * - Every holder's value MUST stay the RAW `user.id` — each consuming store's
 *   `resolveKey()` builds its storage key from it, so any other value strands
 *   the user's data under the wrong namespace.
 * - No holder is written during render EXCEPT through `setPerUserIdentity`
 *   (called once by `usePerUserIdentity`). New per-user stores import their
 *   holder from here and rely on that single writer.
 * - The integrations VAULT rides its own PRIVATE `integrationsOwnerIdHolder`
 *   (stable email-based id) in `integrationsStore.ts` and is intentionally NOT
 *   part of this set — do not consolidate it in.
 *
 * SSR-safe: this module only allocates plain objects at load; it never touches
 * `window` / `localStorage` / `document`.
 */

import { useContext } from 'react';
import { UserContext } from '../context/UserContext';

type UserIdHolder = { current: string | null };

const makeHolder = (): UserIdHolder => ({ current: null });

/* ── ALIAS-store holders (were `X = integrationsUserIdHolder`) ─────────────── */
export const agentContextUserIdHolder: UserIdHolder = makeHolder();
export const llmUsageUserIdHolder: UserIdHolder = makeHolder();
export const goalsUserIdHolder: UserIdHolder = makeHolder();
export const morningBriefUserIdHolder: UserIdHolder = makeHolder();
export const costKpiUserIdHolder: UserIdHolder = makeHolder();
export const activationUserIdHolder: UserIdHolder = makeHolder();
export const artifactsUserIdHolder: UserIdHolder = makeHolder();
export const activityUserIdHolder: UserIdHolder = makeHolder();

/* ── DIRECT-READER-store holders (read `integrationsUserIdHolder.current`) ─── */
export const workspacesUserIdHolder: UserIdHolder = makeHolder();
export const tagsUserIdHolder: UserIdHolder = makeHolder();
export const subscriptionsUserIdHolder: UserIdHolder = makeHolder();
export const halocronKnowledgeGraphUserIdHolder: UserIdHolder = makeHolder();
export const scribeKbUserIdHolder: UserIdHolder = makeHolder();
/** Plan 041 — per-user avatar profiles (avatarId/voiceId/systemPrompt per agentId). */
export const avatarProfilesUserIdHolder: UserIdHolder = makeHolder();
/** Plan 046-F1 — per-user first-run checklist state (firstRunStore). */
export const firstRunUserIdHolder: UserIdHolder = makeHolder();
/** Plan 047 — per-user onboarding state (role, seen tips, unlocked tiers). */
export const onboardingUserIdHolder: UserIdHolder = makeHolder();
/** Plan 046-A2 — per-user "Today at a glance" once-per-day throttle (araDailyGlance). */
export const araGlanceUserIdHolder: UserIdHolder = makeHolder();
/** Plan 047 phase 1 — per-user Excalidraw whiteboard scene (whiteboardStore). */
export const whiteboardUserIdHolder: UserIdHolder = makeHolder();
/** Plan 053 — per-user RustDesk address book (remoteMachinesStore). */
export const remoteMachinesUserIdHolder: UserIdHolder = makeHolder();
/** 5 Persona Advisory Board — per-user saved board sessions (advisoryBoardStore). */
export const advisoryBoardUserIdHolder: UserIdHolder = makeHolder();
/** Plan 054 phase 6 — per-user Cockpit prefs (column widths + work-row split; FluidOS cockpitPrefsStore). */
export const cockpitPrefsUserIdHolder: UserIdHolder = makeHolder();

/** ARA console preferences — streaming, intro-seen, hold-to-talk (araPrefsStore). */
export const araPrefsUserIdHolder: UserIdHolder = makeHolder();

/** Plan 055 phase 1 — per-user live session snapshot (sessionRestoreStore). */
export const sessionRestoreUserIdHolder: UserIdHolder = makeHolder();

/** Research Lab — per-user free-provider API keys (researchKeysStore). NEVER shared with the main integrations bundle. */
export const researchKeysUserIdHolder: UserIdHolder = makeHolder();
/** Research Lab — per-user experiments log (researchLogStore). */
export const researchLogUserIdHolder: UserIdHolder = makeHolder();

/** Plan 055 phase 2 — per-user widget view-state memory (widgetMemory). */
export const widgetMemoryUserIdHolder: UserIdHolder = makeHolder();

/** Plan 055 phase 3 — per-user recent-activity trail (recentActivityStore, ⌘K Resume). */
export const recentActivityUserIdHolder: UserIdHolder = makeHolder();

/** Onboarding walkthrough — per-user spotlight-tour "done" flag (walkthroughStore). */
export const walkthroughUserIdHolder: UserIdHolder = makeHolder();

/** Every per-user identity holder, in one array for the single writer. */
const ALL_HOLDERS: readonly UserIdHolder[] = [
    agentContextUserIdHolder,
    llmUsageUserIdHolder,
    goalsUserIdHolder,
    morningBriefUserIdHolder,
    costKpiUserIdHolder,
    activationUserIdHolder,
    artifactsUserIdHolder,
    activityUserIdHolder,
    workspacesUserIdHolder,
    tagsUserIdHolder,
    subscriptionsUserIdHolder,
    halocronKnowledgeGraphUserIdHolder,
    scribeKbUserIdHolder,
    avatarProfilesUserIdHolder,
    firstRunUserIdHolder,
    onboardingUserIdHolder,
    araGlanceUserIdHolder,
    whiteboardUserIdHolder,
    remoteMachinesUserIdHolder,
    advisoryBoardUserIdHolder,
    araPrefsUserIdHolder,
    cockpitPrefsUserIdHolder,
    sessionRestoreUserIdHolder,
    researchKeysUserIdHolder,
    researchLogUserIdHolder,
    widgetMemoryUserIdHolder,
    recentActivityUserIdHolder,
    walkthroughUserIdHolder,
];

/**
 * The ONE writer. Assigns `userId` (the raw `user.id`, or null) to EVERY
 * per-user identity holder at once, so no two writers can ever disagree.
 * Safe to call during render — it only mutates plain objects.
 */
export function setPerUserIdentity(userId: string | null): void {
    for (const holder of ALL_HOLDERS) holder.current = userId;
}

/**
 * Single-writer hook. Call once at the top of any component/hook that reads a
 * per-user store, BEFORE the store's `useSyncExternalStore` runs, so every
 * dynamic-key store resolves the active user's namespace on the same render.
 *
 * Uses the raw context (NOT `useUser()`) so it degrades gracefully to the
 * `_anonymous` namespace when no provider is present (test envs, anon routes).
 */
export function usePerUserIdentity(): void {
    const userCtx = useContext(UserContext);
    setPerUserIdentity(userCtx?.user?.id ?? null);
}
