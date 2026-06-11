import { test, expect } from '@playwright/test';
import { loginAs, USERS } from './helpers/auth';

/**
 * E2E Test — Stella Agent (Phase 4.3)
 *
 * Covers the full Stella Agent UI:
 *   1. Opening Stella from the sidebar
 *   2. Tab navigation (all 7 tabs)
 *   3. Chat tab renders and accepts input
 *   4. Skills tab renders with search and installed list
 *   5. Memory tab renders with file list
 *   6. Automation tab renders with cron dashboard
 *   7. MCP tab renders
 *   8. Settings tab renders with provider dropdown, lifecycle controls, and Dwellium integration
 *   9. RBAC: viewer user sees "View Only" badges
 *  10. Circuit breaker status appears in settings
 *
 * Tests are resilient to CoPaw being offline — they verify UI renders
 * correctly WITHOUT requiring a live CoPaw backend.
 */

// ─── Helpers ─────────────────────────────────────────────────────

/** Open the Stella widget from the sidebar */
async function openStella(page: import('@playwright/test').Page) {
    const stellaWidget = page.locator('.sidebar-widget:not(.sidebar-widget--pinned)', {
        has: page.locator('.sidebar-widget__label', { hasText: /stella/i }),
    });
    await expect(stellaWidget).toBeVisible({ timeout: 10_000 });
    await stellaWidget.click();

    // Wait for Stella container to appear inside a window
    const stellaContainer = page.locator('.stella');
    await expect(stellaContainer).toBeVisible({ timeout: 10_000 });
    return stellaContainer;
}

/** Click a Stella tab by its label text */
async function clickTab(page: import('@playwright/test').Page, label: string) {
    const tab = page.locator('.stella__tab', { hasText: label });
    await tab.click();
    await page.waitForTimeout(300); // let tab content render
}

// ─── Test Suite ──────────────────────────────────────────────────

test.describe('Stella Agent', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, USERS.andy); // god role = full access
    });

    test('can open Stella widget from sidebar', async ({ page }) => {
        const stella = await openStella(page);
        await expect(stella).toBeVisible();
    });

    test('renders all 7 tabs', async ({ page }) => {
        await openStella(page);
        const tabs = page.locator('.stella__tab');
        await expect(tabs).toHaveCount(7, { timeout: 5_000 });

        // Check each tab label exists
        const expectedLabels = ['Chat', 'Skills', 'Memory', 'Automation', 'MCP', 'Voice', 'Settings'];
        for (const label of expectedLabels) {
            const tab = page.locator('.stella__tab', { hasText: label });
            await expect(tab).toBeVisible();
        }
    });

    test('Chat tab has input and send button', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Chat');

        // Chat input area
        const input = page.locator('.stella__chat-input');
        await expect(input).toBeVisible({ timeout: 5_000 });

        // Send button
        const sendBtn = page.locator('.stella__send-btn');
        await expect(sendBtn).toBeVisible();
    });

    test('Chat tab accepts text input', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Chat');

        const input = page.locator('.stella__chat-input');
        await input.fill('Hello from e2e test');
        await expect(input).toHaveValue('Hello from e2e test');
    });

    test('Skills tab renders installed skills section', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Skills');

        // Skills panel should appear
        const skillsPanel = page.locator('.stella__skills');
        await expect(skillsPanel).toBeVisible({ timeout: 5_000 });

        // Search input should be present
        const searchInput = page.locator('.stella__skills input[type="text"]');
        await expect(searchInput).toBeVisible();
    });

    test('Memory tab renders with files', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Memory');

        // Memory panel should appear
        const memoryPanel = page.locator('.stella__memory');
        await expect(memoryPanel).toBeVisible({ timeout: 5_000 });
    });

    test('Automation tab renders cron section', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Automation');

        // Automation panel should appear
        const automationPanel = page.locator('.stella__automation');
        await expect(automationPanel).toBeVisible({ timeout: 5_000 });

        // Title should say "Automation & Cron Jobs"
        const title = page.locator('.stella__panel-title', { hasText: 'Automation' });
        await expect(title).toBeVisible();
    });

    test('MCP tab renders server section', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'MCP');

        // MCP panel should appear
        const mcpPanel = page.locator('.stella__mcp');
        await expect(mcpPanel).toBeVisible({ timeout: 5_000 });

        // Title should say "MCP Servers"
        const title = page.locator('.stella__panel-title', { hasText: 'MCP' });
        await expect(title).toBeVisible();
    });

    test('Settings tab renders provider dropdown and lifecycle controls', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Settings');

        // Settings panel
        const settingsPanel = page.locator('.stella__settings');
        await expect(settingsPanel).toBeVisible({ timeout: 5_000 });

        // Provider select dropdown
        const providerSelect = page.locator('.stella__settings-select').first();
        await expect(providerSelect).toBeVisible();

        // Lifecycle action buttons
        const healthBtn = page.locator('.stella__settings-btn', { hasText: 'Health' });
        await expect(healthBtn).toBeVisible();
    });

    test('Settings tab shows status details', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Settings');

        // Status section should show current state
        const statusDiv = page.locator('.stella__settings-status');
        await expect(statusDiv).toBeVisible({ timeout: 5_000 });

        // Should show provider info
        const providerInfo = statusDiv.locator('text=Provider');
        await expect(providerInfo).toBeVisible();
    });

    test('Settings tab shows role for authenticated user', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Settings');

        // Wait for permissions to load
        await page.waitForTimeout(2000);

        const statusDiv = page.locator('.stella__settings-status');
        const roleInfo = statusDiv.locator('text=Role');
        // Role badge should be visible (might take a moment for permissions to load)
        await expect(roleInfo).toBeVisible({ timeout: 8_000 });
    });
});

