/**
 * whiteboardStore — plan 047 phase 1, reworked at plan 053: per-user
 * multi-board Excalidraw persistence.
 *
 * One Save dynamic-key store, firstRunStore sister shape: localStorage is the
 * instant offline cache (`whiteboard:<userId>`), `withSync` write-through
 * mirrors it to the backend object store when One Save is enabled. One Save
 * syncs exactly ONE object per (type, user), so everything lives in a single
 * document: every board's scene, the active board id and the user's shape
 * library. Legacy single-scene payloads (plan 047 shape,
 * `{type:'excalidraw',version:2,…}`) are migrated in `normalizeDoc` — which
 * covers BOTH the localStorage deserializer and `hydrate()` payloads that
 * bypass it.
 *
 * The widget calls `saveSceneDebounced` on every Excalidraw onChange; only the
 * trailing call within WHITEBOARD_SAVE_DEBOUNCE_MS persists. Persisting first
 * runs `prepareSceneFiles`: images over the soft per-file size get downscaled
 * client-side to FILE_MAX_DIMENSION, and only if the board is STILL over
 * FILES_CAP_BYTES (10 MB) are the largest files dropped — each path pushes a
 * visible notice through `whiteboardNoticeStore`, never silent (plan 053 #2).
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSync } from './oneSaveStore';
import { whiteboardUserIdHolder } from './perUserIdentity';

/** Excalidraw scene JSON (plan 047: `{type:'excalidraw', version:2, ...}`). */
export interface WhiteboardScene {
    type: 'excalidraw';
    version: 2;
    elements: readonly unknown[];
    appState: { viewBackgroundColor?: string; gridSize?: number | null };
    files: Record<string, unknown>;
}

export const EMPTY_SCENE: WhiteboardScene = { type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} };

/** One named board (plan 053 #5 — Strata boards use id `strata:<type>:<id>`). */
export interface WhiteboardBoard {
    id: string;
    title: string;
    scene: WhiteboardScene;
    updatedAt: number;
}

export const DEFAULT_BOARD_ID = 'default';
const DEFAULT_BOARD_TITLE = 'My whiteboard';

/**
 * The whole persisted per-user document. `libraryItems === undefined` means
 * "library never persisted" — the widget seeds the Andy starter library on
 * that first open only (a user who deletes it persists `[]` and stays clean).
 */
export interface WhiteboardDoc {
    type: 'dwellium-whiteboard';
    version: 1;
    activeBoardId: string;
    boards: Record<string, WhiteboardBoard>;
    libraryItems?: readonly unknown[];
}

function makeDefaultBoard(scene: WhiteboardScene = EMPTY_SCENE): WhiteboardBoard {
    return { id: DEFAULT_BOARD_ID, title: DEFAULT_BOARD_TITLE, scene, updatedAt: 0 };
}

export const EMPTY_DOC: WhiteboardDoc = {
    type: 'dwellium-whiteboard',
    version: 1,
    activeBoardId: DEFAULT_BOARD_ID,
    boards: { [DEFAULT_BOARD_ID]: makeDefaultBoard() },
};

/** Trailing-edge debounce for onChange → persist (plan 047: 1.5 s, on idle). */
export const WHITEBOARD_SAVE_DEBOUNCE_MS = 1500;

/** Plan 053 #2: total serialized `files` cap per board — raised 2 MB → 10 MB. */
export const FILES_CAP_BYTES = 10 * 1024 * 1024;
/** Images whose dataURL exceeds this get downscaled before persisting. */
export const FILE_DOWNSCALE_THRESHOLD_BYTES = 2 * 1024 * 1024;
/** Downscale target: longest image edge after client-side resize. */
export const FILE_MAX_DIMENSION = 2048;

function resolveKey(): string {
    const uid = whiteboardUserIdHolder.current;
    return uid ? `whiteboard:${uid}` : 'whiteboard:_anonymous';
}

function isScene(v: unknown): v is WhiteboardScene {
    return !!v && typeof v === 'object' && (v as { type?: unknown }).type === 'excalidraw'
        && Array.isArray((v as { elements?: unknown }).elements);
}

function coerceScene(v: unknown): WhiteboardScene {
    if (!v || typeof v !== 'object') return EMPTY_SCENE;
    const p = v as Partial<WhiteboardScene>;
    if (!Array.isArray(p.elements)) return EMPTY_SCENE;
    return {
        type: 'excalidraw',
        version: 2,
        elements: p.elements,
        appState: p.appState && typeof p.appState === 'object' ? p.appState : {},
        files: p.files && typeof p.files === 'object' ? p.files : {},
    };
}

