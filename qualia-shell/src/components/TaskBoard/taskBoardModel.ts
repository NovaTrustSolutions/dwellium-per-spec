/**
 * taskBoardModel — PURE, framework-free core for the local-first Task Board.
 *
 * Every mutation of the board flows through `applyAction`, which returns the
 * next state AND appends an AuditEntry carrying an `inverse` action. That single
 * choke-point is what makes the board:
 *   • timestamped — ADD_CARD/MOVE_CARD stamp createdAt + enteredColumnAt
 *   • auditable   — every change (user OR AI) appends {actor, ts, summary}
 *   • reversible  — every entry carries an inverse; undo() applies it
 *   • testable    — now()/id() are injected, so the reducer is deterministic
 *
 * No React, no localStorage here. taskBoardStore.ts wraps this with per-user
 * persistence; TaskBoard.tsx renders it. The AI edits the board through the
 * exact same applyAction path (actor = {kind:'ai'}), so anything the AI does is
 * timestamped, logged, reportable, and reversible by construction.
 */

// ── Actors ─────────────────────────────────────────────────────────
export type Actor =
    | { kind: 'user'; name?: string }
    | { kind: 'ai'; agent: string };   // agent: 'ara' | 'stella' | custom

export function actorLabel(a: Actor): string {
    return a.kind === 'ai' ? `AI · ${a.agent}` : (a.name ? `${a.name}` : 'You');
}

// ── Entities ───────────────────────────────────────────────────────
export type Urgency = 'high' | 'medium' | 'low';

export interface BoardColumn {
    id: string;
    title: string;
    width: number;   // px — user-resizable
    order: number;
    minWip?: number; // min WIP limit (optional)
    maxWip?: number; // max WIP limit (optional)
    policies?: string[]; // definition of done / agreements
}

/** Routing target for a card: an AI agent (ARA/Stella) or a person (email). */
export interface Assignee {
    kind: 'ai' | 'person';
    id: string;       // 'ara' | 'stella' | 'lisa' | custom slug
    label: string;
    email?: string;   // person targets — used to compose an email draft
}

/** File attached to a card's project view. Large files persist metadata-only. */
export interface Attachment {
    id: string;
    name: string;
    size: number;
    type: string;
    addedAt: string;
    dataUrl?: string; // present only for small files (honest cap); else metadata-only
}

export interface TaskCard {
    id: string;
    title: string;
    description: string;
    columnId: string;
    order: number;            // sort position within its column
    createdAt: string;        // ISO — when the card entered the board (never changes)
    enteredColumnAt: string;  // ISO — when it last entered its CURRENT column
    urgency?: Urgency;
    assignee?: Assignee | null;   // Phase 2 — ARA/Stella/Lisa/custom
    parentId?: string | null;     // Phase 2 — sub-task / sub-project nesting
    attachments?: Attachment[];   // Phase 2 — project-view files
    tags?: string[];              // Phase 3 — app-wide tagging
}

// ── Actions (discriminated union) ──────────────────────────────────
export interface CardPosition { cardId: string; columnId: string; order: number; enteredColumnAt: string; }

/** The mutable subset of a card editable via EDIT_CARD. */
export type CardPatch = Partial<Pick<TaskCard, 'title' | 'description' | 'urgency' | 'assignee' | 'tags'>>;

export type BoardAction =
    | { type: 'ADD_CARD'; card: TaskCard }
    | { type: 'REMOVE_CARD'; cardId: string }
    | { type: 'RESTORE_CARD'; card: TaskCard }                       // inverse of REMOVE_CARD
    | { type: 'MOVE_CARD'; cardId: string; toColumnId: string; toOrder?: number }
    | { type: 'MOVE_CARDS'; cardIds: string[]; toColumnId: string }  // bulk
    | { type: 'RESTORE_POSITIONS'; positions: CardPosition[] }       // inverse of MOVE_*
    | { type: 'EDIT_CARD'; cardId: string; patch: CardPatch }
    | { type: 'ADD_COLUMN'; column: BoardColumn }
    | { type: 'REMOVE_COLUMN'; columnId: string }
    | { type: 'RESTORE_COLUMN'; column: BoardColumn; cards: TaskCard[] } // inverse of REMOVE_COLUMN
    | { type: 'RENAME_COLUMN'; columnId: string; title: string }
    | { type: 'RESIZE_COLUMN'; columnId: string; width: number }
    | { type: 'ADD_ATTACHMENT'; cardId: string; attachment: Attachment }
    | { type: 'REMOVE_ATTACHMENT'; cardId: string; attachmentId: string }
    | { type: 'RESTORE_ATTACHMENT'; cardId: string; attachment: Attachment } // inverse of REMOVE_ATTACHMENT
    | { type: 'LOG_EVENT'; summary: string; cardId?: string }               // external effect (routing) — audit-only, not reversible
    | { type: 'UPDATE_COLUMN_LIMITS'; columnId: string; minWip?: number; maxWip?: number }
    | { type: 'UPDATE_COLUMN_POLICIES'; columnId: string; policies: string[] }
    | { type: 'REPLACE_BOARD'; board: BoardState };

