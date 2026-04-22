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
        try {
            const module = await importer();
            if (typeof window !== 'undefined') {
                window.sessionStorage.removeItem(LAZY_RELOAD_KEY);
            }
            return module;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const shouldReload = CHUNK_LOAD_PATTERNS.some(pattern => pattern.test(message));

            if (typeof window !== 'undefined' && shouldReload) {
                const alreadyReloaded = window.sessionStorage.getItem(LAZY_RELOAD_KEY) === '1';
                if (!alreadyReloaded) {
                    window.sessionStorage.setItem(LAZY_RELOAD_KEY, '1');
                    window.location.reload();
                    await new Promise(() => {});
                }
            }

            throw error;
        }
    });
}
