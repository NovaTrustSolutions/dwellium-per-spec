import { Page, expect } from '@playwright/test';

/**
 * Shared login helper for E2E tests.
 *
 * Plan 045 (2026-08-16): the passwordless quick-select avatars are gone
 * (3530a73 + one-form login), so `loginAs` no longer drives the login UI.
 * It seeds the app's OWN offline session restore (UserContext: a
 * `static-…` token + `dwellium-user` restore without a backend round-trip)
 * and lands directly on the shell. The login UI itself is covered by
 * e2e/login.spec.ts. Advantages: no credentials in the harness, no coupling
 * to login-screen markup, faster specs.
 */

interface QuickUser {
  name: string;
  email: string;
  role: string;
  /** Stable id used for per-user stores; defaults to a deterministic slug. */
  id?: string;
}

/**
 * Available quick-login users (must match LoginScreen QUICK_USERS).
 * Add more as needed.
 */
export const USERS: Record<string, QuickUser> = {
  andy: { name: 'Andy', email: 'andy@dwellium.com', role: 'god', id: '9a921527-84b0-497f-b682-45df315c13d1' },
  lisa: { name: 'Lisa', email: 'lisa@zpgroup.io', role: 'corporate' },
  architect: { name: 'Architect', email: 'architect@dwellium.com', role: 'god' },
  wendy: { name: 'Wendy', email: 'wendy@dwellium.com', role: 'management' },
  lee: { name: 'Lee', email: 'lee@dwellium.com', role: 'maintenance' },
};

/**
 * Perform a full login as the specified user.
 *
 * @param page Playwright Page
 * @param user Which quick-select user to log in as (defaults to Andy / god)
 */
export async function loginAs(
  page: Page,
  user: QuickUser = USERS.andy,
): Promise<void> {
  // Seed before goto: cold-start Sidebar useSyncExternalStore reads these
  // synchronously during render.
  //  - qualia_sidebar_groups: expand the groups the nav specs traverse.
  //  - qualia_sidebar_icon_only=false: render the EXPANDED sidebar. Real users
  //    now default to the icon-rail, but the nav specs + screenshot baselines
  //    expect the expanded sidebar (and .sidebar__logo-text only renders then).
  const id = user.id ?? `e2e-${user.name.toLowerCase()}`;
  await page.addInitScript(({ user, id }) => {
    try {
      localStorage.setItem(
        'qualia_sidebar_groups',
        '["Property Management","AI Tools","Filing Cabinet"]',
      );
      localStorage.setItem('qualia_sidebar_icon_only', 'false');
      // Default-startup-stack auto-opens ARA + Strata on a fresh EMPTY canvas —
      // exactly what every e2e context is. Seed the one-shot flag so specs keep
      // their clean-desktop baseline (its absence broke the axe-baseline
      // Overview spec on push run 27390457673).
      localStorage.setItem('dwellium:default-stack:v1', 'done');
      // Onboarding walkthrough auto-starts on a fresh user; its full-screen
      // dimmer intercepts pointer events, so pre-mark it done for e2e (its
      // dimmer would otherwise block the axe/nav specs' clicks). Key shape =
      // walkthroughStore `walkthrough:<uid>` with { done:true }.
      localStorage.setItem(`walkthrough:${id}`, JSON.stringify({ done: true }));
      // FirstRunCard (plan 046-F) floats over the desktop and intercepts
      // pointer events — it broke every axe-baseline click from 2026-08-20 to
      // 2026-08-26 (10 consecutive red Parity Gate runs). Dismiss it for this
      // session, and mark the ARA intro as seen for the same overlay reason.
      sessionStorage.setItem('dwellium:first-run:dismissed', '1');
      localStorage.setItem('dwellium-ara-prefs', JSON.stringify({
        streamTokens: true, showToolActivity: false, holdToTalk: false, introSeen: true, prefsVersion: 2,
      }));
      // Offline session restore (UserContext.tsx: `static-` token skips the
      // backend validator; `dwellium-user` is restored optimistically).
      const now = new Date().toISOString();
      localStorage.setItem('dwellium-auth-token', `static-${Date.now()}-${id}`);
      localStorage.setItem('dwellium-user', JSON.stringify({
        id, name: user.name, email: user.email, role: user.role,
        assignedProperties: [], active: true, createdAt: now, updatedAt: now,
      }));
    } catch { /* private-mode storage denial */ }
  }, { user, id });

  // Navigate to app — lands on the shell directly.
  await page.goto('/');

  // Wait for the shell to load — sidebar logo text is the indicator
  const sidebarLogo = page.locator('.sidebar__logo-text', { hasText: 'DWELLIUM' });
  await expect(sidebarLogo).toBeVisible({ timeout: 15_000 });
}

/**
 * Verify the user is logged out — login overlay should be visible.
 */
export async function expectLoggedOut(page: Page): Promise<void> {
  const overlay = page.locator('.login-start-overlay');
  await expect(overlay).toBeVisible({ timeout: 10_000 });
}
