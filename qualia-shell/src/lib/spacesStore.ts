/**
 * spacesStore — "Spaces" (proposal Way 2): collapse the 42-widget sidebar into
 * a handful of named, saved canvases. A Space is a name + icon + the set of
 * widgets it opens. Switching a Space swaps the whole canvas (minimize what's
 * not in it, open/restore what is) in one click.
 *
 * Per-user + durable via One Save (`withSyncStatic`, objectType 'spaces') so
 * your Spaces follow you across devices. Seeded with the proposal's five
 * defaults; the user can rename, re-pin widgets, or save the current canvas as
 * a new Space.
 */
import { createLocalStorageStore } from '../utils/createLocalStorageStore';
import { withSyncStatic } from './oneSaveStore';

export interface DwelliumSpace {
    id: string;
    name: string;
    /** iconMap key (lucide) — falls back to the first letter if unknown. */
    icon: string;
    /** Widget component ids this Space opens (registry ids). */
    widgets: string[];
    /** Built-in default (vs. user-created). */
    builtin?: boolean;
}

/** The proposal's five default Spaces, mapped to real registry component ids. */
export const DEFAULT_SPACES: DwelliumSpace[] = [
    { id: 'write', name: 'Write', icon: 'pencil', widgets: ['scribe', 'doc-viewer', 'notepad'], builtin: true },
    { id: 'manage', name: 'Manage', icon: 'layout', widgets: ['strata-dashboard', 'astra-dashboard', 'tenant-portal-mgmt', 'task-board'], builtin: true },
    { id: 'research', name: 'Research', icon: 'search', widgets: ['notebooklm-context', 'fact-check-log', 'transcription', 'content-search'], builtin: true },
    { id: 'comms', name: 'Comms', icon: 'mail', widgets: ['inbox', 'honcho', 'ara-console'], builtin: true },
    { id: 'build', name: 'Build', icon: 'wrench', widgets: ['terminal', 'automation-hub', 'universal-shell'], builtin: true },
];

const KEY = 'dwellium-spaces';

function isSpace(s: unknown): s is DwelliumSpace {
    return !!s && typeof (s as DwelliumSpace).id === 'string'
        && typeof (s as DwelliumSpace).name === 'string'
        && Array.isArray((s as DwelliumSpace).widgets);
}

function deserialize(raw: string | null): DwelliumSpace[] {
    if (!raw) return DEFAULT_SPACES;
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
            const valid = parsed.filter(isSpace);
            if (valid.length > 0) return valid;
        }
    } catch { /* ignore */ }
    return DEFAULT_SPACES;
}

export const spacesStore = withSyncStatic(
    createLocalStorageStore<DwelliumSpace[]>(
        () => deserialize(localStorage.getItem(KEY)),
        DEFAULT_SPACES,
    ),
    { objectType: 'spaces', storageKey: KEY },
);

/** Persist the full Spaces list (cache + write-through). */
export function persistSpaces(next: DwelliumSpace[]): void {
    spacesStore.set(next, () => {
        try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* sandboxed */ }
    });
}

/** Add a Space (or replace one with the same id). */
export function upsertSpace(space: DwelliumSpace): void {
    const cur = spacesStore.getSnapshot();
    const idx = cur.findIndex(s => s.id === space.id);
    const next = idx >= 0 ? cur.map(s => (s.id === space.id ? space : s)) : [...cur, space];
    persistSpaces(next);
}

/** Remove a user Space (built-ins are protected). */
export function deleteSpace(id: string): void {
    const cur = spacesStore.getSnapshot();
    persistSpaces(cur.filter(s => s.id !== id || s.builtin));
}

/** Save the given open-widget set as a new named Space. */
export function saveCurrentAsSpace(name: string, widgets: string[], icon = 'layers'): DwelliumSpace {
    const space: DwelliumSpace = {
        id: `space-${Date.now().toString(36)}`,
        name,
        icon,
        widgets: Array.from(new Set(widgets)),
    };
    upsertSpace(space);
    return space;
}
