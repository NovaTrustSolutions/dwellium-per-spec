/**
 * Whiteboard — plan 047 phase 1, extended at plan 053: Excalidraw (MIT) as a
 * native Dwellium widget.
 *
 * Floor plans, maintenance markup, doc diagrams. Persistence is the per-user
 * multi-board `whiteboardStore` doc (One Save localStorage cache + backend
 * write-through), debounced 1.5 s on idle. Plan 053 adds: a boards list (incl.
 * Strata-attached boards `strata:<type>:<id>`), shape-library persistence with
 * the Andy starter library, import of `.excalidraw`/`.excalidrawlib` (picker +
 * drag-drop), PNG/SVG/.excalidraw export, ≥10 MB images with downscale
 * notices, browser-locale `langCode`, and REAL live collaboration via the
 * vendored Excalidraw room client (`./collab/` — MIT, from the monorepo at
 * v0.18.1) against a self-hosted excalidraw-room server
 * (`VITE_EXCALIDRAW_COLLAB_URL`; runbook: tools/excalidraw-room/). Scenes are
 * end-to-end encrypted; the AES-GCM key rides the `#room=<id>,<key>` URL
 * fragment and never reaches any server.
 *
 * Fully self-contained for the Netlify CSP: the npm bundle ships in our chunk
 * and fonts are served same-origin from `public/excalidraw-fonts/`
 * (window.EXCALIDRAW_ASSET_PATH below — no CDN).
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import {
    Excalidraw,
    MIME_TYPES,
    exportToBlob,
    exportToSvg,
    languages,
    loadSceneOrLibraryFromBlob,
    serializeAsJSON,
} from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
    AppState,
    BinaryFiles,
    ExcalidrawImperativeAPI,
    ExcalidrawInitialDataState,
    LibraryItems,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { Copy, FileUp, ImageDown, Shapes, Users, X } from 'lucide-react';
import { themeStore } from '../../context/ThemeContext';
import { UserContext } from '../../context/UserContext';
import type { Theme } from '../../data/types';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import { CollabSession } from './collab/Collab';
import { getCollaborationLinkData } from './collab/protocol';
import {
    DEFAULT_BOARD_ID,
    flushPendingSave,
    getWhiteboardDoc,
    normalizeDoc,
    sanitizeScene,
    saveLibraryItems,
    saveSceneDebounced,
    setActiveBoard,
    whiteboardNoticeStore,
    whiteboardStore,
} from '../../lib/whiteboardStore';
import { buildAndyLibrary } from '../../data/whiteboard/andyLibrary';

declare global {
    interface Window {
        /** Excalidraw self-hosted asset base (fonts) — read by the package at runtime. */
        EXCALIDRAW_ASSET_PATH?: string | string[];
    }
}

// Self-hosted fonts (plan 047 step 5): the package requests
// `./fonts/<Family>/<file>.woff2` relative to this base, so the copied dir
// lives at public/excalidraw-fonts/fonts/. Runtime-read by Excalidraw at font
// load time; the typeof guard keeps the module SSR-importable.
if (typeof window !== 'undefined') {
    window.EXCALIDRAW_ASSET_PATH = '/excalidraw-fonts/';
}

/** The two light picker themes; everything else in the Master Pack is dark. */
const LIGHT_THEMES: ReadonlySet<Theme> = new Set<Theme>(['latte', 'corporate']);

/**
 * Live collab env gate. The 0.18.1 npm package ships no room client, so the
 * transport is vendored from the MIT monorepo (`./collab/`); this only checks
 * whether a room server is configured (runbook: tools/excalidraw-room/).
 */
export function collabState(envUrl: string | undefined | null): { configured: boolean; url: string | null } {
    const url = typeof envUrl === 'string' && envUrl.trim() ? envUrl.trim() : null;
    return { configured: url !== null, url };
}

/** Map the browser locale onto Excalidraw's language list (gap E8). */
export function pickLangCode(
    navLang: string | undefined,
    available: readonly { code: string }[],
): string | undefined {
    if (!navLang) return undefined;
    const exact = available.find((l) => l.code.toLowerCase() === navLang.toLowerCase());
    if (exact) return exact.code;
    const base = navLang.split('-')[0].toLowerCase();
    return available.find((l) => l.code.split('-')[0].toLowerCase() === base)?.code;
}

