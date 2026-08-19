/**
 * idocsStore — per-user persistence for Scribe Interactive Docs. Sister-shape
 * to `../dumpStore.ts`: `createLocalStorageStore` dynamic-key factory wrapped
 * in `withSync` (One Save objectType `scribe-idocs`).
 *
 * Storage key: scribe-idocs:<userId>  (anon → scribe-idocs:_anonymous)
 * State: { docs, activeId, view } — view state is persisted too so a reload
 * lands you back in the doc you were editing (cheap and users expect it).
 */
import { useSyncExternalStore } from 'react';
import { createLocalStorageStore } from '../../../utils/createLocalStorageStore';
import { withSync } from '../../../lib/oneSaveStore';
import { createEmptyDoc, newId, type Card, type IDoc } from './idocTypes';
import type { BlockComment, CustomTheme } from './idocTypes';
import {
    capHistoryBytes, normalizeHistory, pushSnapshot as pushHistory, undo as undoHistory, redo as redoHistory,
    restoreSnapshot as restoreHistory, type HistoryMap, type Snapshot,
} from './idocsHistory';

export type IdocsView = 'library' | 'edit' | 'present';

export interface IdocsState {
    docs: IDoc[];
    activeId: string | null;
    view: IdocsView;
    /** Wave 1: per-doc undo ring buffers (see idocsHistory.ts). Absent in pre-wave-1 payloads. */
    history: HistoryMap;
    /** Wave 2: per-user saved custom themes (reusable across docs). */
    customThemes: CustomTheme[];
}

const DEFAULT: IdocsState = { docs: [], activeId: null, view: 'library', history: {}, customThemes: [] };

/** Holder updated by the InteractiveDocs render path BEFORE useSyncExternalStore reads. */
export const idocsUserIdHolder: { current: string | null } = { current: null };

export function resolveIdocsKey(): string {
    const uid = idocsUserIdHolder.current;
    return uid ? `scribe-idocs:${uid}` : 'scribe-idocs:_anonymous';
}

function isDoc(d: unknown): d is IDoc {
    const x = d as IDoc;
    return !!x && typeof x.id === 'string' && typeof x.title === 'string' && Array.isArray(x.cards);
}

function deserialize(raw: string | null): IdocsState {
    if (!raw) return DEFAULT;
    try {
        const p = JSON.parse(raw) as Partial<IdocsState>;
        const docs = Array.isArray(p.docs) ? p.docs.filter(isDoc) : [];
        const activeId = typeof p.activeId === 'string' && docs.some((d) => d.id === p.activeId) ? p.activeId : null;
        const view: IdocsView = p.view === 'edit' || p.view === 'present' ? (activeId ? p.view : 'library') : 'library';
        const customThemes = Array.isArray(p.customThemes) ? p.customThemes.filter((t): t is CustomTheme => !!t && typeof t === 'object' && typeof (t as CustomTheme).name === 'string' && !!(t as CustomTheme).vars) : [];
        return { docs, activeId, view, history: normalizeHistory(p.history, isDoc), customThemes };
    } catch {
        return DEFAULT;
    }
}

export const idocsStore = withSync(
    createLocalStorageStore<IdocsState>({ key: resolveIdocsKey, deserializer: deserialize, defaultValue: DEFAULT }),
    { objectType: 'scribe-idocs', holder: idocsUserIdHolder, resolveKey: resolveIdocsKey, debounceMs: 1200 },
);

