# One Save — Backend P0 (`/api/objects`) — ready to apply

**Status:** Implementation spec, **not committed** to the backend repo. · **Date:** 2026-06-09
**Target repo:** `ai-dashboard369-file-manager` (HEAD `b9de83f`) — delivered as a doc per the established backend-A read-only-diff convention (`Docs/backend-A-routes.patch`). Apply + run the backend's own gate before relying on it.

Implements the spine from `Docs/Dwellium_One_Save_Design.md` §4: an object store (`objects/<id>.json`) + append-only event log (`events/<id>.ndjson`), behind `/api/objects`. The client half (`qualia-shell/src/lib/oneSaveClient.ts` + `oneSaveStore.ts`) is already built, `tsc`-green, and ships inert behind `VITE_ONE_SAVE`.

Matches backend conventions verified in-repo: JSON persisted under `./data/`, Express `Router`, `res.json({ success, data })` envelope, `uuid` dependency present.

---

## 🔴 Security rule (P0 must enforce)

**The client sends `ownerId`, but the backend MUST derive the owner from the authenticated session and ignore/cross-check the client value.** Otherwise user A can read/write user B's objects. Mount behind the same auth + audit middleware the other sensitive routes use, and set `ownerId = req.user.id` server-side.

---

## File 1 — `src/stores/objectStore.ts` (new)

```ts
/**
 * Object Store — One Save persistence spine.
 * objects/<id>.json   = current materialized state
 * events/<id>.ndjson  = append-only history (create|update|delete|restore)
 * Filesystem is the source of truth; any index is rebuildable by scanning.
 */
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const OBJECTS_DIR = path.join(DATA_DIR, 'objects');
const EVENTS_DIR = path.join(DATA_DIR, 'events');

export interface DwelliumObject<T = unknown> {
    id: string;
    type: string;
    ownerId: string;
    schema: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    payload: T;
}

type EventOp = 'create' | 'update' | 'delete' | 'restore';
interface ObjectEvent { ts: string; op: EventOp; ownerId: string; payload?: unknown; }

function ensureDirs(): void {
    for (const d of [OBJECTS_DIR, EVENTS_DIR]) {
        if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
    }
}
ensureDirs();

/** Reject ids that could escape the data dir. Allow ULID/uuid/slug shapes. */
function safeId(id: string): string {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(id)) throw new Error('invalid object id');
    return id;
}
const objPath = (id: string) => path.join(OBJECTS_DIR, `${safeId(id)}.json`);
const evtPath = (id: string) => path.join(EVENTS_DIR, `${safeId(id)}.ndjson`);

function appendEvent(id: string, ev: ObjectEvent): void {
    fs.appendFileSync(evtPath(id), JSON.stringify(ev) + '\n');
}

export function getObject<T = unknown>(id: string): DwelliumObject<T> | null {
    const p = objPath(id);
    if (!fs.existsSync(p)) return null;
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) as DwelliumObject<T>; }
    catch { return null; }
}

export interface UpsertInput<T = unknown> {
    id: string; type: string; ownerId: string; payload: T; schema?: number;
}

export function upsertObject<T = unknown>(input: UpsertInput<T>): DwelliumObject<T> {
    const now = new Date().toISOString();
    const existing = getObject<T>(input.id);
    const obj: DwelliumObject<T> = {
        id: safeId(input.id),
        type: input.type,
        ownerId: input.ownerId,
        schema: input.schema ?? 1,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        deletedAt: null,
        payload: input.payload,
    };
    fs.writeFileSync(objPath(obj.id), JSON.stringify(obj, null, 2));
    appendEvent(obj.id, { ts: now, op: existing ? 'update' : 'create', ownerId: obj.ownerId, payload: input.payload });
    return obj;
}

export function listObjects<T = unknown>(type?: string, ownerId?: string): DwelliumObject<T>[] {
    if (!fs.existsSync(OBJECTS_DIR)) return [];
    const out: DwelliumObject<T>[] = [];
    for (const file of fs.readdirSync(OBJECTS_DIR)) {
        if (!file.endsWith('.json')) continue;
        try {
            const obj = JSON.parse(fs.readFileSync(path.join(OBJECTS_DIR, file), 'utf8')) as DwelliumObject<T>;
            if (obj.deletedAt) continue;
            if (type && obj.type !== type) continue;
            if (ownerId && obj.ownerId !== ownerId) continue;
            out.push(obj);
        } catch { /* skip corrupt file; never throw the whole list */ }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Soft-delete (tombstone). Never hard-removes the file in P0. */
export function softDeleteObject(id: string, ownerId: string): boolean {
    const obj = getObject(id);
    if (!obj) return false;
    const now = new Date().toISOString();
    obj.deletedAt = now;
    obj.updatedAt = now;
    fs.writeFileSync(objPath(id), JSON.stringify(obj, null, 2));
    appendEvent(id, { ts: now, op: 'delete', ownerId });
    return true;
}
```

