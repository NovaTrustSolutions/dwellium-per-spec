import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * Phase-5 Task 5.4 — E2E: WO 19511-1 round-trip (AppFolio parity)
 *
 * Spec source: parent Plan v2 §9 row 5.4 (canonical per OPTION B resolution
 * at Task 5.3 sweep — Phase_5_Plan.md L160+ scopes deprecated at v2.32).
 * v1 plan L224 verbatim filename: e2e/appfolio-parity-workorder.spec.ts.
 *
 * NAVIGATION INTENT vs IMPLEMENTATION REALITY (PRE-FLIGHT DC-A finding —
 * Phase-5 7th absolute SCOPE-COLLISION pattern catch / 3rd in Phase-5):
 *   v1 L224 envisioned: Residents → Brianna M. Jackson → Work Orders → 19511-1
 *   ResidentsModule reality: NO Work Orders tab inside tenant detail
 *     (Phase-3 Task 3.1 closed Residents detail with 5 NEW tenant-block-*
 *     anchors but no cross-tab link to maintenance).
 *   PATH B intent-preserving navigation (this spec): Sidebar → Strata →
 *     Maintenance → find WO 19511-1 in list → click → DetailPanel renders.
 *   PATH C alternative (add WO tab to Residents) is genuine UI work that
 *     belongs in its own task, not bundled into an E2E spec.
 *
 * NAME DRIFT: data fixture canonical name is "Brianna Jackson" (no middle
 * initial) per qualia-shell/public/data/entities.json:13497 (Phase-1 Task
 * 1.1 absorption from source). v1 L224 spec text says "Brianna M. Jackson".
 * Spec uses data-actual; future-Phase-N reconciliation deferred.
 *
 * 15-SECTION CALIBRATION (B2 + negative assertions):
 *   Asserts 6 NEW Block testids (Sections 7/10/11/12/13/15 — Phase-3 Task
 *   3.4 era) + 5 always-rendered Section title text (Description / Status
 *   Tracking / Attachments / Resident Availability / Actions Log) = 11
 *   verifiable sections. Conditional non-rendered sections (Labor / Purchase
 *   Orders / Scheduling / vendor sub-condition) get EXPLICIT NEGATIVE
 *   assertions scoped to the WO 19511-1 detail panel — strengthens
 *   regression signal beyond passive documentation. If a future PR
 *   accidentally adds laborEntries to WO 19511-1, the negative assertion
 *   catches the regression.
 *
 * MODE-AGNOSTIC: spec runs in both Playwright projects per Task 5.3:
 *   - chromium (default; static-API mode; CI-eligible)
 *   - real-backend (E2E_TARGET=real-backend; requires sibling repo +
 *     seeded staging DB out-of-repo per Phase_5_Plan.md L142-159)
 * Navigation is UI-driven via consumer-side strataApi.ts router, so the
 * same selectors work in both modes.
 */

const WO_NUMBER = '19511-1';
const WO_TITLE_TEXT = 'Fire alarm needs replaced';
const TENANT_NAME = 'Brianna Jackson';
const RESIDENT_AVAILABILITY_DATE = '2026-04-20';
const TIME_WINDOWS = [
  '8:00am-12:00pm',
  '10:00am-2:00pm',
  '1:00pm-5:00pm',
];
const ACTIONS_LOG_EVENTS = [
  'Resident submitted preferred times',
  'Submitted online',
];

