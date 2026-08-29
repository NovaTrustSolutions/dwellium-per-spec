/**
 * OpenOPC stream-json event model + reducer (Automation Hub · AI Company console).
 *
 * OpenOPC's `opc exec --stream-json` prints one JSON object per line. The
 * envelope is VERIFIED against the source (opc/cli/app.py `_print_exec_event`):
 *
 *   { type, seq, timestamp, project_id, task_id, session_id, payload }
 *
 * The top-level `type` values the CLI emits, also verified from source:
 *   session_created · session_resumed · runtime_update · message · final · error
 *
 * The org-chart / kanban / delegate / review / blocker detail rides INSIDE
 * `runtime_update.payload` (a `model_dump()` of an office_ui runtime event).
 * The README/CLI do not pin that inner schema, so `normalizeOpcEvent` reads it
 * DEFENSIVELY: it looks for the fields a runtime event of each kind would carry
 * and ignores anything it doesn't recognise. `escalation` is surfaced by the
 * runner shim (the CLI's own escalation is an interactive console prompt, not a
 * stream-json line — see tools/openopc/README.md), so we accept it as a
 * first-class top-level type too.
 *
 * Nothing here executes anything: it only turns bytes the runner relayed into
 * the org + kanban + inbox the panel renders.
 */

/** The raw line as it comes off `--stream-json` (envelope verified from source). */
export interface OpcRawEvent {
    type: string;
    seq?: number;
    timestamp?: string;
    project_id?: string;
    task_id?: string;
    session_id?: string;
    payload?: Record<string, unknown>;
}

/** Canonical kanban columns (arbitrary runtime phase strings map onto these). */
export type OpcColumn = 'planning' | 'ready' | 'in_progress' | 'review' | 'blocked' | 'done';

export const OPC_COLUMNS: { key: OpcColumn; label: string }[] = [
    { key: 'planning', label: 'Planning' },
    { key: 'ready', label: 'Ready' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'review', label: 'Review' },
    { key: 'blocked', label: 'Blocked' },
    { key: 'done', label: 'Done' },
];

export interface OpcRole {
    id: string;
    title: string;
    parentRoleId?: string;
    status: 'active' | 'waiting' | 'pending' | 'done';
    /** work-item id this role currently owns, if any. */
    workItemId?: string;
}

export interface OpcWorkItem {
    id: string;
    title: string;
    column: OpcColumn;
    ownerRoleId?: string;
    dependsOn: string[];
    lastVerdict?: 'accept' | 'rework';
}

export interface OpcEscalation {
    id: string;
    message: string;
    options: { id: string; label: string }[];
    /** set once the human answered (optimistic; the runner confirms). */
    answered?: string;
}

export interface OpcMessage {
    seq: number;
    role: string;
    content: string;
}

export interface OpcState {
    sessionId?: string;
    taskId?: string;
    roles: Record<string, OpcRole>;
    workItems: Record<string, OpcWorkItem>;
    escalations: OpcEscalation[];
    messages: OpcMessage[];
    done: boolean;
    error?: string;
}

export function emptyOpcState(): OpcState {
    return { roles: {}, workItems: {}, escalations: [], messages: [], done: false };
}

/** Normalized event union the reducer consumes. */
export type OpcEvent =
    | { kind: 'session'; sessionId: string; taskId: string }
    | { kind: 'role_spawned'; roleId: string; title: string; parentRoleId?: string }
    | { kind: 'role_status'; roleId: string; status: OpcRole['status'] }
    | { kind: 'work_item'; itemId: string; title?: string; column?: OpcColumn; ownerRoleId?: string; dependsOn?: string[] }
    | { kind: 'delegate'; itemId: string; toRoleId: string }
    | { kind: 'review'; itemId: string; verdict: 'accept' | 'rework' }
    | { kind: 'blocker'; itemId?: string; roleId?: string; message: string }
    | { kind: 'escalation'; id: string; message: string; options: { id: string; label: string }[] }
    | { kind: 'message'; seq: number; role: string; content: string }
    | { kind: 'done' }
    | { kind: 'error'; message: string };

const COLUMN_ALIASES: Record<string, OpcColumn> = {
    planning: 'planning', plan: 'planning', todo: 'planning', backlog: 'planning',
    ready: 'ready', runnable: 'ready', queued: 'ready',
    in_progress: 'in_progress', running: 'in_progress', executing: 'in_progress', active: 'in_progress', doing: 'in_progress',
    review: 'review', reviewing: 'review', integrate: 'review', integrating: 'review',
    blocked: 'blocked', blocker: 'blocked', escalated: 'blocked', awaiting_peer: 'blocked', rework: 'blocked',
    done: 'done', complete: 'done', completed: 'done', delivered: 'done', accepted: 'done',
};