function write(next: IdocsState): void {
    idocsStore.set(next, () => {
        try { localStorage.setItem(resolveIdocsKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
const snap = (): IdocsState => idocsStore.getSnapshot();
const stamp = (d: IDoc): IDoc => ({ ...d, updatedAt: new Date().toISOString() });

export function createDoc(partial: Partial<IDoc> = {}): IDoc {
    const doc = createEmptyDoc(partial);
    const s = snap();
    write({ ...s, docs: [doc, ...s.docs], activeId: doc.id, view: 'edit' });
    return doc;
}

export function updateDoc(id: string, patch: Partial<IDoc>): void {
    const s = snap();
    write({ ...s, docs: s.docs.map((d) => (d.id === id ? stamp({ ...d, ...patch }) : d)) });
}

/** Replace a whole doc (editor autosave path). Adds it if missing. */
export function replaceDoc(doc: IDoc): void {
    const s = snap();
    const next = stamp(doc);
    const exists = s.docs.some((d) => d.id === doc.id);
    write({ ...s, docs: exists ? s.docs.map((d) => (d.id === doc.id ? next : d)) : [next, ...s.docs] });
}

export function deleteDoc(id: string): void {
    const s = snap();
    const docs = s.docs.filter((d) => d.id !== id);
    const activeId = s.activeId === id ? null : s.activeId;
    const history = { ...s.history }; delete history[id];
    write({ ...s, docs, activeId, view: activeId ? s.view : 'library', history });
}

export function duplicateDoc(id: string): IDoc | null {
    const s = snap();
    const src = s.docs.find((d) => d.id === id);
    if (!src) return null;
    const now = new Date().toISOString();
    const copy: IDoc = {
        ...structuredClone(src),
        id: newId('doc'),
        title: `${src.title} (copy)`,
        createdAt: now,
        updatedAt: now,
        analytics: { views: 0, cardSeconds: {} },
    };
    write({ ...s, docs: [copy, ...s.docs] });
    return copy;
}

export function setActive(id: string | null): void {
    const s = snap();
    write({ ...s, activeId: id, view: id ? s.view : 'library' });
}

export function setView(view: IdocsView): void {
    const s = snap();
    write({ ...s, view: view !== 'library' && !s.activeId ? 'library' : view });
}

export function recordView(id: string): void {
    const s = snap();
    write({
        ...s,
        docs: s.docs.map((d) => d.id === id
            ? { ...d, analytics: { ...d.analytics, views: (d.analytics?.views ?? 0) + 1, lastViewedAt: new Date().toISOString() } }
            : d),
    });
}

export function addCardSeconds(id: string, cardId: string, seconds: number): void {
    if (!(seconds > 0)) return;
    const s = snap();
    write({
        ...s,
        docs: s.docs.map((d) => {
            if (d.id !== id) return d;
            const cardSeconds = { ...(d.analytics?.cardSeconds ?? {}) };
            cardSeconds[cardId] = Math.round(((cardSeconds[cardId] ?? 0) + seconds) * 10) / 10;
            return { ...d, analytics: { ...d.analytics, views: d.analytics?.views ?? 0, cardSeconds } };
        }),
    });
}

/** JSON export of one doc (pretty-printed). */
export function exportDoc(id: string): string {
    const d = snap().docs.find((x) => x.id === id);
    return d ? JSON.stringify(d, null, 2) : '';
}

/** Import our JSON format. New id on collision so imports never clobber. Returns the doc or null. */
export function importDoc(json: string): IDoc | null {
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { return null; }
    if (!isDoc(parsed)) return null;
    const s = snap();
    const now = new Date().toISOString();
    const doc: IDoc = {
        ...parsed,
        id: s.docs.some((d) => d.id === parsed.id) ? newId('doc') : parsed.id,
        theme: parsed.theme ?? 'inherit',
        createdAt: parsed.createdAt ?? now,
        updatedAt: now,
        analytics: parsed.analytics ?? { views: 0, cardSeconds: {} },
    };
    write({ ...s, docs: [doc, ...s.docs], activeId: doc.id, view: 'edit' });
    return doc;
}

export function useIdocs(): IdocsState {
    return useSyncExternalStore(idocsStore.subscribe, idocsStore.getSnapshot, idocsStore.getServerSnapshot);
}

// ── Wave 1: card tree helpers (pure; nested via card.children) ──

export function isCard(x: unknown): x is Card {
    const c = x as Card;
    return !!c && typeof c.id === 'string' && Array.isArray(c.blocks);
}

export function findCard(cards: Card[], id: string): Card | undefined {
    for (const c of cards) {
        if (c.id === id) return c;
        const hit = c.children?.length ? findCard(c.children, id) : undefined;
        if (hit) return hit;
    }
    return undefined;
}

/** Locate a card's containing list. `parent` is null at the top level. */
export function findCardParent(cards: Card[], id: string, parent: Card | null = null): { list: Card[]; parent: Card | null; index: number } | null {
    const index = cards.findIndex((c) => c.id === id);
    if (index >= 0) return { list: cards, parent, index };
    for (const c of cards) {
        const hit = c.children?.length ? findCardParent(c.children, id, c) : null;
        if (hit) return hit;
    }
    return null;
}

/** Deep map: replace the card with `id` by `fn(card)`. */
export function mapCard(cards: Card[], id: string, fn: (c: Card) => Card): Card[] {
    return cards.map((c) => (c.id === id ? fn(c) : c.children?.length ? { ...c, children: mapCard(c.children, id, fn) } : c));
}

/** Deep remove; `removed` keeps document order. Empty `children` arrays are dropped. */
export function removeCards(cards: Card[], ids: ReadonlySet<string>): { cards: Card[]; removed: Card[] } {
    const removed: Card[] = [];
    const walk = (list: Card[]): Card[] => list.flatMap((c) => {
        if (ids.has(c.id)) { removed.push(c); return []; }
        if (!c.children?.length) return [c];
        const children = walk(c.children);
        return [children.length ? { ...c, children } : { ...c, children: undefined }];
    });
    return { cards: walk(cards), removed };
}

/** Insert `toInsert` at `index` in the top level (`parentId` null) or in `parentId`'s children. */
export function insertCardsAt(cards: Card[], parentId: string | null, index: number, toInsert: Card[]): Card[] {
    const splice = (list: Card[]) => { const n = list.slice(); n.splice(Math.max(0, Math.min(index, n.length)), 0, ...toInsert); return n; };
    if (parentId === null) return splice(cards);
    return mapCard(cards, parentId, (p) => ({ ...p, children: splice(p.children ?? []) }));
}

/** Deep clone with fresh ids for the card, its blocks, footnotes and children. */
export function cloneCard(src: Card): Card {
    const c = structuredClone(src);
    return {
        ...c,
        id: newId('c'),
        blocks: c.blocks.map((b) => ({ ...b, id: newId() })),
        footnotes: c.footnotes?.map((f) => ({ ...f, id: newId('fn') })),
        children: c.children?.map(cloneCard),
    };
}

/** Pre-order flatten for the outline rail. */
export function flattenCards(cards: Card[], depth = 0, parentId: string | null = null): { card: Card; depth: number; parentId: string | null; index: number }[] {
    return cards.flatMap((card, index) => [{ card, depth, parentId, index }, ...(card.children?.length ? flattenCards(card.children, depth + 1, card.id) : [])]);
}

function isDescendant(root: Card, id: string): boolean { return !!root.children && !!findCard(root.children, id); }

function writeDocCards(docId: string, fn: (cards: Card[], doc: IDoc) => Card[] | null): void {
    const s = snap();
    const doc = s.docs.find((d) => d.id === docId);
    if (!doc) return;
    const cards = fn(doc.cards, doc);
    if (!cards) return;
    write({ ...s, docs: s.docs.map((d) => (d.id === docId ? stamp({ ...d, cards }) : d)) });
}

/** Deep patch of one card (nested cards included). */
export function updateCard(docId: string, cardId: string, patch: Partial<Card>): void {
    writeDocCards(docId, (cards) => (findCard(cards, cardId) ? mapCard(cards, cardId, (c) => ({ ...c, ...patch })) : null));
}

/** Reorder within one list: top level when `parentId` is omitted, else inside that card's children. */
export function moveCard(docId: string, from: number, to: number, parentId?: string): void {
    writeDocCards(docId, (cards) => {
        const list = parentId ? findCard(cards, parentId)?.children ?? [] : cards;
        if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return null;
        const n = list.slice(); const [c] = n.splice(from, 1); n.splice(to, 0, c);
        return parentId ? mapCard(cards, parentId, (p) => ({ ...p, children: n })) : n;
    });
}

/** Move a set of cards (any depth) to `index` inside `parentId` (null = top level). Used by DnD + group moves. */
export function relocateCards(docId: string, ids: string[], parentId: string | null, index: number): void {
    writeDocCards(docId, (cards) => {
        const set = new Set(ids);
        if (parentId && (set.has(parentId) || ids.some((id) => { const c = findCard(cards, id); return !!c && isDescendant(c, parentId); }))) return null;
        const { cards: rest, removed } = removeCards(cards, set);
        if (!removed.length) return null;
        return insertCardsAt(rest, parentId, index, removed);
    });
}

/** Nest `cardId` as the last child of `intoCardId` (refuses self / own descendants). */
export function nestCard(docId: string, cardId: string, intoCardId: string): void {
    writeDocCards(docId, (cards) => {
        const target = findCard(cards, intoCardId);
        const card = findCard(cards, cardId);
        if (!target || !card || cardId === intoCardId || isDescendant(card, intoCardId)) return null;
        const { cards: rest } = removeCards(cards, new Set([cardId]));
        const t = findCard(rest, intoCardId)!;
        return insertCardsAt(rest, intoCardId, t.children?.length ?? 0, [card]);
    });
}

/** Lift a nested card out to sit right after its parent. No-op at the top level. */
export function unnestCard(docId: string, cardId: string): void {
    writeDocCards(docId, (cards) => {
        const loc = findCardParent(cards, cardId);
        if (!loc?.parent) return null;
        const card = loc.list[loc.index];
        const { cards: rest } = removeCards(cards, new Set([cardId]));
        const pl = findCardParent(rest, loc.parent.id)!;
        return insertCardsAt(rest, pl.parent?.id ?? null, pl.index + 1, [card]);
    });
}

/** Insert already-built cards (caller clones) at a top-level index. */
export function insertCards(docId: string, cards: Card[], atIndex: number): void {
    if (!cards.length) return;
    writeDocCards(docId, (existing) => insertCardsAt(existing, null, atIndex, cards));
}

// ── Wave 1: history / undo / redo ──

/** Snapshot the doc's current state (deduped, capped). `now` injectable for tests. */
export function pushSnapshot(docId: string, now: number = Date.now()): void {
    const s = snap();
    const doc = s.docs.find((d) => d.id === docId);
    if (!doc) return;
    const h = pushHistory(s.history[docId], doc, now);
    if (h === s.history[docId]) return; // identical → nothing to persist
    write({ ...s, history: capHistoryBytes({ ...s.history, [docId]: h }) });
}

function applyRestore(docId: string, res: { history: HistoryMap[string]; doc: IDoc } | null): boolean {
    if (!res) return false;
    const s = snap();
    write({ ...s, docs: s.docs.map((d) => (d.id === docId ? stamp(res.doc) : d)), history: { ...s.history, [docId]: res.history } });
    return true;
}

export function undo(docId: string, now: number = Date.now()): boolean {
    const s = snap();
    const doc = s.docs.find((d) => d.id === docId);
    return !!doc && applyRestore(docId, undoHistory(s.history[docId], doc, now));
}

export function redo(docId: string): boolean {
    return applyRestore(docId, redoHistory(snap().history[docId]));
}

export function restoreSnapshot(docId: string, index: number): boolean {
    return applyRestore(docId, restoreHistory(snap().history[docId], index));
}

export function listSnapshots(docId: string): { snapshots: Snapshot[]; cursor: number } {
    return snap().history[docId] ?? { snapshots: [], cursor: -1 };
}

// ── Wave 2: comments (per card; `blockId` scopes a thread to one block) ──

function writeComments(docId: string, cardId: string, fn: (comments: BlockComment[]) => BlockComment[]): void {
    writeDocCards(docId, (cards) => (findCard(cards, cardId) ? mapCard(cards, cardId, (c) => ({ ...c, comments: fn(c.comments ?? []) })) : null));
}

/** Add a thread. `comment` may omit id/at (filled in). Returns the stored comment. */
export function addComment(docId: string, cardId: string, comment: Omit<BlockComment, 'id' | 'at'> & Partial<Pick<BlockComment, 'id' | 'at'>>): BlockComment {
    const full: BlockComment = { ...comment, id: comment.id ?? newId('cm'), at: comment.at ?? new Date().toISOString() };
    writeComments(docId, cardId, (list) => [...list, full]);
    return full;
}

export function updateComment(docId: string, cardId: string, commentId: string, patch: Partial<Omit<BlockComment, 'id'>>): void {
    writeComments(docId, cardId, (list) => list.map((c) => (c.id === commentId ? { ...c, ...patch } : c)));
}

export function deleteComment(docId: string, cardId: string, commentId: string): void {
    writeComments(docId, cardId, (list) => list.filter((c) => c.id !== commentId));
}

export function replyToComment(docId: string, cardId: string, commentId: string, reply: { author: string; text: string; id?: string; at?: string }): void {
    const full = { id: reply.id ?? newId('re'), author: reply.author, text: reply.text, at: reply.at ?? new Date().toISOString() };
    writeComments(docId, cardId, (list) => list.map((c) => (c.id === commentId ? { ...c, replies: [...(c.replies ?? []), full] } : c)));
}

/** Unresolved thread count for a card (all blocks) or one block. Nested children are NOT included. */
export function unresolvedCount(card: Pick<Card, 'comments'>, blockId?: string): number {
    return (card.comments ?? []).filter((c) => !c.resolved && (blockId === undefined || c.blockId === blockId)).length;
}

// ── Wave 2: custom themes ──
export function saveCustomTheme(theme: CustomTheme): void {
    const st = snap();
    const rest = st.customThemes.filter((t) => t.name !== theme.name);
    write({ ...st, customThemes: [...rest, theme] });
}
export function deleteCustomTheme(name: string): void {
    const st = snap();
    write({ ...st, customThemes: st.customThemes.filter((t) => t.name !== name) });
}
