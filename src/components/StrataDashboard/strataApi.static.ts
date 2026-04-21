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
    if (path === '/notes') return filterBy(await loadTable('notes') as any[], params);
    if (path === '/communications') return filterBy(await loadTable('communications') as any[], params);
    if (path === '/compliance') return filterBy(await loadTable('compliance') as any[], params);
    if (path === '/compliance/audit') return [];
    if (path === '/compliance/gaps') return [];
    if (path === '/compliance/portfolio-rollup') return { overall: 100, categories: {} };
    if (path === '/compliance/reminders') return [];
    if (path === '/incidents') return filterBy(await loadTable('incidents') as any[], params);
    if (path === '/insurance-policies') return filterBy(await loadTable('insurance_policies') as any[], params);
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