/** Map an arbitrary runtime phase/column string onto a canonical kanban column. */
export function toColumn(phase: unknown): OpcColumn | undefined {
    if (typeof phase !== 'string') return undefined;
    return COLUMN_ALIASES[phase.trim().toLowerCase().replace(/[\s-]+/g, '_')];
}

function str(v: unknown): string | undefined {
    return typeof v === 'string' && v ? v : undefined;
}

function pick(p: Record<string, unknown>, ...keys: string[]): string | undefined {
    for (const k of keys) { const v = str(p[k]); if (v) return v; }
    return undefined;
}

function options(v: unknown): { id: string; label: string }[] {
    if (!Array.isArray(v)) return [];
    return v.map((o, i) => {
        const rec = (o && typeof o === 'object') ? o as Record<string, unknown> : {};
        const id = str(rec.id) ?? str(rec.value) ?? String(i + 1);
        return { id, label: str(rec.label) ?? str(rec.title) ?? id };
    });
}

/**
 * Turn one raw stream-json line into a normalized event (or null to ignore).
 * Top-level types are read exactly; `runtime_update` payloads are inspected
 * defensively for the sub-event they carry.
 */
export function normalizeOpcEvent(raw: OpcRawEvent): OpcEvent | null {
    const p = raw.payload ?? {};
    switch (raw.type) {
        case 'session_created':
        case 'session_resumed':
            return { kind: 'session', sessionId: raw.session_id ?? pick(p, 'session_id') ?? '', taskId: raw.task_id ?? pick(p, 'task_id') ?? '' };
        case 'message':
            return { kind: 'message', seq: raw.seq ?? 0, role: pick(p, 'role') ?? 'assistant', content: pick(p, 'content', 'text') ?? '' };
        case 'final':
            return { kind: 'done' };
        case 'error':
            return { kind: 'error', message: pick(p, 'error', 'message') ?? 'Run failed' };
        case 'escalation':
            return { kind: 'escalation', id: pick(p, 'id', 'escalation_id') ?? `esc-${raw.seq ?? Date.now()}`, message: pick(p, 'message', 'prompt') ?? 'Input required', options: options(p.options) };
        case 'runtime_update':
            return normalizeRuntimeUpdate(p);
        default:
            return null;
    }
}

/** Inner `runtime_update.payload` → normalized event (best-effort, schema not pinned upstream). */
function normalizeRuntimeUpdate(p: Record<string, unknown>): OpcEvent | null {
    // The runtime event's own discriminator, whatever it's named.
    const kind = (pick(p, 'kind', 'event', 'event_type', 'type') ?? '').toLowerCase();

    const roleId = pick(p, 'role_id', 'roleId', 'role');
    const itemId = pick(p, 'work_item_id', 'workItemId', 'item_id', 'itemId', 'work_item');

    if (kind.includes('escalat') || kind.includes('human')) {
        return { kind: 'escalation', id: pick(p, 'id', 'escalation_id') ?? `esc-${Date.now()}`, message: pick(p, 'message', 'prompt') ?? 'Input required', options: options(p.options) };
    }
    if (kind.includes('block')) {
        return { kind: 'blocker', itemId, roleId, message: pick(p, 'message', 'reason') ?? 'Blocked' };
    }
    if (kind.includes('review') || kind.includes('verdict')) {
        const verdict = (pick(p, 'verdict', 'decision') ?? '').toLowerCase();
        return itemId ? { kind: 'review', itemId, verdict: verdict.includes('rework') || verdict.includes('reject') ? 'rework' : 'accept' } : null;
    }
    if (kind.includes('delegat') || kind.includes('assign')) {
        const toRoleId = pick(p, 'to_role_id', 'to_role', 'assignee', 'owner_role_id', 'owner');
        return (itemId && toRoleId) ? { kind: 'delegate', itemId, toRoleId } : null;
    }
    if (kind.includes('role') || kind.includes('agent') || kind.includes('employee') || kind.includes('hire') || kind.includes('recruit')) {
        if (!roleId) return null;
        const status = toStatus(pick(p, 'status', 'state'));
        if (pick(p, 'title', 'name', 'role_title') || kind.includes('spawn') || kind.includes('hire') || kind.includes('recruit') || kind.includes('create')) {
            return { kind: 'role_spawned', roleId, title: pick(p, 'title', 'name', 'role_title') ?? roleId, parentRoleId: pick(p, 'parent_role_id', 'parent', 'reports_to') };
        }
        return status ? { kind: 'role_status', roleId, status } : null;
    }
    if (kind.includes('work') || kind.includes('item') || kind.includes('phase') || kind.includes('kanban') || kind.includes('task')) {
        if (!itemId) return null;
        const depends = Array.isArray(p.depends_on) ? (p.depends_on as unknown[]).map(String)
            : Array.isArray(p.dependsOn) ? (p.dependsOn as unknown[]).map(String) : undefined;
        return {
            kind: 'work_item',
            itemId,
            title: pick(p, 'title', 'name', 'summary'),
            column: toColumn(pick(p, 'phase', 'column', 'status', 'state')),
            ownerRoleId: pick(p, 'owner_role_id', 'owner', 'assignee', 'role_id'),
            dependsOn: depends,
        };
    }
    return null;
}