export interface AuditEntry {
    id: string;
    ts: string;                            // ISO
    actor: Actor;
    type: BoardAction['type'] | 'UNDO';
    summary: string;                       // human-readable
    inverse: BoardAction | null;           // null = not reversible
    reversed?: boolean;
    cardId?: string;                       // links the entry to a card (per-card timeline)
}

export interface BoardState {
    columns: BoardColumn[];
    cards: TaskCard[];
    audit: AuditEntry[];
}

export interface ActionContext {
    now: () => string;   // ISO timestamp
    id: () => string;    // unique id
}

// ── Defaults / construction ────────────────────────────────────────
export const DEFAULT_COLUMN_WIDTH = 288;

export function defaultColumns(): BoardColumn[] {
    return [
        { id: 'backlog', title: 'Backlog', width: DEFAULT_COLUMN_WIDTH, order: 0 },
        { id: 'todo', title: 'To Do', width: DEFAULT_COLUMN_WIDTH, order: 1 },
        { id: 'in-progress', title: 'In Progress', width: DEFAULT_COLUMN_WIDTH, order: 2 },
        { id: 'done', title: 'Done', width: DEFAULT_COLUMN_WIDTH, order: 3 },
    ];
}

export function createInitialBoard(): BoardState {
    return { columns: defaultColumns(), cards: [], audit: [] };
}

/** Build a fresh card. Caller supplies id/now via ctx; columnId defaults to first column. */
export function makeCard(
    ctx: ActionContext,
    fields: { title: string; description?: string; columnId: string; urgency?: Urgency; assignee?: Assignee | null; tags?: string[]; parentId?: string | null },
    orderInColumn: number,
): TaskCard {
    const ts = ctx.now();
    return {
        id: ctx.id(),
        title: fields.title.trim() || 'Untitled task',
        description: fields.description?.trim() ?? '',
        columnId: fields.columnId,
        order: orderInColumn,
        createdAt: ts,
        enteredColumnAt: ts,
        urgency: fields.urgency,
        assignee: fields.assignee ?? null,
        parentId: fields.parentId ?? null,
        attachments: [],
        tags: fields.tags ?? [],
    };
}

// ── Helpers ────────────────────────────────────────────────────────
export function cardsInColumn(cards: TaskCard[], columnId: string): TaskCard[] {
    return cards.filter(c => c.columnId === columnId).sort((a, b) => a.order - b.order);
}

function nextOrder(cards: TaskCard[], columnId: string): number {
    const inCol = cards.filter(c => c.columnId === columnId);
    return inCol.length === 0 ? 0 : Math.max(...inCol.map(c => c.order)) + 1;
}

function colTitle(state: { columns: BoardColumn[] }, columnId: string): string {
    return state.columns.find(c => c.id === columnId)?.title ?? columnId;
}

function cardTitle(state: { cards: TaskCard[] }, cardId: string): string {
    return state.cards.find(c => c.id === cardId)?.title ?? cardId;
}

// ── Core reducer (data only — no audit). Returns next data + the inverse. ──
interface BoardData { columns: BoardColumn[]; cards: TaskCard[]; }

