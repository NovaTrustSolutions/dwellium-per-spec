/**
 * Whiteboard — plan 047 phase 1: Excalidraw (MIT) as a native Dwellium widget.
 *
 * Floor plans, maintenance markup, doc diagrams. The scene persists per user
 * via `whiteboardStore` (One Save localStorage cache + backend write-through),
 * debounced 1.5 s on idle. Fully self-contained for the Netlify CSP: the npm
 * bundle ships in our chunk and fonts are served same-origin from
 * `public/excalidraw-fonts/` (window.EXCALIDRAW_ASSET_PATH below — no CDN).
 */
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type { AppState, BinaryFiles, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { themeStore } from '../../context/ThemeContext';
import type { Theme } from '../../data/types';
import { usePerUserIdentity } from '../../lib/perUserIdentity';
import {
    whiteboardStore,
    sanitizeScene,
    saveSceneDebounced,
    cancelPendingSave,
    type WhiteboardScene,
} from '../../lib/whiteboardStore';

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

export default function Whiteboard() {
    // Single writer for every per-user store key — before any snapshot read.
    usePerUserIdentity();
    const theme = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot, themeStore.getServerSnapshot);

    // Excalidraw only reads initialData on mount; capture the mount-time scene.
    const initialScene = useRef<WhiteboardScene>(whiteboardStore.getSnapshot());

    const onChange = useCallback(
        (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
            saveSceneDebounced(sanitizeScene(elements, appState, files));
        },
        [],
    );

    // Drop a pending trailing save on unmount (the last idle save already ran).
    useEffect(() => cancelPendingSave, []);

    return (
        <div style={{ height: '100%', width: '100%' }}>
            <Excalidraw
                theme={LIGHT_THEMES.has(theme) ? 'light' : 'dark'}
                initialData={initialScene.current as unknown as ExcalidrawInitialDataState}
                onChange={onChange}
                UIOptions={{ canvasActions: { loadScene: false } }}
            />
        </div>
    );
}
