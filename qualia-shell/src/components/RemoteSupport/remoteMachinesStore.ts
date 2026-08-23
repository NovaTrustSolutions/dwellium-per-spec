/**
 * remoteMachinesStore — plan 053: Andy's RustDesk address book.
 *
 * Per-user machine list (name, RustDesk ID, notes, tags) for the Remote
 * Support widget's Connect tab. goalsStore sister shape: dynamic-key
 * `createLocalStorageStore` keyed off a perUserIdentity holder + One Save
 * `withSync` ('remoteMachines'), incl. `.reset()`.
 *
 * Deep links (verified 2026-08-23 against rustdesk/rustdesk master):
 * `src/core_main.rs` builds `{uri_prefix}{authority}/{id}?{params}` where
 * `get_uri_prefix()` = "rustdesk://" (`src/common.rs` L1015-1017) and
 * `flutter/lib/common.dart::urlLinkToCmdArgs` accepts authorities
 * `connect|play|file-transfer|view-camera|port-forward|rdp|terminal`
 * (plus legacy `rustdesk://connection/new/<id>` "For compatibility").
 * So Connect = `rustdesk://connect/<ID>`, File transfer =
 * `rustdesk://file-transfer/<ID>`. Requires the stock RustDesk client
 * installed (it registers the URI scheme); there is NO embeddable web
 * client — https://rustdesk.com/web/ sends `x-frame-options: SAMEORIGIN`
 * (fetched 2026-08-23) and v1.4.9 ships no self-hostable web build.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';
import { remoteMachinesUserIdHolder } from '../../lib/perUserIdentity';

export const MACHINE_TAGS = ['Office', 'Kiosk', 'Resident'] as const;
export type MachineTag = (typeof MACHINE_TAGS)[number];

export interface RemoteMachine {
    id: string;
    /** Human name, e.g. "Woodland Parc leasing office PC". */
    name: string;
    /** RustDesk ID from the machine's home screen (digits, or custom after ID change). */
    rustdeskId: string;
    /** Location / notes, e.g. "front desk, ground floor". */
    notes: string;
    tags: MachineTag[];
    /** Seeded placeholder — clearly marked in the UI; Connect disabled until replaced. */
    example?: boolean;
    createdAt: number;
    updatedAt: number;
}

export { remoteMachinesUserIdHolder };

function resolveKey(): string {
    const uid = remoteMachinesUserIdHolder.current;
    return uid ? `remoteMachines:${uid}` : 'remoteMachines:_anonymous';
}

/**
 * Placeholder rows named after Andy's properties (LeasingModule fixtures:
 * Woodland Parc Townhomes, Riverwood Club Apartments). No real IDs —
 * `rustdeskId` is empty until Andy replaces them, and the UI shows an
 * "example" badge with Connect disabled.
 */
export function seedMachines(): RemoteMachine[] {
    const now = 0; // stable timestamp so seeds are identical across users/renders
    const seed = (id: string, name: string, notes: string, tags: MachineTag[]): RemoteMachine => ({
        id, name, rustdeskId: '', notes, tags, example: true, createdAt: now, updatedAt: now,
    });
    return [
        seed('seed-woodland-office', 'Woodland Parc leasing office PC', 'example — replace with your machines. Front-desk PC at Woodland Parc Townhomes.', ['Office']),
        seed('seed-riverwood-kiosk', 'Riverwood Club lobby kiosk', 'example — replace with your machines. Resident self-service kiosk at Riverwood Club Apartments.', ['Kiosk']),
        seed('seed-resident-laptop', "Resident's computer (helping remotely)", 'example — replace with your machines. Add a resident’s machine here while you help them, remove it after.', ['Resident']),
    ];
}

function isMachine(m: unknown): m is RemoteMachine {
    const r = m as RemoteMachine;
    return !!r && typeof r.id === 'string' && typeof r.name === 'string'
        && typeof r.rustdeskId === 'string' && Array.isArray(r.tags);
}

function normalize(m: RemoteMachine): RemoteMachine {
    return {
        ...m,
        notes: typeof m.notes === 'string' ? m.notes : '',
        tags: m.tags.filter((t): t is MachineTag => (MACHINE_TAGS as readonly string[]).includes(t)),
        createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0,
        updatedAt: typeof m.updatedAt === 'number' ? m.updatedAt : 0,
    };
}

function deserialize(raw: string | null): RemoteMachine[] {
    if (!raw) return seedMachines();
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(isMachine).map(normalize) : seedMachines();
    } catch {
        return seedMachines();
    }
}

export const remoteMachinesStore = withSync(
    createLocalStorageStore<RemoteMachine[]>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: seedMachines(),
    }),
    { objectType: 'remoteMachines', holder: remoteMachinesUserIdHolder, resolveKey },
);

function persist(next: RemoteMachine[]): void {
    remoteMachinesStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

function newMachineId(): string {
    return `rm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ─── Mutators (UI-initiated only — no agent/script may remove rows) ─── */

export function addMachine(input: { name: string; rustdeskId: string; notes?: string; tags?: MachineTag[] }): RemoteMachine {
    const now = Date.now();
    const machine: RemoteMachine = {
        id: newMachineId(),
        name: input.name.trim().slice(0, 120),
        rustdeskId: input.rustdeskId.trim(),
        notes: (input.notes ?? '').trim().slice(0, 500),
        tags: input.tags ?? [],
        createdAt: now,
        updatedAt: now,
    };
    persist([...remoteMachinesStore.getSnapshot(), machine]);
    return machine;
}

export function updateMachine(id: string, patch: Partial<Pick<RemoteMachine, 'name' | 'rustdeskId' | 'notes' | 'tags'>>): void {
    persist(remoteMachinesStore.getSnapshot().map(m => (m.id === id
        ? { ...m, ...patch, example: undefined, updatedAt: Date.now() }
        : m)));
}

export function removeMachine(id: string): void {
    persist(remoteMachinesStore.getSnapshot().filter(m => m.id !== id));
}

/* ─── Deep links ─── */

/** `rustdesk://connect/<ID>` / `rustdesk://file-transfer/<ID>` (see header for the source evidence). */
export function buildRustdeskLink(rustdeskId: string, action: 'connect' | 'file-transfer' = 'connect'): string | null {
    const id = rustdeskId.replace(/\s+/g, '');
    if (!id) return null;
    return `rustdesk://${action}/${encodeURIComponent(id)}`;
}

/* ─── Import / export (merge-only — import never deletes existing rows) ─── */

export function exportMachinesJson(): string {
    return JSON.stringify(remoteMachinesStore.getSnapshot(), null, 2);
}

/** Upsert-by-id merge; returns how many rows were imported. Throws on malformed JSON. */
export function importMachinesJson(raw: string): number {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Expected a JSON array of machines');
    const incoming = parsed.filter(isMachine).map(normalize);
    if (incoming.length === 0) return 0;
    const current = [...remoteMachinesStore.getSnapshot()];
    for (const m of incoming) {
        const i = current.findIndex(c => c.id === m.id);
        if (i >= 0) current[i] = { ...current[i], ...m, updatedAt: Date.now() };
        else current.push(m);
    }
    persist(current);
    return incoming.length;
}

/** Test escape hatch (v2.72.1 standing convention). */
export function resetRemoteMachines(): void {
    remoteMachinesStore.reset();
}
