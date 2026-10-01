/**
 * taskBoardStore — per-user persistence for the local-first Task Board.
 *
 * Namespaced by user id via the established `createLocalStorageStore`
 * dynamic-key factory (sister to speakerLibraryStore / savedLayoutsStore /
 * integrationsStore). Andy and Lisa get independent boards; the board loads
 * on login and persists across logout.
 *
 * Every mutation — whether a user drag or an AI edit — goes through the pure
 * `applyAction` choke-point in taskBoardModel.ts, so it is timestamped, audit-
 * logged, and reversible. `aiApply()` is the AI's door: same path, actor tagged
 * {kind:'ai'}, producing an auditable + undoable + reportable change.
 *
 * Storage key:  taskboard:<userId>   (anon → taskboard:_anonymous)
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';
import {
    type BoardState, type BoardAction, type BoardColumn, type Actor, type Urgency, type CardPatch,
    type Assignee, type Attachment,
    applyAction, undo as undoModel, undoLastAi as undoLastAiModel, generateReport,
    createInitialBoard, makeCard, repairBoard, type ActionContext,
} from './taskBoardModel';
import { aiEndpoint, aiRequestBody, buildGmailComposeUrl, composeCardEmail, isStellaNoKeyReply, readAgentReply } from './taskRouting';

// Module-level holder updated DURING render by the consuming component
// (TaskBoard.tsx) before useSyncExternalStore fires — mirrors WindowContext's
// savedLayoutsUserIdHolder pattern. Exposed for test access.
export const taskBoardProjectIdHolder: { current: string | null } = { current: null };
let boardUserId: string | null = null;
// A different account must never inherit the previous account's open project (it would
// address `task-board_<newUser>__<oldProject>`): the project resets whenever the user changes.
// TaskBoard.tsx sets the user first, then the project, during render.
export const taskBoardUserIdHolder: { current: string | null } = {
    get current(): string | null { return boardUserId; },
    set current(next: string | null) {
        if (next !== boardUserId) taskBoardProjectIdHolder.current = null;
        boardUserId = next;
    },
};

function resolveKey(): string {
    const uid = taskBoardUserIdHolder.current;
    const pid = taskBoardProjectIdHolder.current;
    if (uid) {
        return pid && pid !== 'global' ? `taskboard:${uid}:${pid}` : `taskboard:${uid}`;
    }
    return pid && pid !== 'global' ? `taskboard:_anonymous:${pid}` : 'taskboard:_anonymous';
}

function deserialize(raw: string | null): BoardState {
    if (!raw) return createInitialBoard();
    try {
        return repairBoard(JSON.parse(raw));
    } catch {
        return createInitialBoard();
    }
}

// ── Per-board server object (plan 079 B1) ──────────────────────────
/** FNV-1a 32-bit → 8 hex chars. Stable, not cryptographic; only disambiguates slugs. */
function hash8(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * Suffix of the One Save object id `task-board_<uid><suffix>`. '' for the Global
 * board (legacy id, no migration); `__<slug>` for a project board, where the slug is
 * the project id limited to the backend's [A-Za-z0-9_.-] and 60 chars, plus `_<hash>`
 * of the ORIGINAL id whenever that changed it (so two odd ids never collide).
 * ponytail: assumes the user id is short (<=~45 chars) so the whole id stays under the backend's 128.
 */
export function boardObjectSuffix(projectId: string | null): string {
    if (!projectId || projectId === 'global') return '';
    const slug = projectId.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 60);
    return `__${slug}${slug === projectId ? '' : `_${hash8(projectId)}`}`;
}

// ── Remote acceptance (plan 079 B2) ─────────────────────────────────
const legacyFlagKey = (uid: string): string => `taskboard:legacy-checked:${uid}`;

/** One-time per user: does the legacy `task-board_<uid>` object hold a different board than this Global one? */
function legacyObjectIsForeign(local: BoardState, remote: BoardState): boolean {
    const uid = taskBoardUserIdHolder.current ?? '_anonymous';
    try {
        if (localStorage.getItem(legacyFlagKey(uid))) return false;
        localStorage.setItem(legacyFlagKey(uid), '1'); // set whatever the outcome
    } catch { /* sandboxed: no flag, the check just runs again next time */ }
    if (local.cards.length === 0) return false;
    const ids = new Set(local.cards.map(c => c.id));
    return !remote.cards.some(c => ids.has(c.id));
}

