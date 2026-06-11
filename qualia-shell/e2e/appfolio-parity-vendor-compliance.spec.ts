import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * Phase-5 Task 5.5 — E2E: 2-STORY Technical Roofing compliance (AppFolio parity)
 *
 * Spec source: parent Plan v2 §9 row 5.5 (canonical per OPTION B resolution
 * at Task 5.3 sweep + GR-14 amendment at v2.32 — when phase-spec contradicts
 * parent, parent + v1-lineage wins; Phase_5_Plan.md L160+ scopes deprecated).
 * v1 plan L226 verbatim filename: e2e/appfolio-parity-vendor-compliance.spec.ts.
 *
 * NAVIGATION: Vendors module → 2-STORY TECHNICAL ROOFING LLC vendor card →
 *   Compliance detail tab → assert 6 expiration rows render → assert only
 *   General Liability is populated; other 5 itemTypes show Missing.
 *
 * NAME DRIFT (carry-forward from Task 5.4 §7 entry 3 — emerging pattern at 2nd
 * data point): data canonical name is "2-STORY TECHNICAL ROOFING LLC" per
 * qualia-shell/public/data/entities.json:16257 (Phase-1 Task 1.2 absorption
 * from source); v1 L226 spec text says "2-STORY TECHNICAL ROOFING" (no LLC).
 * Pattern: v1 spec-text systematically omits corporate suffixes (LLC) and
 * middle initials (M.) — 1st instance Brianna Jackson at Task 5.4. Spec uses
 * data-canonical name; future-Phase-N reconciliation deferred.
 *
 * DATA-SOURCE PARALLELISM (Task 5.5 PRE-FLIGHT finding): VendorsModule
 * Compliance tab renders from `vendor.vendorCompliance` typed top-level field
 * (Phase-1 Task 1.2 era); compliance.json (Phase-4 Task 4.6 era) is consumed
 * by the cross-vendor ComplianceEngine module — not this tab. Two parallel
 * data sources for the same conceptual data with different itemType enum
 * vocabularies. Spec asserts on the rendered source.
 *
 * ASSERTION CALIBRATION (B2 + negative assertions, extends Task 5.4 §7
 * entry 4 to 5 empty itemTypes):
 *   POSITIVE (1 row): General Liability date "2026-07-11" + status badge
 *     NOT "Missing" via regex /Valid|Expiring|Expired/ — date-stable across
 *     the 2026-07-11 expiration boundary (today 2026-05-03 ~69 days out
 *     yields "Expiring"; future runs after 2026-07-12 flip to "Expired" —
 *     still NOT-Missing).
 *   NEGATIVE (5 rows): Workers' Comp / EPA Certification / Auto Insurance /
 *     State License / Contract — em-dash text "—" + "Missing" badge text.
 *   If a future PR accidentally populates any of the 5 empty itemTypes on
 *   2-STORY, the negative assertions catch the regression.
 *
 * MODE-AGNOSTIC (per Task 5.3 dual-project parameterization): spec runs in
 * both Playwright projects:
 *   - chromium (default; static-API mode; CI-eligible)
 *   - real-backend (E2E_TARGET=real-backend; requires sibling repo +
 *     seeded staging DB out-of-repo per Phase_5_Plan.md L142-159)
 * Navigation is UI-driven via consumer-side strataApi.ts router, so the
 * same selectors work in both modes.
 */

const VENDOR_NAME = '2-STORY TECHNICAL ROOFING LLC';
const GL_EXPIRATION_DATE = '2026-07-11';
const POPULATED_KEY = 'generalLiabilityExpiration';
const EMPTY_KEYS = [
  'workersCompExpiration',
  'epaCertificationExpiration',
  'autoInsuranceExpiration',
  'stateLicenseExpiration',
  'contractExpiration',
] as const;

