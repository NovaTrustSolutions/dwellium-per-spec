/**
 * Render-level block-contract test — MaintenanceModule WO detail 15-section layout (Task 3.4).
 *
 * Path B isolation pattern (mirrors vendors.module.test.tsx Task 3.2 + properties.module.test.tsx Task 3.3
 * calibrations). Each of the 6 NEW Block components is exported as a named React component from
 * MaintenanceModule.tsx and rendered directly here without mounting the full module.
 *
 * Anchor fixture: WO 19511-1 at UUID b7a6b911-c4c2-4d37-bbf4-1955119e115b in
 * public/data/workitems.json — the canonical Task-1.4 typed work_order
 * (1 of 371 work_orders carrying typed Task-1.4 fields; the other 370 carry
 * encrypted-blob STRING-typed metadata "enc:v1:astra:..." per Drift #B-i ack).
 *
 * Block 10 (Withheld Amount) and Block 15 (Notes) typed-path tests use SYNTHETIC
 * Workitem fixtures because canonical 19511 has metadata.withheldFromOwner ABSENT
 * and metadata.notes ABSENT (PRE1 (a-iii) verified — 0/371 work_orders carry either
 * field). Mirrors 3.2 BlockCompliance fallback-path coverage exactly: real fixtures
 * don't carry the typed shape on the canonical anchor, so the test constructs it.
 *
 * Trade-off (mirrors 3.3 properties.module.test.tsx + 3.2 vendors.module.test.tsx):
 *   - Block-toggle Sentry breadcrumb-payload assertion is deferred to CDP integration
 *     coverage. A Path A integration test (full DetailPanel mount with click-through)
 *     is a v2.18+ low-priority follow-up — joins existing Path A candidates from
 *     3.3 (tab-switch breadcrumb-payload) and 3.2 (block-toggle breadcrumb-payload).
 *
 * Test pyramid split:
 *   - Fixture-level data-contract:    src/test/appfolioParity/maintenance.test.ts (Task 1.4 — UNTOUCHED)
 *   - Render-level block-contract:    THIS FILE (Task 3.4)
 *   - User-flow contract:             cdp_probe_task_3_4.cjs (10-guard, post-merge)
 *
 * Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json.
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 3.4 + v2.17 changelog.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Workitem } from '../../components/StrataDashboard/strataTypes';
import {
    BlockViewAsTech,
    BlockWithheldAmount,
    BlockInvoices,
    BlockTexts,
    BlockEmails,
    BlockNotes,
} from '../../components/StrataDashboard/modules/MaintenanceModule';

/** Minimal Workitem with no Task-1.4 typed extensions and empty metadata.
    Used as the absent-path fixture for Block 10 + Block 15 + as the host shell
    for the 4 stub-only Blocks (View-as-Tech / Invoices / Texts / Emails). */
const minimal: Workitem = {
    id: 'test-wo-3-4',
    type: 'work_order',
    title: 'Test work order — Task 3.4 isolation',
    description: 'Test description',
    status: 'open',
    priority: 'medium',
    propertyId: null,
    unitId: null,
    assignedTo: null,
    createdBy: null,
    dueDate: null,
    domain: 'maintenance',
    tags: [],
    metadata: {},
    parentId: null,
    threadChannel: 'corporate',
    resolvedAt: null,
    trackingState: 'active',
    moduleKey: null,
    queueKey: null,
    deactivatedAt: null,
    reactivatedAt: null,
    recordType: null,
    recordId: null,
    createdAt: '2026-04-28T00:00:00Z',
    updatedAt: '2026-04-28T00:00:00Z',
};

describe('Task 3.4 — WO detail 15-section layout (Path B block isolation)', () => {
    it('BlockViewAsTech renders the L168 stub placeholder + testid', () => {
        render(<BlockViewAsTech item={minimal} />);
        expect(screen.getByTestId('wo-block-view-as-tech')).toBeTruthy();
        expect(screen.getByText(/Coming soon/i)).toBeTruthy();
        expect(screen.getByText(/RBAC tech-portal/i)).toBeTruthy();
    });

    it('BlockInvoices renders the L168 stub placeholder + testid', () => {
        render(<BlockInvoices item={minimal} />);
        expect(screen.getByTestId('wo-block-invoices')).toBeTruthy();
        expect(screen.getByText(/invoice ledger/i)).toBeTruthy();
    });

    it('BlockTexts renders the L168 stub placeholder + testid', () => {
        render(<BlockTexts item={minimal} />);
        expect(screen.getByTestId('wo-block-texts')).toBeTruthy();
        expect(screen.getByText(/SMS thread/i)).toBeTruthy();
    });

    it('BlockEmails renders the L168 stub placeholder + testid', () => {
        render(<BlockEmails item={minimal} />);
        expect(screen.getByTestId('wo-block-emails')).toBeTruthy();
        expect(screen.getByText(/email thread/i)).toBeTruthy();
    });

    it('BlockWithheldAmount typed-path: renders USD-formatted dollar value when metadata.withheldFromOwner is set (synthetic; canonical 19511 has it absent per PRE1 (a-iii))', () => {
        const synthetic: Workitem = { ...minimal, metadata: { withheldFromOwner: 1234.56 } };
        render(<BlockWithheldAmount item={synthetic} />);
        expect(screen.getByTestId('wo-block-withheld-amount')).toBeTruthy();
        // Intl currency format renders "$1,234.56" on en-US
        expect(screen.getByText(/\$1,234\.56/)).toBeTruthy();
        expect(screen.getByText(/Owner Withholding/i)).toBeTruthy();
    });

    it('BlockWithheldAmount fallback-path: renders em-dash when metadata.withheldFromOwner absent (real-fixture path on 371/371 work_orders)', () => {
        render(<BlockWithheldAmount item={minimal} />);
        expect(screen.getByTestId('wo-block-withheld-amount')).toBeTruthy();
        expect(screen.getByText('—')).toBeTruthy();
        expect(screen.getByText(/Owner Withholding/i)).toBeTruthy();
    });

    it('BlockNotes typed-path: renders array of structured notes (synthetic; canonical 19511 has metadata.notes absent per PRE1 (a-iii))', () => {
        const synthetic: Workitem = {
            ...minimal,
            metadata: {
                notes: [
                    { body: 'First note body', posted_by: 'Alice', ts: '2026-04-28' },
                    { body: 'Second note body', posted_by: 'Bob', ts: '2026-04-29' },
                ],
            },
        };
        render(<BlockNotes item={synthetic} />);
        expect(screen.getByTestId('wo-block-notes')).toBeTruthy();
        expect(screen.getByText('First note body')).toBeTruthy();
        expect(screen.getByText('Second note body')).toBeTruthy();
        expect(screen.getByText(/Alice · 2026-04-28/)).toBeTruthy();
        expect(screen.getByText(/Bob · 2026-04-29/)).toBeTruthy();
    });

    it('BlockNotes fallback-path: renders "No notes recorded" stub when metadata.notes absent (real-fixture path on 371/371 work_orders)', () => {
        render(<BlockNotes item={minimal} />);
        expect(screen.getByTestId('wo-block-notes')).toBeTruthy();
        expect(screen.getByText(/No notes recorded/i)).toBeTruthy();
    });
});
