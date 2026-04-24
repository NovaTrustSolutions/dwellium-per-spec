/**
 * AppFolio parity contract test — maintenance (Task 1.4)
 *
 * Contract: a new work_order (Brianna Jackson's fire-alarm request,
 * AppFolio work_order_number "19511-1") is present in workitems.json
 * with the typed Task 1.4 shapes — residentAvailability + actionsLog
 * + laborEntries + purchaseOrders — plus the 6 primitive fields
 * (workOrderNumber, permissionToEnter, ownerApproved, trade,
 * vendorInstructions, nextFollowUpDate). The contract is enforced at
 * the data/API seam (strataGet + the seed JSON) — the same seam
 * MaintenanceModule + the 4 other Workitem-type consumers
 * (LegalModule / ProjectsModule / LeasingModule / WorkOrdersModule)
 * consume — so drift in any of {types, seed shape, route handler,
 * id references} fails this test.
 *
 * Pre-Task-1.4 workitems.json length snapshot: 1138. Post-Task-1.4
 * expected length: 1139 (delta +1, WO 19511-1 appended). The length
 * assertion below guards against accidental deletion of an existing
 * entry during future seed edits.
 *
 * WorkitemType coverage (≥2): positive assertions on 'work_order';
 * negative / contamination-guard assertions on 'lease' and 'task'
 * entries (confirming Task 1.4's additive fields did not bleed into
 * non-maintenance rows).
 *
 * Source of truth: AppFolio_Screenshots/data/08_work_order_detail_19511.json
 * See Docs/AppFolio_Parity_Implementation_Plan_v2.md §7 Task 1.4.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
    Workitem,
    WorkitemType,
    WorkitemStatus,
    WorkitemPriority,
    ResidentAvailability,
    ActionLogEntry,
} from '../../components/StrataDashboard/strataTypes';
import workitemsSeed from '../../../public/data/workitems.json';

const WO_ID = 'b7a6b911-c4c2-4d37-bbf4-1955119e115b';
const WO_NUMBER = '19511-1';
const BRIANNA_TENANT_ID = '3ebb1993-7fcd-4218-8f8d-89025d760e00';
const WOODLAND_PROPERTY_ID = '52d4e301-3cbf-4a32-91eb-d20be9d06959';
const UNIT_2789_1_ID = 'd51d8682-bde3-4d60-b0e8-71de2170038e';

// Enumerate the existing unions so the union-guard assertion below
// can't silently drift if someone widens a union upstream.
const ALLOWED_TYPES: WorkitemType[] = ['task', 'work_order', 'lease', 'inspection', 'payment', 'recurring', 'notice'];
const ALLOWED_STATUSES: WorkitemStatus[] = ['open', 'in_progress', 'review', 'completed', 'cancelled', 'on_hold', 'pending', 'resolved', 'tenant_signoff'];
const ALLOWED_PRIORITIES: WorkitemPriority[] = ['critical', 'high', 'medium', 'low'];

describe('workitems parity — WO 19511-1 fire alarm (Task 1.4)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/workitems.json')) {
                return { ok: true, json: async () => workitemsSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    it('seed length is exactly 1148 (+1 Task-1.4 WO 19511 + 9 Task-2.1 Section-8 AHA inspection WOs on Riverwood)', () => {
        const seed = workitemsSeed as unknown as Workitem[];
        // 1138 pre-Task-1.4 baseline + 1 WO 19511-1 (Task 1.4) + 9 AHA
        // inspections (Task 2.1 — this PR). Future workitems-writer tasks
        // (Task 2.9 per scheduling-pass §6 item #10 resolution) will bump
        // this again with their own deltas + comment line.
        expect(seed).toHaveLength(1148);
    });

    it('new WO 19511-1 carries typed residentAvailability (3 windows) + actionsLog (2 entries) + empty labor/PO arrays', () => {
        const seed = workitemsSeed as unknown as Workitem[];
        const wo = seed.find((w) => w.id === WO_ID);
        expect(wo, 'WO 19511-1 must be appended to workitems.json').toBeDefined();
        expect(wo!.workOrderNumber).toBe(WO_NUMBER);

        const avail = wo!.residentAvailability as ResidentAvailability | undefined;
        expect(avail, 'residentAvailability must be typed + present').toBeDefined();
        expect(avail!.date).toBe('2026-04-20');
        expect(avail!.dayOfWeek).toBe('monday');
        expect(avail!.timezone).toBe('EDT');
        expect(avail!.timeWindows).toEqual(['8:00am-12:00pm', '10:00am-2:00pm', '1:00pm-5:00pm']);

        const log = wo!.actionsLog as ActionLogEntry[] | undefined;
        expect(log).toBeDefined();
        expect(log!).toHaveLength(2);
        expect(log![0].actor).toBe('System');
        expect(log![0].event).toMatch(/submitted preferred times/i);
        expect(log![1].actor).toBe('Brianna Jackson');
        expect(log![1].event).toBe('Submitted online');

        expect(wo!.laborEntries).toBeDefined();
        expect(wo!.laborEntries).toHaveLength(0);
        expect(wo!.purchaseOrders).toBeDefined();
        expect(wo!.purchaseOrders).toHaveLength(0);

        // 6 primitives from DoR.
        expect(wo!.permissionToEnter).toBe(true);
        expect(wo!.ownerApproved).toBe(false);
        expect(wo!.trade).toBe('No Trade Assigned');
        expect(wo!.vendorInstructions).toBeNull();
        expect(wo!.nextFollowUpDate).toBeNull();

        // Relational integrity — references resolve to real canonical ids.
        expect(wo!.createdBy).toBe(BRIANNA_TENANT_ID);
        expect(wo!.propertyId).toBe(WOODLAND_PROPERTY_ID);
        expect(wo!.unitId).toBe(UNIT_2789_1_ID);
    });

    it('static API returns WO 19511-1 via /workitems filter', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const rows = await strataGet<Workitem[]>('/workitems', { type: 'work_order', status: 'open' });
        const wo = rows.find((w) => w.id === WO_ID);
        expect(wo, '/workitems filter must surface the new fire-alarm WO').toBeDefined();
        expect(wo!.workOrderNumber).toBe(WO_NUMBER);
        expect(wo!.residentAvailability?.timeWindows).toHaveLength(3);
    });

    it('union guard: new WO type/status/priority fall within the existing unions (no accidental widening)', () => {
        const seed = workitemsSeed as unknown as Workitem[];
        const wo = seed.find((w) => w.id === WO_ID);
        expect(wo!.type).toBe('work_order');
        // These `includes` calls fail if the seed value falls outside the
        // enumerated union, which would indicate someone widened the union.
        expect(ALLOWED_TYPES.includes(wo!.type)).toBe(true);
        expect(ALLOWED_STATUSES.includes(wo!.status)).toBe(true);
        expect(ALLOWED_PRIORITIES.includes(wo!.priority)).toBe(true);
    });

    it('cross-type contamination guard: only the new WO carries Task 1.4 typed fields', () => {
        const seed = workitemsSeed as unknown as Workitem[];
        // No existing lease or task should carry the new typed fields.
        const taintedOtherTypes = seed.filter((w) => w.type !== 'work_order' && (
            w.residentAvailability !== undefined ||
            w.actionsLog !== undefined ||
            w.laborEntries !== undefined ||
            w.purchaseOrders !== undefined ||
            w.workOrderNumber !== undefined ||
            w.permissionToEnter !== undefined ||
            w.ownerApproved !== undefined ||
            w.trade !== undefined ||
            w.vendorInstructions !== undefined ||
            w.nextFollowUpDate !== undefined
        ));
        expect(taintedOtherTypes, 'non-work_order entries must not carry Task 1.4 fields').toHaveLength(0);

        // Among the ~369 existing work_orders, only WO 19511-1 carries the typed fields.
        const workOrders = seed.filter((w) => w.type === 'work_order');
        const tainted = workOrders.filter((w) => w.id !== WO_ID && (
            w.residentAvailability !== undefined ||
            w.actionsLog !== undefined ||
            w.laborEntries !== undefined ||
            w.purchaseOrders !== undefined ||
            w.workOrderNumber !== undefined
        ));
        expect(tainted, 'only WO 19511-1 should carry Task 1.4 typed fields among work_orders').toHaveLength(0);
    });
});
