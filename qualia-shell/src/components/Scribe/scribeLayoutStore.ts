/**
 * Per-user Scribe layout persistence (TOC width, Minimap width, TabBar height).
 * Sister-shape to scribeThemeStore — dynamic-key via createLocalStorageStore
 * (Phase-8+ Task 8.10 Option β). Andy's TOC width ≠ Lisa's; loads on login.
 *
 * One JSON-serialized blob per user keeps localStorage clean. Mutations
 * (setTocWidth / setMinimapWidth / setTabBarHeight) clamp to documented
 * ranges so a corrupted localStorage entry can't render Scribe with a 4px
 * TOC or 2000px minimap.
 */
import { createLocalStorageStore } from '../../utils/createLocalStorageStore';
import { withSync } from '../../lib/oneSaveStore';

export interface ScribeLayout {
    tocWidth: number;
    minimapWidth: number;
    tabBarHeight: number;
    treeWidth: number;
    araWidth: number;
    previewWidth: number;
}

export const TOC_MIN = 160;
export const TOC_MAX = 480;
export const TOC_DEFAULT = 240;

export const MINIMAP_MIN = 32;
export const MINIMAP_MAX = 200;
export const MINIMAP_DEFAULT = 64;

export const TABBAR_MIN = 28;
export const TABBAR_MAX = 80;
export const TABBAR_DEFAULT = 38;

export const TREE_MIN = 160;
export const TREE_MAX = 480;
export const TREE_DEFAULT = 248;

export const ARA_MIN = 240;
export const ARA_MAX = 640;
export const ARA_DEFAULT = 320;

export const PREVIEW_MIN = 280;
export const PREVIEW_MAX = 1000;
export const PREVIEW_DEFAULT = 420;

export const DEFAULT_LAYOUT: ScribeLayout = {
    tocWidth: TOC_DEFAULT,
    minimapWidth: MINIMAP_DEFAULT,
    tabBarHeight: TABBAR_DEFAULT,
    treeWidth: TREE_DEFAULT,
    araWidth: ARA_DEFAULT,
    previewWidth: PREVIEW_DEFAULT,
};

export const scribeLayoutUserIdHolder: { current: string | null } = { current: null };

function resolveKey(): string {
    const uid = scribeLayoutUserIdHolder.current;
    return uid ? `scribe-layout:${uid}` : 'scribe-layout:_anonymous';
}

function clamp(n: number, min: number, max: number): number {
    if (typeof n !== 'number' || !Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function normalize(raw: unknown): ScribeLayout {
    if (!raw || typeof raw !== 'object') return DEFAULT_LAYOUT;
    const obj = raw as Record<string, unknown>;
    return {
        tocWidth: clamp(obj.tocWidth as number ?? TOC_DEFAULT, TOC_MIN, TOC_MAX),
        minimapWidth: clamp(obj.minimapWidth as number ?? MINIMAP_DEFAULT, MINIMAP_MIN, MINIMAP_MAX),
        tabBarHeight: clamp(obj.tabBarHeight as number ?? TABBAR_DEFAULT, TABBAR_MIN, TABBAR_MAX),
        treeWidth: clamp(obj.treeWidth as number ?? TREE_DEFAULT, TREE_MIN, TREE_MAX),
        araWidth: clamp(obj.araWidth as number ?? ARA_DEFAULT, ARA_MIN, ARA_MAX),
        previewWidth: clamp(obj.previewWidth as number ?? PREVIEW_DEFAULT, PREVIEW_MIN, PREVIEW_MAX),
    };
}

export const scribeLayoutStore = withSync(
    createLocalStorageStore<ScribeLayout>({
        key: resolveKey,
        deserializer: (raw) => {
            if (!raw) return DEFAULT_LAYOUT;
            try { return normalize(JSON.parse(raw)); } catch { return DEFAULT_LAYOUT; }
        },
        defaultValue: DEFAULT_LAYOUT,
    }),
    { objectType: 'scribe-layout', holder: scribeLayoutUserIdHolder, resolveKey },
);

export function saveScribeLayout(patch: Partial<ScribeLayout>): void {
    const prev = scribeLayoutStore.getSnapshot();
    const next = normalize({ ...prev, ...patch });
    scribeLayoutStore.set(next, () => {
        try { localStorage.setItem(resolveKey(), JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}
