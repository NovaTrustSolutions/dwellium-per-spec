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
import { createEmptyDoc, newId, type IDoc } from './idocTypes';

export type IdocsView = 'library' | 'edit' | 'present';

export interface IdocsState {
    docs: IDoc[];
    activeId: string | null;
    view: IdocsView;
}

const DEFAULT: IdocsState = { docs: [], activeId: null, view: 'library' };

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
        return { docs, activeId, view };
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
    write({ docs, activeId, view: activeId ? s.view : 'library' });
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