function reduceData(state: BoardData, action: BoardAction, ctx: ActionContext): { next: BoardData; inverse: BoardAction | null } {
    switch (action.type) {
        case 'ADD_CARD': {
            return {
                next: { ...state, cards: [...state.cards, action.card] },
                inverse: { type: 'REMOVE_CARD', cardId: action.card.id },
            };
        }
        case 'RESTORE_CARD': {
            return {
                next: { ...state, cards: [...state.cards.filter(c => c.id !== action.card.id), action.card] },
                inverse: { type: 'REMOVE_CARD', cardId: action.card.id },
            };
        }
        case 'REMOVE_CARD': {
            const card = state.cards.find(c => c.id === action.cardId);
            if (!card) return { next: state, inverse: null };
            return {
                next: { ...state, cards: state.cards.filter(c => c.id !== action.cardId) },
                inverse: { type: 'RESTORE_CARD', card },
            };
        }
        case 'MOVE_CARD': {
            const card = state.cards.find(c => c.id === action.cardId);
            if (!card) return { next: state, inverse: null };
            const prior: CardPosition = { cardId: card.id, columnId: card.columnId, order: card.order, enteredColumnAt: card.enteredColumnAt };
            const columnChanged = card.columnId !== action.toColumnId;
            const toOrder = action.toOrder ?? nextOrder(state.cards, action.toColumnId);
            const moved: TaskCard = {
                ...card,
                columnId: action.toColumnId,
                order: toOrder,
                // Re-stamp entry time ONLY when the column actually changes.
                enteredColumnAt: columnChanged ? ctx.now() : card.enteredColumnAt,
            };
            return {
                next: { ...state, cards: state.cards.map(c => c.id === card.id ? moved : c) },
                inverse: { type: 'RESTORE_POSITIONS', positions: [prior] },
            };
        }
        case 'MOVE_CARDS': {
            const priors: CardPosition[] = [];
            let base = nextOrder(state.cards, action.toColumnId);
            const movedCards = state.cards.map(c => c); // shallow copy
            for (const cardId of action.cardIds) {
                const idx = movedCards.findIndex(c => c.id === cardId);
                if (idx < 0) continue;
                const card = movedCards[idx];
                priors.push({ cardId: card.id, columnId: card.columnId, order: card.order, enteredColumnAt: card.enteredColumnAt });
                const columnChanged = card.columnId !== action.toColumnId;
                movedCards[idx] = {
                    ...card,
                    columnId: action.toColumnId,
                    order: base++,
                    enteredColumnAt: columnChanged ? ctx.now() : card.enteredColumnAt,
                };
            }
            if (priors.length === 0) return { next: state, inverse: null };
            return {
                next: { ...state, cards: movedCards },
                inverse: { type: 'RESTORE_POSITIONS', positions: priors },
            };
        }
        case 'RESTORE_POSITIONS': {
            const before: CardPosition[] = [];
            const byId = new Map(action.positions.map(p => [p.cardId, p]));
            const cards = state.cards.map(c => {
                const p = byId.get(c.id);
                if (!p) return c;
                before.push({ cardId: c.id, columnId: c.columnId, order: c.order, enteredColumnAt: c.enteredColumnAt });
                return { ...c, columnId: p.columnId, order: p.order, enteredColumnAt: p.enteredColumnAt };
            });
            return { next: { ...state, cards }, inverse: { type: 'RESTORE_POSITIONS', positions: before } };
        }
        case 'EDIT_CARD': {
            const card = state.cards.find(c => c.id === action.cardId);
            if (!card) return { next: state, inverse: null };
            const oldPatch: BoardAction = {
                type: 'EDIT_CARD',
                cardId: card.id,
                patch: {
                    ...(('title' in action.patch) ? { title: card.title } : {}),
                    ...(('description' in action.patch) ? { description: card.description } : {}),
                    ...(('urgency' in action.patch) ? { urgency: card.urgency } : {}),
                    ...(('assignee' in action.patch) ? { assignee: card.assignee } : {}),
                    ...(('tags' in action.patch) ? { tags: card.tags } : {}),
                },
            };
            return {
                next: { ...state, cards: state.cards.map(c => c.id === card.id ? { ...c, ...action.patch } : c) },
                inverse: oldPatch,
            };
        }
        case 'ADD_COLUMN': {
            return {
                next: { ...state, columns: [...state.columns, action.column] },
                inverse: { type: 'REMOVE_COLUMN', columnId: action.column.id },
            };
        }
        case 'REMOVE_COLUMN': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column) return { next: state, inverse: null };
            const removedCards = state.cards.filter(c => c.columnId === action.columnId);
            return {
                next: {
                    columns: state.columns.filter(c => c.id !== action.columnId),
                    cards: state.cards.filter(c => c.columnId !== action.columnId),
                },
                inverse: { type: 'RESTORE_COLUMN', column, cards: removedCards },
            };
        }
        case 'RESTORE_COLUMN': {
            return {
                next: {
                    columns: [...state.columns.filter(c => c.id !== action.column.id), action.column],
                    cards: [...state.cards.filter(c => c.columnId !== action.column.id), ...action.cards],
                },
                inverse: { type: 'REMOVE_COLUMN', columnId: action.column.id },
            };
        }
        case 'RENAME_COLUMN': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, title: action.title } : c) },
                inverse: { type: 'RENAME_COLUMN', columnId: column.id, title: column.title },
            };
        }
        case 'RESIZE_COLUMN': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, width: action.width } : c) },
                inverse: { type: 'RESIZE_COLUMN', columnId: column.id, width: column.width },
            };
        }
        case 'UPDATE_COLUMN_LIMITS': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, minWip: action.minWip, maxWip: action.maxWip } : c) },
                inverse: { type: 'UPDATE_COLUMN_LIMITS', columnId: column.id, minWip: column.minWip, maxWip: column.maxWip },
            };
        }
        case 'UPDATE_COLUMN_POLICIES': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, policies: action.policies } : c) },
                inverse: { type: 'UPDATE_COLUMN_POLICIES', columnId: column.id, policies: column.policies ?? [] },
            };
        }
        case 'ADD_ATTACHMENT': {
            const card = state.cards.find(c => c.id === action.cardId);
            if (!card) return { next: state, inverse: null };
            const cards = state.cards.map(c => c.id === card.id ? { ...c, attachments: [...(c.attachments ?? []), action.attachment] } : c);
            return { next: { ...state, cards }, inverse: { type: 'REMOVE_ATTACHMENT', cardId: card.id, attachmentId: action.attachment.id } };
        }
        case 'RESTORE_ATTACHMENT': {
            const card = state.cards.find(c => c.id === action.cardId);
            if (!card) return { next: state, inverse: null };
            const cards = state.cards.map(c => c.id === card.id
                ? { ...c, attachments: [...(c.attachments ?? []).filter(a => a.id !== action.attachment.id), action.attachment] } : c);
            return { next: { ...state, cards }, inverse: { type: 'REMOVE_ATTACHMENT', cardId: card.id, attachmentId: action.attachment.id } };
        }
        case 'REMOVE_ATTACHMENT': {
            const card = state.cards.find(c => c.id === action.cardId);
            const removed = card?.attachments?.find(a => a.id === action.attachmentId);
            if (!card || !removed) return { next: state, inverse: null };
            const cards = state.cards.map(c => c.id === card.id ? { ...c, attachments: (c.attachments ?? []).filter(a => a.id !== action.attachmentId) } : c);
            return { next: { ...state, cards }, inverse: { type: 'RESTORE_ATTACHMENT', cardId: card.id, attachment: removed } };
        }
        case 'LOG_EVENT': {
            // External effect (routing dispatch / email draft) — recorded for the
            // audit + timeline, no board-state change, not reversible.
            return { next: state, inverse: null };
        }
        case 'REPLACE_BOARD': {
            return {
                next: action.board,
                inverse: { type: 'REPLACE_BOARD', board: { columns: state.columns, cards: state.cards, audit: [] } }
            };
        }
        default:
            return { next: state, inverse: null };
    }
}

