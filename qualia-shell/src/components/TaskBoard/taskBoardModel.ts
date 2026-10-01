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
    dueAt?: string;               // Phase 5 — 'YYYY-MM-DD' local calendar date
}

// ── Actions (discriminated union) ──────────────────────────────────
export interface CardPosition { cardId: string; columnId: string; order: number; enteredColumnAt: string; }

/** The mutable subset of a card editable via EDIT_CARD. `urgency: null` = unset. */
export type CardPatch = Partial<Pick<TaskCard, 'title' | 'description' | 'assignee' | 'tags'>> & { urgency?: Urgency | null; dueAt?: string | null };

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
    cardIds?: string[];                    // MOVE_CARD/MOVE_CARDS: cards actually moved; UNDO copies its target's
    to?: string;                           // MOVE_CARD/MOVE_CARDS: destination column id as applied
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

// ── repairBoard: tolerant loader for stored / remote payloads (pure, never throws) ──
type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isIso = (v: unknown): v is string => isStr(v) && !Number.isNaN(Date.parse(v));
const strArray = (v: unknown): string[] | undefined => (Array.isArray(v) && v.every(isStr) ? v : undefined);

/** 'YYYY-MM-DD' that is a real calendar date (no 2026-02-31). */
export function isDueDate(v: unknown): v is string {
    if (!isStr(v) || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function repairColumn(r: Rec, index: number): BoardColumn {
    const col: BoardColumn = {
        id: r.id as string,
        title: isStr(r.title) ? r.title : 'Untitled column',
        width: isNum(r.width) ? Math.min(640, Math.max(200, r.width)) : DEFAULT_COLUMN_WIDTH,
        order: isNum(r.order) ? r.order : index,
    };
    if (isNum(r.minWip)) col.minWip = r.minWip;
    if (isNum(r.maxWip)) col.maxWip = r.maxWip;
    const policies = strArray(r.policies);
    if (policies) col.policies = policies;
    return col;
}

function repairAssignee(v: unknown): Assignee | null | undefined {
    if (v === null) return null;
    if (!isRec(v) || (v.kind !== 'ai' && v.kind !== 'person') || !isStr(v.id) || !isStr(v.label)) return undefined;
    return { kind: v.kind, id: v.id, label: v.label, ...(isStr(v.email) ? { email: v.email } : {}) };
}

function repairAttachments(v: unknown): Attachment[] | undefined {
    if (!Array.isArray(v)) return undefined;
    return v.filter(isRec).filter(a => isStr(a.id) && isStr(a.name) && isNum(a.size) && isStr(a.type) && isStr(a.addedAt))
        .map(a => ({ id: a.id as string, name: a.name as string, size: a.size as number, type: a.type as string, addedAt: a.addedAt as string, ...(isStr(a.dataUrl) ? { dataUrl: a.dataUrl } : {}) }));
}

function repairCard(r: Rec, firstColumnId: string, columnIds: Set<string>): TaskCard {
    const fallbackTs = new Date().toISOString();
    const created = isIso(r.createdAt) ? r.createdAt : isIso(r.enteredColumnAt) ? r.enteredColumnAt : fallbackTs;
    const card: TaskCard = {
        id: r.id as string,
        title: isStr(r.title) && r.title.trim() ? r.title : 'Untitled task',
        description: isStr(r.description) ? r.description : '',
        columnId: isStr(r.columnId) && columnIds.has(r.columnId) ? r.columnId : firstColumnId,
        order: isNum(r.order) ? r.order : 0,
        createdAt: created,
        enteredColumnAt: isIso(r.enteredColumnAt) ? r.enteredColumnAt : created,
    };
    if (r.urgency === 'high' || r.urgency === 'medium' || r.urgency === 'low') card.urgency = r.urgency;
    const assignee = repairAssignee(r.assignee);
    if (assignee !== undefined) card.assignee = assignee;
    if (r.parentId === null || isStr(r.parentId)) card.parentId = r.parentId;
    const attachments = repairAttachments(r.attachments);
    if (attachments) card.attachments = attachments;
    const tags = strArray(r.tags);
    if (tags) card.tags = tags;
    if (isDueDate(r.dueAt)) card.dueAt = r.dueAt;
    return card;
}

/** First entry per string `id` wins; entries without one are dropped. */
function uniqueById(list: unknown): Rec[] {
    const seen = new Set<string>();
    return (Array.isArray(list) ? list : []).filter((e): e is Rec => {
        if (!isRec(e) || !isStr(e.id) || seen.has(e.id)) return false;
        seen.add(e.id);
        return true;
    });
}

/** Coerce any stored/remote payload into a valid board. A card is never dropped for a bad field. */
export function repairBoard(raw: unknown): BoardState {
    const src: Rec = isRec(raw) ? raw : {};
    const usable = uniqueById(src.columns).map(repairColumn);
    const columns = usable.length > 0 ? usable : defaultColumns();
    const firstId = (firstColumn(columns) as BoardColumn).id;
    const columnIds = new Set(columns.map(c => c.id));
    const cards = uniqueById(src.cards).map(c => repairCard(c, firstId, columnIds));
    const audit = (Array.isArray(src.audit) ? src.audit : [])
        .filter((e): e is Rec => isRec(e) && isStr(e.id) && isStr(e.type) && isStr(e.summary))
        .map(repairAuditEntry);
    return { columns, cards, audit };
}

/** The UI reads actor/ts on every entry and `cardIds.includes` on timelines — keep those well-typed. */
function repairAuditEntry(e: Rec): AuditEntry {
    const a = e.actor;
    const actor: Actor = isRec(a) && a.kind === 'ai' && isStr(a.agent) ? { kind: 'ai', agent: a.agent }
        : isRec(a) && a.kind === 'user' ? { kind: 'user', ...(isStr(a.name) ? { name: a.name } : {}) }
        : { kind: 'user' };
    const cardIds = strArray(e.cardIds);
    return {
        id: e.id as string,
        ts: isStr(e.ts) ? e.ts : '',
        actor,
        type: e.type as AuditEntry['type'],
        summary: e.summary as string,
        inverse: isRec(e.inverse) && isStr(e.inverse.type) ? e.inverse as unknown as BoardAction : null,
        ...(e.reversed === true ? { reversed: true } : {}),
        ...(isStr(e.cardId) ? { cardId: e.cardId } : {}),
        ...(cardIds ? { cardIds } : {}),
        ...(isStr(e.to) ? { to: e.to } : {}),
    };
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

/** Last column by order (the 'done' lane). */
export function lastColumnId(columns: BoardColumn[]): string | undefined {
    return columns.reduce<BoardColumn | undefined>((a, c) => (!a || c.order > a.order ? c : a), undefined)?.id;
}

/** Overdue = has a due date before `today` ('YYYY-MM-DD') and is not in the last column. */
export function isOverdue(card: TaskCard, columns: BoardColumn[], today: string): boolean {
    return !!card.dueAt && card.dueAt < today && card.columnId !== lastColumnId(columns);
}

/** WIP counts top-level cards only; sub-tasks do not fill a column. */
export function wipCount(cards: TaskCard[], columnId: string): number {
    return cards.filter(c => c.columnId === columnId && !c.parentId).length;
}

function nextOrder(cards: TaskCard[], columnId: string): number {
    const inCol = cards.filter(c => c.columnId === columnId);
    return inCol.length === 0 ? 0 : Math.max(...inCol.map(c => c.order)) + 1;
}

function firstColumn(columns: BoardColumn[]): BoardColumn | undefined {
    return columns.reduce<BoardColumn | undefined>((a, c) => (!a || c.order < a.order ? c : a), undefined);
}

/** `columnId` if that column exists, else the first column's id (else `columnId` untouched). */
function landingColumnId(state: { columns: BoardColumn[] }, columnId: string): string {
    return state.columns.some(c => c.id === columnId) ? columnId : (firstColumn(state.columns)?.id ?? columnId);
}

function colTitle(state: { columns: BoardColumn[] }, columnId: string): string {
    return state.columns.find(c => c.id === columnId)?.title ?? columnId;
}

function cardTitle(state: { cards: TaskCard[] }, cardId: string): string {
    return state.cards.find(c => c.id === cardId)?.title ?? cardId;
}

// ── EDIT_CARD planning: whitelist keys, drop no-ops, record a JSON-safe inverse ──
const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b);

function planEdit(card: TaskCard, patch: CardPatch): { card: TaskCard; inverse: CardPatch } | null {
    const next: TaskCard = { ...card };
    const inverse: CardPatch = {};
    if (typeof patch.title === 'string' && patch.title.trim() && patch.title.trim() !== card.title) {
        next.title = patch.title.trim(); inverse.title = card.title;
    }
    if (typeof patch.description === 'string' && patch.description !== card.description) {
        next.description = patch.description; inverse.description = card.description;
    }
    const urgencyOk = patch.urgency === null || patch.urgency === 'high' || patch.urgency === 'medium' || patch.urgency === 'low';
    if (urgencyOk && (patch.urgency ?? undefined) !== card.urgency) {
        if (patch.urgency === null) delete next.urgency; else next.urgency = patch.urgency;
        inverse.urgency = card.urgency ?? null;
    }
    if (patch.assignee !== undefined && !same(patch.assignee, card.assignee ?? null)) {
        next.assignee = patch.assignee; inverse.assignee = card.assignee ?? null;
    }
    if (Array.isArray(patch.tags) && patch.tags.every(t => typeof t === 'string') && !same(patch.tags, card.tags ?? [])) {
        next.tags = patch.tags; inverse.tags = card.tags ?? [];
    }
    if ((patch.dueAt === null || isDueDate(patch.dueAt)) && (patch.dueAt ?? undefined) !== card.dueAt) {
        if (patch.dueAt === null) delete next.dueAt; else next.dueAt = patch.dueAt;
        inverse.dueAt = card.dueAt ?? null;
    }
    return Object.keys(inverse).length === 0 ? null : { card: next, inverse };
}

// ── Core reducer (data only — no audit). Returns next data + the inverse. ──
interface BoardData { columns: BoardColumn[]; cards: TaskCard[]; }

const posOf = (c: TaskCard): CardPosition => ({ cardId: c.id, columnId: c.columnId, order: c.order, enteredColumnAt: c.enteredColumnAt });

/** MOVE_CARD with toOrder: insert at that index among the destination's other cards, renumber the column 0..n-1. */
function insertCard(state: BoardData, card: TaskCard, columnId: string, toOrder: number, ctx: ActionContext): { next: BoardData; inverse: BoardAction | null } {
    const columnChanged = card.columnId !== columnId;
    const column = cardsInColumn(state.cards, columnId);
    const others = column.filter(c => c.id !== card.id);
    const at = Number.isFinite(toOrder) ? Math.min(others.length, Math.max(0, Math.trunc(toOrder))) : others.length;
    if (!columnChanged && at === column.indexOf(card)) return { next: state, inverse: null }; // same slot
    const sequence = [...others.slice(0, at), card, ...others.slice(at)];
    const slot = new Map(sequence.map((c, i) => [c.id, i]));
    const priors: CardPosition[] = [posOf(card)]; // the moved card first, then neighbours whose order changed
    const cards = state.cards.map(c => {
        const i = slot.get(c.id);
        if (i === undefined) return c;
        if (c.id === card.id) return { ...c, columnId, order: i, enteredColumnAt: columnChanged ? ctx.now() : c.enteredColumnAt };
        if (c.order === i) return c;
        priors.push(posOf(c));
        return { ...c, order: i };
    });
    return { next: { ...state, cards }, inverse: { type: 'RESTORE_POSITIONS', positions: priors } };
}

function reduceData(state: BoardData, action: BoardAction, ctx: ActionContext): { next: BoardData; inverse: BoardAction | null } {
    // No-op contract: a reducer that changes nothing returns `state` itself (same object).
    switch (action.type) {
        case 'ADD_CARD': {
            if (state.cards.some(c => c.id === action.card.id)) return { next: state, inverse: null }; // duplicate id
            const columnId = landingColumnId(state, action.card.columnId);
            const card = columnId === action.card.columnId ? action.card : { ...action.card, columnId, order: nextOrder(state.cards, columnId) };
            return {
                next: { ...state, cards: [...state.cards, card] },
                inverse: { type: 'REMOVE_CARD', cardId: card.id },
            };
        }
        case 'RESTORE_CARD': {
            const columnId = landingColumnId(state, action.card.columnId);
            const card = columnId === action.card.columnId ? action.card
                : { ...action.card, columnId, order: nextOrder(state.cards, columnId), enteredColumnAt: ctx.now() };
            return {
                next: { ...state, cards: [...state.cards.filter(c => c.id !== card.id), card] },
                inverse: { type: 'REMOVE_CARD', cardId: card.id },
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
            if (!card || !state.columns.some(c => c.id === action.toColumnId)) return { next: state, inverse: null };
            const columnChanged = card.columnId !== action.toColumnId;
            if (action.toOrder !== undefined) return insertCard(state, card, action.toColumnId, action.toOrder, ctx);
            if (!columnChanged) return { next: state, inverse: null }; // already there
            const prior: CardPosition = { cardId: card.id, columnId: card.columnId, order: card.order, enteredColumnAt: card.enteredColumnAt };
            const moved: TaskCard = { ...card, columnId: action.toColumnId, order: nextOrder(state.cards, action.toColumnId), enteredColumnAt: ctx.now() };
            return {
                next: { ...state, cards: state.cards.map(c => c.id === card.id ? moved : c) },
                inverse: { type: 'RESTORE_POSITIONS', positions: [prior] },
            };
        }
        case 'MOVE_CARDS': {
            if (!state.columns.some(c => c.id === action.toColumnId)) return { next: state, inverse: null };
            const priors: CardPosition[] = [];
            let base = nextOrder(state.cards, action.toColumnId);
            const movedCards = state.cards.map(c => c); // shallow copy
            for (const cardId of new Set(action.cardIds)) {
                const idx = movedCards.findIndex(c => c.id === cardId);
                if (idx < 0) continue;
                const card = movedCards[idx];
                if (card.columnId === action.toColumnId) continue; // already there
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
            const cards = state.cards.map(c => c); // working copy: fallback orders see earlier restores
            cards.forEach((c, i) => {
                const p = byId.get(c.id);
                if (!p) return;
                const columnId = landingColumnId(state, p.columnId);
                // Old column gone and the card already sits in the fallback column: leave it alone
                // (no fake "revert", and its time-in-column clock keeps running).
                if (columnId !== p.columnId && columnId === c.columnId) return;
                before.push({ cardId: c.id, columnId: c.columnId, order: c.order, enteredColumnAt: c.enteredColumnAt });
                cards[i] = columnId === p.columnId
                    ? { ...c, columnId, order: p.order, enteredColumnAt: p.enteredColumnAt }
                    : { ...c, columnId, order: nextOrder(cards, columnId), enteredColumnAt: ctx.now() };
            });
            if (before.length === 0) return { next: state, inverse: null };
            return { next: { ...state, cards }, inverse: { type: 'RESTORE_POSITIONS', positions: before } };
        }
        case 'EDIT_CARD': {
            const card = state.cards.find(c => c.id === action.cardId);
            if (!card) return { next: state, inverse: null };
            const edit = planEdit(card, action.patch);
            if (!edit) return { next: state, inverse: null };
            return {
                next: { ...state, cards: state.cards.map(c => c.id === card.id ? edit.card : c) },
                inverse: { type: 'EDIT_CARD', cardId: card.id, patch: edit.inverse },
            };
        }
        case 'ADD_COLUMN': {
            if (state.columns.some(c => c.id === action.column.id)) return { next: state, inverse: null }; // duplicate id
            return {
                next: { ...state, columns: [...state.columns, action.column] },
                inverse: { type: 'REMOVE_COLUMN', columnId: action.column.id },
            };
        }
        case 'REMOVE_COLUMN': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column || state.columns.length <= 1) return { next: state, inverse: null }; // never remove the last column
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
                    // Keep every card already on the board; add back only snapshot cards that are gone.
                    cards: [...state.cards, ...action.cards.filter(c => !state.cards.some(x => x.id === c.id))],
                },
                inverse: { type: 'REMOVE_COLUMN', columnId: action.column.id },
            };
        }
        case 'RENAME_COLUMN': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column || !action.title.trim() || action.title === column.title) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, title: action.title } : c) },
                inverse: { type: 'RENAME_COLUMN', columnId: column.id, title: column.title },
            };
        }
        case 'RESIZE_COLUMN': {
            const column = state.columns.find(c => c.id === action.columnId);
            if (!column || !Number.isFinite(action.width)) return { next: state, inverse: null };
            const width = Math.min(640, Math.max(200, Math.round(action.width)));
            if (width === column.width) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, width } : c) },
                inverse: { type: 'RESIZE_COLUMN', columnId: column.id, width: column.width },
            };
        }
        case 'UPDATE_COLUMN_LIMITS': {
            const column = state.columns.find(c => c.id === action.columnId);
            const limit = (v: number | undefined): number | undefined => (Number.isFinite(v) && (v as number) >= 0 ? Math.floor(v as number) : undefined);
            const minWip = limit(action.minWip), maxWip = limit(action.maxWip);
            if (!column || (minWip === column.minWip && maxWip === column.maxWip)) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, minWip, maxWip } : c) },
                inverse: { type: 'UPDATE_COLUMN_LIMITS', columnId: column.id, minWip: column.minWip, maxWip: column.maxWip },
            };
        }
        case 'UPDATE_COLUMN_POLICIES': {
            const column = state.columns.find(c => c.id === action.columnId);
            const policies = Array.isArray(action.policies) ? action.policies.filter(x => typeof x === 'string') : [];
            if (!column || same(policies, column.policies ?? [])) return { next: state, inverse: null };
            return {
                next: { ...state, columns: state.columns.map(c => c.id === column.id ? { ...c, policies } : c) },
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
            const board = repairBoard(action.board); // Load Board files are untrusted
            return {
                next: { columns: board.columns, cards: board.cards },
                inverse: { type: 'REPLACE_BOARD', board: { columns: state.columns, cards: state.cards, audit: [] } }
            };
        }
        default:
            return { next: state, inverse: null };
    }
}