function toStatus(v: unknown): OpcRole['status'] | undefined {
    const s = (typeof v === 'string' ? v : '').toLowerCase();
    if (s.includes('active') || s.includes('run') || s.includes('exec')) return 'active';
    if (s.includes('wait') || s.includes('block') || s.includes('await')) return 'waiting';
    if (s.includes('done') || s.includes('complete')) return 'done';
    if (s.includes('pending') || s.includes('idle')) return 'pending';
    return undefined;
}

/** Fold one normalized event into the accumulated state (pure; returns new state). */
export function reduceOpc(prev: OpcState, ev: OpcEvent): OpcState {
    switch (ev.kind) {
        case 'session':
            return { ...prev, sessionId: ev.sessionId || prev.sessionId, taskId: ev.taskId || prev.taskId };
        case 'role_spawned': {
            const existing = prev.roles[ev.roleId];
            return { ...prev, roles: { ...prev.roles, [ev.roleId]: { id: ev.roleId, title: ev.title, parentRoleId: ev.parentRoleId ?? existing?.parentRoleId, status: existing?.status ?? 'pending', workItemId: existing?.workItemId } } };
        }
        case 'role_status': {
            const r = prev.roles[ev.roleId] ?? { id: ev.roleId, title: ev.roleId, status: 'pending' as const, dependsOn: [] };
            return { ...prev, roles: { ...prev.roles, [ev.roleId]: { ...r, status: ev.status } } };
        }
        case 'work_item': {
            const w = prev.workItems[ev.itemId] ?? { id: ev.itemId, title: ev.itemId, column: 'planning' as OpcColumn, dependsOn: [] };
            const next: OpcWorkItem = {
                ...w,
                title: ev.title ?? w.title,
                column: ev.column ?? w.column,
                ownerRoleId: ev.ownerRoleId ?? w.ownerRoleId,
                dependsOn: ev.dependsOn ?? w.dependsOn,
            };
            const roles = next.ownerRoleId ? withRoleItem(prev.roles, next.ownerRoleId, next.id) : prev.roles;
            return { ...prev, workItems: { ...prev.workItems, [ev.itemId]: next }, roles };
        }
        case 'delegate': {
            const w = prev.workItems[ev.itemId] ?? { id: ev.itemId, title: ev.itemId, column: 'in_progress' as OpcColumn, dependsOn: [] };
            return { ...prev, workItems: { ...prev.workItems, [ev.itemId]: { ...w, ownerRoleId: ev.toRoleId } }, roles: withRoleItem(prev.roles, ev.toRoleId, ev.itemId) };
        }
        case 'review': {
            const w = prev.workItems[ev.itemId];
            if (!w) return prev;
            return { ...prev, workItems: { ...prev.workItems, [ev.itemId]: { ...w, lastVerdict: ev.verdict, column: ev.verdict === 'accept' ? 'done' : 'in_progress' } } };
        }
        case 'blocker': {
            if (!ev.itemId) return prev;
            const w = prev.workItems[ev.itemId];
            if (!w) return prev;
            return { ...prev, workItems: { ...prev.workItems, [ev.itemId]: { ...w, column: 'blocked' } } };
        }
        case 'escalation': {
            if (prev.escalations.some(e => e.id === ev.id)) return prev;
            return { ...prev, escalations: [...prev.escalations, { id: ev.id, message: ev.message, options: ev.options }] };
        }
        case 'message':
            return { ...prev, messages: [...prev.messages, { seq: ev.seq, role: ev.role, content: ev.content }] };
        case 'done':
            return { ...prev, done: true };
        case 'error':
            return { ...prev, error: ev.message, done: true };
        default:
            return prev;
    }
}

function withRoleItem(roles: Record<string, OpcRole>, roleId: string, itemId: string): Record<string, OpcRole> {
    const r = roles[roleId] ?? { id: roleId, title: roleId, status: 'active' as const };
    return { ...roles, [roleId]: { ...r, workItemId: itemId, status: r.status === 'pending' ? 'active' : r.status } };
}

/** Convenience: fold a whole batch of raw lines (used by tests + initial hydration). */
export function reduceRawEvents(raws: OpcRawEvent[], from: OpcState = emptyOpcState()): OpcState {
    return raws.reduce((st, raw) => {
        const ev = normalizeOpcEvent(raw);
        return ev ? reduceOpc(st, ev) : st;
    }, from);
}

/** Mark an escalation answered locally (optimistic; runner is the source of truth). */
export function answerEscalation(state: OpcState, id: string, answer: string): OpcState {
    return { ...state, escalations: state.escalations.map(e => e.id === id ? { ...e, answered: answer } : e) };
}
