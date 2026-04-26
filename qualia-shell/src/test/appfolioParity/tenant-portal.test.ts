/**
 * AppFolio parity contract test — TenantPortal fixtures + static handlers (Task 3.9)
 *
 * Contract: Task 3.9 commit B writes 2 NEW fixtures
 * `qualia-shell/public/data/tenant_portal_payments.json` (10 rows;
 *  6 paid / 2 pending / 2 overdue) and
 * `qualia-shell/public/data/tenant_portal_messages.json` (10 rows;
 *  6 inbound / 4 outbound; 3 reply pairs). All 20 IDs are stable
 * `tp-pay-NNN` / `tp-msg-NNN` (uniqueness invariant; uuid5 namespace
 * skipped per Task 3.8 corporate_review.json precedent — the test
 * exercises ID uniqueness, not UUID-format-ness).
 *
 * Tests 1-2 are NEW-fixture invariants (existence + ID uniqueness).
 * Test 3 is the GR-3 FK integrity check (every messages.tenantId
 * points at a real entities.json row with entityType=tenant).
 * Tests 4-6 exercise the derived static GET handlers
 * (/tenant/admin/directory + /tenant/admin/maintenance +
 *  /tenant/admin/lease-alerts) via direct module import +
 * fetch-mocking, resetting the strataApi.static module's dataCache
 * via `vi.resetModules()` so each test runs against a fresh load.
 * Reuses Task 3.8's first-in-suite static-handler direct-test
 * pattern; documented in `corporate-review.test.ts` header.
 *
 * Source of truth: plan v2 §15 L491 GR-13 mandate (closed by the
 * sibling `tenant-portal.module.test.tsx` render-layer test);
 * Task 3.9 DoR PRE0 / (a)–(g) ack chain (see commit B + C bodies).
 *
 * Cross-test note: this test reads `entities.json` via static
 * import for FK integrity validation (test #3) but does NOT modify
 * it — Task 3.9 is a pure-additive surface for
 * tenant_portal_messages.json + tenant_portal_payments.json only.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import paymentsSeed from '../../../public/data/tenant_portal_payments.json';
import messagesSeed from '../../../public/data/tenant_portal_messages.json';
import entitiesSeed from '../../../public/data/entities.json';
import unitsSeed from '../../../public/data/units.json';
import workitemsSeed from '../../../public/data/workitems.json';

const TASK_3_9_PAYMENTS_FIXTURE_LENGTH = 10;
const TASK_3_9_MESSAGES_FIXTURE_LENGTH = 10;
const PAYMENT_STATUS_VALUES: ReadonlyArray<string> = ['paid', 'pending', 'overdue', 'received', 'due'];
const MESSAGE_DIRECTION_VALUES: ReadonlyArray<string> = ['inbound', 'outbound'];

interface PaymentFixture {
    id: string;
    tenantId: string;
    tenantName: string;
    propertyId: string;
    propertyName: string;
    unitNumber: string;
    title: string;
    amount: number;
    status: string;
    createdAt: string;
}

interface MessageFixture {
    id: string;
    tenantId: string;
    tenantName: string;
    direction: string;
    subject: string;
    body: string;
    channel: string;
    createdAt: string;
    readStatus: string;
}

describe('tenant portal parity — Task 3.9 fixtures (10+10 row baselines)', () => {
    // ── 1. Payments fixture: length + ID uniqueness + status enum ──────
    it('GR-2 fixture drift guard: tenant_portal_payments seed.length === 10; all IDs unique; status ∈ enum', () => {
        const seed = paymentsSeed as unknown as PaymentFixture[];
        expect(seed).toHaveLength(TASK_3_9_PAYMENTS_FIXTURE_LENGTH);
        const ids = new Set(seed.map(p => p.id));
        expect(ids.size).toBe(TASK_3_9_PAYMENTS_FIXTURE_LENGTH);
        for (const p of seed) {
            expect(PAYMENT_STATUS_VALUES).toContain(p.status);
        }
    });

    // ── 2. Messages fixture: length + ID uniqueness + direction enum ───
    it('GR-2 fixture drift guard: tenant_portal_messages seed.length === 10; all IDs unique; direction ∈ enum; readStatus ∈ {read, unread}', () => {
        const seed = messagesSeed as unknown as MessageFixture[];
        expect(seed).toHaveLength(TASK_3_9_MESSAGES_FIXTURE_LENGTH);
        const ids = new Set(seed.map(m => m.id));
        expect(ids.size).toBe(TASK_3_9_MESSAGES_FIXTURE_LENGTH);
        for (const m of seed) {
            expect(MESSAGE_DIRECTION_VALUES).toContain(m.direction);
            expect(['read', 'unread']).toContain(m.readStatus);
        }
    });

    // ── 3. GR-3 FK integrity: messages.tenantId + payments.tenantId ─────
    it('GR-3 FK integrity: every messages/payments tenantId points at an entityType=tenant row in entities.json', () => {
        const entities = entitiesSeed as unknown as Array<{ id: string; entityType: string }>;
        const tenantIds = new Set(entities.filter(e => e.entityType === 'tenant').map(e => e.id));
        const messages = messagesSeed as unknown as MessageFixture[];
        const payments = paymentsSeed as unknown as PaymentFixture[];
        for (const m of messages) {
            expect(tenantIds.has(m.tenantId)).toBe(true);
        }
        for (const p of payments) {
            expect(tenantIds.has(p.tenantId)).toBe(true);
        }
    });

    // ── 4-6. Derived static handler exercise ────────────────────────────
    // Direct-import the static impl (NOT the strataApi.ts barrel) so we
    // bypass the VITE_USE_STATIC_API routing decision entirely. fetch is
    // mocked to serve each canonical fixture by URL; vi.resetModules()
    // evicts the dataCache so each test loads fresh. This is the
    // canonical pattern from Task 3.8 first-in-suite static-handler
    // direct-test; reused here for the 3 derived endpoints
    // (/directory + /maintenance + /lease-alerts).
    describe('static GET handlers — /tenant/admin/{directory,maintenance,lease-alerts}', () => {
        let strataGet: typeof import('../../components/StrataDashboard/strataApi.static').strataGet;
        const originalFetch = globalThis.fetch;

        beforeEach(async () => {
            globalThis.fetch = vi.fn(async (url: any) => {
                const u = typeof url === 'string' ? url : '';
                if (u.includes('entities.json')) {
                    return { ok: true, json: async () => entitiesSeed } as Response;
                }
                if (u.includes('units.json')) {
                    return { ok: true, json: async () => unitsSeed } as Response;
                }
                if (u.includes('workitems.json')) {
                    return { ok: true, json: async () => workitemsSeed } as Response;
                }
                if (u.includes('tenant_portal_payments.json')) {
                    return { ok: true, json: async () => paymentsSeed } as Response;
                }
                if (u.includes('tenant_portal_messages.json')) {
                    return { ok: true, json: async () => messagesSeed } as Response;
                }
                return { ok: false, status: 404, json: async () => ({ error: 'not found' }) } as Response;
            }) as typeof globalThis.fetch;
            vi.resetModules();
            const mod = await import('../../components/StrataDashboard/strataApi.static');
            strataGet = mod.strataGet;
            try { localStorage.clear(); } catch { /* jsdom always provides localStorage */ }
        });

        afterEach(() => {
            globalThis.fetch = originalFetch;
        });

        // ── 4. /directory derives from entities (entityType=tenant + status=active)
        it('/tenant/admin/directory returns tenants only (entityType=tenant, status=active) with pivoted unit/property fields', async () => {
            const result = await strataGet<any[]>('/tenant/admin/directory');
            expect(Array.isArray(result)).toBe(true);
            // Must be a non-empty subset of the 322 active tenants in
            // entities.json (verified at PRE1).
            expect(result.length).toBeGreaterThan(0);
            // Every row must have the canonical TenantPortal directory
            // field set populated (id + name + status).
            for (const r of result) {
                expect(typeof r.id).toBe('string');
                expect(typeof r.name).toBe('string');
                expect(r.status).toBe('active');
            }
            // status filter is structurally impossible to violate since
            // we filter against entityType + status before mapping — a
            // non-tenant row in result would mean the handler is broken.
            const entities = entitiesSeed as unknown as Array<{ id: string; entityType: string; status: string }>;
            const tenantIds = new Set(entities.filter(e => e.entityType === 'tenant' && e.status === 'active').map(e => e.id));
            for (const r of result) {
                expect(tenantIds.has(r.id)).toBe(true);
            }
        });

        // ── 5. /maintenance filters workitems to type=work_order + domain=maintenance
        it('/tenant/admin/maintenance returns only work_order rows in the maintenance domain', async () => {
            const result = await strataGet<any[]>('/tenant/admin/maintenance');
            expect(Array.isArray(result)).toBe(true);
            // Verify shape: every row has id + title + priority + status + createdAt.
            for (const r of result) {
                expect(typeof r.id).toBe('string');
                expect(typeof r.title).toBe('string');
                expect(typeof r.priority).toBe('string');
                expect(typeof r.status).toBe('string');
                expect(typeof r.createdAt).toBe('string');
            }
            // Cross-check against the workitems source: every result row
            // must trace to a workitem with type=work_order + domain=
            // maintenance. (Filter applied in handler at static.ts.)
            const wis = workitemsSeed as unknown as Array<{ id: string; type: string; domain: string }>;
            const maintIds = new Set(
                wis.filter(w => w.type === 'work_order' && w.domain === 'maintenance').map(w => w.id)
            );
            expect(result.length).toBe(maintIds.size);
            for (const r of result) {
                expect(maintIds.has(r.id)).toBe(true);
            }
        });

        // ── 6. /lease-alerts filters units to leaseEnd within 90 days, sorted by daysRemaining
        it('/tenant/admin/lease-alerts returns only future leases within 90 days, sorted by daysRemaining ascending, with urgency tier classification', async () => {
            // Pin the clock so daysRemaining math is deterministic.
            // 2026-04-26 is the kickoff date (per CLAUDE.md L99); the
            // units fixture has leaseEnds in 2026-2028 range so 90-day
            // window ends 2026-07-25.
            vi.useFakeTimers();
            vi.setSystemTime(new Date('2026-04-26T12:00:00.000Z'));
            try {
                const result = await strataGet<any[]>('/tenant/admin/lease-alerts');
                expect(Array.isArray(result)).toBe(true);
                // Sort invariant: ascending by daysRemaining.
                for (let i = 1; i < result.length; i++) {
                    expect(result[i].daysRemaining).toBeGreaterThanOrEqual(result[i - 1].daysRemaining);
                }
                // Cutoff invariant: every row's daysRemaining ∈ [0, 90].
                for (const a of result) {
                    expect(a.daysRemaining).toBeGreaterThanOrEqual(0);
                    expect(a.daysRemaining).toBeLessThanOrEqual(90);
                }
                // Urgency tier classification.
                for (const a of result) {
                    if (a.daysRemaining <= 30) expect(a.urgency).toBe('high');
                    else if (a.daysRemaining <= 60) expect(a.urgency).toBe('medium');
                    else expect(a.urgency).toBe('low');
                }
            } finally {
                vi.useRealTimers();
            }
        });
    });
});
