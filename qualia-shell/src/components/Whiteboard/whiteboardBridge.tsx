/**
 * whiteboardBridge — plan 053 #5: attach whiteboard boards to Strata entities.
 *
 * `openStrataBoard` creates/activates the per-entity board
 * (`boardId = strata:<type>:<id>`) in the per-user whiteboardStore doc, then
 * opens the Whiteboard widget through the shell's `dwellium:open-widget` bus
 * (WindowContext listens; an already-open widget re-keys off the store).
 *
 * IMPORT GRAPH NOTE: Strata modules import THIS file, so it must never import
 * `@excalidraw/excalidraw` (directly or via Whiteboard.tsx / andyLibrary.ts) —
 * the Excalidraw bundle stays in the lazy whiteboard chunk.
 */
import { PenTool } from 'lucide-react';
import { openBoard } from '../../lib/whiteboardStore';

export type StrataBoardKind = 'maintenance' | 'property';

const KIND_PREFIX: Record<StrataBoardKind, string> = {
    maintenance: 'WO',
    property: 'Property',
};

export function strataBoardId(kind: StrataBoardKind, id: string): string {
    return `strata:${kind}:${id}`;
}

/** Create-or-activate the entity's board and open the Whiteboard widget. */
export function openStrataBoard(kind: StrataBoardKind, id: string, title: string): void {
    openBoard(strataBoardId(kind, id), `${KIND_PREFIX[kind]}: ${title || id}`);
    window.dispatchEvent(new CustomEvent('dwellium:open-widget', {
        detail: { widgetId: 'whiteboard', label: 'Whiteboard', icon: 'pen-tool' },
    }));
}

/**
 * Drop-in action button for Strata detail panels (Maintenance work orders,
 * Properties). Kept here so module files only add ONE import + ONE JSX line.
 */
export function WhiteboardAction({ kind, id, title }: { kind: StrataBoardKind; id: string; title: string }) {
    return (
        <button
            onClick={() => openStrataBoard(kind, id, title)}
            title="Open this record's whiteboard (floor plans, markup)"
            style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px',
                borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                color: 'var(--accent)',
            }}
        >
            <PenTool size={10} /> Whiteboard
        </button>
    );
}
