/**
 * AppFolio parity contract test — Projects WO 19441-1 (Task 2.9)
 *
 * Contract: Task 2.9 appends a single canonical project workitem row
 * to qualia-shell/public/data/workitems.json — "Replace sheetrock"
 * on Woodland Parc Townhomes Unit 2767-3, vendor CS Cooper Residential
 * Contractors LLC. v1 L146 acceptance is "open ProjectsModule → By
 * Entity, verify it groups under Woodland Parc Townhomes"; this test
 * proves the data contract that the live module's by-entity grouping
 * (ProjectsModule.tsx L82-110) consumes — see Task 2.9 completion
 * report §3 for the live-DOM CDP render proof.
 *
 * Source of truth: plan v1 L146 (sole authoritative; v2 §8 has no
 * dedicated 2.9 section — same pattern as Task 2.6); scheduling-pass
 * §6 item #10 (WO 19441-1 NOT in pre-Task-2.9 workitems.json — Task
 * 2.9 writes append-only). DoR-PRE0/PRE1/PRE2 + (a)/(b1)/(c1)/(d1)/
 * (d4)/(e)/(f) ack chain.
 *
 * Cross-test note: this test does NOT touch packages/types/index.ts
 * (per (c1) — Workitem interface and WorkitemType union reused
 * as-is; no 'project' literal added). It does NOT touch entities.json
 * (Phase-4 owner; CS Cooper duplicates flagged for Phase-3 dedupe in
 * report §7). Asserts a drift bound on the workitems.json baseline
 * (1152 = 1151 post-Task-2.6 + 1 Task-2.9 project) per (e).
 */
import { describe, it, expect } from 'vitest';
import workitemsSeed from '../../../public/data/workitems.json';
import propertiesSeed from '../../../public/data/properties.json';
import unitsSeed from '../../../public/data/units.json';
import entitiesSeed from '../../../public/data/entities.json';

const WORKITEMS_BASELINE_TASK_2_9 = 1152;
const TASK_2_9_PROJECT_ID = 'wi-task-2-9-project-01';
const TASK_2_9_WO_NUMBER = '19441-1';
const WOODLAND_PARC_PROPERTY_ID = '52d4e301-3cbf-4a32-91eb-d20be9d06959';
const WOODLAND_PARC_NAME = 'Woodland Parc Townhomes';
const UNIT_2767_3_ID = '7837b811-5346-4f79-802f-37e16ee37b74';
const UNIT_2767_3_NUMBER = '2767-3';
const CS_COOPER_VENDOR_ID = 'e013ce70-3930-43db-94fc-743bcac83779';
const CS_COOPER_NAME = 'CS Cooper Residential Contractors LLC';