// ── Summaries (human-readable audit text) ──────────────────────────
function summarize(state: BoardData, action: BoardAction): string {
    switch (action.type) {
        case 'ADD_CARD': return `Added "${action.card.title}" to ${colTitle(state, action.card.columnId)}`;
        case 'RESTORE_CARD': return `Restored "${action.card.title}"`;
        case 'REMOVE_CARD': return `Removed "${cardTitle(state, action.cardId)}"`;
        case 'MOVE_CARD': return `Moved "${cardTitle(state, action.cardId)}" → ${colTitle(state, action.toColumnId)}`;
        case 'MOVE_CARDS': return `Moved ${action.cardIds.length} card${action.cardIds.length === 1 ? '' : 's'} → ${colTitle(state, action.toColumnId)}`;
        case 'RESTORE_POSITIONS': return `Restored position of ${action.positions.length} card${action.positions.length === 1 ? '' : 's'}`;
        case 'EDIT_CARD': return `Edited "${cardTitle(state, action.cardId)}" (${Object.keys(action.patch).join(', ')})`;
        case 'ADD_COLUMN': return `Added column "${action.column.title}"`;
        case 'REMOVE_COLUMN': return `Removed column "${colTitle(state, action.columnId)}"`;
        case 'RESTORE_COLUMN': return `Restored column "${action.column.title}"`;
        case 'RENAME_COLUMN': return `Renamed column to "${action.title}"`;
        case 'RESIZE_COLUMN': return `Resized column "${colTitle(state, action.columnId)}" → ${action.width}px`;
        case 'UPDATE_COLUMN_LIMITS': return `Updated limits for column "${colTitle(state, action.columnId)}"`;
        case 'UPDATE_COLUMN_POLICIES': return `Updated policies for column "${colTitle(state, action.columnId)}"`;
        case 'ADD_ATTACHMENT': return `Attached "${action.attachment.name}" to "${cardTitle(state, action.cardId)}"`;
        case 'RESTORE_ATTACHMENT': return `Restored attachment "${action.attachment.name}"`;
        case 'REMOVE_ATTACHMENT': return `Removed an attachment from "${cardTitle(state, action.cardId)}"`;
        case 'LOG_EVENT': return action.summary;
        default: return 'Updated board';
    }
}