/**
 * Any historical payload → a well-formed doc. Handles: the plan-047 legacy
 * single scene (becomes the default board), a bare `{elements:[…]}` blob, a
 * current doc (boards re-coerced, default board guaranteed, active id valid),
 * and garbage (→ EMPTY_DOC).
 */
export function normalizeDoc(raw: unknown): WhiteboardDoc {
    if (isScene(raw)) {
        return { ...EMPTY_DOC, boards: { [DEFAULT_BOARD_ID]: makeDefaultBoard(coerceScene(raw)) } };
    }
    if (!raw || typeof raw !== 'object') return EMPTY_DOC;
    const d = raw as Partial<WhiteboardDoc> & { elements?: unknown };
    if (d.type !== 'dwellium-whiteboard') {
        // Pre-047 tolerant path: a scene-ish blob without the type tag.
        if (Array.isArray(d.elements)) {
            return { ...EMPTY_DOC, boards: { [DEFAULT_BOARD_ID]: makeDefaultBoard(coerceScene(raw)) } };
        }
        return EMPTY_DOC;
    }
    const boards: Record<string, WhiteboardBoard> = {};
    if (d.boards && typeof d.boards === 'object') {
        for (const [id, b] of Object.entries(d.boards)) {
            if (!b || typeof b !== 'object') continue;
            boards[id] = {
                id,
                title: typeof b.title === 'string' && b.title ? b.title : id,
                scene: coerceScene(b.scene),
                updatedAt: typeof b.updatedAt === 'number' ? b.updatedAt : 0,
            };
        }
    }
    if (!boards[DEFAULT_BOARD_ID]) boards[DEFAULT_BOARD_ID] = makeDefaultBoard();
    const activeBoardId = typeof d.activeBoardId === 'string' && boards[d.activeBoardId]
        ? d.activeBoardId
        : DEFAULT_BOARD_ID;
    const doc: WhiteboardDoc = { type: 'dwellium-whiteboard', version: 1, activeBoardId, boards };
    if (Array.isArray(d.libraryItems)) doc.libraryItems = d.libraryItems;
    return doc;
}

function deserialize(raw: string | null): WhiteboardDoc {
    if (!raw) return EMPTY_DOC;
    try {
        return normalizeDoc(JSON.parse(raw));
    } catch {
        return EMPTY_DOC;
    }
}

export const whiteboardStore = withSync(
    createLocalStorageStore<WhiteboardDoc>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: EMPTY_DOC,
    }),
    { objectType: 'whiteboard', holder: whiteboardUserIdHolder, resolveKey },
);

/** Snapshot as a guaranteed-normalized doc (hydrate() can inject legacy shapes). */
export function getWhiteboardDoc(): WhiteboardDoc {
    return normalizeDoc(whiteboardStore.getSnapshot());
}

/* ─────────────────────────── notices (plan 053 #2: never silent) ───────── */

export interface WhiteboardNotice {
    id: number;
    kind: 'downscaled' | 'dropped' | 'cache-quota';
    message: string;
}

let noticeSeq = 0;
let currentNotice: WhiteboardNotice | null = null;
const noticeListeners = new Set<() => void>();

export const whiteboardNoticeStore = {
    subscribe(listener: () => void): () => void {
        noticeListeners.add(listener);
        return () => { noticeListeners.delete(listener); };
    },
    getSnapshot(): WhiteboardNotice | null {
        return currentNotice;
    },
    getServerSnapshot(): WhiteboardNotice | null {
        return null;
    },
    push(kind: WhiteboardNotice['kind'], message: string): void {
        currentNotice = { id: ++noticeSeq, kind, message };
        noticeListeners.forEach((l) => l());
    },
    dismiss(): void {
        if (currentNotice === null) return;
        currentNotice = null;
        noticeListeners.forEach((l) => l());
    },
    /** Standing convention: test escape hatch. */
    reset(): void {
        currentNotice = null;
        noticeListeners.forEach((l) => l());
    },
};

/* ─────────────────────── image prep (downscale / cap) ──────────────────── */

interface BinaryFileLike { dataURL?: unknown; mimeType?: unknown; [k: string]: unknown }