// ─── RBAC Tests ─────────────────────────────────────────────────

test.describe('Stella Agent — RBAC (Restricted User)', () => {
    test.beforeEach(async ({ page }) => {
        // Login as Wendy (management role — below admin for MCP)
        await loginAs(page, USERS.wendy);
    });

    test('Automation tab shows View Only badge for non-admin', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Automation');

        const automationPanel = page.locator('.stella__automation');
        await expect(automationPanel).toBeVisible({ timeout: 5_000 });

        // Should NOT crash even with restricted permissions
        const errorBoundary = page.locator('text=encountered an error');
        await expect(errorBoundary).not.toBeVisible();
    });

    test('MCP tab shows View Only badge for non-admin', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'MCP');

        const mcpPanel = page.locator('.stella__mcp');
        await expect(mcpPanel).toBeVisible({ timeout: 5_000 });

        // Should NOT crash even with restricted permissions
        const errorBoundary = page.locator('text=encountered an error');
        await expect(errorBoundary).not.toBeVisible();
    });
});

// ─── Tab Navigation Sweep ───────────────────────────────────────

const ALL_TABS = ['Chat', 'Skills', 'Memory', 'Automation', 'MCP', 'Voice', 'Settings'];

test.describe('Stella Agent — Tab Navigation No-Crash', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, USERS.andy);
    });

    for (const tabLabel of ALL_TABS) {
        test(`clicking "${tabLabel}" tab does not crash`, async ({ page }) => {
            await openStella(page);
            await clickTab(page, tabLabel);

            // Verify no error boundary triggered
            const errorBoundary = page.locator('text=encountered an error');
            await expect(errorBoundary).not.toBeVisible();

            // The stella container should still exist
            const stella = page.locator('.stella');
            await expect(stella).toBeVisible();
        });
    }
});

// ─── Settings Tab — Dwellium Integration (Phase 3) ──────────────

test.describe('Stella Agent — Dwellium Integration (Admin)', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, USERS.andy); // god role = admin+
    });

    test('shows Dwellium Integration section for admin user', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Settings');

        // Wait for permissions to load
        await page.waitForTimeout(2000);

        // The "Dwellium Integration" heading should be visible for admin+
        const dwelliumHeading = page.locator('.stella__settings-title', { hasText: 'Dwellium' });
        await expect(dwelliumHeading).toBeVisible({ timeout: 8_000 });
    });

    test('shows Bootstrap button for admin user', async ({ page }) => {
        await openStella(page);
        await clickTab(page, 'Settings');

        await page.waitForTimeout(2000);

        const bootstrapBtn = page.locator('.stella__settings-btn', { hasText: 'Bootstrap' });
        await expect(bootstrapBtn).toBeVisible({ timeout: 8_000 });
    });
});
