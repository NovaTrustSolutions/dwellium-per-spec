/**
 * AppFolio parity render-layer test — Property detail tab parity (Task 3.3)
 *
 * Sibling to fixture-only `properties.test.ts` (Task 1.3; preserved frozen).
 * This file exercises the 4 NEW AppFolio property-detail tab Placeholder
 * components landed in commit C: BudgetPlaceholder / MarketingPlaceholder
 * / ComparablesPlaceholder / ShowingSettingsPlaceholder.
 *
 * Source of truth: PropertiesModule.tsx commit C (Task 3.3); v1 L168 spec
 * (Property detail tab parity — stubs acceptable for this phase).
 *
 * Test design rationale (deviates from DoR (f) recommended "render full
 * module → click tab → assert content" pattern; documented for §1 ledger):
 *
 *   PropertiesModule.tsx is 2,511 LOC and consumes 7 React Query hooks
 *   from useStrataQueries (useProperties / useUnits / useEntities /
 *   useLinkedData / useModuleConfig / useStrataInvalidate / strataKeys),
 *   plus useUser from UserContext, plus useQueryClient directly from
 *   @tanstack/react-query. A full module render with 4 click-through
 *   it-blocks would require ~80 lines of hook mocks + a QueryClient-
 *   Provider wrapper + child-component mocks (TrelloCardModal,
 *   ProfileSpaces, PropertyOverview, UtilitiesModule, VehiclesPanel,
 *   InsuranceModule, FixedAssetsTable). The actual NEW surface in
 *   commit C is the 4 Placeholder components — small self-contained
 *   stubs whose render correctness is the subject of the test.
 *
 *   Path B (placeholder isolation tests) exercises the actual NEW
 *   render surface directly: import each Placeholder, render it,
 *   assert testid + body text. The tab-switch + breadcrumb integration
 *   path is verified end-to-end by the CDP probe at
 *   `qualia-shell/cdp_probe_task_3_3.cjs` (committed as part of the
 *   same PR's commit F): the probe navigates into property-detail
 *   view, clicks each new tab button, and asserts the corresponding
 *   content testid + body text appears live in a real chromium
 *   instance — covering the full setActiveTab + Sentry breadcrumb path
 *   that Path B's isolation tests skip.
 *
 *   This split (component-level invariants in vitest + integration via
 *   CDP) matches the project's overall test pyramid: the fixture-level
 *   tests in `properties.test.ts` cover the Task 1.3 data contract;
 *   this file covers the Task 3.3 render contract; CDP covers the
 *   Task 3.3 user-flow contract. Each layer tests what it can verify
 *   most cheaply and reliably.
 *
 * To enable direct import, the 4 Placeholders are exported from
 * PropertiesModule.tsx in this same commit (D). The export change is
 * purely additive — no callers depended on them being module-private.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    BudgetPlaceholder,
    MarketingPlaceholder,
    ComparablesPlaceholder,
    ShowingSettingsPlaceholder,
} from '../../components/StrataDashboard/modules/PropertiesModule';

const TEST_PROPERTY_ID = 'test-property-3-3-render-1';

describe('properties parity — Task 3.3 AppFolio property-detail tab parity (render layer)', () => {
    // ── 1. Budget tab placeholder ──────────────────────────────────────
    it('BudgetPlaceholder renders the property-tab-content-budget testid + Phase-5 P&L wiring intent body', () => {
        render(<BudgetPlaceholder propertyId={TEST_PROPERTY_ID} />);

        const root = screen.getByTestId('property-tab-content-budget');
        expect(root).toBeInTheDocument();

        // Title — icon + "Budget" label
        expect(root.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('Budget')).toBeInTheDocument();

        // Body text — Phase-5 wiring intent matches v1 L168 acceptance
        // criteria ("stubbed with 'Coming soon' cards is acceptable").
        expect(root.textContent).toMatch(/property-level budget tracking will land in Phase 5/i);
        expect(root.textContent).toMatch(/P&L/);
        expect(root.textContent).toMatch(/variance vs forecast/i);
        expect(root.textContent).toMatch(/vendor spend rollup/i);
    });

    // ── 2. Marketing tab placeholder ────────────────────────────────────
    it('MarketingPlaceholder renders the property-tab-content-marketing testid + Phase-5 syndication/ROI wiring intent body', () => {
        render(<MarketingPlaceholder propertyId={TEST_PROPERTY_ID} />);

        const root = screen.getByTestId('property-tab-content-marketing');
        expect(root).toBeInTheDocument();

        expect(root.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('Marketing')).toBeInTheDocument();

        expect(root.textContent).toMatch(/listing syndication/i);
        expect(root.textContent).toMatch(/photo management/i);
        expect(root.textContent).toMatch(/campaign ROI/i);
        expect(root.textContent).toMatch(/will land in Phase 5/i);
    });

    // ── 3. Comparables tab placeholder ──────────────────────────────────
    it('ComparablesPlaceholder renders the property-tab-content-comparables testid + Phase-5 sales/rent comps wiring intent body', () => {
        render(<ComparablesPlaceholder propertyId={TEST_PROPERTY_ID} />);

        const root = screen.getByTestId('property-tab-content-comparables');
        expect(root).toBeInTheDocument();

        expect(root.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('Comparables')).toBeInTheDocument();

        expect(root.textContent).toMatch(/comparable property data/i);
        expect(root.textContent).toMatch(/sales\/rent comps/i);
        expect(root.textContent).toMatch(/market-band positioning/i);
        expect(root.textContent).toMatch(/will land in Phase 5/i);
    });

    // ── 4. Showing Settings tab placeholder ─────────────────────────────
    it('ShowingSettingsPlaceholder renders the property-tab-content-showing-settings testid + Phase-5 schedule/access wiring intent body', () => {
        render(<ShowingSettingsPlaceholder propertyId={TEST_PROPERTY_ID} />);

        const root = screen.getByTestId('property-tab-content-showing-settings');
        expect(root).toBeInTheDocument();

        expect(root.querySelector('svg')).toBeInTheDocument();
        expect(screen.getByText('Showing Settings')).toBeInTheDocument();

        expect(root.textContent).toMatch(/showing schedule/i);
        expect(root.textContent).toMatch(/agent access/i);
        expect(root.textContent).toMatch(/self-tour configuration/i);
        expect(root.textContent).toMatch(/will land in Phase 5/i);
    });
});
