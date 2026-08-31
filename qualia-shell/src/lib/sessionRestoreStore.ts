/**
 * sessionRestoreStore — plan 055 phase 1 "the desktop remembers".
 *
 * Persists the LIVE session per user via One Save (localStorage cache +
 * debounced backend write-through) so closing the app loses nothing:
 *   - classic:  the Classic desktop's open windows (component, geometry,
 *               z-order, minimized, group) as a minimal serializable
 *               projection of WindowState
 *   - halocron: Holocron OS open widget-tab ids + active id
 *   - fluid:    Fluid OS (Cockpit) open widget-tab ids + active id
 *
 * Capture is debounced (~800 ms) and flushed IMMEDIATELY on `beforeunload`
 * and `visibilitychange → hidden` — the close-the-browser case. The flush
 * writes localStorage synchronously; the One Save backend write-through
 * rides the store's own debounce and catches up during normal use.
 *
 * Multi-tab: two Dwellium tabs both capture into the same key —
 * last-writer-wins is acceptable for a per-user UI session (no merge; the
 * tab you close last is the one you get back). Concurrent storage events
 * never crash: reads go through the hardened deserializer.
 *
 * Account switch: a capture scheduled for user A whose flush fires after
 * the identity holders flipped to user B is DROPPED (owner check), never
 * written into B's namespace.
 *
 * Deliberately NOT part of the projection (phase 2, not phase 1):
 * per-widget internal state, scroll positions, popout (`/?popup=`) windows
 * (separate OS windows; docking back re-enters capture naturally).
 */
import type { WindowState } from '../data/types';
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { sessionRestoreUserIdHolder } from './perUserIdentity';
import { WIDGET_REGISTRY } from '../registry/widgetRegistry';

/** Minimal serializable projection of a Classic desktop window. */
export interface WindowProjection {
    component: string;
    title: string;
    icon: string;
    x: number;
    y: number;
    width: number;
    height: number;
    zIndex: number;
    minimized: boolean;
    groupId?: string | null;
}

/** Open-tab slice for one OS shell (Holocron / Fluid). */
export interface OsTabsSlice {
    tabs: string[];
    active: string | null;
}

export interface SessionSnapshot {
    version: 1;
    classic: WindowProjection[];
    halocron: OsTabsSlice;
    fluid: OsTabsSlice;
    savedAt: number;
}

const EMPTY_TABS: OsTabsSlice = { tabs: [], active: null };

function emptySnapshot(): SessionSnapshot {
    return {
        version: 1,
        classic: [],
        halocron: { ...EMPTY_TABS },
        fluid: { ...EMPTY_TABS },
        savedAt: 0,
    };
}

function resolveSessionRestoreKey(): string {
    return sessionRestoreUserIdHolder.current
        ? `dwellium_session_restore_${sessionRestoreUserIdHolder.current}`
        : 'dwellium_session_restore_guest';
}

/* ── hardened deserializer: bad JSON / bad shape → null (default-stack path) ── */