/** Extract the card a given action pertains to (for per-card timeline linkage). */
function actionCardId(action: BoardAction): string | undefined {
    switch (action.type) {
        case 'ADD_CARD':
        case 'RESTORE_CARD': return action.card.id;
        case 'REMOVE_CARD':
        case 'MOVE_CARD':
        case 'EDIT_CARD':
        case 'ADD_ATTACHMENT':
        case 'REMOVE_ATTACHMENT':
        case 'RESTORE_ATTACHMENT': return action.cardId;
        case 'LOG_EVENT': return action.cardId;
        default: return undefined;
    }
}

// ── Public: applyAction (the single mutation choke-point) ──────────
export function applyAction(state: BoardState, action: BoardAction, actor: Actor, ctx: ActionContext): BoardState {
    const summary = summarize(state, action);
    const { next, inverse } = reduceData({ columns: state.columns, cards: state.cards }, action, ctx);
    const entry: AuditEntry = {
        id: ctx.id(),
        ts: ctx.now(),
        actor,
        type: action.type,
        summary,
        inverse,
        cardId: actionCardId(action),
    };
    return { columns: next.columns, cards: next.cards, audit: [...state.audit, entry] };
}

/** Audit entries for one card, oldest→newest — the per-card project timeline. */
export function cardTimeline(state: BoardState, cardId: string): AuditEntry[] {
    return state.audit.filter(e => e.cardId === cardId);
}

/** Direct sub-tasks / sub-projects of a card. */
export function subtasksOf(cards: TaskCard[], parentId: string): TaskCard[] {
    return cards.filter(c => c.parentId === parentId).sort((a, b) => a.order - b.order);
}

/** Find the last reversible (not-yet-reversed) audit entry, optionally filtered. */
export function lastReversible(state: BoardState, filter?: (e: AuditEntry) => boolean): AuditEntry | null {
    for (let i = state.audit.length - 1; i >= 0; i--) {
        const e = state.audit[i];
        if (e.reversed || !e.inverse) continue;
        if (e.type === 'UNDO') continue;
        if (filter && !filter(e)) continue;
        return e;
    }
    return null;
}

/**
 * Undo the most recent reversible action (optionally only those matching a
 * filter — e.g. AI-authored). Applies the inverse, marks the original entry
 * reversed, and appends a truthful UNDO entry to the log. Returns the same
 * state when there is nothing to undo.
 */
export function undo(state: BoardState, ctx: ActionContext, actor: Actor, filter?: (e: AuditEntry) => boolean): { state: BoardState; undone: AuditEntry | null } {
    const target = lastReversible(state, filter);
    if (!target || !target.inverse) return { state, undone: null };
    const { next } = reduceData({ columns: state.columns, cards: state.cards }, target.inverse, ctx);
    const undoEntry: AuditEntry = {
        id: ctx.id(),
        ts: ctx.now(),
        actor,
        type: 'UNDO',
        summary: `Reverted: ${target.summary}`,
        inverse: null,
    };
    const audit = state.audit.map(e => e.id === target.id ? { ...e, reversed: true } : e);
    return { state: { columns: next.columns, cards: next.cards, audit: [...audit, undoEntry] }, undone: target };
}

/** Convenience: undo the last AI-authored action specifically. */
export function undoLastAi(state: BoardState, ctx: ActionContext, actor: Actor): { state: BoardState; undone: AuditEntry | null } {
    return undo(state, ctx, actor, e => e.actor.kind === 'ai');
}

/**
 * Build a human-readable report from audit entries. `onlyAi` filters to
 * AI-authored actions (the "report of what the AI did" requirement).
 */
export function generateReport(audit: AuditEntry[], opts: { onlyAi?: boolean; title?: string } = {}): string {
    const entries = opts.onlyAi ? audit.filter(e => e.actor.kind === 'ai') : audit;
    const title = opts.title ?? (opts.onlyAi ? 'AI Activity Report' : 'Board Activity Report');
    const lines: string[] = [`# ${title}`, `Generated ${new Date().toISOString()}`, `${entries.length} action${entries.length === 1 ? '' : 's'}`, ''];
    for (const e of entries) {
        const who = actorLabel(e.actor);
        const rev = e.reversed ? ' [reverted]' : '';
        lines.push(`- ${e.ts} — ${who}: ${e.summary}${rev}`);
    }
    return lines.join('\n');
}