/** Validate a remote board and refuse to let it erase or replace a non-empty local one. */
function acceptRemoteBoard(remote: unknown, local: BoardState): BoardState | null {
    const r = repairBoard(remote);
    const pid = taskBoardProjectIdHolder.current;
    const foreign = (!pid || pid === 'global') && legacyObjectIsForeign(local, r);
    // ponytail: a board emptied on purpose on another device is resurrected here; accepted over losing a board.
    if (r.cards.length === 0 && local.cards.length >= 1) return null;
    // The legacy object may hold another board: keep BOTH sides (union by id) rather than pushing
    // local over it — a few foreign cards can be removed, a destroyed board cannot be recovered.
    if (foreign) return repairBoard({ columns: unionById(r.columns, local.columns), cards: unionById(r.cards, local.cards), audit: unionById(r.audit, local.audit) });
    return r;
}

function unionById<T extends { id: string }>(primary: T[], extra: T[]): T[] {
    const ids = new Set(primary.map(x => x.id));
    return [...primary, ...extra.filter(x => !ids.has(x.id))];
}

export const taskBoardStore = withSync(
    createLocalStorageStore<BoardState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: createInitialBoard(),
    }),
    {
        objectType: 'task-board', holder: taskBoardUserIdHolder, resolveKey,
        objectSuffix: () => boardObjectSuffix(taskBoardProjectIdHolder.current),
        acceptRemote: acceptRemoteBoard,
    },
);

// ── Board-scoped async guard (plan 079 B6) ──────────────────────────
/** Capture the active board now; the returned fn is true while the board (user AND project) is unchanged. */
export function captureBoard(): () => boolean {
    const key = resolveKey();
    return () => resolveKey() === key;
}

// ── Local save failure (plan 079 B7) ────────────────────────────────
const SAVE_ERROR_MSG = "Couldn't save this board on this device (storage full). Your last change is only in memory.";
let saveError: string | null = null;
const saveErrorListeners = new Set<() => void>();
function setSaveError(next: string | null): void {
    if (next === saveError) return;
    saveError = next;
    saveErrorListeners.forEach(l => l());
}
/** Tiny external store for useSyncExternalStore; null = last local write succeeded. */
export const taskBoardSaveError = {
    subscribe(l: () => void): () => void { saveErrorListeners.add(l); return () => { saveErrorListeners.delete(l); }; },
    getSnapshot: (): string | null => saveError,
    getServerSnapshot: (): string | null => null,
};