// ── Summaries (human-readable audit text) ──────────────────────────
function summarize(state: BoardData, action: BoardAction, inverse: BoardAction | null): string {
    switch (action.type) {
        case 'ADD_CARD': return `Added "${action.card.title}" to ${colTitle(state, landingColumnId(state, action.card.columnId))}`;
        case 'RESTORE_CARD': return `Restored "${action.card.title}"`;
        case 'REMOVE_CARD': return `Removed "${cardTitle(state, action.cardId)}"`;
        case 'MOVE_CARD': return `Moved "${cardTitle(state, action.cardId)}" → ${colTitle(state, action.toColumnId)}`;
        case 'MOVE_CARDS': {
            const n = inverse?.type === 'RESTORE_POSITIONS' ? inverse.positions.length : 0; // cards actually moved
            return `Moved ${n} card${n === 1 ? '' : 's'} → ${colTitle(state, action.toColumnId)}`;
        }
        case 'RESTORE_POSITIONS': return `Restored position of ${action.positions.length} card${action.positions.length === 1 ? '' : 's'}`;
        case 'EDIT_CARD': return `Edited "${cardTitle(state, action.cardId)}" (${Object.keys(inverse?.type === 'EDIT_CARD' ? inverse.patch : action.patch).join(', ')})`;
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

// ── Bounded audit log (plan 079 B4) ────────────────────────────────
export const AUDIT_LIMIT = 500;          // newest entries kept
export const HEAVY_INVERSE_WINDOW = 50;  // older entries lose a heavy inverse (they stay in the log, no longer reversible)

// heavy = whole-board snapshot or anything carrying attachment bytes
const isHeavyInverse = (inv: BoardAction): boolean => inv.type === 'REPLACE_BOARD' || JSON.stringify(inv).includes('"dataUrl"');

/** Cap the log length, then drop heavy inverses older than the newest HEAVY_INVERSE_WINDOW. */
function boundAudit(audit: AuditEntry[]): AuditEntry[] {
    const kept = audit.length > AUDIT_LIMIT ? audit.slice(audit.length - AUDIT_LIMIT) : audit;
    const cut = kept.length - HEAVY_INVERSE_WINDOW;
    // ponytail: re-stringifies every older light inverse per action (<=450 small ones); cache a heavy flag on the entry if this shows up in a profile.
    return kept.map((e, i) => (i < cut && e.inverse && isHeavyInverse(e.inverse) ? { ...e, inverse: null } : e));
}

// ── Public: applyAction (the single mutation choke-point) ──────────
/** Cards a MOVE_CARD/MOVE_CARDS actually moved, read off its RESTORE_POSITIONS inverse. */
function movedIds(action: BoardAction, inverse: BoardAction | null): { cardIds: string[]; to: string } | null {
    if ((action.type !== 'MOVE_CARD' && action.type !== 'MOVE_CARDS') || inverse?.type !== 'RESTORE_POSITIONS') return null;
    // MOVE_CARD may also renumber neighbours (they are in the inverse); only the moved card is "moved".
    return { cardIds: action.type === 'MOVE_CARD' ? [action.cardId] : inverse.positions.map(p => p.cardId), to: action.toColumnId };
}

export function applyAction(state: BoardState, action: BoardAction, actor: Actor, ctx: ActionContext): BoardState {
    const data: BoardData = { columns: state.columns, cards: state.cards };
    const { next, inverse } = reduceData(data, action, ctx);
    // No-op: same state object back, nothing logged (LOG_EVENT is audit-only, so it always logs).
    if (next === data && action.type !== 'LOG_EVENT') return state;
    const moved = movedIds(action, inverse);
    const entry: AuditEntry = {
        id: ctx.id(),
        ts: ctx.now(),
        actor,
        type: action.type,
        summary: summarize(state, action, inverse),
        inverse,
        cardId: actionCardId(action),
        ...(moved ?? {}),
    };
    return { columns: next.columns, cards: next.cards, audit: boundAudit([...state.audit, entry]) };
}

/** Audit entries for one card, oldest→newest — the per-card project timeline. */
export function cardTimeline(state: BoardState, cardId: string): AuditEntry[] {
    return state.audit.filter(e => e.cardId === cardId || e.cardIds?.includes(cardId));
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

export interface UndoResult { state: BoardState; undone: AuditEntry | null; changed: boolean; }

/** RESTORE_POSITIONS undo: skip cards that were moved again since (current column != entry.to). */
function applicableInverse(state: BoardState, target: AuditEntry): { inverse: BoardAction; skipped: number } {
    const inv = target.inverse as BoardAction;
    if (inv.type !== 'RESTORE_POSITIONS' || !target.to) return { inverse: inv, skipped: 0 };
    const col = new Map(state.cards.map(c => [c.id, c.columnId]));
    const positions = inv.positions.filter(p => col.get(p.cardId) === target.to);
    const skipped = inv.positions.filter(p => col.has(p.cardId) && col.get(p.cardId) !== target.to).length;
    return { inverse: { type: 'RESTORE_POSITIONS', positions }, skipped };
}

/**
 * Reverting an older add/edit would destroy work done since: a card that later live
 * (reversible, not undone) entries touched is not deleted, a field edited again is not
 * overwritten, and a column that holds cards is not removed. Plain LIFO undo never
 * hits this (those later entries are undone first); "Undo last AI" does.
 */
function changedSince(state: BoardState, target: AuditEntry): boolean {
    const inv = target.inverse as BoardAction;
    const later = state.audit.slice(state.audit.indexOf(target) + 1).filter(e => !e.reversed && e.inverse);
    const touches = (e: AuditEntry, cardId: string): boolean => e.cardId === cardId || !!e.cardIds?.includes(cardId);
    if (inv.type === 'REMOVE_CARD') return later.some(e => touches(e, inv.cardId));
    if (inv.type === 'EDIT_CARD') return later.some(e => e.type === 'EDIT_CARD' && touches(e, inv.cardId));
    if (inv.type === 'REMOVE_COLUMN') return state.cards.some(c => c.columnId === inv.columnId);
    return false;
}

/**
 * Undo the most recent reversible action (optionally only those matching a
 * filter — e.g. AI-authored). Applies the inverse, marks the original entry
 * reversed, and appends a truthful UNDO entry to the log. Returns the same
 * state when there is nothing to undo. `changed` = the board data changed.
 */
export function undo(state: BoardState, ctx: ActionContext, actor: Actor, filter?: (e: AuditEntry) => boolean): UndoResult {
    const target = lastReversible(state, filter);
    if (!target || !target.inverse) return { state, undone: null, changed: false };
    const data: BoardData = { columns: state.columns, cards: state.cards };
    const blocked = changedSince(state, target);
    let next: BoardData = data, skipped = 0;
    if (!blocked) {
        try {
            const applicable = applicableInverse(state, target);
            skipped = applicable.skipped;
            next = reduceData(data, applicable.inverse, ctx).next;
        } catch {
            next = data; // malformed stored inverse: report it, mark it reversed, never wedge the Undo button
        }
    }
    const changed = next !== data;
    const summary = blocked ? `Nothing to revert: ${target.summary} (changed since)`
        : !changed ? `Nothing to revert: ${target.summary}`
        : skipped > 0 ? `Reverted: ${target.summary} (skipped ${skipped} card(s) moved since)`
        : `Reverted: ${target.summary}`;
    const undoEntry: AuditEntry = {
        id: ctx.id(),
        ts: ctx.now(),
        actor,
        type: 'UNDO',
        summary,
        inverse: null,
        ...(target.cardId ? { cardId: target.cardId } : {}),
        ...(target.cardIds ? { cardIds: target.cardIds } : {}),
    };
    // A reversed entry can never be undone again, so drop its inverse: a removal's inverse carries the
    // removed card/attachment bytes, and keeping it would grow the board on every Remove → Undo cycle.
    const audit = state.audit.map(e => e.id === target.id ? { ...e, reversed: true, inverse: null } : e);
    return { state: { columns: next.columns, cards: next.cards, audit: boundAudit([...audit, undoEntry]) }, undone: target, changed };
}

/** Convenience: undo the last AI-authored action specifically. */
export function undoLastAi(state: BoardState, ctx: ActionContext, actor: Actor): UndoResult {
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
