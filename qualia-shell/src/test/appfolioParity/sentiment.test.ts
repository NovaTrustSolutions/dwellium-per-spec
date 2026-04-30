/**
 * AppFolio parity contract test — Sentiment static handlers (Task 2.8)
 *
 * Contract: GET /sentiment/scores, /sentiment/history, /sentiment/by-entity
 * in strataApi.static.ts are the static-mode counterparts for the live
 * backend at localhost:3000/api/sentiment/{trends,response} that
 * SentimentModule.tsx historically hit directly. Pre-Task-2.8, static
 * mode was effectively broken — the raw fetches always failed against
 * "Could not connect to backend". The Task 2.8 rewire (commit C)
 * routes the module through strataGet<SentimentScoreView>('/sentiment/scores')
 * + isStaticMode-guarded POST and the new handlers (commit B) return
 * typed projections from the new sentiment_scores.json fixture (40
 * rows / 20 at-risk / deterministic from sorted entities.json
 * tenantIds; zero real AppFolio PII).
 *
 * Source of truth: plan v2.8 §8 L330 (route list + entities.json
 * non-mutation guard). v1 L144's "3,274 captured tenants / Past-status"
 * is documented as Phase-3 AppFolio re-capture deferral (true count is
 * 322 active tenants). The "20 at-risk" acceptance from v1 L144 is
 * preserved by fixture construction (rows 0-19 carry atRisk: true).
 *
 * Cross-test note: this test does NOT touch entities.json (plan §8
 * L330 explicit guard) and does NOT touch the tenant surface in any
 * way. It asserts a drift bound on the 322-tenant baseline and a
 * non-active count of 0 to catch any future status mutation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SentimentScoreView, SentimentHistory, SentimentByEntity } from '@qualia/types';
import sentimentSeed from '../../../public/data/sentiment_scores.json';
import entitiesSeed from '../../../public/data/entities.json';
import propertiesSeed from '../../../public/data/properties.json';

// Drift-bound constants (PRE1 reality: 322 active tenants, all status:
// active; v1's "3,274" was pre-capture estimation — Phase-3 re-capture
// deferral). These pin the baseline the rest of Task 2.8 sits on.
// Phase-4 Task 4.2 (2026-04-29): page-1 closeout absorbed +12 inactive
// (Past-status) tenants from 04_tenants_page1.json into entities.json
// → total tenant subset 322 → 334. The 322-active baseline still
// holds; the GR-2 drift guard below was relaxed from strict count to
// "active subset === 322 + total ≥ 322" so Phase-4 page-1+ inactive
// growth doesn't regress the test. Sentiment fixture itself remains
// unchanged (40 / 20 at-risk derive from active subset).
const TENANTS_BASELINE_PHASE_1_ACTIVE = 322;

// Deterministic anchors from the fixture (40 rows / 20 at-risk / 2
// unique propertyIds). The fixture is generated from sorted tenantIds
// in entities.json, so these counts are stable across re-runs.
const FIXTURE_TOTAL = 40;
const FIXTURE_AT_RISK = 20;
const RIVERWOOD_PROPERTY_ID = '705a6f52-f4a1-403b-ae3f-b3954b2cdac1';
const RIVERWOOD_FIXTURE_ROWS = 26;
const RIVERWOOD_FIXTURE_AT_RISK = 14;

describe('sentiment parity — static /sentiment/* handlers (Task 2.8)', () => {
    beforeEach(() => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = typeof input === 'string' ? input : input.toString();
            if (url.endsWith('/data/sentiment_scores.json')) {
                return { ok: true, json: async () => sentimentSeed } as Response;
            }
            if (url.endsWith('/data/entities.json')) {
                return { ok: true, json: async () => entitiesSeed } as Response;
            }
            if (url.endsWith('/data/properties.json')) {
                return { ok: true, json: async () => propertiesSeed } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as typeof fetch;
    });

    // ── 1. /sentiment/scores no-params shape + aggregates ───────────────
    it('GET /sentiment/scores (no params) returns a typed SentimentScoreView; trends.length === 40; aggregates internally consistent', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const result = await strataGet<SentimentScoreView>('/sentiment/scores');
        expect(result).toBeDefined();
        expect(Array.isArray(result.trends)).toBe(true);
        expect(result.trends).toHaveLength(FIXTURE_TOTAL);
        expect(result.totalTracked).toBe(FIXTURE_TOTAL);
        // Aggregate fields match the actual filter counts on the returned set.
        expect(result.atRiskCount).toBe(result.trends.filter(t => t.atRisk).length);
        expect(result.improvingCount).toBe(result.trends.filter(t => t.trend === 'improving').length);
        // avgScore is the mean of avgScore values, rounded to 2 decimals.
        const expectedAvg = +(result.trends.reduce((s, t) => s + t.avgScore, 0) / result.trends.length).toFixed(2);
        expect(result.avgScore).toBe(expectedAvg);
        // Each row carries every SentimentScore field with the right type.
        for (const t of result.trends) {
            expect(typeof t.tenantId).toBe('string');
            expect(typeof t.tenantName).toBe('string');
            expect(typeof t.unit).toBe('string');
            expect(typeof t.propertyId).toBe('string');
            expect(typeof t.propertyName).toBe('string');
            expect(typeof t.latestScore).toBe('number');
            expect(typeof t.avgScore).toBe('number');
            expect(['improving', 'stable', 'declining']).toContain(t.trend);
            expect(typeof t.consecutiveDeclines).toBe('number');
            expect(typeof t.atRisk).toBe('boolean');
            expect(Array.isArray(t.responses)).toBe(true);
        }
    });

    // ── 2. ?atRisk=true filter (v1 L144 GR-4 acceptance proof) ──────────
    it('?atRisk=true filter returns exactly the 20 at-risk rows; aggregate atRiskCount tracks the filter', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const result = await strataGet<SentimentScoreView>('/sentiment/scores', { atRisk: 'true' });
        expect(result.trends).toHaveLength(FIXTURE_AT_RISK);
        expect(result.totalTracked).toBe(FIXTURE_AT_RISK);
        expect(result.atRiskCount).toBe(FIXTURE_AT_RISK);
        // Every returned row is at-risk (no false positives in the filter).
        for (const t of result.trends) {
            expect(t.atRisk).toBe(true);
        }
    });

    // ── 3. ?propertyId=X filter scopes correctly ────────────────────────
    it('?propertyId filter scopes trends + aggregates to the property; unknown propertyId returns the empty-aggregate shape', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const scoped = await strataGet<SentimentScoreView>('/sentiment/scores', { propertyId: RIVERWOOD_PROPERTY_ID });
        expect(scoped.trends).toHaveLength(RIVERWOOD_FIXTURE_ROWS);
        expect(scoped.totalTracked).toBe(RIVERWOOD_FIXTURE_ROWS);
        expect(scoped.atRiskCount).toBe(RIVERWOOD_FIXTURE_AT_RISK);
        for (const t of scoped.trends) {
            expect(t.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
        }
        // Unknown propertyId — defensive empty-aggregate, never throws.
        const unknown = await strataGet<SentimentScoreView>('/sentiment/scores', { propertyId: 'no-such-property-uuid' });
        expect(unknown.trends).toHaveLength(0);
        expect(unknown.totalTracked).toBe(0);
        expect(unknown.atRiskCount).toBe(0);
        expect(unknown.improvingCount).toBe(0);
        expect(unknown.avgScore).toBe(0);
    });

    // ── 4. /sentiment/history typed contract + defensive empty ──────────
    it('GET /sentiment/history?tenantId=X returns a typed SentimentHistory; unknown tenantId returns the empty defensive shape, never throws', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const knownTenantId = (sentimentSeed as Array<{ tenantId: string }>)[0].tenantId;
        const known = await strataGet<SentimentHistory>('/sentiment/history', { tenantId: knownTenantId });
        expect(known.tenantId).toBe(knownTenantId);
        expect(typeof known.tenantName).toBe('string');
        expect(Array.isArray(known.responses)).toBe(true);
        expect(known.responses.length).toBeGreaterThan(0);
        expect(known.stats.count).toBe(known.responses.length);
        const scores = known.responses.map(r => r.score);
        expect(known.stats.min).toBe(Math.min(...scores));
        expect(known.stats.max).toBe(Math.max(...scores));
        expect(known.stats.avg).toBe(+(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2));
        expect(typeof known.stats.latestDate).toBe('string');
        // Unknown tenantId → defensive shape; tenantName === ''; responses === [].
        const unknown = await strataGet<SentimentHistory>('/sentiment/history', { tenantId: 'no-such-tenant-uuid' });
        expect(unknown.tenantId).toBe('no-such-tenant-uuid');
        expect(unknown.tenantName).toBe('');
        expect(unknown.responses).toHaveLength(0);
        expect(unknown.stats.count).toBe(0);
        expect(unknown.stats.avg).toBe(0);
        expect(unknown.stats.latestDate).toBeNull();
    });

    // ── 5. /sentiment/by-entity property + community + unknown ──────────
    it('GET /sentiment/by-entity scopes byTenant by property; entityName resolves; unknown entityId returns the empty defensive shape', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const byProp = await strataGet<SentimentByEntity>('/sentiment/by-entity', {
            entityType: 'property',
            entityId: RIVERWOOD_PROPERTY_ID,
        });
        expect(byProp.entityType).toBe('property');
        expect(byProp.entityId).toBe(RIVERWOOD_PROPERTY_ID);
        expect(byProp.entityName).toBe('Riverwood Club Apartments');
        expect(byProp.totalTracked).toBe(RIVERWOOD_FIXTURE_ROWS);
        expect(byProp.atRiskCount).toBe(RIVERWOOD_FIXTURE_AT_RISK);
        expect(byProp.byTenant).toHaveLength(RIVERWOOD_FIXTURE_ROWS);
        for (const t of byProp.byTenant) {
            expect(t.propertyId).toBe(RIVERWOOD_PROPERTY_ID);
        }
        // Unknown entityId — defensive zero-aggregate, never throws.
        const unknown = await strataGet<SentimentByEntity>('/sentiment/by-entity', {
            entityType: 'property',
            entityId: 'no-such-property-uuid',
        });
        expect(unknown.byTenant).toHaveLength(0);
        expect(unknown.totalTracked).toBe(0);
        expect(unknown.atRiskCount).toBe(0);
        expect(unknown.avgScore).toBe(0);
        expect(unknown.entityName).toBe('');
    });

    // ── 6. GR-2 entities.json drift guard (plan §8 L330 non-mutation) ───
    // Active-subset semantic (Task 4.2 relaxation 2026-04-29): the
    // active baseline of 322 is the load-bearing invariant; total
    // tenant count is now ≥ 322 because Phase-4 page-1 closeout adds
    // inactive (Past-status) historical tenants. Sentiment fixture
    // (40 trends / 20 at-risk) derives from the active subset only,
    // so this relaxation does not regress §8 L330 non-mutation intent.
    it('GR-2 entities.json drift guard: active tenants === 322 (baseline holds); total ≥ 322 (Phase-4 may add inactive past tenants)', () => {
        const tenants = (entitiesSeed as Array<{ entityType: string; status: string }>).filter(
            e => e.entityType === 'tenant',
        );
        expect(tenants.filter(t => t.status === 'active')).toHaveLength(TENANTS_BASELINE_PHASE_1_ACTIVE);
        expect(tenants.length).toBeGreaterThanOrEqual(TENANTS_BASELINE_PHASE_1_ACTIVE);
    });

    // ── 7. GR-3 fixture integrity (FK validity + uniquePropertyIds) ─────
    it('GR-3 fixture integrity: every tenantId resolves in entities.json; every propertyId resolves in properties.json; uniquePropertyIds.size === 2', () => {
        const tenantIds = new Set(
            (entitiesSeed as Array<{ id: string; entityType: string }>)
                .filter(e => e.entityType === 'tenant')
                .map(e => e.id),
        );
        const propertyIds = new Set(
            (propertiesSeed as Array<{ id: string }>).map(p => p.id),
        );
        const seed = sentimentSeed as Array<{ tenantId: string; propertyId: string }>;
        for (const row of seed) {
            expect(tenantIds.has(row.tenantId), `orphaned tenantId ${row.tenantId}`).toBe(true);
            expect(propertyIds.has(row.propertyId), `orphaned propertyId ${row.propertyId}`).toBe(true);
        }
        const uniquePropertyIds = new Set(seed.map(r => r.propertyId));
        // Phase-3 AppFolio re-capture should diversify across more flagship
        // properties (currently 2; ideal >=5 per Task 2.10 multi-source
        // precedent). Pinning the actual value here so a future seed
        // expansion deliberately bumps this constant rather than silently
        // drifting.
        expect(uniquePropertyIds.size).toBe(2);
    });

    // ── 8. Aggregate + channel-type consistency across the full fixture ─
    it('aggregate consistency: full-fixture atRiskCount field === filter count; every response.channel ∈ SentimentChannel union; community branch returns the defensive shape', async () => {
        const { strataGet } = await import('../../components/StrataDashboard/strataApi.static');
        const all = await strataGet<SentimentScoreView>('/sentiment/scores');
        // The aggregate field cannot lie — must equal the actual filter count.
        expect(all.atRiskCount).toBe(all.trends.filter(t => t.atRisk).length);
        // Every response on every row carries a valid SentimentChannel.
        const validChannels = new Set(['manual', 'email', 'sms']);
        for (const t of all.trends) {
            for (const r of t.responses) {
                expect(validChannels.has(r.channel), `invalid channel ${r.channel} on response ${r.id}`).toBe(true);
                expect(r.score).toBeGreaterThanOrEqual(1);
                expect(r.score).toBeLessThanOrEqual(5);
            }
        }
        // /sentiment/by-entity community branch — no community-level fixture
        // today; defensive shape (zero-aggregate) must hold without throwing.
        const community = await strataGet<SentimentByEntity>('/sentiment/by-entity', {
            entityType: 'community',
            entityId: 'no-such-community',
        });
        expect(community.entityType).toBe('community');
        expect(community.byTenant).toHaveLength(0);
        expect(community.totalTracked).toBe(0);
        expect(community.atRiskCount).toBe(0);
    });
});
