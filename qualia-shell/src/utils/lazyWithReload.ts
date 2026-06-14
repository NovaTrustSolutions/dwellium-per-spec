import { lazy } from 'react';

const LAZY_RELOAD_KEY = 'qualia.lazy-reload-once';
const CHUNK_LOAD_PATTERNS = [
    /Failed to fetch dynamically imported module/i,
    /Importing a module script failed/i,
    /ChunkLoadError/i,
    /Loading chunk [\w-]+ failed/i,
];

export function lazyWithReload<T extends React.ComponentType<any>>(
    importer: () => Promise<{ default: T }>
) {
    return lazy(async () => {
        // 2026-06-12 fix (live-sweep finding): transient first-open import
        // failures (Vite dep re-optimization mid-flight in dev; brief network
        // blips in prod) were going STRAIGHT to window.location.reload() —
        // a full page nuke on first open of terminal / doc-viewer / pdf-gear /
        // scribe that users experienced as "clicking a widget logs you out".
        // Retry the import IN PLACE first (2 retries, 300/600ms backoff) —
        // by then Vite has finished re-optimizing and the import succeeds with
        // no reload. The sessionStorage-gated reload remains as the LAST
        // resort for genuinely stale chunks (post-deploy hash change).
        let lastError: unknown;
        for (let attempt = 0; attempt <= 2; attempt++) {
            if (attempt > 0) {
                await new Promise(resolve => setTimeout(resolve, 300 * attempt));
            }
            try {
                const module = await importer();
                if (typeof window !== 'undefined') {
                    window.sessionStorage.removeItem(LAZY_RELOAD_KEY);
                }
                return module;
            } catch (error) {
                lastError = error;
                const message = error instanceof Error ? error.message : String(error);
                if (!CHUNK_LOAD_PATTERNS.some(pattern => pattern.test(message))) {
                    throw error; // not a chunk-load failure — don't retry/reload
                }
            }
        }

        if (typeof window !== 'undefined') {
            const alreadyReloaded = window.sessionStorage.getItem(LAZY_RELOAD_KEY) === '1';
            if (!alreadyReloaded) {
                window.sessionStorage.setItem(LAZY_RELOAD_KEY, '1');
                window.location.reload();
                await new Promise(() => {});
            }
        }

        throw lastError;
    });
}