// Real (non-deterministic) context for production. Tests use the pure model
// directly with an injected deterministic ctx.
function newId(): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* fall through */ }
    return `tb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
const ctx: ActionContext = { now: () => new Date().toISOString(), id: newId };

function persist(next: BoardState): void {
    taskBoardStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); setSaveError(null); } catch { setSaveError(SAVE_ERROR_MSG); }
    });
}

/** The one dispatch path. actor distinguishes user vs AI; everything is logged. */
export function dispatch(action: BoardAction, actor: Actor = { kind: 'user' }): BoardState {
    const next = applyAction(taskBoardStore.getSnapshot(), action, actor, ctx);
    persist(next);
    return next;
}

/** AI door — same path, actor tagged {kind:'ai'}. Returns the new state. */
export function aiApply(action: BoardAction, agent: string): BoardState {
    return dispatch(action, { kind: 'ai', agent });
}

// ── User-facing convenience dispatchers ────────────────────────────
function orderInColumn(state: BoardState, columnId: string): number {
    const inCol = state.cards.filter(c => c.columnId === columnId);
    return inCol.length === 0 ? 0 : Math.max(...inCol.map(c => c.order)) + 1;
}

export function addCard(fields: { title: string; description?: string; columnId?: string; urgency?: Urgency; assignee?: Assignee | null }, actor: Actor = { kind: 'user' }): BoardState {
    const state = taskBoardStore.getSnapshot();
    const columnId = fields.columnId ?? [...state.columns].sort((a, b) => a.order - b.order)[0]?.id ?? 'backlog';
    const card = makeCard(ctx, { ...fields, columnId }, orderInColumn(state, columnId));
    return dispatch({ type: 'ADD_CARD', card }, actor);
}

export function moveCard(cardId: string, toColumnId: string, toOrder?: number, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'MOVE_CARD', cardId, toColumnId, toOrder }, actor);
}

export function moveCards(cardIds: string[], toColumnId: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'MOVE_CARDS', cardIds, toColumnId }, actor);
}

export function editCard(cardId: string, patch: CardPatch, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'EDIT_CARD', cardId, patch }, actor);
}

export function removeCard(cardId: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'REMOVE_CARD', cardId }, actor);
}

export function addColumn(title: string, actor: Actor = { kind: 'user' }): BoardState {
    const state = taskBoardStore.getSnapshot();
    const order = state.columns.length === 0 ? 0 : Math.max(...state.columns.map(c => c.order)) + 1;
    const column: BoardColumn = { id: newId(), title: title.trim() || 'New Column', width: 288, order };
    return dispatch({ type: 'ADD_COLUMN', column }, actor);
}

export function removeColumn(columnId: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'REMOVE_COLUMN', columnId }, actor);
}

export function renameColumn(columnId: string, title: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'RENAME_COLUMN', columnId, title }, actor);
}

export function resizeColumn(columnId: string, width: number, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'RESIZE_COLUMN', columnId, width }, actor);
}

export function updateColumnLimits(columnId: string, minWip?: number, maxWip?: number, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'UPDATE_COLUMN_LIMITS', columnId, minWip, maxWip }, actor);
}

export function updateColumnPolicies(columnId: string, policies: string[], actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'UPDATE_COLUMN_POLICIES', columnId, policies }, actor);
}

// ── Undo / report ──────────────────────────────────────────────────
export function undo(actor: Actor = { kind: 'user' }): BoardState {
    const { state, undone } = undoModel(taskBoardStore.getSnapshot(), ctx, actor);
    if (undone) persist(state);
    return state;
}

export function undoLastAi(actor: Actor = { kind: 'user' }): BoardState {
    const { state, undone } = undoLastAiModel(taskBoardStore.getSnapshot(), ctx, actor);
    if (undone) persist(state);
    return state;
}

export function boardReport(onlyAi = false): string {
    return generateReport(taskBoardStore.getSnapshot().audit, { onlyAi });
}

/**
 * Local, deterministic AI helper (honest: a rule, not an LLM call) used to
 * demonstrate the AI→audit→reversible loop end-to-end: files every Backlog
 * card into To Do as agent "ara". Fully reversible via undoLastAi().
 */
export function aiFileBacklog(agent = 'ara'): BoardState {
    const state = taskBoardStore.getSnapshot();
    const backlog = state.columns.find(c => c.id === 'backlog' || /backlog/i.test(c.title));
    const todo = state.columns.find(c => c.id === 'todo' || /to ?do/i.test(c.title));
    if (!backlog || !todo) return state;
    const ids = state.cards.filter(c => c.columnId === backlog.id).map(c => c.id);
    if (ids.length === 0) return state;
    return aiApply({ type: 'MOVE_CARDS', cardIds: ids, toColumnId: todo.id }, agent);
}

// ── Phase 2: assignment + routing + sub-tasks + attachments ────────
export const MAX_INLINE_ATTACHMENT = 256 * 1024; // 256 KB — larger files persist metadata-only

export function assignCard(cardId: string, assignee: Assignee | null, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'EDIT_CARD', cardId, patch: { assignee } }, actor);
}

/** Create a sub-task / sub-project under a parent card (same column as the parent). */
export function addSubtask(parentId: string, title: string, actor: Actor = { kind: 'user' }): BoardState {
    const state = taskBoardStore.getSnapshot();
    const parent = state.cards.find(c => c.id === parentId);
    const columnId = parent?.columnId ?? state.columns[0]?.id ?? 'backlog';
    const card = makeCard(ctx, { title, columnId, parentId }, orderInColumn(state, columnId));
    return dispatch({ type: 'ADD_CARD', card }, actor);
}

export function logEvent(summary: string, cardId?: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'LOG_EVENT', summary, cardId }, actor);
}

/** Keeps one board object well under the backend body limit (~1 MB). */
export const MAX_BOARD_JSON = 700_000;

export function attachToCard(cardId: string, meta: { name: string; size: number; type: string; dataUrl?: string }, actor: Actor = { kind: 'user' }): BoardState {
    // Too big to inline on top of the current board → keep metadata only.
    const inline = meta.dataUrl && JSON.stringify(taskBoardStore.getSnapshot()).length + meta.dataUrl.length <= MAX_BOARD_JSON;
    const attachment: Attachment = {
        id: newId(), name: meta.name, size: meta.size, type: meta.type,
        addedAt: new Date().toISOString(), dataUrl: inline ? meta.dataUrl : undefined,
    };
    return dispatch({ type: 'ADD_ATTACHMENT', cardId, attachment }, actor);
}

export function removeAttachment(cardId: string, attachmentId: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'REMOVE_ATTACHMENT', cardId, attachmentId }, actor);
}

export interface RouteResult { status: 'sent' | 'failed' | 'drafted' | 'none'; detail: string; reply?: string; }

/** Newlines collapsed, cut to 300 chars: one readable audit line. */
const replyLine = (r: string) => r.replace(/\s+/g, ' ').trim().slice(0, 300);

/**
 * Route a card to its assignee. AI targets POST to the agent endpoint; the outcome is
 * logged exactly as it happened (sent / no reply / failed); there is no retry queue. Person targets open a pre-filled Gmail draft the user reviews + sends (never
 * auto-sent). Every outcome is audited via LOG_EVENT so it appears in the card's timeline.
 */
export async function routeCard(cardId: string): Promise<RouteResult> {
    const card = taskBoardStore.getSnapshot().cards.find(c => c.id === cardId);
    if (!card || !card.assignee) return { status: 'none', detail: 'No assignee set.' };
    const a = card.assignee;

    if (a.kind === 'ai') {
        const endpoint = aiEndpoint(a.id);
        if (!endpoint) {
            const detail = `Not sent: no agent called "${a.label}" exists`;
            logEvent(detail, cardId);
            return { status: 'failed', detail };
        }
        const sameBoard = captureBoard();
        let res: Response | null = null;
        let reply: string | null = null;
        try {
            res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(aiRequestBody(a.id, card)),
            });
        } catch { /* offline: handled below */ }
        if (res?.ok) {
            try { reply = readAgentReply(await res.json()); } catch { /* non-JSON body = no reply */ }
        }
        // The user switched board/account while the request was in flight: logging now would write onto the wrong board.
        if (!sameBoard()) return { status: 'none', detail: 'The board changed while sending; the result was not logged.' };
        if (!res) {
            logEvent(`Not sent to AI · ${a.label} (backend offline)`, cardId);
            return { status: 'failed', detail: `${a.label} is offline. Nothing was sent.` };
        }
        if (!res.ok) {
            logEvent(`Not sent to AI · ${a.label} (HTTP ${res.status})`, cardId);
            return { status: 'failed', detail: `${a.label} refused the request (HTTP ${res.status}). Nothing was sent.` };
        }
        if (!reply) {
            logEvent(`Sent "${card.title}" to AI · ${a.label} (no reply)`, cardId);
            return { status: 'sent', detail: `Sent to ${a.label}.` };
        }
        if (a.id === 'stella' && isStellaNoKeyReply(reply)) {
            logEvent('Not handled: Stella has no LLM key configured', cardId);
            return { status: 'failed', detail: 'Stella is online but has no LLM key, so she did not handle this card. Add a key in Settings → API Keys.' };
        }
        logEvent(`AI · ${a.label} replied: ${replyLine(reply)}`, cardId);
        return { status: 'sent', detail: `Sent to ${a.label}.`, reply };
    }

    // person → compose an email DRAFT (never auto-send)
    const { subject, body } = composeCardEmail(card);
    const url = buildGmailComposeUrl({ to: a.email, subject, body });
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    logEvent(`Drafted email to ${a.label}${a.email ? ` <${a.email}>` : ''}`, cardId);
    return { status: 'drafted', detail: `Opened a Gmail draft to ${a.label} for you to review + send.` };
}

export function loadBoardState(board: BoardState, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'REPLACE_BOARD', board }, actor);
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetTaskBoard(): void {
    taskBoardStore.set(createInitialBoard(), () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
