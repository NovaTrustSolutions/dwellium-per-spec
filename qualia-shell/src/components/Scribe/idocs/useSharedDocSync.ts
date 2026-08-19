/**
 * useSharedDocSync — "live-lite" sync for a shared doc (contract §2 polling
 * rules). NOT a CRDT: last-writer-wins with a version check.
 *
 *  - Poll `GET /shared/:docId` every `pollMs` (5 s; 15 s when the tab is hidden).
 *    server.version > local && no unsaved edits → apply silently (store write).
 *    server.version > local && local edits pending → `conflict` banner.
 *  - Local edits (owner / edit role) → debounced `PUT` with the last-seen
 *    version; 409 → the same banner with the server's `current`.
 *  - Presence: `POST presence { cardId }` on card focus change + every 20 s.
 *
 * "Unsaved local edits" = fingerprint(doc) ≠ fingerprint at the last sync
 * (fingerprint ignores updatedAt / analytics / shared / publication).
 * ponytail: full-doc JSON compare per render — docs are small; diff when they aren't.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getSharedDoc, IdocsApiError, postPresence, putSharedDoc, type IdocsApiDeps, type PresenceEntry, type SharedCurrent } from './idocsApi';
import { replaceDoc, updateDoc } from './idocsStore';
import type { IDoc } from './idocTypes';

export interface SharedSyncOpts {
    /** Card the user is on (presence). */
    activeCardId?: string;
    pollMs?: number;
    hiddenPollMs?: number;
    presenceMs?: number;
    saveDebounceMs?: number;
    api?: IdocsApiDeps;
}

export interface SharedConflict { current: SharedCurrent; from: string }

export interface SharedSync {
    conflict: SharedConflict | null;
    /** Banner: take the server version (discards local edits). */
    loadTheirs: () => void;
    /** Banner: force-save mine (overwrites theirs). */
    keepMine: () => void;
    others: PresenceEntry[];
    /** Poll now (e.g. after a comment-role `postComment`). */
    refresh: () => Promise<void>;
    /** Last save / poll error (network etc.); null when healthy. */
    error: string | null;
    saving: boolean;
}

/** What goes over the wire: the doc minus client-local metadata. */
export function toRemoteDoc(d: IDoc): IDoc {
    const { shared: _s, publication: _p, ...rest } = d;
    return rest;
}
export function fingerprint(d: IDoc): string {
    const { updatedAt: _u, analytics: _a, shared: _s, publication: _p, ...rest } = d;
    return JSON.stringify(rest);
}
const canWrite = (d: IDoc): boolean => d.shared?.role === 'owner' || d.shared?.role === 'edit';

function applyRemote(docId: string, cur: SharedCurrent, prev: IDoc['shared'], extra: { role?: NonNullable<IDoc['shared']>['role']; ownerId?: string; ownerName?: string } = {}): IDoc {
    const next: IDoc = {
        ...cur.doc,
        id: docId,
        analytics: cur.doc.analytics ?? { views: 0, cardSeconds: {} },
        shared: { version: cur.version, updatedAt: cur.updatedAt, role: extra.role ?? prev?.role ?? 'view', ownerId: extra.ownerId ?? prev?.ownerId, ownerName: extra.ownerName ?? prev?.ownerName },
    };
    replaceDoc(next);
    return next;
}

