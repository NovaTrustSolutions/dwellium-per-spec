/**
 * Reusable splitter handle for resizable Scribe panels.
 *
 * - Vertical splitter (orientation='vertical') = thin column with ew-resize cursor.
 *   Used between editor ↔ TOC and editor ↔ Minimap.
 * - Horizontal splitter (orientation='horizontal') = thin row with ns-resize cursor.
 *   Used between TabBar ↔ editor.
 *
 * onResize is called continuously with the delta from the initial mousedown
 * position. The parent component clamps + applies. onResizeEnd fires once
 * on mouseup so the parent can persist to localStorage.
 */
import { useCallback, useRef } from 'react';

interface Props {
    orientation: 'vertical' | 'horizontal';
    /** Sign of the delta: 'positive' if dragging away from start increases size,
     *  'negative' if dragging toward start increases size (e.g., right-side panel
     *  resized via its left edge). */
    direction?: 'positive' | 'negative';
    onResize: (delta: number) => void;
    onResizeEnd?: () => void;
}

export function Splitter({ orientation, direction = 'positive', onResize, onResizeEnd }: Props) {
    const startPosRef = useRef(0);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const startPos = orientation === 'vertical' ? e.clientX : e.clientY;
        startPosRef.current = startPos;
        // Lock cursor + disable text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = orientation === 'vertical' ? 'ew-resize' : 'ns-resize';

        const onMove = (ev: MouseEvent) => {
            const cur = orientation === 'vertical' ? ev.clientX : ev.clientY;
            const raw = cur - startPosRef.current;
            const delta = direction === 'negative' ? -raw : raw;
            onResize(delta);
        };

        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
            onResizeEnd?.();
        };

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }, [orientation, direction, onResize, onResizeEnd]);

    const baseStyle: React.CSSProperties = {
        position: 'relative',
        flexShrink: 0,
        background: 'transparent',
        transition: 'background 120ms',
    };

    const orientationStyle: React.CSSProperties = orientation === 'vertical'
        ? { width: 4, cursor: 'ew-resize', alignSelf: 'stretch' }
        : { height: 4, cursor: 'ns-resize', width: '100%' };

    return (
        <div
            onMouseDown={handleMouseDown}
            style={{ ...baseStyle, ...orientationStyle }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#D6FE51'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            role="separator"
            aria-orientation={orientation === 'vertical' ? 'vertical' : 'horizontal'}
        />
    );
}