describe('projects parity — Task 2.9 canonical project fixture (WO 19441-1)', () => {
    // ── 1. Two-half drift guard (per (e) ack) ───────────────────────────
    it('GR-2 workitems.json drift guard: seed.length === 1152 AND exactly one row carries workOrderNumber === "19441-1"', () => {
        const seed = workitemsSeed as unknown as Array<{ id: string; workOrderNumber?: string }>;
        expect(seed).toHaveLength(WORKITEMS_BASELINE_TASK_2_9);
        const matches = seed.filter(w => w.workOrderNumber === TASK_2_9_WO_NUMBER);
        expect(matches).toHaveLength(1);
        expect(matches[0].id).toBe(TASK_2_9_PROJECT_ID);
    });

    // ── 2. Row field shape (mandatory + optional Task 1.4 fields) ───────
    it('WO 19441-1 row carries every expected field: type "work_order", title "Replace sheetrock — Unit 2767-3", status "in_progress", domain "maintenance", trade "drywall", workOrderNumber "19441-1"', () => {
        const seed = workitemsSeed as unknown as Array<any>;
        const row = seed.find(w => w.id === TASK_2_9_PROJECT_ID);
        expect(row).toBeDefined();
        expect(row.type).toBe('work_order');
        expect(row.title).toBe('Replace sheetrock — Unit 2767-3');
        expect(row.status).toBe('in_progress');
        expect(row.priority).toBe('medium');
        expect(row.domain).toBe('maintenance');
        expect(row.trade).toBe('drywall');
        expect(row.workOrderNumber).toBe(TASK_2_9_WO_NUMBER);
        expect(row.moduleKey).toBe('projects');
        expect(row.threadChannel).toBe('management');
        expect(Array.isArray(row.tags)).toBe(true);
        expect(row.tags).toEqual(expect.arrayContaining(['project', 'sheetrock', 'task-2-9']));
        expect(row.assignedTo).toBeNull();
    });

    // ── 3. propertyId FK → Woodland Parc Townhomes ──────────────────────
    it('WO 19441-1 propertyId resolves to "Woodland Parc Townhomes" in properties.json', () => {
        const seed = workitemsSeed as unknown as Array<{ id: string; propertyId: string | null }>;
        const row = seed.find(w => w.id === TASK_2_9_PROJECT_ID);
        expect(row?.propertyId).toBe(WOODLAND_PARC_PROPERTY_ID);
        const props = propertiesSeed as unknown as Array<{ id: string; name: string }>;
        const wp = props.find(p => p.id === WOODLAND_PARC_PROPERTY_ID);
        expect(wp).toBeDefined();
        expect(wp!.name).toBe(WOODLAND_PARC_NAME);
    });

    // ── 4. unitId FK → unit 2767-3 + cross-source propertyId match ──────
    it('WO 19441-1 unitId resolves to unit "2767-3" in units.json AND that unit\'s propertyId matches the row\'s propertyId (FK chain integrity)', () => {
        const seed = workitemsSeed as unknown as Array<{ id: string; propertyId: string | null; unitId: string | null }>;
        const row = seed.find(w => w.id === TASK_2_9_PROJECT_ID);
        expect(row?.unitId).toBe(UNIT_2767_3_ID);
        const units = unitsSeed as unknown as Array<{ id: string; propertyId: string; unitNumber: string }>;
        const unit = units.find(u => u.id === UNIT_2767_3_ID);
        expect(unit, 'unit 2767-3 must exist in units.json').toBeDefined();
        expect(unit!.unitNumber).toBe(UNIT_2767_3_NUMBER);
        expect(unit!.propertyId).toBe(row!.propertyId);
    });

    // ── 5. metadata.vendorId FK → active CS Cooper vendor entity ────────
    it('WO 19441-1 metadata.vendorId resolves to an active CS Cooper vendor entity in entities.json (canonical mixed-case spelling)', () => {
        const seed = workitemsSeed as unknown as Array<{ id: string; metadata: any }>;
        const row = seed.find(w => w.id === TASK_2_9_PROJECT_ID);
        expect(row?.metadata?.vendorId).toBe(CS_COOPER_VENDOR_ID);
        expect(row?.metadata?.vendorName).toBe(CS_COOPER_NAME);
        const entities = entitiesSeed as unknown as Array<{ id: string; entityType: string; name: string; status: string }>;
        const vendor = entities.find(e => e.id === CS_COOPER_VENDOR_ID);
        expect(vendor, 'CS Cooper vendor entity must exist').toBeDefined();
        expect(vendor!.entityType).toBe('vendor');
        expect(vendor!.status).toBe('active');
        expect(vendor!.name).toBe(CS_COOPER_NAME);
    });

    // ── 6. ProjectsModule by-entity grouping logic — Woodland Parc bucket
    it('replicates ProjectsModule.tsx L82-110 by-entity grouping logic against the seed: WO 19441-1 lands in the "property:Woodland Parc" bucket (v1 L146 GR-4 acceptance proof at handler level)', () => {
        const seed = workitemsSeed as unknown as Array<any>;
        const props = propertiesSeed as unknown as Array<{ id: string; name: string }>;
        const propMap = new Map<string, { id: string; name: string }>();
        props.forEach(p => propMap.set(p.id, p));
        // Replicate ProjectsModule's by-entity grouping (propertyId
        // primary, metadata.vendorId secondary, "unassigned" fallback).
        const groups = new Map<string, { label: string; items: any[] }>();
        for (const w of seed) {
            let key = 'unassigned';
            let label = 'Unassigned / General';
            if (w.propertyId) {
                key = `property:${w.propertyId}`;
                const prop = propMap.get(w.propertyId);
                label = prop ? prop.name : `Property ${w.propertyId.slice(0, 8)}…`;
            } else if (w.metadata?.vendorId) {
                key = `vendor:${w.metadata.vendorId}`;
                label = w.metadata.vendorName || `Vendor ${w.metadata.vendorId.slice(0, 8)}…`;
            }
            if (!groups.has(key)) groups.set(key, { label, items: [] });
            groups.get(key)!.items.push(w);
        }
        const wpBucket = groups.get(`property:${WOODLAND_PARC_PROPERTY_ID}`);
        expect(wpBucket, 'Woodland Parc bucket must exist after grouping').toBeDefined();
        expect(wpBucket!.label).toBe(WOODLAND_PARC_NAME);
        // The new project row must be present in the WP bucket.
        const ourRow = wpBucket!.items.find(w => w.id === TASK_2_9_PROJECT_ID);
        expect(ourRow, 'WO 19441-1 must group under Woodland Parc Townhomes (v1 L146 acceptance)').toBeDefined();
        // Pre-Task-2.9 there was 1 fire-alarm work_order on WP; post-Task-2.9
        // there are 2 (the fire alarm + WO 19441-1). Pin the count to catch
        // future drift.
        expect(wpBucket!.items).toHaveLength(2);
    });
});
