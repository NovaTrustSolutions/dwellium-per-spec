/**
 * Strata API — COMPLETE Static Data Layer for Netlify deployment.
 * Handles ALL routes used by the frontend — static and dynamic.
 * Reads from pre-exported JSON files, persists changes to localStorage.
 */

const DATA_BASE = '/data';
const STORAGE_PREFIX = 'dwellium-changes-';
const dataCache: Record<string, any[]> = {};

function loadChanges(table: string): Record<string, any> {
    try { return JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${table}`) || '{}'); }
    catch { return {}; }
}
function saveChanges(table: string, changes: Record<string, any>) {
    localStorage.setItem(`${STORAGE_PREFIX}${table}`, JSON.stringify(changes));
}

async function loadTable<T extends { id: string }>(name: string): Promise<T[]> {
    if (!dataCache[name]) {
        try {
            const res = await fetch(`${DATA_BASE}/${name}.json`);
            dataCache[name] = res.ok ? await res.json() : [];
        } catch { dataCache[name] = []; }
    }
    const changes = loadChanges(name);
    let rows = [...dataCache[name]] as T[];
    if (changes._created) {
        for (const item of changes._created) {
            if (!rows.find(r => r.id === item.id)) rows.push(item);
        }
    }
    if (changes._updated) {
        for (const [id, updates] of Object.entries(changes._updated)) {
            const idx = rows.findIndex(r => r.id === id);
            if (idx >= 0) rows[idx] = { ...rows[idx], ...updates as any };
        }
    }
    if (changes._deleted) rows = rows.filter(r => !(changes._deleted as string[]).includes(r.id));
    return rows;
}

// ─── GET route matching ───
async function matchRoute(path: string, params?: Record<string, string>): Promise<any> {
    let m: RegExpMatchArray | null;

    // ═══════════════════════════════════════════════════
    // STATIC ROUTES (exact match)
    // ═══════════════════════════════════════════════════

    if (path === '/entities') {
        const all = await loadTable('entities');
        if (params?.type) {
            const types = params.type.split(',').map(t => t.trim());
            return (all as any[]).filter(e => types.includes(e.entityType));
        }
        return all;
    }
    if (path === '/entities/bulk-status') return { counts: {} };
    if (path === '/stats') {
        // Shell Overview aggregates: totalProperties/totalUnits/occupiedUnits/occupancyRate/openWorkOrders.
        // Computed live from fixtures so numbers match the rest of the page.
        const [props, units, wis] = await Promise.all([
            loadTable('properties'), loadTable('units'), loadTable('workitems'),
        ]);
        const activeProps = (props as any[]).filter(p => p.status === 'active');
        const totalUnits = (units as any[]).length;
        const occupiedUnits = (units as any[]).filter(u => u.status === 'occupied').length;
        const openWorkOrders = (wis as any[]).filter(w =>
            (w.status === 'open' || w.status === 'in_progress') && w.type === 'work_order',
        ).length;
        const occRateNum = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0;
        return {
            totalProperties: activeProps.length,
            totalUnits,
            occupiedUnits,
            occupancyRate: String(occRateNum),
            openWorkOrders,
        };
    }
    if (path === '/comms') {
        const all = await loadTable('communications') as any[];
        const limit = parseInt(params?.limit ?? String(all.length), 10) || all.length;
        return all.slice(0, limit);
    }
    if (path === '/properties') return loadTable('properties');
    if (path === '/property-modules') {
        const all = await loadTable('property_modules');
        return params?.property_id ? (all as any[]).filter((m: any) => m.propertyId === params.property_id) : all;
    }
    if (path === '/links') return filterBy(await loadTable('entity_links') as any[], params);
    if (path === '/spaces') {
        const all = await loadTable('profile_spaces');
        let f = all as any[];
        if (params?.entity_type) f = f.filter(s => s.entityType === params.entity_type);
        if (params?.entity_id) f = f.filter(s => s.entityId === params.entity_id);
        return f;
    }
    if (path === '/space-items') return filterBy(await loadTable('space_items') as any[], params);
    if (path === '/units') {
        const all = await loadTable('units');
        return params?.property_id ? (all as any[]).filter((u: any) => u.propertyId === params.property_id) : all;
    }
    if (path === '/workitems') {
        let f = await loadTable('workitems') as any[];
        if (params?.type) f = f.filter(w => w.type === params.type);
        if (params?.domain) f = f.filter(w => w.domain === params.domain);
        if (params?.property_id) f = f.filter(w => w.propertyId === params.property_id);
        if (params?.status) f = f.filter(w => w.status === params.status);
        return f;
    }
    if (path === '/audit') {
        // Backend returns { entries, total } for /audit — mirror that shape here
        // so AuditModule works identically in static mode.
        let rows = await loadTable('audit_log') as any[];
        if (params?.property_id) rows = rows.filter((a: any) => a.propertyId === params.property_id);
        if (params?.user_id) rows = rows.filter((a: any) => a.userId === params.user_id);
        if (params?.q) {
            const q = params.q.toLowerCase();
            rows = rows.filter((a: any) =>
                (a.action || '').toLowerCase().includes(q) ||
                (a.userName || '').toLowerCase().includes(q) ||
                (a.entityType || '').toLowerCase().includes(q),
            );
        }
        const total = rows.length;
        const limit = parseInt(params?.limit ?? '50', 10) || 50;
        const offset = parseInt(params?.offset ?? '0', 10) || 0;
        const entries = rows.slice(offset, offset + limit);
        return { entries, total };
    }
    // Task 2.7 — unified activity timeline across 5 source tables
    // (compliance + insurance + workitem actionsLog + audit_log +
    // communication). Returns UnifiedTimelineView.
    //
    // Security contract per /security-review checklist for multi-source
    // joins:
    //   - Each source branch writes an EXPLICIT `source: <literal>` tag
    //     on every event it emits. No computed-key access. No dynamic
    //     property-source propagation from input params. Type-confusion
    //     (a compliance row masquerading as an insurance event) is
    //     structurally impossible.
    //   - propertyId filter uses strict === on row fields only.
    //   - limit is parseInt-coerced with NaN fallback AND upper-capped
    //     at 1000 to prevent Array.slice with unbounded arg from
    //     callers (harmless here since it's a static JSON read, but the
    //     cap is the norm for the /security-review checklist).
    //   - audit_log events are excluded from property-scoped queries
    //     (rows have no propertyId — including them would leak
    //     non-property system events into a property-scoped view).
    if (path === '/audit/unified-timeline') {
        const [compliance, insurance, workitems, auditLogRows, communications] = await Promise.all([
            loadTable('compliance'),
            loadTable('insurance_policies'),
            loadTable('workitems'),
            loadTable('audit_log'),
            loadTable('communications'),
        ]);
        const propertyFilter = params?.propertyId;
        const events: any[] = [];

        // Source: compliance → ComplianceRecord rows as compliance_change events
        for (const r of compliance as any[]) {
            if (propertyFilter && r.propertyId !== propertyFilter) continue;
            const sev: 'info' | 'warning' | 'critical' =
                r.status === 'expired' ? 'critical' :
                r.status === 'missing' || r.status === 'warning' ? 'warning' : 'info';
            events.push({
                id: `compliance-${r.id}`,
                source: 'compliance',
                sourceId: r.id,
                category: 'compliance_change',
                severity: sev,
                title: `${r.label || r.itemType || 'Compliance item'} — ${r.status}`,
                description: r.notes || `${r.entityType} ${r.entityId || ''}`.trim(),
                propertyId: r.propertyId ?? null,
                entityId: r.entityId ?? null,
                actor: r.source ?? null,
                timestamp: r.lastAuditedAt || r.createdAt || r.expirationDate || '1970-01-01T00:00:00.000Z',
                relatedComplianceId: r.id,
            });
        }

        // Source: insurance → InsurancePolicy rows as policy_enforcement events
        for (const p of insurance as any[]) {
            if (propertyFilter && p.propertyId !== propertyFilter) continue;
            const enf = p.enforcementStatus;
            const sev: 'info' | 'warning' | 'critical' =
                enf === 'lapsed' ? 'critical' :
                enf === 'required' ? 'warning' : 'info';
            events.push({
                id: `insurance-${p.id}`,
                source: 'insurance',
                sourceId: p.id,
                category: 'policy_enforcement',
                severity: sev,
                title: `${p.carrier || 'Policy'} ${p.policyNumber || ''} — ${enf || p.status || 'unknown'}`.trim(),
                description: `${p.policyType || 'policy'} · coverage ${p.coverageAmount ?? '—'}`,
                propertyId: p.propertyId ?? null,
                entityId: p.entityId ?? null,
                actor: null,
                timestamp: p.effectiveDate || p.createdAt || '1970-01-01T00:00:00.000Z',
                relatedPolicyId: p.id,
            });
        }

        // Source: workitem actionsLog → one event per actionsLog entry
        for (const w of workitems as any[]) {
            if (propertyFilter && w.propertyId !== propertyFilter) continue;
            const al = Array.isArray(w.actionsLog) ? w.actionsLog : [];
            for (let i = 0; i < al.length; i++) {
                const a = al[i];
                events.push({
                    id: `workitem-${w.id}-${i}`,
                    source: 'workitem',
                    sourceId: w.id,
                    category: 'work_order_action',
                    severity: 'info',
                    title: a.event || 'Work-order action',
                    description: a.detail || w.title || '',
                    propertyId: w.propertyId ?? null,
                    entityId: w.entityId ?? null,
                    actor: a.actor ?? null,
                    timestamp: a.ts || w.createdAt || '1970-01-01T00:00:00.000Z',
                    relatedWorkitemId: w.id,
                });
            }
        }

        // Source: audit_log → only when NOT scoped to a property
        // (rows have no propertyId — a property-scoped query must not
        // leak unscoped system events).
        if (!propertyFilter) {
            for (const a of auditLogRows as any[]) {
                events.push({
                    id: `audit-${a.id}`,
                    source: 'audit_log',
                    sourceId: String(a.id),
                    category: 'user_action',
                    severity: 'info',
                    title: a.action || 'audit entry',
                    description: `${a.userName || 'system'} · ${a.entityType || ''}`.trim(),
                    propertyId: null,
                    entityId: a.entityId ?? null,
                    actor: a.userName ?? null,
                    timestamp: a.createdAt || '1970-01-01T00:00:00.000Z',
                });
            }
        }

        // Source: communications → communication events
        for (const c of communications as any[]) {
            if (propertyFilter && c.propertyId !== propertyFilter) continue;
            events.push({
                id: `communication-${c.id}`,
                source: 'communication',
                sourceId: c.id,
                category: 'communication',
                severity: 'info',
                title: c.subject || c.channel || 'communication',
                description: c.preview || c.body || '',
                propertyId: c.propertyId ?? null,
                entityId: c.entityId ?? null,
                actor: c.sender ?? null,
                timestamp: c.createdAt || c.sentAt || '1970-01-01T00:00:00.000Z',
            });
        }

        // Chronological descending
        events.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        const sourceBreakdown: Record<string, number> = {
            compliance: 0, insurance: 0, workitem: 0, audit_log: 0, communication: 0,
        };
        for (const e of events) {
            if (Object.prototype.hasOwnProperty.call(sourceBreakdown, e.source)) {
                sourceBreakdown[e.source]++;
            }
        }

        const rawLimit = parseInt(params?.limit ?? '100', 10);
        const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 100, 1000);
        return {
            events: events.slice(0, limit),
            total: events.length,
            sourceBreakdown,
            propertyId: propertyFilter ?? null,
            generatedAt: new Date().toISOString(),
        };
    }
    // Task 2.7 — metadata rollup for the AuditModule landing card.
    // Returns either the single row matching ?propertyId= (or null), or
    // the full 2-row array when no param is provided. Lineage between
    // this fixture and the runtime join above is enforced at test time.
    if (path === '/audit/unified-timeline/snapshot') {
        const rows = await loadTable('audit_timeline_index') as any[];
        if (params?.propertyId) {
            return rows.find(r => r.propertyId === params.propertyId) ?? null;
        }
        return rows;
    }
    if (path === '/occupancies') {
        // Task 1.1: 1:N occupancy (primary tenant + N other occupants).
        // Seeded from qualia-shell/public/data/occupancies.json.
        let f = await loadTable('occupancies') as any[];
        if (params?.primaryTenantId) f = f.filter(o => o.primaryTenantId === params.primaryTenantId);
        if (params?.unitId) f = f.filter(o => o.unitId === params.unitId);
        return f;
    }
    if (path === '/notes') return filterBy(await loadTable('notes') as any[], params);
    if (path === '/communications') return filterBy(await loadTable('communications') as any[], params);
    // Task 2.2 — thread rollup. Aggregates communications.json rows by
    // threadId into CommunicationThreadRollup objects. Optional
    // ?propertyId= filter uses strict === on the row's own propertyId.
    // Rows with threadId === null fall into a solo bucket (keyed by
    // `__solo-<rowId>` — prefix guarantees no collision with real
    // threadIds). Mirrors the Task 2.3 Section8Rollup / Task 2.5
    // FolioGuardRollup / Task 2.7 unified-timeline patterns: pure
    // function, no SQL, no computed-key access from input params, and
    // no data source beyond the trusted static fixture. Results sorted
    // chronologically descending by lastMessageAt.
    if (path === '/communications/thread-rollup') {
        const rows = await loadTable('communications') as any[];
        const propertyFilter = params?.propertyId;
        const scoped = propertyFilter
            ? rows.filter(r => r.propertyId === propertyFilter)
            : rows;
        const threads = new Map<string, any>();
        for (const r of scoped) {
            const key = r.threadId || `__solo-${r.id}`;
            if (!threads.has(key)) {
                threads.set(key, {
                    threadId: r.threadId ?? null,
                    propertyId: r.propertyId ?? null,
                    _participants: new Set<string>(),
                    messageCount: 0,
                    lastMessageAt: '1970-01-01T00:00:00.000Z',
                    _channels: new Set<string>(),
                    unreadCount: 0,
                });
            }
            const t = threads.get(key);
            t.messageCount++;
            if (r.fromAddress) t._participants.add(r.fromAddress);
            if (r.toAddress) t._participants.add(r.toAddress);
            if (r.channel) t._channels.add(r.channel);
            if ((r.createdAt || '') > t.lastMessageAt) t.lastMessageAt = r.createdAt;
            if (r.readStatus === 'unread') t.unreadCount++;
        }
        return [...threads.values()].map(t => ({
            threadId: t.threadId,
            propertyId: t.propertyId,
            participantCount: t._participants.size,
            messageCount: t.messageCount,
            lastMessageAt: t.lastMessageAt,
            channels: [...t._channels],
            unreadCount: t.unreadCount,
        })).sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    }
    if (path === '/compliance') return filterBy(await loadTable('compliance') as any[], params);
    // Task 2.3 — audit view returns the full ComplianceRecord list with
    // optional entityType/entityId/itemType/source filters. Replaces the
    // pre-Phase-2 empty-array stub so ComplianceEngine's Audit panel
    // shows real rows without flipping the global /compliance shape.
    if (path === '/compliance/audit') {
        let rows = await loadTable('compliance') as any[];
        if (params?.entityType) rows = rows.filter(r => r.entityType === params.entityType);
        if (params?.entityId) rows = rows.filter(r => r.entityId === params.entityId);
        if (params?.itemType) rows = rows.filter(r => r.itemType === params.itemType);
        if (params?.source) rows = rows.filter(r => r.source === params.source);
        return rows;
    }
    if (path === '/compliance/gaps') return [];
    // Task 2.3 — portfolio rollup extended with `section8` key. Pre-existing
    // `overall` + `categories` keys preserved for consumer back-compat
    // (ComplianceEngine.tsx reads both shapes defensively via `any`).
    if (path === '/compliance/portfolio-rollup') {
        const rows = await loadTable('compliance') as any[];
        const s8 = (await loadTable('section8_rollup') as any[])[0] ?? null;
        const nonMissing = rows.filter(r => r.status !== 'missing' && r.status !== 'expired').length;
        const overall = rows.length > 0 ? Math.round((nonMissing / rows.length) * 100) : 100;
        const byType = (type: string) => rows.filter(r => r.entityType === type);
        const counts = (subset: any[]) => ({
            total: subset.length,
            compliant: subset.filter(r => r.status === 'valid' || r.status === 'tracked').length,
            missing: subset.filter(r => r.status === 'missing').length,
            expiring: subset.filter(r => r.status === 'warning' || r.status === 'scheduled').length,
            expired: subset.filter(r => r.status === 'expired').length,
        });
        return {
            overall,
            categories: {
                vendor: counts(byType('vendor')),
                inspection: counts(byType('inspection')),
                policy: counts(byType('policy')),
                property: counts(byType('property')),
            },
            section8: s8,
        };
    }
    // Task 2.3 — new exact-match route; returns the single Section8Rollup
    // object (or null) from the committed section8_rollup.json fixture.
    // Lineage between this fixture and the underlying 9 AHA rows in
    // compliance.json is enforced at test time (see complianceEngine.test.ts).
    if (path === '/compliance/section8-rollup') {
        const rows = await loadTable('section8_rollup') as any[];
        return rows[0] ?? null;
    }
    if (path === '/compliance/reminders') return [];
    if (path === '/incidents') return filterBy(await loadTable('incidents') as any[], params);
    if (path === '/insurance-policies') return filterBy(await loadTable('insurance_policies') as any[], params);
    // Task 2.5 — new exact-match route; returns the single FolioGuardRollup
    // for a given property (via ?propertyId=) or the first available rollup
    // if no param is provided. Lineage between folioguard_rollup.json and
    // insurance_policies.json is enforced at test time (see insurance.test.ts
    // it-block #4). Strict === filter on propertyId value; no computed-key
    // access. Matches the Task 2.3 /compliance/section8-rollup pattern.
    if (path === '/insurance/folioguard-rollup') {
        const rows = await loadTable('folioguard_rollup') as any[];
        if (params?.propertyId) {
            return rows.find(r => r.propertyId === params.propertyId) ?? null;
        }
        return rows[0] ?? null;
    }
    if (path === '/invoices') return filterBy(await loadTable('invoices') as any[], params);
    if (path === '/intake/queue') return loadTable('intake_queue');
    if (path === '/intake/stats') return { pending: 0, approved: 0, total: 0 };
    if (path === '/vehicles') return filterBy(await loadTable('vehicles') as any[], params);
    if (path === '/vendor-associations') return filterBy(await loadTable('vendor_associations') as any[], params);
    if (path === '/reports') return loadTable('report_snapshots');
    if (path === '/predictive-flags') return [];
    if (path === '/leasing/renewals') return [];
    if (path === '/leasing/alerts') return [];
    if (path === '/maintenance/sla-report') return { metrics: { avgResponseTime: 0, avgResolutionTime: 0, slaCompliance: 100, openCount: 0, resolvedCount: 0 } };
    if (path === '/maintenance/recurring-templates') return loadTable('recurring_charges');
    // Task 1.5 — canonical AR/tenant-recurring-rent endpoint (additive; existing
    // /maintenance/recurring-templates route kept intact for back-compat).
    if (path === '/recurring-charges') {
        let f = await loadTable('recurring_charges') as any[];
        if (params?.tenantId) f = f.filter(r => r.tenantId === params.tenantId);
        if (params?.occupancyId) f = f.filter(r => r.occupancyId === params.occupancyId);
        if (params?.propertyId) f = f.filter(r => r.propertyId === params.propertyId);
        return f;
    }
    if (path === '/maintenance/history') return loadTable('maintenance_alerts');
    if (path === '/search/health') return { status: 'ok', indexed: 0 };
    if (path === '/search/saved') return loadTable('saved_searches');
    if (path === '/search/log') return loadTable('search_log');
    if (path === '/civil/history') return loadTable('civil_history');
    if (path === '/design/history') return loadTable('design_history');
    if (path === '/users') return loadTable('users');
    if (path === '/legal-snippets' || path === '/legal-issues') return loadTable('legal_snippets');
    if (path === '/inspections') return loadTable('inspection_logs');
    if (path.startsWith('/reporting/')) return [];

    // ═══════════════════════════════════════════════════
    // DYNAMIC ROUTES (pattern match)
    // ═══════════════════════════════════════════════════

    // /search?q=...
    if (path === '/search' || path.startsWith('/search?')) {
        // Static search: scan entities, properties, workitems
        const q = params?.q?.toLowerCase() || '';
        if (!q) return { results: [], total: 0 };
        const [props, ents, wis] = await Promise.all([loadTable('properties'), loadTable('entities'), loadTable('workitems')]);
        const results: any[] = [];
        for (const p of props as any[]) {
            if (p.name?.toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)) results.push({ type: 'property', ...p });
        }
        for (const e of ents as any[]) {
            if (e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q)) results.push({ type: e.entityType, ...e });
        }
        for (const w of wis as any[]) {
            if (w.title?.toLowerCase().includes(q)) results.push({ type: 'workitem', ...w });
        }
        return { results: results.slice(0, 50), total: results.length };
    }

    // /property-report-cards/{id}
    m = path.match(/^\/property-report-cards\/(.+)$/);
    if (m) {
        const pid = m[1];
        const [units, workitems, policies, compliance] = await Promise.all([
            loadTable('units'), loadTable('workitems'), loadTable('insurance_policies'), loadTable('compliance'),
        ]);
        const propUnits = (units as any[]).filter(u => u.propertyId === pid);
        const propWIs = (workitems as any[]).filter(w => w.propertyId === pid);
        const openWOs = propWIs.filter(w => (w.status === 'open' || w.status === 'in_progress') && w.type === 'work_order');
        const highP = openWOs.filter(w => w.priority === 'high');
        const now = Date.now();
        const d30 = 30 * 86400000;
        const d60 = 60 * 86400000;
        const leaseUnits = propUnits.filter(u => u.leaseEnd);
        return {
            workOrders: { totalOpen: openWOs.length, highPriority: highP.length },
            insurance: {
                activePolicies: (policies as any[]).filter(p => p.propertyId === pid).length,
                expiringSoon: 0, nearestExpiry: null,
            },
            compliance: { compliant: 0, missing: 0, expiring: 0 },
            vendors: { activeCount: 0 },
            openIncidents: 0,
            leaseHealth: {
                expiringIn30: leaseUnits.filter(u => { const d = new Date(u.leaseEnd).getTime() - now; return d > 0 && d <= d30; }).length,
                expiringIn60: leaseUnits.filter(u => { const d = new Date(u.leaseEnd).getTime() - now; return d > 0 && d <= d60; }).length,
                expired: leaseUnits.filter(u => new Date(u.leaseEnd).getTime() < now && u.status === 'occupied').length,
            },
        };
    }

    // /property-activity/{id}
    m = path.match(/^\/property-activity\/(.+)$/);
    if (m) {
        const pid = m[1];
        const wis = (await loadTable('workitems') as any[]).filter(w => w.propertyId === pid);
        const events = wis.slice(0, 50).map(w => ({ id: w.id, type: w.type, title: w.title, status: w.status, date: w.createdAt || w.updatedAt, priority: w.priority }));
        return { events };
    }

    // /property-linked/{id}
    m = path.match(/^\/property-linked\/(.+)$/);
    if (m) {
        const pid = m[1];
        const [workitems, notes, legal, incidents, compliance] = await Promise.all([
            loadTable('workitems'), loadTable('notes'), loadTable('legal_snippets'),
            loadTable('incidents'), loadTable('compliance'),
        ]);
        const wi = (workitems as any[]).filter(w => w.propertyId === pid);
        const n = (notes as any[]).filter(n => n.propertyId === pid);
        const l = (legal as any[]).filter(l => l.propertyId === pid);
        const inc = (incidents as any[]).filter(i => i.propertyId === pid);
        const comp = (compliance as any[]).filter(c => c.propertyId === pid);
        return { workitems: wi, notes: n, legalIssues: l, legal: l, incidents: inc, complianceItems: comp, compliance: comp, entityLinks: [],
            summary: { workitems: wi.length, legal: l.length, compliance: comp.length, incidents: inc.length, entityLinks: 0, total: wi.length + l.length + comp.length + inc.length }
        };
    }

    // /compliance/property-rollup/{id}
    m = path.match(/^\/compliance\/property-rollup\/(.+)$/);
    if (m) return { compliant: 0, missing: 0, expiring: 0, score: 100 };

    // /properties/{id}
    m = path.match(/^\/properties\/([^/]+)$/);
    if (m) return (await loadTable('properties')).find((p: any) => p.id === m![1]) || null;

    // /entities/{id}
    m = path.match(/^\/entities\/([^/]+)$/);
    if (m) return (await loadTable('entities')).find((e: any) => e.id === m![1]) || null;

    // /units/{id}
    m = path.match(/^\/units\/([^/]+)$/);
    if (m) return (await loadTable('units')).find((u: any) => u.id === m![1]) || null;

    // /occupancies/{id}  (Task 1.1)
    m = path.match(/^\/occupancies\/([^/]+)$/);
    if (m) return (await loadTable('occupancies')).find((o: any) => o.id === m![1]) || null;

    // /workitems/{id}
    m = path.match(/^\/workitems\/([^/]+)$/);
    if (m) return (await loadTable('workitems')).find((w: any) => w.id === m![1]) || null;

    // /resident-linkage/{id}
    m = path.match(/^\/resident-linkage\/(.+)$/);
    if (m) {
        const tid = m[1];
        const [units, props, wis] = await Promise.all([loadTable('units'), loadTable('properties'), loadTable('workitems')]);
        const tenantUnits = (units as any[]).filter(u => u.currentTenantId === tid);
        const propIds = [...new Set(tenantUnits.map(u => u.propertyId))];
        const linkedProps = (props as any[]).filter(p => propIds.includes(p.id));
        const linkedWIs = (wis as any[]).filter(w => propIds.includes(w.propertyId));
        return { units: tenantUnits, properties: linkedProps, workitems: linkedWIs };
    }

    // /resident-history/{id}
    m = path.match(/^\/resident-history\/(.+)$/);
    if (m) return { events: [] };

    // /vendors/{id}/ledger
    m = path.match(/^\/vendors\/([^/]+)\/ledger$/);
    if (m) return [];

    // /vendors/{id}/balance
    m = path.match(/^\/vendors\/([^/]+)\/balance$/);
    if (m) return { balance: 0 };

    // /vendors/{id}/documents
    m = path.match(/^\/vendors\/([^/]+)\/documents$/);
    if (m) return [];

    // /vendors/{id}/performance
    m = path.match(/^\/vendors\/([^/]+)\/performance$/);
    if (m) return { rating: 0, totalJobs: 0, onTime: 0, avgCost: 0 };

    // /legal/{id}/comments
    m = path.match(/^\/legal\/([^/]+)\/comments$/);
    if (m) return [];

    // /legal/{id}/links
    m = path.match(/^\/legal\/([^/]+)\/links$/);
    if (m) return [];

    // /insurance-policies/{id}/documents
    m = path.match(/^\/insurance-policies\/([^/]+)\/documents$/);
    if (m) return [];

    // /maintenance/attachments/{id}
    m = path.match(/^\/maintenance\/attachments\/(.+)$/);
    if (m) return { attachments: [] };

    // /links/{id}
    m = path.match(/^\/links\/([^/]+)$/);
    if (m) return (await loadTable('entity_links')).find((l: any) => l.id === m![1]) || null;

    // /gmail
    if (path.startsWith('/gmail/')) return { success: true };

    // Fallback
    console.warn('[StaticAPI] Unhandled GET:', path, params);
    return [];
}

function filterBy(rows: any[], params?: Record<string, string>): any[] {
    if (!params) return rows;
    let out = rows;
    for (const [key, val] of Object.entries(params)) {
        if (!val) continue;
        const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
        out = out.filter(r => r[key] === val || r[camel] === val);
    }
    return out;
}

// ─── CRUD ───
function createRecord(table: string, record: any): any {
    const changes = loadChanges(table);
    if (!changes._created) changes._created = [];
    if (!record.id) record.id = crypto.randomUUID();
    record.createdAt = record.createdAt || new Date().toISOString();
    record.updatedAt = new Date().toISOString();
    changes._created.push(record);
    saveChanges(table, changes);
    delete dataCache[table];
    return record;
}
function updateRecord(table: string, id: string, updates: any): any {
    const changes = loadChanges(table);
    if (!changes._updated) changes._updated = {};
    changes._updated[id] = { ...(changes._updated[id] || {}), ...updates, updatedAt: new Date().toISOString() };
    saveChanges(table, changes);
    delete dataCache[table];
    return { id, ...updates };
}
function deleteRecord(table: string, id: string): void {
    const changes = loadChanges(table);
    if (!changes._deleted) changes._deleted = [];
    if (!changes._deleted.includes(id)) changes._deleted.push(id);
    if (changes._created) changes._created = changes._created.filter((r: any) => r.id !== id);
    saveChanges(table, changes);
    delete dataCache[table];
}

type CrudTable = { route: RegExp; table: string };
const crudRoutes: CrudTable[] = [
    { route: /^\/entities(?:\/([^/]+))?$/, table: 'entities' },
    { route: /^\/properties(?:\/([^/]+))?$/, table: 'properties' },
    { route: /^\/workitems(?:\/([^/]+))?$/, table: 'workitems' },
    { route: /^\/spaces(?:\/([^/]+))?$/, table: 'profile_spaces' },
    { route: /^\/units(?:\/([^/]+))?$/, table: 'units' },
    { route: /^\/notes(?:\/([^/]+))?$/, table: 'notes' },
    { route: /^\/links(?:\/([^/]+))?$/, table: 'entity_links' },
    { route: /^\/space-items(?:\/([^/]+))?$/, table: 'space_items' },
    { route: /^\/vehicles(?:\/([^/]+))?$/, table: 'vehicles' },
    { route: /^\/incidents(?:\/([^/]+))?$/, table: 'incidents' },
    { route: /^\/invoices(?:\/([^/]+))?$/, table: 'invoices' },
    { route: /^\/insurance-policies(?:\/([^/]+))?$/, table: 'insurance_policies' },
    { route: /^\/compliance(?:\/([^/]+))?$/, table: 'compliance' },
    { route: /^\/vendor-associations(?:\/([^/]+))?$/, table: 'vendor_associations' },
    { route: /^\/audit(?:\/([^/]+))?$/, table: 'audit_log' },
];

function matchWriteRoute(method: string, path: string, body: any): any {
    if (method === 'PUT' && path === '/property-modules') return body;
    if (path.includes('/deactivate') || path.includes('/reactivate')) return { success: true };
    if (path.startsWith('/leasing/') || path.startsWith('/civil/') || path.startsWith('/design/') || path.startsWith('/gmail/')) return { success: true };
    if (method === 'POST' && path === '/trello-sync') {
        // Static mode stub — pretend the sync ran with nothing to do.
        return { success: true, synced: 0, message: 'Static mode — Trello sync disabled.' };
    }

    for (const { route, table } of crudRoutes) {
        const m = path.match(route);
        if (m) {
            const id = m[1];
            if (method === 'POST' && !id) return createRecord(table, body);
            if (method === 'PUT' && id) return updateRecord(table, id, body);
            if (method === 'DELETE' && id) { deleteRecord(table, id); return {}; }
        }
    }
    console.warn('[StaticAPI] Unhandled WRITE:', method, path);
    return {};
}

// ─── Public API ───
export function strataGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    return matchRoute(path, params) as Promise<T>;
}
export function strataPost<T>(path: string, body: unknown): Promise<T> {
    return Promise.resolve(matchWriteRoute('POST', path, body) as T);
}
export function strataPut<T>(path: string, body: unknown): Promise<T> {
    return Promise.resolve(matchWriteRoute('PUT', path, body) as T);
}
export async function strataDelete(path: string): Promise<void> {
    matchWriteRoute('DELETE', path, null);
}

// ─── Cursor Pagination ───────────────────────────────────────
// Static mode has all rows in memory, so we simulate cursor pagination
// by returning everything in one slice. Shape MUST match
// strataApi.backend.ts so the router in strataApi.ts can swap impls.
export interface PaginatedResponse<T> {
    data: T[];
    pagination: {
        hasMore: boolean;
        nextCursor: string | null;
        limit: number;
    };
}

export async function strataGetPaginated<T>(
    path: string,
    params?: Record<string, string>
): Promise<PaginatedResponse<T>> {
    const all = (await matchRoute(path, params)) as T[] | { data?: T[] } | null;
    const rows: T[] = Array.isArray(all)
        ? all
        : Array.isArray((all as any)?.data)
            ? ((all as any).data as T[])
            : [];

    const limit = parseInt(params?.limit ?? String(rows.length || 50), 10) || 50;

    return {
        data: rows.slice(0, limit),
        pagination: {
            hasMore: rows.length > limit,
            nextCursor: null,
            limit,
        },
    };
}
