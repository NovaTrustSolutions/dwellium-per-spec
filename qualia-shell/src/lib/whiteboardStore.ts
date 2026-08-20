/**
 * whiteboardStore — plan 047 phase 1: per-user Excalidraw scene persistence.
 *
 * One Save dynamic-key store, firstRunStore sister shape: localStorage is the
 * instant offline cache (`whiteboard:<userId>`), `withSync` write-through
 * mirrors it to the backend object store when One Save is enabled. The widget
 * calls `saveSceneDebounced` on every Excalidraw onChange; only the trailing
 * call within WHITEBOARD_SAVE_DEBOUNCE_MS actually persists.
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

/** Trailing-edge debounce for onChange → persist (plan 047: 1.5 s, on idle). */
export const WHITEBOARD_SAVE_DEBOUNCE_MS = 1500;

/** Plan 047: cap embedded image `files` at ≤2 MB of serialized JSON. */
const FILES_CAP_BYTES = 2 * 1024 * 1024;

function resolveKey(): string {
    const uid = whiteboardUserIdHolder.current;
    return uid ? `whiteboard:${uid}` : 'whiteboard:_anonymous';
}

function deserialize(raw: string | null): WhiteboardScene {
    if (!raw) return EMPTY_SCENE;
    try {
        const parsed = JSON.parse(raw) as Partial<WhiteboardScene> | null;
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.elements)) return EMPTY_SCENE;
        return {
            type: 'excalidraw',
            version: 2,
            elements: parsed.elements,
            appState: parsed.appState && typeof parsed.appState === 'object' ? parsed.appState : {},
            files: parsed.files && typeof parsed.files === 'object' ? parsed.files : {},
        };
    } catch {
        return EMPTY_SCENE;
    }
}

export const whiteboardStore = withSync(
    createLocalStorageStore<WhiteboardScene>({
        key: resolveKey,
        deserializer: deserialize,
        defaultValue: EMPTY_SCENE,
    }),
    { objectType: 'whiteboard', holder: whiteboardUserIdHolder, resolveKey },
);

/**
 * Pure: Excalidraw onChange payload → persistable scene. Keeps only the two
 * appState keys worth restoring (plan 047 — strips `collaborators`, which is a
 * Map and breaks JSON round-trips), and drops `files` over the 2 MB cap.
 */
export function sanitizeScene(
    elements: readonly unknown[],
    appState: { viewBackgroundColor?: string; gridSize?: number | null },
    files: Record<string, unknown> | undefined,
): WhiteboardScene {
    let keptFiles: Record<string, unknown> = files ?? {};
    try {
        if (JSON.stringify(keptFiles).length > FILES_CAP_BYTES) keptFiles = {};
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

function persist(next: WhiteboardScene): void {
    whiteboardStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* quota/sandboxed */ }
    });
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced persist — trailing edge only (one write per idle period). */
export function saveSceneDebounced(scene: WhiteboardScene): void {
    if (saveTimer !== null) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; persist(scene); }, WHITEBOARD_SAVE_DEBOUNCE_MS);
}

/** Cancel any pending debounced save (widget unmount). */
export function cancelPendingSave(): void {
    if (saveTimer !== null) { clearTimeout(saveTimer); saveTimer = null; }
}

/** Test/escape-hatch reset (v2.72.1 standing convention). */
export function resetWhiteboard(): void {
    cancelPendingSave();
    whiteboardStore.reset();
}
