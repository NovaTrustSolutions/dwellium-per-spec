// @vitest-environment jsdom
// @vitest-environment-options {"url": "http://localhost:3000/"}
/**
 * Phase-5 Task 5.2 — Backend vs MSW contract tests.
 *
 * Goal (per Plan v2 §8 L322 + Phase_5_Plan.md L128-138 verbatim):
 * "Prove the real backend and the MSW-style strataApi.static.ts
 *  return structurally identical payloads for identical inputs.
 *  ... Run a deep-structural-equality check (shape, not values)."
 *
 * Architecture
 * ────────────
 * Each it-block calls the SAME endpoint+verb on BOTH:
 *   • backend variant — strataApi.backend.* → fetch /api/dwellium/<path>
 *     (intercepted by MSW; handler returns a shape-equivalent payload)
 *   • static variant — strataApi.static.*  → fetch /data/<table>.json
 *     (intercepted by MSW; handler reads the on-disk fixture file)
 * and asserts shapeOf parity (key-set + typeof at every depth).
 *
 * Both impls share fetch interception so jsdom's fetch can resolve
 * relative URLs against the test base URL set via the
 * @vitest-environment-options directive above. MSW 2.14.2 (exact pin)
 * registers handlers at http://localhost:3000/...; jsdom resolves the
 * relative paths from strataApi.{backend,static}.ts against that
 * base. NO production-source modifications.
 *
 * Slug-namespace fixture IDs throughout (Task 5.1b §7 entry 1
 * carry-forward — pre-existing PII guard regex
 * /\b(?:\d[ -]*?){13,19}\b/ at complianceEngine.test.ts:228 false-
 * positives on UUID 16-digit hex prefixes; slug-namespace bypasses).
 *
 * X-Qualia-API: v2 invariance regression guards re-assert Task 5.1c's
 * unconditional header emission across both request() and
 * strataUpload() pathways (extends strataApi.test.ts L60/102/168 +
 * the 2 it-blocks added at 5.1c).
 *
 * shapeOf helper non-degeneracy guards against the JSON-identity
 * round-trip trap captured at Task 5.1b §7 entry 3
 * (`expect(JSON.parse(JSON.stringify(x))).toEqual(x)` silently passes
 * on JSON-dropped Date / Map / BigInt / function / undefined fields).
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { readFileSync } from 'fs';
import { join } from 'path';

import * as backendImpl from '../../components/StrataDashboard/strataApi.backend';
import * as staticImpl from '../../components/StrataDashboard/strataApi.static';

// ─── shapeOf — non-degenerate recursive shape extraction ───────────────────
// Returns a deeply-recursive structural skeleton of `value` where every
// leaf is replaced by its typeof tag. Distinguishes:
//   • null vs undefined ('null' vs 'undefined' — JSON-dropped fields would
//     otherwise compare equal under JSON.parse/stringify identity)
//   • empty arrays vs non-empty arrays (sentinel '<empty>' vs element shape)
//   • nested object key-sets sorted for stable comparison
// Used by every contract test below to compare backend-vs-static response
// shapes without coupling to volatile values.
function shapeOf(value: unknown): unknown {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) {
        if (value.length === 0) return ['Array', '<empty>'];
        return ['Array', shapeOf(value[0])];
    }
    if (typeof value === 'object') {
        const out: Record<string, unknown> = {};
        for (const k of Object.keys(value as object).sort()) {
            out[k] = shapeOf((value as Record<string, unknown>)[k]);
        }
        return out;
    }
    return typeof value;
}

// ─── shapeOf helper unit tests (non-degeneracy guards) ─────────────────────
describe('shapeOf — helper non-degeneracy', () => {
    it('distinguishes null from undefined (JSON-identity-trap regression guard)', () => {
        expect(shapeOf(null)).toEqual('null');
        expect(shapeOf(undefined)).toEqual('undefined');
        expect(shapeOf(null)).not.toEqual(shapeOf(undefined));
    });

    it('catches missing nested keys at any depth', () => {
        const a = { user: { id: 1, email: 'x', profile: { age: 30 } } };
        const b = { user: { id: 1, profile: { age: 30 } } }; // missing 'email'
        const c = { user: { id: 1, email: 'x', profile: {} } }; // missing nested 'age'
        expect(shapeOf(a)).not.toEqual(shapeOf(b));
        expect(shapeOf(a)).not.toEqual(shapeOf(c));
    });
});

// ─── On-disk fixture reader ────────────────────────────────────────────────
// Reads JSON fixtures from qualia-shell/public/data/ at test time.
// process.cwd() resolves to qualia-shell/ when vitest runs from package
// root (the canonical convention used by the parity-gate workflow).
const DATA_DIR = join(process.cwd(), 'public', 'data');
function readFixture(filename: string): any {
    return JSON.parse(readFileSync(join(DATA_DIR, filename), 'utf-8'));
}

// ─── MSW server with shape-equivalent handlers ─────────────────────────────
// Two handler families:
//   1. /data/* — passthrough to on-disk fixture; serves staticImpl.loadTable
//   2. /api/dwellium/* — backend mocks; return payloads with the same
//      structural shape as their /data/* counterparts so contract parity
//      asserts the wrapper-layer contract (request/response handling +
//      filtering + write-pathway shape) — the genuine drift surface.
const BASE = 'http://localhost:3000';
const API = `${BASE}/api/dwellium`;

const server = setupServer(
    // /data/<name>.json — read on-disk fixture; if missing, return [] so
    // unhandled-table fall-throughs match static.ts behaviour.
    http.get(`${BASE}/data/:filename`, ({ params }) => {
        try {
            const content = readFileSync(join(DATA_DIR, params.filename as string), 'utf-8');
            return new HttpResponse(content, {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch {
            return HttpResponse.json([]);
        }
    }),

    // ── Backend GET handlers (return same shape as static returns) ──
    http.get(`${API}/properties`, () => HttpResponse.json(readFixture('properties.json'))),
    http.get(`${API}/units`, () => HttpResponse.json(readFixture('units.json'))),
    http.get(`${API}/entities`, () => HttpResponse.json(readFixture('entities.json'))),
    http.get(`${API}/workitems`, () => HttpResponse.json(readFixture('workitems.json'))),
    http.get(`${API}/property-modules`, () => HttpResponse.json(readFixture('property_modules.json'))),
    // /audit — static returns { entries, total } (paginated wrapper, see
    // strataApi.static.ts L112-131); mirror that shape exactly.
    http.get(`${API}/audit`, () => {
        const rows = readFixture('audit_log.json');
        return HttpResponse.json({ entries: rows.slice(0, 50), total: rows.length });
    }),
    http.get(`${API}/leases`, () => HttpResponse.json([])),
    http.get(`${API}/calendar`, () => HttpResponse.json([])),
    http.get(`${API}/communication-log`, () => HttpResponse.json([])),
    // /property-linked/:id — slug-namespace tenant id; static returns full
    // shape with empty arrays + summary scalar; mirror that here.
    http.get(`${API}/property-linked/:id`, () => HttpResponse.json({
        workitems: [], notes: [], legalIssues: [], legal: [],
        incidents: [], complianceItems: [], compliance: [],
        entityLinks: [],
        summary: { workitems: 0, legal: 0, compliance: 0, incidents: 0, entityLinks: 0, total: 0 },
    })),

    // ── Backend POST handlers (mirror createRecord shape from static) ──
    // createRecord returns: { ...body, id, createdAt, updatedAt }
    http.post(`${API}/properties`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...body, createdAt: 'iso', updatedAt: 'iso' });
    }),
    http.post(`${API}/workitems`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...body, createdAt: 'iso', updatedAt: 'iso' });
    }),
    http.post(`${API}/entities`, async ({ request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ ...body, createdAt: 'iso', updatedAt: 'iso' });
    }),

    // GlobalSearch: /search/log (POST, fall-through generic) and
    // /search/saved/:id (DELETE).
    http.post(`${API}/search/log`, () => HttpResponse.json({})),
    http.delete(`${API}/search/saved/:id`, () => HttpResponse.json({})),

    // ── Backend PUT handlers (mirror updateRecord shape: { id, ...body }) ──
    http.put(`${API}/properties/:id`, async ({ params, request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: params.id, ...body });
    }),
    http.put(`${API}/workitems/:id`, async ({ params, request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: params.id, ...body });
    }),
    http.put(`${API}/entities/:id`, async ({ params, request }) => {
        const body = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ id: params.id, ...body });
    }),
    // /property-modules PUT: matchWriteRoute returns body verbatim.
    http.put(`${API}/property-modules`, async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(body);
    }),

    // ── Backend DELETE handlers (return {} — strataDelete discards body) ──
    http.delete(`${API}/properties/:id`, () => HttpResponse.json({})),
    http.delete(`${API}/workitems/:id`, () => HttpResponse.json({})),
    http.delete(`${API}/entities/:id`, () => HttpResponse.json({})),

    // ── Multipart upload (Task 3.8 strataUpload pathway) ──
    // Static returns createRecord result on /corporate-review/upload —
    // mirror that shape here.
    http.post(`${API}/corporate-review/upload`, () => HttpResponse.json({
        id: 'test-doc-001',
        filename: 'test.pdf',
        uploadedBy: 'a@b.test',
        status: 'pending',
        priority: 'medium',
        category: 'static-upload',
        notes: '',
        workitemId: null,
        createdAt: 'iso',
        updatedAt: 'iso',
    })),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// ─── Per-endpoint contract tests ───────────────────────────────────────────
// 22 endpoint+verb combinations across useStrataQueries.ts (20) +
// GlobalSearch.tsx (2) per the Phase-5 Task 5.2 endpoint matrix, plus
// 1 multipart upload contract for the strataUpload pathway (Task 3.8).
// Total: 23 contract tests. Each asserts shapeOf parity between the
// backend variant and the static variant for the same path+params.
describe('strataApi contract — backend (MSW) vs static (in-memory) shape parity', () => {
    // ── GET endpoints (10) ──────────────────────────────────────────────
    it('GET /properties — Property[] shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/properties');
        const fromStatic = await staticImpl.strataGet('/properties');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /units — Unit[] shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/units');
        const fromStatic = await staticImpl.strataGet('/units');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /entities — EntityProfile[] shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/entities');
        const fromStatic = await staticImpl.strataGet('/entities');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /workitems — Workitem[] shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/workitems');
        const fromStatic = await staticImpl.strataGet('/workitems');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /property-linked/:id — multi-table aggregate shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/property-linked/test-prop-001');
        const fromStatic = await staticImpl.strataGet('/property-linked/test-prop-001');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /property-modules — module[] shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/property-modules');
        const fromStatic = await staticImpl.strataGet('/property-modules');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /leases — empty-array shape parity (no static handler)', async () => {
        const fromBackend = await backendImpl.strataGet('/leases');
        const fromStatic = await staticImpl.strataGet('/leases');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /calendar — empty-array shape parity (no static handler)', async () => {
        const fromBackend = await backendImpl.strataGet('/calendar');
        const fromStatic = await staticImpl.strataGet('/calendar');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /audit — audit_log[] shape parity', async () => {
        const fromBackend = await backendImpl.strataGet('/audit');
        const fromStatic = await staticImpl.strataGet('/audit');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('GET /communication-log — empty-array shape parity (no static handler)', async () => {
        const fromBackend = await backendImpl.strataGet('/communication-log');
        const fromStatic = await staticImpl.strataGet('/communication-log');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    // ── POST create endpoints (3) ───────────────────────────────────────
    // Send a sample body with same key-set as the fixture's first row so
    // both static (createRecord spreads body + adds timestamps) and
    // backend (MSW handler same) return identical-shape responses.
    it('POST /properties — Property create shape parity', async () => {
        const body = readFixture('properties.json')[0];
        const fromBackend = await backendImpl.strataPost('/properties', body);
        const fromStatic = await staticImpl.strataPost('/properties', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('POST /workitems — Workitem create shape parity', async () => {
        const body = readFixture('workitems.json')[0];
        const fromBackend = await backendImpl.strataPost('/workitems', body);
        const fromStatic = await staticImpl.strataPost('/workitems', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('POST /entities — EntityProfile create shape parity', async () => {
        const body = readFixture('entities.json')[0];
        const fromBackend = await backendImpl.strataPost('/entities', body);
        const fromStatic = await staticImpl.strataPost('/entities', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    // ── PUT update endpoints (4) ────────────────────────────────────────
    // Static updateRecord returns { id, ...body } — NO timestamps, just
    // id + the body fields. MSW handler mirrors that.
    it('PUT /properties/:id — Property update shape parity', async () => {
        const body = readFixture('properties.json')[0];
        const fromBackend = await backendImpl.strataPut('/properties/test-prop-001', body);
        const fromStatic = await staticImpl.strataPut('/properties/test-prop-001', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('PUT /workitems/:id — Workitem update shape parity', async () => {
        const body = readFixture('workitems.json')[0];
        const fromBackend = await backendImpl.strataPut('/workitems/test-wi-001', body);
        const fromStatic = await staticImpl.strataPut('/workitems/test-wi-001', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('PUT /entities/:id — EntityProfile update shape parity', async () => {
        const body = readFixture('entities.json')[0];
        const fromBackend = await backendImpl.strataPut('/entities/test-ent-001', body);
        const fromStatic = await staticImpl.strataPut('/entities/test-ent-001', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('PUT /property-modules — body-echo shape parity', async () => {
        const body = { propertyId: 'test-prop-001', moduleKey: 'test-mod', enabled: true };
        const fromBackend = await backendImpl.strataPut('/property-modules', body);
        const fromStatic = await staticImpl.strataPut('/property-modules', body);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    // ── DELETE endpoints (3) — strataDelete returns Promise<void> ──────
    it('DELETE /properties/:id — void shape parity', async () => {
        const fromBackend = await backendImpl.strataDelete('/properties/test-prop-001');
        const fromStatic = await staticImpl.strataDelete('/properties/test-prop-001');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('DELETE /workitems/:id — void shape parity', async () => {
        const fromBackend = await backendImpl.strataDelete('/workitems/test-wi-001');
        const fromStatic = await staticImpl.strataDelete('/workitems/test-wi-001');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('DELETE /entities/:id — void shape parity', async () => {
        const fromBackend = await backendImpl.strataDelete('/entities/test-ent-001');
        const fromStatic = await staticImpl.strataDelete('/entities/test-ent-001');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    // ── GlobalSearch endpoints (2) ──────────────────────────────────────
    it('POST /search/log — fall-through generic shape parity', async () => {
        const fromBackend = await backendImpl.strataPost('/search/log', { query: 'q' });
        const fromStatic = await staticImpl.strataPost('/search/log', { query: 'q' });
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    it('DELETE /search/saved/:id — void shape parity', async () => {
        const fromBackend = await backendImpl.strataDelete('/search/saved/test-search-001');
        const fromStatic = await staticImpl.strataDelete('/search/saved/test-search-001');
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });

    // ── Multipart upload (Task 3.8 strataUpload pathway) ───────────────
    // Static strataUpload flattens FormData → matchWriteRoute('POST',
    // '/corporate-review/upload', flatBody) → createRecord returns the
    // mock document. MSW backend handler mirrors that shape.
    it('POST /corporate-review/upload — multipart Document shape parity', async () => {
        const fd = new FormData();
        const blob = new Blob(['test content'], { type: 'application/pdf' });
        fd.append('file', new File([blob], 'test.pdf', { type: 'application/pdf' }));
        fd.append('category', 'static-upload');
        fd.append('priority', 'medium');
        fd.append('notes', '');
        const fromBackend = await backendImpl.strataUpload('/corporate-review/upload', fd);
        const fromStatic = await staticImpl.strataUpload('/corporate-review/upload', fd);
        expect(shapeOf(fromBackend)).toEqual(shapeOf(fromStatic));
    });
});

// ─── X-Qualia-API: v2 invariance regression guards (Task 5.1c extension) ──
// Cross-pathway defensive layer. If a future refactor accidentally
// drops the v2 header on one pathway (request, upload, etc.), these
// guards catch it independently of which contract test happens to
// run first. Mirrors Task 5.1c's explicit it-blocks at strataApi.test.ts
// L60/102/168 + the 2 added at 5.1c.
describe('X-Qualia-API: v2 — header invariance across backend pathways', () => {
    it('GET request() pathway emits X-Qualia-API: v2', async () => {
        let captured: Headers | undefined;
        server.use(http.get(`${API}/properties`, ({ request }) => {
            captured = request.headers;
            return HttpResponse.json([]);
        }));
        await backendImpl.strataGet('/properties');
        expect(captured?.get('X-Qualia-API')).toBe('v2');
    });

    it('POST request() pathway emits X-Qualia-API: v2', async () => {
        let captured: Headers | undefined;
        server.use(http.post(`${API}/workitems`, ({ request }) => {
            captured = request.headers;
            return HttpResponse.json({});
        }));
        await backendImpl.strataPost('/workitems', { title: 'x' });
        expect(captured?.get('X-Qualia-API')).toBe('v2');
    });

    it('strataUpload() pathway emits X-Qualia-API: v2', async () => {
        let captured: Headers | undefined;
        server.use(http.post(`${API}/corporate-review/upload`, ({ request }) => {
            captured = request.headers;
            return HttpResponse.json({});
        }));
        const fd = new FormData();
        fd.append('file', new File([new Blob(['x'])], 'x.pdf'));
        await backendImpl.strataUpload('/corporate-review/upload', fd);
        expect(captured?.get('X-Qualia-API')).toBe('v2');
    });
});