function slugify(title: string): string {
    return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'whiteboard';
}

function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Stable no-op store surface for useSyncExternalStore when no session runs. */
const NOOP_SUBSCRIBE = () => () => {};
const getNullSnapshot = () => null;

const IMPORT_EXTENSIONS = ['.excalidraw', '.excalidrawlib'];

function isImportFile(name: string | undefined): boolean {
    return !!name && IMPORT_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

const toolbarBtn: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
    borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
    background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
    border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
    color: 'var(--accent)',
};

export default function Whiteboard() {
    // Single writer for every per-user store key — before any snapshot read.
    usePerUserIdentity();
    const theme = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);
    const rawDoc = useSyncExternalStore(whiteboardStore.subscribe, whiteboardStore.getSnapshot, whiteboardStore.getServerSnapshot);
    const doc = useMemo(() => normalizeDoc(rawDoc), [rawDoc]);
    const notice = useSyncExternalStore(whiteboardNoticeStore.subscribe, whiteboardNoticeStore.getSnapshot, whiteboardNoticeStore.getServerSnapshot);

    const activeBoardId = doc.activeBoardId;
    // onChange fires between renders — keep the board it belongs to in a ref
    // (render-phase write: own ref, idempotent, must be current before the
    // remounted canvas fires its first onChange).
    const boardIdRef = useRef(activeBoardId);
    boardIdRef.current = activeBoardId;

    const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [collabOpen, setCollabOpen] = useState(false);

    /* ── live collaboration (vendored room client, ./collab/) ───────────── */
    const collab = collabState(import.meta.env.VITE_EXCALIDRAW_COLLAB_URL as string | undefined);
    const userCtx = useContext(UserContext);
    const usernameRef = useRef('Dwellium user');
    usernameRef.current = userCtx?.user?.name || 'Dwellium user';

    const sessionRef = useRef<CollabSession | null>(null);
    const [session, setSession] = useState<CollabSession | null>(null);
    const [joinLink, setJoinLink] = useState('');
    const sessionSnap = useSyncExternalStore(
        session?.subscribe ?? NOOP_SUBSCRIBE,
        session?.getSnapshot ?? getNullSnapshot,
        getNullSnapshot,
    );

    const startSession = useCallback(async (existing: { roomId: string; roomKey: string } | null) => {
        const api = apiRef.current;
        const url = collabState(import.meta.env.VITE_EXCALIDRAW_COLLAB_URL as string | undefined).url;
        if (!api || !url || sessionRef.current) return;
        const s = new CollabSession({
            excalidrawAPI: api,
            serverUrl: url,
            username: usernameRef.current,
            onError: (message) => whiteboardNoticeStore.push('collab', message),
        });
        sessionRef.current = s;
        setSession(s);
        setCollabOpen(true);
        await s.start(existing);
        const link = s.getSnapshot().roomLink;
        // Refresh-safe: put the room fragment in the URL (key never leaves it).
        try { window.history.replaceState({}, '', link); } catch { /* sandboxed */ }
        if (!existing) {
            try {
                await navigator.clipboard.writeText(link);
                whiteboardNoticeStore.push('collab', 'Live session started — link copied to your clipboard.');
            } catch {
                whiteboardNoticeStore.push('collab', 'Live session started — use Copy link to share it.');
            }
        }
    }, []);

    const leaveSession = useCallback(() => {
        const s = sessionRef.current;
        if (!s) return;
        // Persist the collaborative result before teardown (remote-echo saves
        // are skipped during the session — see onChange).
        const api = apiRef.current;
        if (api) {
            saveSceneDebounced(
                boardIdRef.current,
                sanitizeScene(api.getSceneElements(), api.getAppState(), api.getFiles()),
            );
        }
        flushPendingSave();
        s.stop();
        sessionRef.current = null;
        setSession(null);
        if (typeof window !== 'undefined' && getCollaborationLinkData(window.location.href)) {
            try {
                window.history.replaceState({}, '', window.location.pathname + window.location.search);
            } catch { /* sandboxed */ }
        }
    }, []);

    const copyRoomLink = useCallback(async () => {
        const link = sessionRef.current?.getSnapshot().roomLink;
        if (!link) return;
        try {
            await navigator.clipboard.writeText(link);
            whiteboardNoticeStore.push('collab', 'Room link copied — anyone with it joins this board live.');
        } catch {
            whiteboardNoticeStore.push('collab', `Copy failed — room link: ${link}`);
        }
    }, []);

    const joinFromLink = useCallback(() => {
        const data = getCollaborationLinkData(joinLink.trim());
        if (!data) {
            whiteboardNoticeStore.push('collab', 'That is not a valid room link — expected …#room=<id>,<key>.');
            return;
        }
        setJoinLink('');
        void startSession(data);
    }, [joinLink, startSession]);

    // Opening the app with a #room= fragment joins automatically once the
    // canvas API is available (the api callback below calls this).
    const maybeAutoJoin = useCallback(() => {
        if (sessionRef.current || typeof window === 'undefined') return;
        const data = getCollaborationLinkData(window.location.href);
        if (data) void startSession(data);
    }, [startSession]);

    // Board switches remount the canvas (new imperative API) — a live session
    // is bound to the old one, so leave honestly instead of desyncing.
    const prevBoardRef = useRef(activeBoardId);
    useEffect(() => {
        if (prevBoardRef.current !== activeBoardId && sessionRef.current) {
            leaveSession();
            whiteboardNoticeStore.push('collab', 'Left the live session — sessions are per board.');
        }
        prevBoardRef.current = activeBoardId;
    }, [activeBoardId, leaveSession]);

    // Unmount: tear the socket down (flushPendingSave runs in its own effect).
    useEffect(() => () => {
        sessionRef.current?.stop();
        sessionRef.current = null;
    }, []);

    // Excalidraw only reads initialData on mount; the canvas remounts per board
    // (key={activeBoardId}), so compute mount data per board id. First-ever open
    // (libraryItems undefined) seeds the Andy property-management library.
    const initialData = useMemo<ExcalidrawInitialDataState>(() => {
        const d = getWhiteboardDoc();
        const board = d.boards[activeBoardId] ?? d.boards[DEFAULT_BOARD_ID];
        return {
            ...board.scene,
            libraryItems: (d.libraryItems as LibraryItems | undefined) ?? buildAndyLibrary(),
        } as ExcalidrawInitialDataState;
    }, [activeBoardId]);

    const onChange = useCallback(
        (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
            // In a live session, skip persisting remote-echo churn — the final
            // scene is saved explicitly on Leave/board-switch (leaveSession).
            if (!sessionRef.current?.isApplyingRemote()) {
                saveSceneDebounced(boardIdRef.current, sanitizeScene(elements, appState, files));
            }
            // Version-gated inside: received scenes are never re-broadcast.
            sessionRef.current?.syncElements(elements);
        },
        [],
    );

    const onLibraryChange = useCallback((items: LibraryItems) => {
        saveLibraryItems(items);
    }, []);

    // Flush (not drop) a pending trailing save on unmount — closing the widget
    // must not lose the last ≤1.5 s of drawing. Board switches flush inside
    // setActiveBoard.
    useEffect(() => flushPendingSave, []);

    /* ── import (.excalidraw / .excalidrawlib — picker + drag-drop) ─────── */
    const importBlob = useCallback(async (file: Blob) => {
        const api = apiRef.current;
        if (!api) return;
        try {
            const result = await loadSceneOrLibraryFromBlob(file, null, null);
            if (result.type === MIME_TYPES.excalidraw) {
                const hasContent = api.getSceneElements().length > 0;
                if (hasContent && !window.confirm('Replace the current board with the imported drawing?')) return;
                const elements = result.data.elements ?? [];
                api.updateScene({
                    elements,
                    appState: { viewBackgroundColor: result.data.appState?.viewBackgroundColor },
                });
                const files = (result.data.files ?? {}) as BinaryFiles;
                api.addFiles(Object.values(files));
                saveSceneDebounced(
                    boardIdRef.current,
                    sanitizeScene(elements, result.data.appState ?? {}, files as Record<string, unknown>),
                );
            } else {
                await api.updateLibrary({ libraryItems: result.data.libraryItems ?? [], merge: true, openLibraryMenu: true });
            }
        } catch {
            whiteboardNoticeStore.push('dropped', 'Could not import that file — it is not a valid .excalidraw or .excalidrawlib.');
        }
    }, []);

    const onPickFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void importBlob(file);
    }, [importBlob]);

    const onDropCapture = useCallback((e: React.DragEvent) => {
        const files = Array.from(e.dataTransfer?.files ?? []);
        const importable = files.find((f) => isImportFile(f.name));
        if (!importable) return; // images etc. → Excalidraw's own drop handling
        e.preventDefault();
        e.stopPropagation();
        void importBlob(importable);
    }, [importBlob]);

    /* ── export (PNG / SVG / .excalidraw) ───────────────────────────────── */
    const exportScene = useCallback(async (kind: 'png' | 'svg' | 'excalidraw') => {
        const api = apiRef.current;
        if (!api) return;
        const elements = api.getSceneElements();
        const appState = api.getAppState();
        const files = api.getFiles();
        const base = slugify(getWhiteboardDoc().boards[boardIdRef.current]?.title ?? 'whiteboard');
        try {
            if (kind === 'png') {
                const blob = await exportToBlob({ elements, appState, files, mimeType: 'image/png' });
                downloadBlob(blob, `${base}.png`);
            } else if (kind === 'svg') {
                const svg = await exportToSvg({ elements, appState, files });
                downloadBlob(new Blob([svg.outerHTML], { type: 'image/svg+xml' }), `${base}.svg`);
            } else {
                const json = serializeAsJSON(elements, appState, files, 'local');
                downloadBlob(new Blob([json], { type: MIME_TYPES.excalidraw }), `${base}.excalidraw`);
            }
        } catch {
            whiteboardNoticeStore.push('dropped', 'Export failed — try again with a smaller selection.');
        }
    }, []);

    /* ── Andy library re-add ────────────────────────────────────────────── */
    const addDwelliumShapes = useCallback(() => {
        void apiRef.current?.updateLibrary({ libraryItems: buildAndyLibrary(), merge: true, openLibraryMenu: true });
    }, []);

    /* ── boards list (default first, then most recently updated) ────────── */
    const boardList = useMemo(() => {
        const boards = Object.values(doc.boards);
        return [
            ...boards.filter((b) => b.id === DEFAULT_BOARD_ID),
            ...boards.filter((b) => b.id !== DEFAULT_BOARD_ID).sort((a, b) => b.updatedAt - a.updatedAt),
        ];
    }, [doc.boards]);

    const langCode = pickLangCode(typeof navigator !== 'undefined' ? navigator.language : undefined, languages);

    return (
        <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }} onDropCapture={onDropCapture}>
            {/* ── Toolbar ── */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}>
                <select
                    aria-label="Board"
                    value={activeBoardId}
                    onChange={(e) => setActiveBoard(e.target.value)}
                    style={{
                        maxWidth: 220, padding: '4px 6px', borderRadius: 6, fontSize: 11, fontFamily: 'inherit',
                        background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)',
                        border: '1px solid rgba(255,255,255,0.1)',
                    }}
                >
                    {boardList.map((b) => (
                        <option key={b.id} value={b.id}>{b.title}</option>
                    ))}
                </select>
                <button style={toolbarBtn} onClick={() => void exportScene('png')} title="Export the board as a PNG image">
                    <ImageDown size={12} /> Save as PNG
                </button>
                <button style={toolbarBtn} onClick={() => void exportScene('svg')} title="Export the board as SVG">
                    SVG
                </button>
                <button style={toolbarBtn} onClick={() => void exportScene('excalidraw')} title="Export the board as a .excalidraw file">
                    .excalidraw
                </button>
                <button style={toolbarBtn} onClick={() => fileInputRef.current?.click()} title="Import a .excalidraw drawing or .excalidrawlib shape library (or drop one on the canvas)">
                    <FileUp size={12} /> Import
                </button>
                <button style={toolbarBtn} onClick={addDwelliumShapes} title="Add the Dwellium property-management shapes to your library">
                    <Shapes size={12} /> Dwellium shapes
                </button>
                <button style={toolbarBtn} onClick={() => setCollabOpen((v) => !v)} title="Live collaboration" aria-expanded={collabOpen}>
                    <Users size={12} /> Live collab{session && sessionSnap ? ` (${sessionSnap.collaboratorCount})` : ''}
                </button>
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".excalidraw,.excalidrawlib,application/json"
                    onChange={onPickFile}
                    style={{ display: 'none' }}
                    aria-label="Import whiteboard file"
                />
            </div>

            {/* ── Live collab panel (vendored room client, ./collab/) ── */}
            {collabOpen && (
                <div role="note" style={{
                    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: '8px 12px', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
                }}>
                    {!collab.configured ? (
                        <span>
                            Collab server not configured — set <code>VITE_EXCALIDRAW_COLLAB_URL</code> to your
                            excalidraw-room server (runbook: <code>tools/excalidraw-room/</code>: <code>docker
                            compose up</code>, then the env var). Once set, live collaboration runs right here —
                            end-to-end encrypted, presence cursors and all.
                        </span>
                    ) : session && sessionSnap ? (
                        <>
                            <span>
                                Live session — {sessionSnap.collaboratorCount} participant{sessionSnap.collaboratorCount === 1 ? '' : 's'}.
                                Images are not synced live; they stay on the device that added them.
                            </span>
                            <button style={toolbarBtn} onClick={() => void copyRoomLink()} title="Copy the room link (the key stays in the URL fragment)">
                                <Copy size={12} /> Copy link
                            </button>
                            <button style={toolbarBtn} onClick={leaveSession} title="Leave the live session (the board stays saved to your account)">
                                Leave
                            </button>
                        </>
                    ) : (
                        <>
                            <button style={toolbarBtn} onClick={() => void startSession(null)} title="Create an end-to-end encrypted room and copy its link">
                                Start session
                            </button>
                            <input
                                aria-label="Join with link"
                                placeholder="Paste a #room= link to join"
                                value={joinLink}
                                onChange={(e) => setJoinLink(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') joinFromLink(); }}
                                style={{
                                    flex: 1, minWidth: 180, padding: '4px 8px', borderRadius: 6, fontSize: 11,
                                    fontFamily: 'inherit', background: 'rgba(255,255,255,0.04)',
                                    color: 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)',
                                }}
                            />
                            <button style={toolbarBtn} onClick={joinFromLink} title="Join the pasted room link">
                                Join
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* ── Image/size notices (plan 053 #2 — never silent) ── */}
            {notice && (
                <div role="status" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 11,
                    color: notice.kind === 'downscaled' || notice.kind === 'collab' ? 'var(--text-secondary)' : '#f59e0b',
                    background: 'rgba(245,158,11,0.06)', borderBottom: '1px solid rgba(245,158,11,0.15)',
                }}>
                    <span style={{ flex: 1 }}>{notice.message}</span>
                    <button
                        aria-label="Dismiss notice"
                        onClick={() => whiteboardNoticeStore.dismiss()}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 2, display: 'flex' }}
                    >
                        <X size={12} />
                    </button>
                </div>
            )}

            {/* ── Canvas (remounts per board so initialData re-reads) ── */}
            <div style={{ flex: 1, minHeight: 0 }}>
                <Excalidraw
                    key={activeBoardId}
                    theme={LIGHT_THEMES.has(theme) ? 'light' : 'dark'}
                    langCode={langCode}
                    initialData={initialData}
                    onChange={onChange}
                    onLibraryChange={onLibraryChange}
                    excalidrawAPI={(api) => { apiRef.current = api; maybeAutoJoin(); }}
                    isCollaborating={session !== null}
                    onPointerUpdate={session ? session.onPointerUpdate : undefined}
                    UIOptions={{ canvasActions: { loadScene: false } }}
                />
            </div>
        </div>
    );
}
