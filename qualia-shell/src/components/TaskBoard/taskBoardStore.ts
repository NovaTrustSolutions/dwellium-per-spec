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
    type BoardState, type BoardAction, type BoardColumn, type TaskCard, type Actor, type Urgency, type AuditEntry, type CardPatch,
    type Assignee, type Attachment,
    applyAction, undo as undoModel, undoLastAi as undoLastAiModel, generateReport,
    createInitialBoard, defaultColumns, makeCard, type ActionContext,
} from './taskBoardModel';
import { aiEndpoint, buildGmailComposeUrl, composeCardEmail, composeCardPrompt } from './taskRouting';

// Module-level holder updated DURING render by the consuming component
// (TaskBoard.tsx) before useSyncExternalStore fires — mirrors WindowContext's
// savedLayoutsUserIdHolder pattern. Exposed for test access.
export const taskBoardUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = taskBoardUserIdHolder.current;
    return uid ? `taskboard:${uid}` : 'taskboard:_anonymous';
}

function isCard(c: any): c is TaskCard {
    return c && typeof c.id === 'string' && typeof c.title === 'string' && typeof c.columnId === 'string'
        && typeof c.createdAt === 'string' && typeof c.enteredColumnAt === 'string';
}
function isColumn(c: any): c is BoardColumn {
    return c && typeof c.id === 'string' && typeof c.title === 'string' && typeof c.width === 'number';
}

function deserialize(raw: string | null): BoardState {
    if (!raw) return createInitialBoard();
    try {
        const p = JSON.parse(raw);
        const columns: BoardColumn[] = Array.isArray(p?.columns) && p.columns.every(isColumn) ? p.columns : defaultColumns();
        const cards: TaskCard[] = Array.isArray(p?.cards) ? p.cards.filter(isCard) : [];
        const audit: AuditEntry[] = Array.isArray(p?.audit) ? p.audit : [];
        return { columns, cards, audit };
    } catch {
        return createInitialBoard();
    }
}

export const taskBoardStore = withSync(
    createLocalStorageStore<BoardState>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: createInitialBoard(),
    }),
    { objectType: 'task-board', holder: taskBoardUserIdHolder, resolveKey },
);

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
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
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
    const columnId = fields.columnId ?? state.columns.sort((a, b) => a.order - b.order)[0]?.id ?? 'backlog';
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

// ── Undo / report ──────────────────────────────────────────────────
export function undo(actor: Actor = { kind: 'user' }): BoardState {
    const { state } = undoModel(taskBoardStore.getSnapshot(), ctx, actor);
    persist(state);
    return state;
}

export function undoLastAi(actor: Actor = { kind: 'user' }): BoardState {
    const { state } = undoLastAiModel(taskBoardStore.getSnapshot(), ctx, actor);
    persist(state);
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

export function attachToCard(cardId: string, meta: { name: string; size: number; type: string; dataUrl?: string }, actor: Actor = { kind: 'user' }): BoardState {
    const attachment: Attachment = {
        id: newId(), name: meta.name, size: meta.size, type: meta.type,
        addedAt: new Date().toISOString(), dataUrl: meta.dataUrl,
    };
    return dispatch({ type: 'ADD_ATTACHMENT', cardId, attachment }, actor);
}

export function removeAttachment(cardId: string, attachmentId: string, actor: Actor = { kind: 'user' }): BoardState {
    return dispatch({ type: 'REMOVE_ATTACHMENT', cardId, attachmentId }, actor);
}

export interface RouteResult { status: 'sent' | 'queued' | 'drafted' | 'none'; detail: string; }

/**
 * Route a card to its assignee. AI targets POST to the agent endpoint best-effort
 * (QUEUED — never faked — when the backend is offline). Person targets open a
 * pre-filled Gmail draft the user reviews + sends (never auto-sent). Every outcome
 * is audited via LOG_EVENT so it appears in the card's timeline.
 */
export async function routeCard(cardId: string): Promise<RouteResult> {
    const card = taskBoardStore.getSnapshot().cards.find(c => c.id === cardId);
    if (!card || !card.assignee) return { status: 'none', detail: 'No assignee set.' };
    const a = card.assignee;

    if (a.kind === 'ai') {
        const endpoint = aiEndpoint(a.id);
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: composeCardPrompt(card), source: 'task-board', cardId }),
            });
            if (res.ok) {
                logEvent(`Sent "${card.title}" to AI · ${a.label}`, cardId);
                return { status: 'sent', detail: `Sent to ${a.label}.` };
            }
            logEvent(`Queued "${card.title}" for AI · ${a.label} (agent returned ${res.status})`, cardId);
            return { status: 'queued', detail: `${a.label} unavailable (HTTP ${res.status}) — queued, not sent.` };
        } catch {
            logEvent(`Queued "${card.title}" for AI · ${a.label} (backend offline)`, cardId);
            return { status: 'queued', detail: `${a.label} is offline — queued, not sent.` };
        }
    }

    // person → compose an email DRAFT (never auto-send)
    const { subject, body } = composeCardEmail(card);
    const url = buildGmailComposeUrl({ to: a.email, subject, body });
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
    logEvent(`Drafted email to ${a.label}${a.email ? ` <${a.email}>` : ''}`, cardId);
    return { status: 'drafted', detail: `Opened a Gmail draft to ${a.label} for you to review + send.` };
}

/** Test/escape-hatch reset (standing convention for factory stores). */
export function resetTaskBoard(): void {
    taskBoardStore.set(createInitialBoard(), () => {
        try { localStorage.removeItem(resolveKey()); } catch { /* sandboxed */ }
    });
}