test.describe('AppFolio parity — 2-STORY Technical Roofing compliance', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, USERS.andy);
  });

  test('Vendors → 2-STORY → Compliance tab → 6 rows + only General Liability populated', async ({ page }) => {
    // 1. Open Strata via sidebar widget (pattern from strata-nav.spec.ts L44-58)
    const strataWidget = page.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
      has: page.locator('.sidebar-widget__label', { hasText: 'Strata' }),
    });
    await strataWidget.click();

    const strataNav = page.locator('.s-sidebar-nav');
    await expect(strataNav).toBeVisible({ timeout: 10_000 });

    // 2. Navigate to Vendors module
    const vendorsNav = page.locator('.s-nav-item', {
      has: page.locator('span', { hasText: 'Vendors' }),
    });
    await vendorsNav.click();

    // Allow module to load + fetch vendors via strataApi
    const mainContent = page.locator('.s-main-content');
    await expect(mainContent).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500);

    // 3. Find 2-STORY vendor card by name text (vendor list renders
    //    .s-list-item with .s-list-item-title = vendor.name).
    //    Click the card to populate the detail panel.
    const vendorCard = page.locator('.s-list-item', {
      has: page.locator('.s-list-item-title', { hasText: VENDOR_NAME }),
    });
    await expect(vendorCard).toBeVisible({ timeout: 10_000 });
    await vendorCard.click();
    await page.waitForTimeout(500);

    // 4. Scope all subsequent assertions to the detail panel to prevent
    //    list-side false positives.
    const detailPanel = page.locator('.s-detail-panel');
    await expect(detailPanel).toBeVisible();
    await expect(detailPanel.locator('h3', { hasText: VENDOR_NAME })).toBeVisible();

    // 5. Click the Compliance detail tab (tab bar at VendorsModule.tsx:914
    //    renders [overview, ledger, documents, performance, compliance,
    //    accounting, spaces] with textTransform: capitalize → visible
    //    button text "Compliance").
    // Phase-6 Task 6.1b: narrow with `:not([aria-controls])` to exclude the
    // Section accordion-header button rendered by VendorsModule's Block component
    // (which carries aria-controls=`vendor-block-${slug}` per VendorsModule.tsx:87).
    // Tab-bar buttons (VendorsModule.tsx:915) have NO aria-controls attribute,
    // so the filter cleanly disambiguates the tab-bar Compliance button from
    // the Section header inside the Overview tab.
    //
    // Case-insensitive match: tab-bar button DOM text is the lowercase array
    // value 'compliance' (VendorsModule.tsx:914 `(['overview', 'ledger', ...,
    // 'compliance', ...]).map(tab => <button>{tab}</button>)`); the visual
    // "Compliance" capitalization comes from CSS `textTransform: capitalize`
    // which is presentation-only and doesn't change DOM textContent. Pre-6.1a
    // the original `/^Compliance$/` regex matched the Block accordion-header's
    // capital-C `title` prop; 6.1b's :not([aria-controls]) filter correctly
    // removed that match but exposed the case mismatch with the tab-bar.
    const complianceTabBtn = detailPanel.locator('button:not([aria-controls])', { hasText: /^[Cc]ompliance$/ });
    await complianceTabBtn.click();
    await page.waitForTimeout(300);

    // 6. ComplianceTab parent container becomes visible
    const complianceTab = detailPanel.locator('[data-testid="vendor-compliance-tab"]');
    await expect(complianceTab).toBeVisible({ timeout: 5_000 });

    // ── 6 EXPIRATION ROWS render (one for each AppFolio compliance itemType) ──

    // 7. POSITIVE assertion — General Liability row (only populated row).
    //    Date text matches data fixture verbatim; status badge is one of
    //    {Valid, Expiring, Expired} but NOT "Missing" — date-stable.
    const glRow = detailPanel.locator(`[data-testid="compliance-row-${POPULATED_KEY}"]`);
    await expect(glRow).toBeVisible();
    await expect(glRow).toContainText(GL_EXPIRATION_DATE);
    const glBadge = detailPanel.locator(`[data-testid="compliance-badge-${POPULATED_KEY}"]`);
    await expect(glBadge).toBeVisible();
    await expect(glBadge).toHaveText(/Valid|Expiring|Expired/);

    // 8. NEGATIVE assertions — 5 empty itemTypes show em-dash text +
    //    "Missing" badge. If a future PR populates any of these on 2-STORY,
    //    the assertion catches the regression.
    for (const key of EMPTY_KEYS) {
      const row = detailPanel.locator(`[data-testid="compliance-row-${key}"]`);
      await expect(row).toBeVisible();
      await expect(row).toContainText('—');
      const badge = detailPanel.locator(`[data-testid="compliance-badge-${key}"]`);
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText('Missing');
    }

    // 9. CTA visibility sanity — 2-STORY has
    //    vendorCompliance.requestComplianceDocumentsCta: true so the
    //    "Request Compliance Documents" button renders.
    const cta = detailPanel.locator('[data-testid="compliance-request-cta"]');
    await expect(cta).toBeVisible();
  });
});