function fileSize(f: unknown): number {
    const dataURL = (f as BinaryFileLike | null)?.dataURL;
    return typeof dataURL === 'string' ? dataURL.length : 0;
}

function isDownscalableImage(f: unknown): boolean {
    const file = f as BinaryFileLike | null;
    return !!file && typeof file.dataURL === 'string'
        && typeof file.mimeType === 'string' && file.mimeType.startsWith('image/')
        && file.mimeType !== 'image/svg+xml'
        && file.dataURL.length > FILE_DOWNSCALE_THRESHOLD_BYTES;
}

export type Downscaler = (dataURL: string, maxDimension: number) => Promise<string | null>;

/**
 * Canvas-based default downscaler: decode, fit inside maxDimension, re-encode
 * as JPEG. Returns null when the image is already small enough, shrinking did
 * not help, or decode failed (caller keeps the original then).
 */
export const canvasDownscale: Downscaler = (dataURL, maxDimension) =>
    new Promise((resolve) => {
        try {
            const img = new Image();
            img.onload = () => {
                try {
                    const scale = maxDimension / Math.max(img.width, img.height);
                    if (!Number.isFinite(scale) || scale >= 1) { resolve(null); return; }
                    const canvas = document.createElement('canvas');
                    canvas.width = Math.max(1, Math.round(img.width * scale));
                    canvas.height = Math.max(1, Math.round(img.height * scale));
                    const ctx = canvas.getContext('2d');
                    if (!ctx) { resolve(null); return; }
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    const out = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(out.length < dataURL.length ? out : null);
                } catch {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = dataURL;
        } catch {
            resolve(null);
        }
    });

export interface PreparedFiles {
    files: Record<string, unknown>;
    downscaled: string[];
    dropped: string[];
}

/**
 * Enforce the plan-053 image policy on a scene's `files`:
 *   1. downscale every oversized raster image to FILE_MAX_DIMENSION;
 *   2. if the total is still over FILES_CAP_BYTES, drop largest-first.
 * Pure given an injected `downscale` (tests stub it; jsdom has no codecs).
 */
export async function prepareSceneFiles(
    files: Record<string, unknown>,
    downscale: Downscaler = canvasDownscale,
): Promise<PreparedFiles> {
    const out: Record<string, unknown> = { ...files };
    const downscaledIds: string[] = [];
    for (const [id, f] of Object.entries(out)) {
        if (!isDownscalableImage(f)) continue;
        const next = await downscale((f as BinaryFileLike).dataURL as string, FILE_MAX_DIMENSION);
        if (next !== null) {
            out[id] = { ...(f as BinaryFileLike), dataURL: next, mimeType: 'image/jpeg' };
            downscaledIds.push(id);
        }
    }
    const droppedIds: string[] = [];
    let total = Object.values(out).reduce<number>((sum, f) => sum + fileSize(f), 0);
    if (total > FILES_CAP_BYTES) {
        const bySizeDesc = Object.entries(out).sort((a, b) => fileSize(b[1]) - fileSize(a[1]));
        for (const [id] of bySizeDesc) {
            if (total <= FILES_CAP_BYTES) break;
            total -= fileSize(out[id]);
            delete out[id];
            droppedIds.push(id);
        }
    }
    return { files: out, downscaled: downscaledIds, dropped: droppedIds };
}

/* ─────────────────────────── scene persistence ─────────────────────────── */

/**
 * Pure: Excalidraw onChange payload → persistable scene. Keeps only the two
 * appState keys worth restoring (plan 047 — strips `collaborators`, which is a
 * Map and breaks JSON round-trips). File downscaling/capping happens later in
 * the persist path (`prepareSceneFiles`) so it can be async and non-silent.
 */
export function sanitizeScene(
    elements: readonly unknown[],
    appState: { viewBackgroundColor?: string; gridSize?: number | null },
    files: Record<string, unknown> | undefined,
): WhiteboardScene {
    let keptFiles: Record<string, unknown> = files ?? {};
    try {
        JSON.stringify(keptFiles);
    } catch {
        keptFiles = {}; // unserializable → don't persist
    }
    return {
        type: 'excalidraw',
        version: 2,
        elements,
        appState: { viewBackgroundColor: appState.viewBackgroundColor, gridSize: appState.gridSize ?? null },
        files: keptFiles,
    };
}

function persistDoc(next: WhiteboardDoc): void {
    whiteboardStore.set(next, () => {
        try {
            localStorage.setItem(resolveKey(), JSON.stringify(next));
        } catch {
            // Quota/sandboxed. One Save still syncs the payload to the backend;
            // surface the local-cache miss instead of silently losing offline data.
            whiteboardNoticeStore.push(
                'cache-quota',
                'Board too large for the offline cache — it is saved to your account (One Save) only.',
            );
        }
    });
}

async function persistScene(boardId: string, scene: WhiteboardScene): Promise<void> {
    let files = scene.files;
    // Only pay the async prep when some file crosses the downscale threshold
    // or the board total is over cap.
    const total = Object.values(files).reduce<number>((sum, f) => sum + fileSize(f), 0);
    if (total > FILES_CAP_BYTES || Object.values(files).some(isDownscalableImage)) {
        const prepared = await prepareSceneFiles(files);
        files = prepared.files;
        if (prepared.downscaled.length > 0) {
            whiteboardNoticeStore.push(
                'downscaled',
                `${prepared.downscaled.length} image${prepared.downscaled.length === 1 ? '' : 's'} downscaled to ${FILE_MAX_DIMENSION}px to keep the board under ${Math.round(FILES_CAP_BYTES / 1024 / 1024)} MB.`,
            );
        }
        if (prepared.dropped.length > 0) {
            whiteboardNoticeStore.push(
                'dropped',
                `${prepared.dropped.length} image${prepared.dropped.length === 1 ? '' : 's'} could not fit the ${Math.round(FILES_CAP_BYTES / 1024 / 1024)} MB board limit and will not be saved.`,
            );
        }
    }
    const doc = getWhiteboardDoc();
    const prev = doc.boards[boardId];
    const board: WhiteboardBoard = {
        id: boardId,
        title: prev?.title ?? (boardId === DEFAULT_BOARD_ID ? DEFAULT_BOARD_TITLE : boardId),
        scene: { ...scene, files },
        updatedAt: Date.now(),
    };
    persistDoc({ ...doc, boards: { ...doc.boards, [boardId]: board } });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: { boardId: string; scene: WhiteboardScene } | null = null;

/** Debounced persist — trailing edge only (one write per idle period). */
export function saveSceneDebounced(boardId: string, scene: WhiteboardScene): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    pendingSave = { boardId, scene };
    saveTimer = setTimeout(() => {
        saveTimer = null;
        const p = pendingSave;
        pendingSave = null;
        if (p) void persistScene(p.boardId, p.scene);
    }, WHITEBOARD_SAVE_DEBOUNCE_MS);
}

/** Cancel any pending debounced save (widget unmount). */
export function cancelPendingSave(): void {
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    pendingSave = null;
}

/** Run a pending debounced save NOW (board switch — don't lose the last strokes). */
export function flushPendingSave(): void {
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
    const p = pendingSave;
    pendingSave = null;
    if (p) void persistScene(p.boardId, p.scene);
}

/* ─────────────────────────── boards + library ──────────────────────────── */

/** Switch the active board; flushes any pending save for the previous board first. */
export function setActiveBoard(boardId: string): void {
    flushPendingSave();
    const doc = getWhiteboardDoc();
    if (!doc.boards[boardId] || doc.activeBoardId === boardId) return;
    persistDoc({ ...doc, activeBoardId: boardId });
}

/**
 * Create-or-activate a board (Strata bridge entry point, plan 053 #5).
 * Persists immediately — not debounced — so the widget mounts on it.
 */
export function openBoard(boardId: string, title: string): void {
    flushPendingSave();
    const doc = getWhiteboardDoc();
    const existing = doc.boards[boardId];
    const board: WhiteboardBoard = existing
        ? { ...existing, title: title || existing.title }
        : { id: boardId, title: title || boardId, scene: EMPTY_SCENE, updatedAt: Date.now() };
    persistDoc({ ...doc, activeBoardId: boardId, boards: { ...doc.boards, [boardId]: board } });
}

/** Persist the user's shape library (Excalidraw onLibraryChange, plan 053 #1). */
export function saveLibraryItems(items: readonly unknown[]): void {
    const doc = getWhiteboardDoc();
    persistDoc({ ...doc, libraryItems: items });
}

/** Test/escape-hatch reset (v2.72.1 standing convention). */
export function resetWhiteboard(): void {
    cancelPendingSave();
    whiteboardNoticeStore.reset();
    whiteboardStore.reset();
}