function isFiniteNum(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function normalizeProjection(raw: unknown): WindowProjection | null {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as Partial<WindowProjection>;
    if (typeof p.component !== 'string' || !p.component) return null;
    if (!isFiniteNum(p.x) || !isFiniteNum(p.y) || !isFiniteNum(p.width) || !isFiniteNum(p.height)) return null;
    return {
        component: p.component,
        title: typeof p.title === 'string' ? p.title : p.component,
        icon: typeof p.icon === 'string' ? p.icon : '',
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        zIndex: isFiniteNum(p.zIndex) ? p.zIndex : 1,
        minimized: Boolean(p.minimized),
        groupId: typeof p.groupId === 'string' ? p.groupId : null,
    };
}

function normalizeTabs(raw: unknown): OsTabsSlice {
    if (!raw || typeof raw !== 'object') return { ...EMPTY_TABS };
    const t = raw as Partial<OsTabsSlice>;
    const tabs = Array.isArray(t.tabs) ? t.tabs.filter((x): x is string => typeof x === 'string') : [];
    return { tabs, active: typeof t.active === 'string' ? t.active : null };
}

export function normalizeSnapshot(raw: unknown): SessionSnapshot | null {
    if (!raw || typeof raw !== 'object') return null;
    const s = raw as Partial<SessionSnapshot>;
    if (s.version !== 1 || !Array.isArray(s.classic)) return null;
    return {
        version: 1,
        classic: s.classic.map(normalizeProjection).filter((p): p is WindowProjection => p !== null),
        halocron: normalizeTabs(s.halocron),
        fluid: normalizeTabs(s.fluid),
        savedAt: isFiniteNum(s.savedAt) ? s.savedAt : 0,
    };
}

function deserialize(raw: string | null): SessionSnapshot | null {
    if (!raw) return null;
    try {
        return normalizeSnapshot(JSON.parse(raw));
    } catch {
        return null;
    }
}

export const sessionRestoreStore = withSync(
    createLocalStorageStore<SessionSnapshot | null>({
        key: resolveSessionRestoreKey,
        deserializer: deserialize,
        defaultValue: null,
    }),
    {
        objectType: 'session-restore',
        holder: sessionRestoreUserIdHolder,
        resolveKey: resolveSessionRestoreKey,
    },
);

/* ── capture (debounced, slice-merging) ─────────────────────────────────── */

const CAPTURE_DEBOUNCE_MS = 800;

type SessionSlices = Partial<Pick<SessionSnapshot, 'classic' | 'halocron' | 'fluid'>>;

let pendingSlices: SessionSlices | null = null;
let pendingOwner: string | null = null;
let captureTimer: ReturnType<typeof setTimeout> | null = null;

/** Is this window the `/?popup=` popout shell? Popouts are separate OS
 *  windows and must never capture into (or restore from) the session. */
export function isPopupContext(): boolean {
    if (typeof window === 'undefined') return false;
    try {
        return new URLSearchParams(window.location.search).has('popup');
    } catch {
        return false;
    }
}

/**
 * Merge `slices` into the persisted session, debounced. Call on every
 * windows/tab mutation; cheap to call often.
 */
export function captureSession(slices: SessionSlices): void {
    if (typeof window === 'undefined' || isPopupContext()) return;
    if (pendingOwner !== sessionRestoreUserIdHolder.current) {
        // Identity changed since the last schedule — never mix users' slices.
        pendingSlices = null;
    }
    pendingOwner = sessionRestoreUserIdHolder.current;
    pendingSlices = { ...pendingSlices, ...slices };
    if (captureTimer) clearTimeout(captureTimer);
    captureTimer = setTimeout(flushSession, CAPTURE_DEBOUNCE_MS);
}

/**
 * Write any pending capture NOW (synchronous localStorage; backend
 * write-through rides One Save's own debounce). Wired to `beforeunload` and
 * `visibilitychange → hidden` below so a closed window never loses state.
 */
export function flushSession(): void {
    if (captureTimer) { clearTimeout(captureTimer); captureTimer = null; }
    if (!pendingSlices) return;
    if (pendingOwner !== sessionRestoreUserIdHolder.current) {
        // Account switched mid-debounce — drop rather than write into the
        // wrong user's namespace (sister rule to oneSaveStore's owner guard).
        pendingSlices = null;
        return;
    }
    const next: SessionSnapshot = {
        ...(sessionRestoreStore.getSnapshot() ?? emptySnapshot()),
        ...pendingSlices,
        version: 1,
        savedAt: Date.now(),
    };
    pendingSlices = null;
    sessionRestoreStore.set(next, () => {
        try { localStorage.setItem(resolveSessionRestoreKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushSession);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') flushSession();
    });
}

/* ── restore summary (plan 055 phase 3 — welcome-back toast) ────────────── */

/**
 * What the last restore actually brought back, accumulated across the three
 * shells' restore paths (Classic windows + Holocron/Fluid tabs) so the
 * welcome-back toast can fire from ONE place without touching the shells.
 */
export interface RestoreSummary {
    windows: number;
    tabs: number;
    /** Title of the top-z restored Classic window (null when none). */
    topTitle: string | null;
    /** Component ids restored (windows + tabs) — used to pick a human label. */
    components: string[];
}

type RestoreSource = 'classic' | 'halocron' | 'fluid';

/**
 * Per-source slots, REPLACED (never accumulated) on each restore call.
 * The restore paths re-run under StrictMode double-invoke and provider
 * remounts — a plain accumulator inflated the toast ("Restored 16 windows"
 * for a 2-window session on the phase-5 rig). Replacing per source keeps
 * the composed summary truthful no matter how often each path re-runs.
 */
let restoreParts: Partial<Record<RestoreSource, RestoreSummary>> = {};

function noteRestore(source: RestoreSource, part: RestoreSummary): void {
    restoreParts[source] = part;
}

function composeSummary(): RestoreSummary | null {
    const parts = (['classic', 'halocron', 'fluid'] as const)
        .map((s) => restoreParts[s])
        .filter((p): p is RestoreSummary => p !== undefined);
    if (parts.length === 0) return null;
    return parts.reduce((acc, p) => ({
        windows: acc.windows + p.windows,
        tabs: acc.tabs + p.tabs,
        topTitle: acc.topTitle ?? p.topTitle,
        components: [...acc.components, ...p.components],
    }), { windows: 0, tabs: 0, topTitle: null, components: [] as string[] });
}

/** The composed summary of the last restore (null = nothing restored). */
export function getLastRestoreSummary(): RestoreSummary | null {
    return composeSummary();
}

/** Read AND clear the summary — the toast consumes it exactly once per login. */
export function consumeRestoreSummary(): RestoreSummary | null {
    const s = composeSummary();
    restoreParts = {};
    return s;
}

/** Test escape hatch (v2.72.1 sister convention). */
export function resetRestoreSummary(): void {
    restoreParts = {};
}

/* ── restore helpers ────────────────────────────────────────────────────── */

/** The persisted session for the CURRENT identity holder (null = nothing). */
export function readSessionSnapshot(): SessionSnapshot | null {
    if (typeof window === 'undefined') return null;
    return sessionRestoreStore.getSnapshot();
}

/** Project live WindowStates down to the serializable session shape. */
export function projectWindows(windows: WindowState[]): WindowProjection[] {
    return windows.map((w) => ({
        component: w.component,
        title: w.title,
        icon: w.icon,
        x: w.x,
        y: w.y,
        width: w.width,
        height: w.height,
        zIndex: w.zIndex,
        minimized: w.minimized,
        groupId: w.groupId ?? null,
    }));
}

/** A widget id the registry still knows. Removed widgets are dropped with a
 *  console.warn — a stale session must never crash the shell. */
function knownWidget(id: string): boolean {
    if (WIDGET_REGISTRY[id]) return true;
    console.warn(`[sessionRestore] dropping unknown widget "${id}" from restored session`);
    return false;
}

/**
 * Rehydrate Classic windows from a snapshot: exact geometry (auto-placement
 * and region-snap bypassed by construction — the frames are set verbatim),
 * fresh window ids, y clamped ≥ 0 (titlebar-rescue rule).
 */
export function restoreClassicWindows(snap: SessionSnapshot): WindowState[] {
    const restored = snap.classic
        .filter((p) => knownWidget(p.component))
        .map((p, i) => ({
            id: `win-${Date.now()}-restored-${i}`,
            title: p.title,
            icon: p.icon,
            x: p.x,
            y: Math.max(0, p.y),
            width: p.width,
            height: p.height,
            zIndex: p.zIndex,
            minimized: p.minimized,
            maximized: false,
            component: p.component,
            groupId: p.groupId ?? null,
        }));
    if (restored.length > 0) {
        const top = restored.reduce((a, b) => (b.zIndex > a.zIndex ? b : a));
        noteRestore('classic', { windows: restored.length, tabs: 0, topTitle: top.title, components: restored.map((w) => w.component) });
    }
    return restored;
}

/** Filter an OS tab slice to registry-known widgets; active falls back to null.
 *  `source` keys the restore-summary slot (idempotent across re-runs). */
export function restoreOsTabs(slice: OsTabsSlice, source: 'halocron' | 'fluid' = 'halocron'): OsTabsSlice {
    const tabs = slice.tabs.filter(knownWidget);
    if (tabs.length > 0) noteRestore(source, { windows: 0, tabs: tabs.length, topTitle: null, components: tabs });
    return { tabs, active: slice.active && tabs.includes(slice.active) ? slice.active : null };
}

/* ── fresh start (phase 3) ──────────────────────────────────────────────── */

/**
 * ⌘K → Fresh start: forget the persisted session projection for the current
 * user (localStorage + One Save write-through both nulled) and drop any
 * pending capture. Touches ONLY the session projection — widgetMemory and all
 * data stores are untouched. The caller reopens the default stack; the new
 * windows re-enter capture naturally and become the new session.
 */
export function clearSessionForFreshStart(): void {
    if (captureTimer) { clearTimeout(captureTimer); captureTimer = null; }
    pendingSlices = null;
    restoreParts = {};
    sessionRestoreStore.set(null, () => {
        try { localStorage.removeItem(resolveSessionRestoreKey()); } catch { /* sandboxed */ }
    });
}
