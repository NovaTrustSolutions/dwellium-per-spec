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
 * notices, browser-locale `langCode`, and an honest live-collab state.
 *
 * Fully self-contained for the Netlify CSP: the npm bundle ships in our chunk
 * and fonts are served same-origin from `public/excalidraw-fonts/`
 * (window.EXCALIDRAW_ASSET_PATH below — no CDN).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
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
import { FileUp, ImageDown, Shapes, Users, X } from 'lucide-react';
import { themeStore } from '../../context/ThemeContext';
import type { Theme } from '../../data/types';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
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
 * Plan 053 #6 — honest collab state. The 0.18.1 npm package ships collab UI
 * affordances only (`isCollaborating`, collaborator avatars); the room client
 * (socket transport) lives in the unpublished excalidraw-app, so the embed
 * cannot join a room in-app. Env-gated so a future room server is one env var
 * away (runbook: tools/excalidraw-room/).
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
            saveSceneDebounced(boardIdRef.current, sanitizeScene(elements, appState, files));
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

    const collab = collabState(import.meta.env.VITE_EXCALIDRAW_COLLAB_URL as string | undefined);
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
                <button style={toolbarBtn} onClick={() => setCollabOpen((v) => !v)} title="Live collaboration status" aria-expanded={collabOpen}>
                    <Users size={12} /> Collab
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

            {/* ── Honest collab state (plan 053 #6) ── */}
            {collabOpen && (
                <div role="note" style={{
                    padding: '8px 12px', fontSize: 11, lineHeight: 1.5, color: 'var(--text-secondary)',
                    borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)',
                }}>
                    {collab.configured ? (
                        <>
                            Room server configured: <code>{collab.url}</code>. The embedded Excalidraw (0.18.1) ships no
                            room client, so in-app live sync is not supported — use the server with a self-hosted
                            excalidraw-app (see <code>tools/excalidraw-room/</code>), or{' '}
                            <a href="https://excalidraw.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                                open an excalidraw.com room ↗
                            </a>{' '}for a quick shared session (export this board as .excalidraw and drop it in).
                        </>
                    ) : (
                        <>
                            Collab server not configured — set <code>VITE_EXCALIDRAW_COLLAB_URL</code> (runbook:{' '}
                            <code>tools/excalidraw-room/</code>). Note the embedded Excalidraw (0.18.1) ships no room
                            client either way; for a live session today,{' '}
                            <a href="https://excalidraw.com" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>
                                open an excalidraw.com room ↗
                            </a>{' '}and import this board there (.excalidraw export).
                        </>
                    )}
                </div>
            )}

            {/* ── Image/size notices (plan 053 #2 — never silent) ── */}
            {notice && (
                <div role="status" style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px', fontSize: 11,
                    color: notice.kind === 'downscaled' ? 'var(--text-secondary)' : '#f59e0b',
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
                    excalidrawAPI={(api) => { apiRef.current = api; }}
                    UIOptions={{ canvasActions: { loadScene: false } }}
                />
            </div>
        </div>
    );
}
