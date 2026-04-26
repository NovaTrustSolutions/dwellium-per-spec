/**
 * AppFolio parity contract test — Corporate Review fixture (Task 3.8)
 *
 * Contract: Task 3.8 commit B writes a NEW fixture
 * `qualia-shell/public/data/corporate_review.json` (12 documents — 4
 * pending / 3 triaged / 3 approved / 2 rejected; 1 critical / 4 high /
 * 5 medium / 2 low priorities; categories drawn from the
 * `CATEGORIES` constant at `CorporateReview.tsx:38`). All 12 IDs are
 * deterministic uuid5 values seeded from a Task-3.8-namespaced UUID for
 * reproducibility — see commit B body for the seed seed.
 *
 * Tests 1-4 are fixture-only invariants (no handler exercise). Tests
 * 5-6 exercise the static GET handler at
 * `strataApi.static.ts:matchRoute` via direct module import +
 * fetch-mocking, resetting the strataApi.static module's dataCache via
 * `vi.resetModules()` so each test runs against a fresh load. This is
 * the *first* fixture-level test in the AppFolio parity suite to
 * exercise a static handler directly (Task 3.7 / 2.9 / 2.6 / 2.4 / 2.8
 * all stayed at the data-layer assertion boundary); the pattern is
 * established here for future modules with non-trivial filter
 * semantics.
 *
 * Source of truth: plan v2 §15 L491 GR-13 mandate (closed by the
 * sibling `corporate-review.module.test.tsx` render-layer test);
 * Task 3.8 DoR PRE0 / (a)–(g) ack chain (see commit B + C bodies).
 *
 * Cross-test note: this test reads `workitems.json` via static import
 * for FK integrity validation (test #4) but does NOT modify it — Task
 * 3.8 is a pure-additive surface for `corporate_review.json` only;
 * workitems.json baseline 1152 holds from Task 2.9.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import corpReviewSeed from '../../../public/data/corporate_review.json';
import workitemsSeed from '../../../public/data/workitems.json';

const REVIEW_STATUS_VALUES: ReadonlyArray<string> = ['pending', 'triaged', 'approved', 'rejected'];
const DOC_PRIORITY_VALUES: ReadonlyArray<string> = ['critical', 'high', 'medium', 'low'];
const TASK_3_8_FIXTURE_LENGTH = 12;
const TASK_3_8_PENDING_COUNT = 4;
const TASK_3_8_APPROVED_COUNT = 3;

interface ReviewDocFixture {
    id: string;
    filename: string;
    uploadedBy: string;
    status: string;
    priority: string;
    category: string;
    notes: string;
    workitemId: string | null;
    createdAt: string;
    updatedAt: string;
}

describe('corporate review parity — Task 3.8 corporate_review.json fixture (12-doc baseline)', () => {
    // ── 1. Length + ID uniqueness ──────────────────────────────────────
    it('GR-2 fixture drift guard: seed.length === 12 and all IDs are unique', () => {
        const seed = corpReviewSeed as unknown as ReviewDocFixture[];
        expect(seed).toHaveLength(TASK_3_8_FIXTURE_LENGTH);
        const ids = new Set(seed.map(d => d.id));
        expect(ids.size).toBe(TASK_3_8_FIXTURE_LENGTH);
    });

    // ── 2. Status enum compliance ───────────────────────────────────────
    it('every doc.status is in the ReviewStatus union (pending|triaged|approved|rejected)', () => {
        const seed = corpReviewSeed as unknown as ReviewDocFixture[];
        for (const d of seed) {
            expect(REVIEW_STATUS_VALUES).toContain(d.status);
        }
    });

    // ── 3. Priority enum compliance ─────────────────────────────────────
    it('every doc.priority is in the DocPriority union (critical|high|medium|low)', () => {
        const seed = corpReviewSeed as unknown as ReviewDocFixture[];
        for (const d of seed) {
            expect(DOC_PRIORITY_VALUES).toContain(d.priority);
        }
    });

    // ── 4. workitemId nullability + GR-3 FK integrity ───────────────────
    it('GR-3 FK integrity: approved rows have non-null workitemId pointing into workitems.json; non-approved rows have null', () => {
        const seed = corpReviewSeed as unknown as ReviewDocFixture[];
        const wis = workitemsSeed as unknown as Array<{ id: string }>;
        const wiIds = new Set(wis.map(w => w.id));
        const approvedRows = seed.filter(d => d.status === 'approved');
        expect(approvedRows).toHaveLength(TASK_3_8_APPROVED_COUNT);
        for (const d of seed) {
            if (d.status === 'approved') {
                expect(d.workitemId).not.toBeNull();
                expect(wiIds.has(d.workitemId!)).toBe(true);
            } else {
                expect(d.workitemId).toBeNull();
            }
        }
    });

    // ── 5-6. Static GET handler exercise ────────────────────────────────
    // Direct-import the static impl (NOT the strataApi.ts barrel) so we
    // bypass the VITE_USE_STATIC_API routing decision entirely. fetch is
    // mocked to serve the seed for `/data/corporate_review.json`;
    // `vi.resetModules()` evicts the dataCache so each test loads fresh.
    // This is the canonical pattern for any future static-handler unit
    // test that needs fixture isolation.
    describe('static GET handler — /corporate-review', () => {
        let strataGet: typeof import('../../components/StrataDashboard/strataApi.static').strataGet;
        const originalFetch = globalThis.fetch;

        beforeEach(async () => {
            globalThis.fetch = vi.fn(async (url: any) => {
                if (typeof url === 'string' && url.includes('corporate_review.json')) {
                    return { ok: true, json: async () => corpReviewSeed } as Response;
                }
                return { ok: false, status: 404, json: async () => ({ error: 'not found' }) } as Response;
            }) as typeof globalThis.fetch;
            vi.resetModules();
            const mod = await import('../../components/StrataDashboard/strataApi.static');
            strataGet = mod.strataGet;
            // Clear localStorage so changes-overlay logic doesn't bleed
            // across tests (loadTable folds in `_created`/`_updated`/
            // `_deleted` on every call).
            try { localStorage.clear(); } catch { /* jsdom always provides localStorage */ }
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        it('returns the full 12-doc list when no params are supplied', async () => {
            const result = await strataGet<ReviewDocFixture[]>('/corporate-review');
            expect(result).toHaveLength(TASK_3_8_FIXTURE_LENGTH);
        });

        it('?status=pending returns only the 4 pending rows', async () => {
            const result = await strataGet<ReviewDocFixture[]>('/corporate-review', { status: 'pending' });
            expect(result).toHaveLength(TASK_3_8_PENDING_COUNT);
            for (const d of result) expect(d.status).toBe('pending');
        });
    });
});