export function useSharedDocSync(doc: IDoc | null, opts: SharedSyncOpts = {}): SharedSync {
    const { pollMs = 5000, hiddenPollMs = 15000, presenceMs = 20000, saveDebounceMs = 1500, api = {}, activeCardId } = opts;
    const enabled = !!doc?.shared;
    const docId = doc?.id ?? '';
    const [conflict, setConflict] = useState<SharedConflict | null>(null);
    const [others, setOthers] = useState<PresenceEntry[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const docRef = useRef(doc); docRef.current = doc;
    const apiRef = useRef(api); apiRef.current = api;
    const conflictRef = useRef(conflict); conflictRef.current = conflict;
    // Fingerprint of the doc as last seen by / sent to the server.
    const syncedRef = useRef<string | null>(null);
    const savingRef = useRef(false);

    // (Re)baseline whenever we start syncing a doc.
    useEffect(() => { syncedRef.current = enabled && docRef.current ? fingerprint(docRef.current) : null; setConflict(null); }, [enabled, docId]);

    const isDirty = useCallback(() => { const d = docRef.current; return !!d && syncedRef.current !== null && fingerprint(d) !== syncedRef.current; }, []);

    const poll = useCallback(async () => {
        const d = docRef.current;
        if (!d?.shared || savingRef.current) return; // in-flight save owns the version bump
        try {
            const cur = await getSharedDoc(d.id, apiRef.current);
            setError(null);
            const local = docRef.current; if (!local?.shared || savingRef.current) return;
            if (cur.version <= local.shared.version) {
                // Same version: keep role/owner metadata fresh (cheap, no doc write unless changed).
                if (cur.role !== local.shared.role || cur.owner?.id !== local.shared.ownerId) updateDoc(local.id, { shared: { ...local.shared, role: cur.role, ownerId: cur.owner?.id, ownerName: cur.owner?.name } });
                return;
            }
            if (isDirty()) { setConflict({ current: cur, from: cur.updatedBy?.name || 'someone' }); return; }
            const next = applyRemote(local.id, cur, local.shared, { role: cur.role, ownerId: cur.owner?.id, ownerName: cur.owner?.name });
            syncedRef.current = fingerprint(next);
        } catch (e) { setError((e as Error).message); }
    }, [isDirty]);

    // ── polling loop (setTimeout chain so the hidden interval applies at the next tick) ──
    useEffect(() => {
        if (!enabled) return;
        let on = true; let t: ReturnType<typeof setTimeout> | undefined;
        const tick = async () => { if (!on) return; await poll(); if (!on) return; t = setTimeout(tick, typeof document !== 'undefined' && document.hidden ? hiddenPollMs : pollMs); };
        t = setTimeout(tick, pollMs);
        return () => { on = false; if (t) clearTimeout(t); };
    }, [enabled, docId, pollMs, hiddenPollMs, poll]);

    // ── debounced save of local edits (owner / edit) ──
    const save = useCallback(async (force = false) => {
        const d = docRef.current;
        if (!d?.shared || !canWrite(d) || savingRef.current) return;
        if (!force && !isDirty()) return;
        savingRef.current = true; setSaving(true);
        const sent = fingerprint(d);
        try {
            const r = await putSharedDoc(d.id, force ? { doc: toRemoteDoc(d) } : { doc: toRemoteDoc(d), version: d.shared.version }, apiRef.current);
            syncedRef.current = sent;
            const latest = docRef.current;
            if (latest?.shared) updateDoc(latest.id, { shared: { ...latest.shared, version: r.version, updatedAt: r.updatedAt } });
            setError(null); if (force) setConflict(null);
        } catch (e) {
            if (e instanceof IdocsApiError && e.status === 409 && e.current) setConflict({ current: e.current, from: e.current.updatedBy?.name || 'someone' });
            else setError((e as Error).message);
        } finally { savingRef.current = false; setSaving(false); }
    }, [isDirty]);

    useEffect(() => {
        if (!enabled || !doc || !canWrite(doc) || conflict || !isDirty()) return;
        const t = setTimeout(() => { void save(); }, saveDebounceMs);
        return () => clearTimeout(t);
    }, [enabled, doc, conflict, saveDebounceMs, save, isDirty]);

    // ── presence ──
    useEffect(() => {
        if (!enabled) return;
        let on = true;
        const ping = () => { void postPresence(docId, { cardId: activeCardId }, apiRef.current).then((o) => { if (on) setOthers(o); }).catch(() => { /* presence is best-effort */ }); };
        ping();
        const t = setInterval(ping, presenceMs);
        return () => { on = false; clearInterval(t); };
    }, [enabled, docId, activeCardId, presenceMs]);

    const loadTheirs = useCallback(() => {
        const c = conflictRef.current; const d = docRef.current;
        if (!c || !d?.shared) return;
        const next = applyRemote(d.id, c.current, d.shared);
        syncedRef.current = fingerprint(next);
        setConflict(null);
    }, []);
    const keepMine = useCallback(() => { void save(true); }, [save]);

    return { conflict, loadTheirs, keepMine, others, refresh: poll, error, saving };
}