test.describe('AppFolio parity — WO 19511-1 round-trip (Brianna Jackson)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.andy);
  });

  test('Maintenance → WO 19511-1 → 15-section DetailPanel + 3 windows + 2 actions log', async ({ page }) => {
    // 1. Open Strata via sidebar widget (pattern from strata-nav.spec.ts L44-58)
    const strataWidget = page.locator('.sidebar-widget', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();

    const strataNav = page.locator('.s-sidebar-nav');
    await expect(strataNav).toBeVisible({ timeout: 10_000 });

    // 2. Navigate to Maintenance module (pattern from create-workitem.spec.ts L31-34)
    const maintenanceNav = page.locator('.s-nav-item', {
      has: page.locator('span', { hasText: 'Maintenance' }),
    });
    await maintenanceNav.click();

    // Allow module to load + fetch workitems via strataApi
    const mainContent = page.locator('.s-main-content');
    await expect(mainContent).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500);

    // 3. Find WO 19511-1 by title text (ItemCard renders item.title at
    //    MaintenanceModule.tsx:174; workOrderNumber is NOT on the card).
    //    Click the card to populate the DetailPanel.
    const woCard = page.locator('text=' + WO_TITLE_TEXT).first();
    await expect(woCard).toBeVisible({ timeout: 10_000 });
    await woCard.click();
    await page.waitForTimeout(500);

    // 4. Scope all subsequent assertions to the DetailPanel to prevent
    //    list-side false positives (the WO title also appears in the card).
    const detailPanel = page.locator('.s-detail-panel');
    await expect(detailPanel).toBeVisible();

    // ── 15-SECTION CALIBRATION (B2 — 6 testids + 5 Section titles = 11 verifiable) ──

    // 5. Six NEW Block testids (Phase-3 Task 3.4 era — Sections 7/10/11/12/13/15)
    await expect(detailPanel.locator('[data-testid="wo-block-view-as-tech"]')).toBeVisible();
    await expect(detailPanel.locator('[data-testid="wo-block-withheld-amount"]')).toBeVisible();
    await expect(detailPanel.locator('[data-testid="wo-block-invoices"]')).toBeVisible();
    await expect(detailPanel.locator('[data-testid="wo-block-texts"]')).toBeVisible();
    await expect(detailPanel.locator('[data-testid="wo-block-emails"]')).toBeVisible();
    await expect(detailPanel.locator('[data-testid="wo-block-notes"]')).toBeVisible();

    // 6. Five always-rendered Section title text (selected by exact text inside detail panel)
    //    These render unconditionally for WOs with the relevant typed fields populated.
    await expect(detailPanel.getByText('Description', { exact: true }).first()).toBeVisible();
    await expect(detailPanel.getByText('Status Tracking', { exact: true }).first()).toBeVisible();
    await expect(detailPanel.locator('text=/Attachments \\(/').first()).toBeVisible();
    await expect(detailPanel.getByText('Resident Availability', { exact: true }).first()).toBeVisible();
    await expect(detailPanel.getByText('Actions Log', { exact: true }).first()).toBeVisible();

    // 7. WO identity sanity — workOrderNumber Field renders inside Work Order Info section
    await expect(detailPanel.getByText(WO_NUMBER).first()).toBeVisible();

    // ── 3 RESIDENT-AVAILABILITY TIME WINDOWS (Monday 2026-04-20) ──

    // 8. residentAvailability section may default to collapsed; expand if needed.
    const availabilityHeader = detailPanel.locator('text=Resident Availability').first();
    await availabilityHeader.click().catch(() => { /* already-open or non-clickable header is fine */ });
    await page.waitForTimeout(200);

    for (const window of TIME_WINDOWS) {
      // Time windows render either in the typed Section or in the Actions Log
      // System detail line. Either visible occurrence satisfies the assertion.
      await expect(detailPanel.locator(`text=${window}`).first()).toBeVisible();
    }

    // ── 2 ACTIONS LOG ENTRIES (Brianna Jackson + System) ──

    // 9. actionsLog section may default to collapsed; expand if needed.
    const actionsLogHeader = detailPanel.locator('text=Actions Log').first();
    await actionsLogHeader.click().catch(() => { /* already-open or non-clickable header is fine */ });
    await page.waitForTimeout(200);

    for (const event of ACTIONS_LOG_EVENTS) {
      await expect(detailPanel.locator(`text=${event}`).first()).toBeVisible();
    }

    // 10. Tenant attribution — Brianna Jackson appears as the actor on the
    //     "Submitted online" actions log entry (data-actual name; not "Brianna M. Jackson").
    await expect(detailPanel.locator(`text=${TENANT_NAME}`).first()).toBeVisible();

    // ── EXPLICIT NEGATIVE ASSERTIONS for 4 conditional non-rendered sections ──
    //
    // These sections render conditionally on typed-field presence per
    // MaintenanceModule.tsx::DetailPanel L848/L876/L890/etc. WO 19511-1 has:
    //   laborEntries: []        → "Labor" Section header SHOULD NOT render
    //   purchaseOrders: []      → "Purchase Orders" Section header SHOULD NOT render
    //   nextFollowUpDate: null  → "Scheduling" / sub-condition Section absent
    //   no vendorInstructions   → vendor-only sub-condition absent
    //
    // If a future PR accidentally adds laborEntries to WO 19511-1's fixture,
    // OR removes the conditional-render guard on the Labor/PO sections, these
    // negative assertions catch the regression. Scope is the WO 19511-1
    // detail panel only — list-side or sidebar mentions of "Labor" elsewhere
    // are not affected.

    await expect(detailPanel.getByText('Labor', { exact: true })).toHaveCount(0);
    await expect(detailPanel.getByText('Purchase Orders', { exact: true })).toHaveCount(0);
    await expect(detailPanel.getByText('Scheduling', { exact: true })).toHaveCount(0);
    await expect(detailPanel.getByText('Vendor Instructions', { exact: true })).toHaveCount(0);

    // ── No error boundary / no crash sentinel ──
    const errorBoundary = page.locator('text=encountered an error');
    await expect(errorBoundary).not.toBeVisible();
  });
});