## File 2 — `src/routes/objectRoutes.ts` (new)

```ts
/** One Save object store routes — /api/objects */
import { Router, Request, Response } from 'express';
import { getObject, upsertObject, listObjects, softDeleteObject } from '../stores/objectStore';

const router = Router();

// Derive the owner from the authenticated session — do NOT trust the client.
// Replace with your real auth accessor (e.g. (req as any).user?.id).
function ownerFromReq(req: Request): string {
    const u = (req as Request & { user?: { id?: string } }).user;
    return u?.id ?? 'shared';
}

// GET /api/objects?type=&owner=  (owner forced to the caller)
router.get('/', (req: Request, res: Response) => {
    try {
        const type = typeof req.query.type === 'string' ? req.query.type : undefined;
        const owner = ownerFromReq(req);
        res.json({ success: true, data: listObjects(type, owner) });
    } catch (err) {
        res.status(500).json({ success: false, error: (err as Error).message });
    }
});

// GET /api/objects/:id
router.get('/:id', (req: Request, res: Response) => {
    try {
        const obj = getObject(req.params.id);
        if (!obj || obj.ownerId !== ownerFromReq(req)) {
            return res.status(404).json({ success: false, error: 'not found' });
        }
        res.json({ success: true, data: obj });
    } catch (err) {
        res.status(400).json({ success: false, error: (err as Error).message });
    }
});

// PUT /api/objects/:id  (upsert)
router.put('/:id', (req: Request, res: Response) => {
    try {
        const { type, payload, schema } = req.body ?? {};
        if (typeof type !== 'string') {
            return res.status(400).json({ success: false, error: 'type required' });
        }
        const obj = upsertObject({ id: req.params.id, type, ownerId: ownerFromReq(req), payload, schema });
        res.json({ success: true, data: obj });
    } catch (err) {
        res.status(400).json({ success: false, error: (err as Error).message });
    }
});

// DELETE /api/objects/:id  (soft)
router.delete('/:id', (req: Request, res: Response) => {
    try {
        const ok = softDeleteObject(req.params.id, ownerFromReq(req));
        res.json({ success: ok, data: { id: req.params.id, deleted: ok } });
    } catch (err) {
        res.status(400).json({ success: false, error: (err as Error).message });
    }
});

export default router;
```

## File 3 — `src/app.ts` (one added mount line)

Place beside the other sensitive, audited routes:

```ts
import objectRoutes from './routes/objectRoutes';
// …
app.use('/api/objects', createAuditMiddleware('/api/objects'), objectRoutes);
```

> Mount it **after** the auth middleware so `req.user` is populated for `ownerFromReq`.

## File 4 — `tests/objectStore.test.ts` (new, Jest — matches `tests/`)

```ts
import { upsertObject, getObject, listObjects, softDeleteObject } from '../src/stores/objectStore';

describe('objectStore', () => {
    const id = `test_${Date.now()}`;
    it('upserts then reads back', () => {
        upsertObject({ id, type: 'wiki', ownerId: 'u1', payload: { a: 1 } });
        const got = getObject<{ a: number }>(id);
        expect(got?.payload.a).toBe(1);
        expect(got?.deletedAt).toBeNull();
    });
    it('lists by type+owner', () => {
        expect(listObjects('wiki', 'u1').some(o => o.id === id)).toBe(true);
    });
    it('soft-deletes (tombstone, not in list)', () => {
        expect(softDeleteObject(id, 'u1')).toBe(true);
        expect(getObject(id)?.deletedAt).not.toBeNull();
        expect(listObjects('wiki', 'u1').some(o => o.id === id)).toBe(false);
    });
});
```

---

## Apply + verify checklist (on your go)

1. Drop in Files 1–2 + 4; add the File 3 mount line.
2. Wire `ownerFromReq` to the real auth user accessor (grep how `authRoutes`/middleware attaches the user).
3. `npm test` (the new Jest spec) + `npx tsc --noEmit`.
4. Smoke: `curl -X PUT localhost:3000/api/objects/test_1 -H 'Content-Type: application/json' -H 'Authorization: Bearer <t>' -d '{"type":"wiki","payload":{"hi":1}}'` then `GET` it back.
5. Flip the client: build qualia-shell with `VITE_ONE_SAVE=true`; the spine is now live but **no store is wrapped yet** — that's P1.

## What stays for P1 (client cutover)

Wrap the ~20 content stores with `withSync(...)` (lowest-risk first), call `.hydrate()` on login, and run the one-time `migrateLocalToSpine()` backfill. `integrationsStore` (API keys) is **excluded** until you decide encryption (your "decide later").

## Not done / open

- `ownerFromReq` placeholder — must be wired to real auth before this is safe.
- No index yet (P0 scans the dir; fine to thousands of objects). Add SQLite/manifest in P1 if list latency shows.
- Event-log compaction (snapshots) deferred until logs grow.
